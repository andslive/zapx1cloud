// LeonaPay — OXXO/MXN. Contrato: docs.leonapay.com.br (OXXO, Webhooks, Sandbox).
import { gatewayBaseUrl, type GatewayEnvironment } from "./catalog.ts";
import { hmacSha256Hex, timingSafeEqualStr } from "./crypto.ts";
import { type ChargeStatus, type FetchFn, GatewayError, type GatewayChargeState, requestWithRetry, toMoney } from "./types.ts";

const base = (env: GatewayEnvironment) => gatewayBaseUrl("leonapay", env);

export function mapLeonaStatus(status: unknown): ChargeStatus {
  switch (String(status ?? "").toUpperCase()) {
    case "PAID":
      return "paid";
    case "FAILED":
      return "failed";
    case "EXPIRED":
      return "expired";
    default: // PENDING, ACTION_REQUIRED (e demais)
      return "pending";
  }
}

/** Aceita `{data:{...}}` ou o objeto direto (o formato de GET transactions não é documentado). */
export function mapLeonaPayment(body: any): GatewayChargeState {
  const d = body?.data ?? body ?? {};
  const na = d.nextAction ?? {};
  const voucher = na.type === "CASH_VOUCHER";
  const ref = voucher && na.reference != null ? String(na.reference) : null; // referência como TEXTO
  const bar = voucher && typeof na.barcodeUrl === "string" && na.barcodeUrl ? na.barcodeUrl : null;
  let status = mapLeonaStatus(d.status);
  return {
    externalId: String(d.id ?? ""),
    status,
    paymentCode: ref,
    paymentQrcode: bar,
    paymentLink: typeof na.voucherUrl === "string" ? na.voucherUrl : (typeof na.url === "string" ? na.url : null),
    expiresAt: na.expiresAt ?? null,
    bankName: null,
    beneficiary: null,
    amount: toMoney(d.amount),
    errorCode: body?.leonapayCode && !body?.success ? String(body.leonapayCode) : null,
  };
}

/** Instruções completas = referência E imagem do código de barras presentes. */
export function hasCompleteVoucher(s: GatewayChargeState): boolean {
  return !!s.paymentCode && !!s.paymentQrcode;
}

async function parseOrThrow(res: Response): Promise<any> {
  let body: any = null;
  try {
    body = await res.json();
  } catch { /* vazio */ }
  if (res.ok && body?.success !== false) return body;
  const code = String(body?.leonapayCode ?? body?.error?.code ?? `http_${res.status}`).slice(0, 80);
  // LP503_OXXO_TEMPORARILY_UNAVAILABLE e 429/5xx: repetir com a mesma chave. Demais: conclusivo.
  const retryable = res.status === 429 || res.status >= 500 || code === "LP503_OXXO_TEMPORARILY_UNAVAILABLE";
  throw new GatewayError(code, res.status, retryable);
}

export interface LeonaCreateInput {
  amount: string; // "250.00"
  payerName: string;
  payerEmail: string;
  idempotencyKey: string; // UUID estável por tentativa
  reference: string; // referência interna
}

export async function createOxxoPayment(
  doFetch: FetchFn, apiKey: string, env: GatewayEnvironment, input: LeonaCreateInput,
): Promise<GatewayChargeState> {
  const res = await requestWithRetry(doFetch, `${base(env)}/api/v2/payments`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "idempotency-key": input.idempotencyKey, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      method: "OXXO",
      currency: "MXN",
      amount: Number(input.amount),
      instructionType: "CASH",
      payer: { name: input.payerName, email: input.payerEmail },
      reference: input.reference,
    }),
  });
  return mapLeonaPayment(await parseOrThrow(res));
}

export async function getTransaction(doFetch: FetchFn, apiKey: string, env: GatewayEnvironment, id: string): Promise<GatewayChargeState> {
  const res = await requestWithRetry(doFetch, `${base(env)}/api/v2/transactions/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: { "x-api-key": apiKey, Accept: "application/json" },
  });
  return mapLeonaPayment(await parseOrThrow(res));
}

/** Sandbox: simula o pagamento (PAID | FAILED | EXPIRED). Nunca usar com chave de produção. */
export async function simulateSandboxPayment(
  doFetch: FetchFn, apiKey: string, id: string, status: "PAID" | "FAILED" | "EXPIRED",
): Promise<void> {
  const res = await requestWithRetry(doFetch, `${base("sandbox")}/api/v2/simulations/payments/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  await parseOrThrow(res);
}

/** x-leonapay-signature = `sha256=<hex HMAC-SHA256("<timestamp>.<eventId>.<corpo bruto>", whsec)>`, ±5 min. */
export async function verifyLeonaDelivery(input: {
  timestamp: string | null;
  eventId: string | null;
  signature: string | null;
  rawBody: string;
  secret: string;
  nowSec?: number;
  toleranceSec?: number;
}): Promise<{ ok: boolean; reason?: string }> {
  if (!input.timestamp || !input.eventId || !input.signature) return { ok: false, reason: "missing_headers" };
  const t = Number(input.timestamp);
  if (!Number.isFinite(t)) return { ok: false, reason: "malformed_timestamp" };
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > (input.toleranceSec ?? 300)) return { ok: false, reason: "stale_timestamp" };
  const expected = "sha256=" + await hmacSha256Hex(input.secret, `${input.timestamp}.${input.eventId}.${input.rawBody}`);
  return timingSafeEqualStr(expected, input.signature.trim()) ? { ok: true } : { ok: false, reason: "bad_signature" };
}

export interface LeonaEvent {
  id?: string;
  event?: string;
  type?: string;
  data?: any;
}

/** Devolve o estado do pagamento descrito pelo evento (formatos `event`/`type` coexistem na doc). */
export function interpretLeonaEvent(e: LeonaEvent): { kind: "payment"; state: GatewayChargeState; reference: string | null } | { kind: "ignored" } {
  const name = String(e?.event ?? e?.type ?? "");
  if (!name.startsWith("payment.") || !e?.data?.id) return { kind: "ignored" };
  const state = mapLeonaPayment({ data: e.data });
  const byEvent: Record<string, ChargeStatus | undefined> = {
    "payment.paid": "paid", "payment.failed": "failed", "payment.expired": "expired",
  };
  if (byEvent[name]) state.status = byEvent[name]!;
  return { kind: "payment", state, reference: e.data?.reference ?? null };
}
