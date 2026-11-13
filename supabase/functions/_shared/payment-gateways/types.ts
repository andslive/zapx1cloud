export type ChargeStatus = "creating" | "awaiting_instructions" | "pending" | "paid" | "failed" | "expired";

/** Resultado normalizado de qualquer gateway (criação ou consulta). */
export interface GatewayChargeState {
  externalId: string;
  status: ChargeStatus;
  paymentCode: string | null;
  paymentQrcode: string | null;
  paymentLink: string | null;
  expiresAt: string | null;
  bankName: string | null;
  beneficiary: string | null;
  amount: string | null; // decimal string como veio do gateway
  errorCode: string | null;
}

export class GatewayError extends Error {
  constructor(
    public code: string,
    public httpStatus: number | null,
    /** true quando repetir a MESMA requisição (mesma chave) é seguro e útil. */
    public retryable: boolean,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

/** Normaliza valores monetários para string decimal com 2 casas ("250.00"). */
export function toMoney(v: unknown): string | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

/** Envia a requisição; em timeout/429/5xx repete a MESMA requisição (mesma chave/payload). */
export async function requestWithRetry(
  doFetch: FetchFn,
  url: string,
  init: RequestInit,
  opts: { retries?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Response> {
  const retries = opts.retries ?? 2;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await doFetch(url, { ...init, signal: AbortSignal.timeout(15000) });
      if (res.status === 429 || res.status >= 500) {
        last = new GatewayError(`http_${res.status}`, res.status, true);
        if (attempt < retries) {
          await sleep(300 * 2 ** attempt + Math.floor(Math.random() * 100));
          continue;
        }
        return res;
      }
      return res;
    } catch (e) {
      last = e;
      if (attempt < retries) {
        await sleep(300 * 2 ** attempt + Math.floor(Math.random() * 100));
        continue;
      }
    }
  }
  throw last instanceof GatewayError ? last : new GatewayError("network_error", null, true);
}
