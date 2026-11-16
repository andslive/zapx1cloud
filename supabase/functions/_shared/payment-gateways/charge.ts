// Bloco Cobrança: gera o instrumento e devolve as variáveis `gateway.*`.
// A tentativa é persistida ANTES da chamada ao gateway; retries/replays reaproveitam a mesma
// tentativa (mesma idempotency-key e mesmo payload). O bloco termina na geração do instrumento.
import { methodsFor, type GatewayEnvironment, type GatewayProvider } from "./catalog.ts";
import { createSpeiPayin, getPayin } from "./colocapay.ts";
import { createOxxoPayment, getTransaction, hasCompleteVoucher } from "./leonapay.ts";
import { GatewayError, type FetchFn, type GatewayChargeState, type ChargeStatus } from "./types.ts";
import { resolvePayerEmail, resolvePayerName, type AliasConfig } from "./payer-data.ts";

export interface ChargeRow {
  id: string;
  organization_id: string;
  gateway_account_id: string;
  provider: GatewayProvider;
  method: "SPEI" | "OXXO";
  currency: "MXN";
  amount: string;
  status: ChargeStatus;
  execution_key: string;
  order_ref: string;
  idempotency_key: string;
  request_fingerprint: string;
  internal_reference: string;
  payer_name: string | null;
  payer_email: string | null;
  payer_email_source: "lead" | "asked" | "alias" | null;
  external_id: string | null;
  payment_code: string | null;
  payment_qrcode: string | null;
  payment_link: string | null;
  expires_at: string | null;
  bank_name: string | null;
  beneficiary: string | null;
  error_code: string | null;
  conversation_id?: string | null;
  lead_id?: string | null;
  flow_id?: string | null;
  block_id?: string | null;
}

export interface ChargeStore {
  findOpenByExecution(orgId: string, executionKey: string): Promise<ChargeRow | null>;
  /** Insere; em violação do índice de "uma aberta por execução" devolve a existente. */
  insert(row: Omit<ChargeRow, "id" | "internal_reference">): Promise<ChargeRow>;
  update(id: string, patch: Partial<ChargeRow>): Promise<void>;
}

export interface ChargeAccount {
  id: string;
  organization_id: string;
  provider: GatewayProvider;
  environment: GatewayEnvironment;
  enabled: boolean;
}

export interface ChargeInput {
  account: ChargeAccount;
  apiKey: string;
  method: "SPEI" | "OXXO";
  /** Valor JÁ resolvido (variável substituída) mas ainda texto: validado aqui, no backend. */
  rawAmount: unknown;
  executionKey: string;
  orderRef: string;
  conversationId?: string | null;
  leadId?: string | null;
  flowId?: string | null;
  blockId?: string | null;
  lead: { name?: unknown; email?: unknown };
  whatsappDisplayName?: unknown;
  whatsappUsername?: unknown;
  /** Respostas coletadas do lead quando faltou dado (retomada da MESMA execução). */
  askedName?: string | null;
  askedEmail?: string | null;
  aliasConfig?: AliasConfig;
  aliasSeq?: number;
  leonaLimits?: { min?: number; max?: number };
}

export type ChargeResult =
  | { status: "ready"; charge: ChargeRow; vars: GatewayVars }
  | { status: "awaiting_instructions"; charge: ChargeRow; vars: GatewayVars }
  | { status: "need_input"; need: "name" | "email" }
  | { status: "error"; code: string; retryable: boolean; vars: GatewayVars };

export interface GatewayVars {
  transaction_id: string;
  payment_code: string;
  payment_qrcode: string;
  payment_link: string;
  expires_at: string;
  value: string;
  bank_name: string;
  beneficiary: string;
  erro: string;
  charge_id: string;
  status: string;
}

const emptyVars = (): GatewayVars => ({
  transaction_id: "", payment_code: "", payment_qrcode: "", payment_link: "", expires_at: "",
  value: "", bank_name: "", beneficiary: "", erro: "", charge_id: "", status: "",
});

export function varsFromCharge(c: Pick<ChargeRow, "id" | "external_id" | "payment_code" | "payment_qrcode" | "payment_link" | "expires_at" | "amount" | "bank_name" | "beneficiary" | "error_code" | "status">): GatewayVars {
  return {
    transaction_id: c.external_id ?? "",
    payment_code: c.payment_code ?? "", // sempre texto: preserva zeros à esquerda e todos os dígitos
    payment_qrcode: c.payment_qrcode ?? "",
    payment_link: c.payment_link ?? "",
    expires_at: c.expires_at ?? "",
    value: Number(c.amount).toFixed(2),
    bank_name: c.bank_name ?? "",
    beneficiary: c.beneficiary ?? "",
    erro: c.error_code ?? "",
    charge_id: c.id,
    status: c.status,
  };
}

/** Linhas lidas do banco (PostgREST) trazem `numeric` como número: volta SEMPRE a string "250.10". */
export function normalizeRow<T extends { amount: unknown }>(r: T): T & { amount: string } {
  return { ...r, amount: Number(r.amount).toFixed(2) };
}

/** Valida o valor no backend: decimal positivo, até 2 casas, sem notação científica. */
export function parseAmount(raw: unknown): string | null {
  const s = String(raw ?? "").trim().replace(/\s/g, "");
  let norm = s;
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(s)) norm = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d{1,2}$/.test(s)) norm = s.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(norm)) return null;
  const n = Number(norm);
  return n > 0 && n < 1e9 ? n.toFixed(2) : null;
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Limites comerciais conhecidos (LeonaPay OXXO: 10 a 10.000 MXN). */
const STATIC_LIMITS: Record<string, { min: number; max: number } | undefined> = { OXXO: { min: 10, max: 10000 } };

export async function createCharge(
  deps: { store: ChargeStore; fetch: FetchFn; sleep?: (ms: number) => Promise<void> },
  input: ChargeInput,
): Promise<ChargeResult> {
  const { account } = input;
  const fail = (code: string, retryable = false): ChargeResult => ({ status: "error", code, retryable, vars: { ...emptyVars(), erro: code } });

  // Regras de disponibilidade: as mesmas da interface (catalog.ts).
  if (!account.enabled) return fail("account_disabled");
  if (!methodsFor(account.provider, "MXN").some((m) => m.method === input.method)) return fail("method_unavailable");
  const amount = parseAmount(input.rawAmount);
  if (!amount) return fail("invalid_amount");
  const lim = input.leonaLimits ?? STATIC_LIMITS[input.method];
  if (lim) {
    const n = Number(amount);
    if (lim.min !== undefined && n < lim.min) return fail("amount_below_minimum");
    if (lim.max !== undefined && n > lim.max) return fail("amount_above_maximum");
  }

  // Dados do pagador (nome → e-mail). Faltou? pede só o que falta.
  const nameRes = input.askedName
    ? { name: input.askedName.trim(), source: "asked" }
    : resolvePayerName({ leadName: input.lead.name, whatsappDisplayName: input.whatsappDisplayName, whatsappUsername: input.whatsappUsername, gatewayAcceptsUsername: false });
  if (!nameRes || !nameRes.name) return { status: "need_input", need: "name" };

  let payerEmail: string | null = null;
  let emailSource: "lead" | "asked" | "alias" | null = null;
  if (input.method === "OXXO") {
    const em = input.askedEmail
      ? resolvePayerEmail({ leadEmail: input.askedEmail, name: nameRes.name, seq: 0 })
      : resolvePayerEmail({ leadEmail: input.lead.email, name: nameRes.name, seq: input.aliasSeq ?? 0, alias: input.aliasConfig });
    if (!em) return { status: "need_input", need: "email" };
    payerEmail = em.email;
    emailSource = input.askedEmail ? "asked" : em.source;
  }

  const fingerprint = await sha256Hex(JSON.stringify([account.id, input.method, amount, nameRes.name, payerEmail, input.orderRef]));

  // Retry/replay da mesma execução: reaproveita a tentativa aberta.
  let row = await deps.store.findOpenByExecution(account.organization_id, input.executionKey);
  if (row) row = normalizeRow(row);
  if (row && row.request_fingerprint !== fingerprint) {
    if (row.external_id) {
      // Já existe cobrança real no gateway para esta execução: NÃO cria outra com payload diferente.
      return { status: row.status === "pending" || row.status === "awaiting_instructions" ? "ready" : "ready", charge: row, vars: varsFromCharge(row) };
    }
    // Nunca chegou ao gateway: é uma nova tentativa (chave nova), persistida antes.
    const newKey = crypto.randomUUID();
    await deps.store.update(row.id, { request_fingerprint: fingerprint, idempotency_key: newKey, amount, payer_name: nameRes.name, payer_email: payerEmail, payer_email_source: emailSource });
    row = { ...row, request_fingerprint: fingerprint, idempotency_key: newKey, amount, payer_name: nameRes.name, payer_email: payerEmail, payer_email_source: emailSource };
  }
  if (!row) {
    row = await deps.store.insert({
      organization_id: account.organization_id,
      gateway_account_id: account.id,
      provider: account.provider,
      method: input.method,
      currency: "MXN",
      amount,
      status: "creating", // persistida ANTES de chamar a API
      execution_key: input.executionKey,
      order_ref: input.orderRef,
      idempotency_key: crypto.randomUUID(),
      request_fingerprint: fingerprint,
      payer_name: nameRes.name,
      payer_email: payerEmail,
      payer_email_source: emailSource,
      external_id: null, payment_code: null, payment_qrcode: null, payment_link: null,
      expires_at: null, bank_name: null, beneficiary: null, error_code: null,
      conversation_id: input.conversationId ?? null, lead_id: input.leadId ?? null,
      flow_id: input.flowId ?? null, block_id: input.blockId ?? null,
    });
    row = normalizeRow(row);
  }

  // Já tem instrumento (replay após sucesso): não chama o gateway de novo.
  if (row.external_id && row.status !== "creating") {
    return row.status === "awaiting_instructions"
      ? { status: "awaiting_instructions", charge: row, vars: varsFromCharge(row) }
      : { status: "ready", charge: row, vars: varsFromCharge(row) };
  }

  let state: GatewayChargeState;
  try {
    if (row.external_id) {
      // Resposta anterior perdida mas o id ficou salvo: só consulta.
      state = row.provider === "colocapay"
        ? await getPayin(deps.fetch, input.apiKey, account.environment, row.external_id)
        : await getTransaction(deps.fetch, input.apiKey, account.environment, row.external_id);
    } else if (row.provider === "colocapay") {
      state = await createSpeiPayin(deps.fetch, input.apiKey, account.environment, {
        amount: row.amount, payerName: row.payer_name ?? nameRes.name, idempotencyKey: row.idempotency_key, concept: row.internal_reference,
      });
    } else {
      state = await createOxxoPayment(deps.fetch, input.apiKey, account.environment, {
        amount: row.amount, payerName: row.payer_name ?? nameRes.name, payerEmail: row.payer_email ?? payerEmail!,
        idempotencyKey: row.idempotency_key, reference: row.internal_reference,
      });
    }
  } catch (e) {
    const ge = e instanceof GatewayError ? e : new GatewayError("network_error", null, true);
    if (!ge.retryable) {
      await deps.store.update(row.id, { status: "failed", error_code: ge.code });
      return { status: "error", code: ge.code, retryable: false, vars: { ...emptyVars(), erro: ge.code, charge_id: row.id, status: "failed" } };
    }
    // Timeout/resposta perdida: a tentativa fica 'creating'; a próxima chamada reutiliza a MESMA chave.
    return { status: "error", code: ge.code, retryable: true, vars: { ...emptyVars(), erro: ge.code, charge_id: row.id, status: "creating" } };
  }

  // LeonaPay pode aceitar antes de devolver o voucher completo: recupera com retentativa controlada.
  let complete = row.provider === "colocapay" ? !!state.paymentCode : hasCompleteVoucher(state);
  if (!complete && row.provider === "leonapay" && state.externalId) {
    const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    for (const wait of [1500, 3000, 6000]) {
      await sleep(wait);
      try {
        const again = await getTransaction(deps.fetch, input.apiKey, account.environment, state.externalId);
        state = { ...again, externalId: state.externalId };
        if (hasCompleteVoucher(state)) { complete = true; break; }
        if (state.status === "failed" || state.status === "expired" || state.status === "paid") break;
      } catch { /* mantém aguardando */ }
    }
  }

  const status: ChargeStatus = state.status === "pending" && !complete ? "awaiting_instructions" : state.status;
  const patch: Partial<ChargeRow> = {
    status, external_id: state.externalId || row.external_id, payment_code: state.paymentCode, payment_qrcode: state.paymentQrcode,
    payment_link: state.paymentLink, expires_at: state.expiresAt, bank_name: state.bankName, beneficiary: state.beneficiary,
    error_code: state.errorCode,
  };
  await deps.store.update(row.id, patch);
  const final = { ...row, ...patch } as ChargeRow;
  const vars = varsFromCharge(final);
  return status === "awaiting_instructions" ? { status: "awaiting_instructions", charge: final, vars } : { status: "ready", charge: final, vars };
}
