// Execução do bloco `charge` dentro do funil: carrega conta/segredo, resolve dados e gera o instrumento.
import { createCharge, type ChargeRow, type ChargeStore, type GatewayVars, varsFromCharge } from "./charge.ts";
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
  if (linked?.charge_id && linked.block_id === ctx.blockId) {
    const { data } = await sb.from("payment_charges").select("*").eq("id", linked.charge_id).maybeSingle();
    prev = data ?? null;
    if (prev && prev.status === "paid") {
      return { kind: "advance", chargeId: prev.id, vars: tag(varsFromCharge(prev), { provider: prev.provider, method: prev.method }) };
    }
    if (prev && prev.status === "pending" && prev.payment_code && (prev.provider !== "leonapay" || prev.payment_qrcode)) {
      return { kind: "advance", chargeId: prev.id, vars: tag(varsFromCharge(prev), { provider: prev.provider, method: prev.method }) };
    }
  }
  const round = roundFor(ctx.flowVariables, ctx.blockId, prev);
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
      aliasConfig: undefined, // alias automático DESATIVADO até domínio operacional + confirmação da LeonaPay
    },
  );

  if (result.status === "need_input") return { kind: "need_input", need: result.need };
  if (result.status === "error") return { kind: "error", retryable: result.retryable, vars: tag(result.vars) };
  const meta = { provider: result.charge.provider, method: result.charge.method };
  return result.status === "awaiting_instructions"
    ? { kind: "awaiting_instructions", chargeId: result.charge.id, vars: tag(result.vars, meta) }
    : { kind: "advance", chargeId: result.charge.id, vars: tag(result.vars, meta) };
}
