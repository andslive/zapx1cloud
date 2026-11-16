// Execução do bloco `charge` dentro do funil: carrega conta/segredo, resolve dados e gera o instrumento.
import { createCharge, parseAmount, type ChargeRow, type ChargeStore, type GatewayVars, varsFromCharge } from "./charge.ts";
import type { FetchFn } from "./types.ts";

export function supabaseChargeStore(sb: any): ChargeStore {
  return {
    async findOpenByExecution(orgId, executionKey) {
      const { data } = await sb.from("payment_charges").select("*").eq("organization_id", orgId)
        .eq("execution_key", executionKey).in("status", ["creating", "awaiting_instructions", "pending"]).maybeSingle();
      return data ?? null;
    },
    async insert(row) {
      const ins = await sb.from("payment_charges").insert(row).select("*").single();
      if (ins.error) {
        if (ins.error.code === "23505") {
          const again = await this.findOpenByExecution(row.organization_id, row.execution_key);
          if (again) return again; // corrida: reaproveita a tentativa aberta
        }
        throw new Error("charge_insert_failed");
      }
      return ins.data;
    },
    async update(id, patch) {
      const { error } = await sb.from("payment_charges").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error("charge_update_failed");
    },
  };
}

export interface ChargeBlockCtx {
  sb: any;
  fetch: FetchFn;
  blockId: string;
  blockData: Record<string, any>;
  conversationId: string;
  flowId: string;
  /** Pode vir vazio: o bloco confirma a organização pela própria conversa. */
  organizationId?: string | null;
  leadId: string | null;
  whatsappDisplayName: unknown;
  flowVariables: Record<string, any>;
  /** Substitui {{variáveis}} do funil em um texto. */
  replaceVars: (t: any) => string;
}

export type ChargeBlockOutcome =
  | { kind: "advance"; vars: GatewayVars & { block_id: string; provider: string; method: string; order_ref?: string }; chargeId: string }
  | { kind: "error"; vars: GatewayVars & { block_id: string }; retryable: boolean }
  | { kind: "need_input"; need: "name" | "email" }
  | { kind: "awaiting_instructions"; vars: GatewayVars & { block_id: string; provider: string; method: string }; chargeId: string };

/** Entrada repetida em cobrança vencida/falha = nova tentativa (rodada seguinte). */
function roundFor(flowVariables: Record<string, any>, blockId: string, prev: ChargeRow | null): number {
  const rounds = (flowVariables.__charge_rounds ?? {}) as Record<string, number>;
  let r = rounds[blockId] ?? 1;
  if (prev && (prev.status === "expired" || prev.status === "failed")) r += 1;
  return r;
}

/** Cobrança aberta que já não corresponde à configuração atual do bloco (conta, meio ou valor). */
export function isChargeStale(
  prev: Pick<ChargeRow, "status" | "gateway_account_id" | "method" | "amount"> | null,
  accountId: string, method: string, rawAmount: string,
): boolean {
  if (!prev || prev.status === "paid") return false;
  const wantMethod = method.toUpperCase() === "OXXO" ? "OXXO" : "SPEI";
  const wantAmount = parseAmount(rawAmount);
  return prev.gateway_account_id !== accountId || prev.method !== wantMethod ||
    (wantAmount !== null && Number(prev.amount) !== Number(wantAmount));
}

/** Domínio padrão do e-mail gerado (pode ser trocado no bloco). */
export const DEFAULT_ALIAS_DOMAIN = "gmail.com";
export function aliasDomain(raw: unknown): string {
  const d = String(raw ?? "").trim().toLowerCase().replace(/^@/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : DEFAULT_ALIAS_DOMAIN;
}
/** Sufixo numérico estável para a mesma execução (replay gera o mesmo e-mail). */
export function aliasSeqFor(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % 10000;
}

export async function runChargeBlock(ctx: ChargeBlockCtx): Promise<ChargeBlockOutcome> {
  const { sb, blockData: d } = ctx;
  // A organização vem SEMPRE da conversa (fonte de verdade), nunca só do objeto em memória do chamador.
  const { data: convRow } = await sb.from("webchat_conversations").select("organization_id").eq("id", ctx.conversationId).maybeSingle();
  const orgId: string | null = convRow?.organization_id ?? ctx.organizationId ?? null;
  if (!orgId) return { kind: "error", retryable: false, vars: { transaction_id: "", payment_code: "", payment_qrcode: "", payment_link: "", expires_at: "", value: "", bank_name: "", beneficiary: "", erro: "account_not_configured", charge_id: "", status: "failed", block_id: ctx.blockId } };
  const orderRefValue = `${ctx.conversationId}:${ctx.flowId}`;
  const tag = <T extends GatewayVars>(v: T, extra: Record<string, string> = {}) => ({ ...v, block_id: ctx.blockId, order_ref: orderRefValue, ...extra } as any);

  const accountId = String(d.gateway_account_id ?? "");
  const { data: account } = accountId
    ? await sb.from("payment_gateway_accounts").select("id, organization_id, provider, environment, enabled")
      .eq("id", accountId).eq("organization_id", orgId).maybeSingle()
    : { data: null };
  const emptyErr = (code: string): ChargeBlockOutcome => ({
    kind: "error", retryable: false,
    vars: tag({ transaction_id: "", payment_code: "", payment_qrcode: "", payment_link: "", expires_at: "", value: "", bank_name: "", beneficiary: "", erro: code, charge_id: "", status: "failed" }),
  });
  if (!account) return emptyErr("account_not_configured");

  const { data: apiKey, error: keyErr } = await sb.rpc("get_payment_gateway_secret", {
    p_account_id: account.id, p_organization_id: orgId, p_secret_kind: "api_key",
  });
  if (keyErr || typeof apiKey !== "string") return emptyErr("account_not_configured");

  // Cobrança já vinculada a esta execução/bloco?
  const linked = ctx.flowVariables.__gateway;
  let prev: ChargeRow | null = null;
  let prevStale: ChargeRow | null = null;
  if (linked?.charge_id && linked.block_id === ctx.blockId) {
    const { data } = await sb.from("payment_charges").select("*").eq("id", linked.charge_id).maybeSingle();
    prev = data ?? null;
    // A cobrança vinculada só vale se ainda corresponde à configuração ATUAL do bloco
    // (conta, meio e valor). Se o bloco foi reconfigurado, ela é de outra configuração:
    // não é reaproveitada nem entregue, e a execução abre uma nova rodada.
    const staleConfig = isChargeStale(prev, account.id, String(d.method ?? ""), ctx.replaceVars(d.amount ?? ""));
    if (staleConfig) { prevStale = prev; prev = null; }
    if (prev && prev.status === "paid") {
      return { kind: "advance", chargeId: prev.id, vars: tag(varsFromCharge(prev), { provider: prev.provider, method: prev.method }) };
    }
    if (prev && prev.status === "pending" && prev.payment_code && (prev.provider !== "leonapay" || prev.payment_qrcode)) {
      return { kind: "advance", chargeId: prev.id, vars: tag(varsFromCharge(prev), { provider: prev.provider, method: prev.method }) };
    }
  }
  let round = roundFor(ctx.flowVariables, ctx.blockId, prev) + (prevStale ? 1 : 0);
  // Mesmo sem vínculo na execução (funil reiniciado na mesma conversa), uma cobrança ABERTA desta
  // rodada de outra conta/meio/valor não pode ser devolvida no lugar da nova: pula para a próxima rodada.
  const wantAmountRaw = ctx.replaceVars(d.amount ?? "");
  for (let i = 0; i < 20; i++) {
    const { data: open } = await sb.from("payment_charges").select("*").eq("organization_id", orgId)
      .eq("execution_key", `${ctx.conversationId}:${ctx.blockId}:${round}`)
      .in("status", ["creating", "awaiting_instructions", "pending"]).maybeSingle();
    if (open && isChargeStale(open, account.id, String(d.method ?? ""), wantAmountRaw)) round += 1; else break;
  }
  if (round > 1) {
    ctx.flowVariables.__charge_rounds = { ...(ctx.flowVariables.__charge_rounds ?? {}), [ctx.blockId]: round };
  }

  // Dados do lead e nome de exibição do WhatsApp.
  let lead: { name?: unknown; email?: unknown } = {};
  if (ctx.leadId) {
    const { data } = await sb.from("leads").select("name, email").eq("id", ctx.leadId).maybeSingle();
    lead = data ?? {};
  }
  // Campos manuais ("Inserir variável") têm prioridade sobre o automático.
  const manualName = d.payer_name_mode === "variable" ? ctx.replaceVars(d.payer_name_var ?? "").trim() : "";
  const manualEmail = d.payer_email_mode === "variable" ? ctx.replaceVars(d.payer_email_var ?? "").trim() : "";
  const askedName = (typeof ctx.flowVariables.__charge_asked_name === "string" ? ctx.flowVariables.__charge_asked_name : "") || manualName;
  const askedEmail = (typeof ctx.flowVariables.__charge_asked_email === "string" ? ctx.flowVariables.__charge_asked_email : "") || manualEmail;

  const result = await createCharge(
    { store: supabaseChargeStore(sb), fetch: ctx.fetch },
    {
      account, apiKey,
      method: String(d.method ?? "").toUpperCase() === "OXXO" ? "OXXO" : "SPEI",
      rawAmount: ctx.replaceVars(d.amount ?? ""),
      executionKey: `${ctx.conversationId}:${ctx.blockId}:${round}`,
      orderRef: orderRefValue,
      conversationId: ctx.conversationId, leadId: ctx.leadId, flowId: ctx.flowId, blockId: ctx.blockId,
      lead, whatsappDisplayName: ctx.whatsappDisplayName,
      askedName: askedName || null, askedEmail: askedEmail || null,
      // E-mail gerado (primeiro.último + 3 dígitos@domínio, estável por execução) em vez de perguntar ao lead.
      // Prioridade: e-mail informado/variável → e-mail do lead → gerado. Só o modo "ask" pergunta ao lead.
      aliasConfig: d.payer_email_mode === "ask"
        ? undefined
        : { enabled: true, providerAcceptsAlias: true, domain: aliasDomain(d.payer_email_domain) },
      aliasSeq: aliasSeqFor(`${ctx.conversationId}:${ctx.blockId}:${round}`),
    },
  );

  if (result.status === "need_input") return { kind: "need_input", need: result.need };
  if (result.status === "error") return { kind: "error", retryable: result.retryable, vars: tag(result.vars) };
  const meta = { provider: result.charge.provider, method: result.charge.method };
  return result.status === "awaiting_instructions"
    ? { kind: "awaiting_instructions", chargeId: result.charge.id, vars: tag(result.vars, meta) }
    : { kind: "advance", chargeId: result.charge.id, vars: tag(result.vars, meta) };
}
