// ColocaPay — SPEI/MEX/MXN. Contrato: OpenAPI oficial (Coloca Public API 1.0).
// Base já inclui /api/v1 (ver catalog.ts): os caminhos aqui NÃO repetem o prefixo.
import { GATEWAYS, type GatewayEnvironment } from "./catalog.ts";
import { hmacSha256Hex, timingSafeEqualStr } from "./crypto.ts";
import { type ChargeStatus, type FetchFn, GatewayError, type GatewayChargeState, requestWithRetry, toMoney } from "./types.ts";

const base = (env: GatewayEnvironment) => GATEWAYS.colocapay.baseUrls[env];
const headers = (apiKey: string) => ({ "x-api-key": apiKey, Accept: "application/json", "Content-Type": "application/json" });

export function mapColocaStatus(status: unknown, failureReason?: unknown): ChargeStatus {
  switch (String(status ?? "").toUpperCase()) {
    case "CONFIRMED":
      return "paid";
    case "REJECTED":
      return String(failureReason ?? "") === "expired" ? "expired" : "failed";
    case "FAILED":
    case "REVERSED":
      return "failed";
    default: // CREATED, PENDING
      return "pending";
  }
}

export function mapColocaPayin(p: any): GatewayChargeState {
  return {
    externalId: String(p?.id ?? ""),
    status: mapColocaStatus(p?.status, p?.failure_reason),
    paymentCode: typeof p?.clabe === "string" && p.clabe ? p.clabe : null, // CLABE como TEXTO (sem Number)
    paymentQrcode: null,
    paymentLink: null,
    expiresAt: p?.expires_at ?? null,
    bankName: null,
    beneficiary: null,
    amount: toMoney(p?.gross_amount),
    errorCode: p?.failure_reason ?? null,
  };
}

async function parseOrThrow(res: Response): Promise<any> {
  let body: any = null;
  try {
    body = await res.json();
  } catch { /* corpo vazio */ }
  if (res.ok) return body;
  const code = String(body?.error ?? body?.code ?? body?.message ?? `http_${res.status}`).slice(0, 80);
  // 409 idempotency_conflict em voo: seguro repetir depois; 4xx restantes são conclusivos.
  throw new GatewayError(code, res.status, res.status === 409 || res.status === 429 || res.status >= 500);
}

export interface ColocaCreateInput {
  amount: string; // "250.00"
  payerName: string;
  idempotencyKey: string; // uuid da tentativa (mesmo em todo retry)
  concept: string; // referência interna (volta nos eventos)
}

export async function createSpeiPayin(
  doFetch: FetchFn, apiKey: string, env: GatewayEnvironment, input: ColocaCreateInput,
): Promise<GatewayChargeState> {
  const res = await requestWithRetry(doFetch, `${base(env)}/public/payments/payins`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({
      rail: "SPEI",
      country: "MEX",
      currency: "MXN",
      gross_amount: input.amount,
      payer: { name: input.payerName },
      concept: input.concept.slice(0, 120),
      idempotency_key: input.idempotencyKey,
    }),
  });
  return mapColocaPayin(await parseOrThrow(res));
}

export async function getPayin(doFetch: FetchFn, apiKey: string, env: GatewayEnvironment, id: string): Promise<GatewayChargeState> {
  const res = await requestWithRetry(doFetch, `${base(env)}/public/payments/payins/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: headers(apiKey),
  });
  return mapColocaPayin(await parseOrThrow(res));
}

/**
 * Autentica uma entrega: `x-secret` igual ao segredo cadastrado E `x-coloca-signature`
 * = `t=<unix>,v1=<hex HMAC-SHA256("<t>.<corpo bruto>", segredo)>`, com tolerância de 5 min.
 */
export async function verifyColocaDelivery(input: {
  secretHeader: string | null;
  signatureHeader: string | null;
  rawBody: string;
  secret: string;
  nowSec?: number;
  toleranceSec?: number;
}): Promise<{ ok: boolean; reason?: string }> {
  if (!input.secretHeader || !timingSafeEqualStr(input.secretHeader, input.secret)) return { ok: false, reason: "bad_secret" };
  if (!input.signatureHeader) return { ok: false, reason: "missing_signature" };
  const parts = Object.fromEntries(
    input.signatureHeader.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1) return { ok: false, reason: "malformed_signature" };
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > (input.toleranceSec ?? 300)) return { ok: false, reason: "stale_timestamp" };
  const expected = await hmacSha256Hex(input.secret, `${t}.${input.rawBody}`);
  return timingSafeEqualStr(expected, parts.v1) ? { ok: true } : { ok: false, reason: "bad_signature" };
}

export interface ColocaEnvelope {
  id: string;
  type: string;
  event: string;
  created_at: string;
  data: any;
}

export function isColocaPing(e: Partial<ColocaEnvelope>): boolean {
  return e?.type === "test" && e?.event === "ping";
}

/** Só eventos de payin interessam; `payin_confirmed` confirma o pagamento. */
export function interpretColocaEvent(e: ColocaEnvelope): { kind: "payin"; state: GatewayChargeState; concept: string | null } | { kind: "ignored" } {
  if (e?.type !== "payments" || !String(e?.event ?? "").startsWith("payin_") || !e.data?.id) return { kind: "ignored" };
  const state = mapColocaPayin(e.data);
  // payin_confirmed/settled → pago; os demais seguem o status do próprio recurso.
  if (e.event === "payin_confirmed" || e.event === "payin_settled") state.status = "paid";
  return { kind: "payin", state, concept: e.data?.concept ?? null };
}
