// "Testar conexão": consulta autenticada, NUNCA cria cobrança.
// Resultado em duas partes independentes: credencial aceita? método disponível?
//
// ColocaPay: parser segue o OpenAPI oficial. LeonaPay: o formato de GET /api/v2/payment-methods
// não está documentado; o parser é tolerante e `parser_confidence` sinaliza a heurística até o
// primeiro teste com credencial de sandbox.

import { gatewayBaseUrl, type GatewayEnvironment, type GatewayProvider } from "./catalog.ts";

export interface ConnectionTestResult {
  credential_accepted: boolean;
  method_available: boolean | null; // null = não foi possível avaliar
  detail: string;
  http_status: number | null;
  limits?: { min?: number; max?: number };
  parser_confidence: "matched" | "heuristic" | "none";
  checked_at: string;
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

const norm = (v: unknown) => String(v ?? "").trim().toUpperCase();

function* walk(node: unknown, depth = 0): Generator<Record<string, unknown>> {
  if (depth > 6 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) yield* walk(n, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  yield obj;
  for (const v of Object.values(obj)) yield* walk(v, depth + 1);
}

const pick = (o: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined) return o[k];
  return undefined;
};

function isExplicitlyOff(o: Record<string, unknown>): boolean {
  for (const k of ["available", "enabled", "active", "isEnabled", "is_enabled"]) {
    if (o[k] === false) return true;
  }
  const st = norm(pick(o, ["status", "state"]));
  return ["DISABLED", "INACTIVE", "UNAVAILABLE", "BLOCKED"].includes(st);
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * ColocaPay (contrato OpenAPI oficial): GET /public/payments/corridors devolve
 * `{ corridors: [{ rail, country, currency, direction, available, unavailable_reason,
 *   limits: [{ payer_type: "PERSON"|"COMPANY", min_amount, max_amount }] }] }`.
 * Corredor ausente = não oferecido; `available:false` = indisponível (ex.: rail_disabled,
 * no_fee_config). Pagador de SPEI é PESSOA, então os limites PERSON têm prioridade.
 */
export function parseColocaCorridors(body: unknown): Pick<ConnectionTestResult, "method_available" | "limits" | "parser_confidence" | "detail"> {
  const list = Array.isArray((body as any)?.corridors) ? ((body as any).corridors as Record<string, unknown>[]) : null;
  if (!list) {
    return { method_available: null, parser_confidence: "none", detail: "Resposta de corridors fora do formato esperado (campo corridors ausente)." };
  }
  const found = list.find((c) =>
    norm(c.rail) === "SPEI" && norm(c.country) === "MEX" && norm(c.currency) === "MXN" &&
    (c.direction === undefined || norm(c.direction) === "PAYIN")
  );
  if (!found) {
    return { method_available: false, parser_confidence: "matched", detail: "SPEI/MEX/MXN não é oferecido para esta conta." };
  }
  if (found.available !== true) {
    const why = found.unavailable_reason ? ` (${String(found.unavailable_reason)})` : "";
    return { method_available: false, parser_confidence: "matched", detail: `SPEI/MEX/MXN indisponível agora${why}.` };
  }
  const limits = Array.isArray(found.limits) ? (found.limits as Record<string, unknown>[]) : [];
  const lim = limits.find((l) => norm(l.payer_type) === "PERSON") ?? limits[0];
  const min = lim ? num(lim.min_amount) : undefined;
  const max = lim ? num(lim.max_amount) : undefined;
  return {
    method_available: true,
    limits: { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) },
    parser_confidence: "matched",
    detail: "Corredor SPEI/MEX/MXN disponível.",
  };
}

/** LeonaPay: procura OXXO/MXN em payment-methods. */
export function parseLeonaMethods(body: unknown): Pick<ConnectionTestResult, "method_available" | "limits" | "parser_confidence" | "detail"> {
  let found: Record<string, unknown> | undefined;
  for (const o of walk(body)) {
    const m = norm(pick(o, ["method", "code", "type", "id", "name"]));
    const cur = norm(pick(o, ["currency", "currencyCode"]));
    if (m === "OXXO" && (cur === "" || cur === "MXN")) {
      found = o;
      break;
    }
  }
  if (!found) {
    return { method_available: false, parser_confidence: "none", detail: "OXXO/MXN não consta nos métodos desta conta (SPEI habilitado não garante OXXO)." };
  }
  if (isExplicitlyOff(found)) {
    return { method_available: false, parser_confidence: "matched", detail: "OXXO/MXN presente, mas indisponível para esta conta." };
  }
  const min = num(pick(found, ["minAmount", "min_amount", "min"]));
  const max = num(pick(found, ["maxAmount", "max_amount", "max"]));
  return {
    method_available: true,
    limits: { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) },
    parser_confidence: found["available"] === true ? "matched" : "heuristic",
    detail: "OXXO/MXN habilitado.",
  };
}

export async function testGatewayConnection(
  provider: GatewayProvider,
  environment: GatewayEnvironment,
  apiKey: string,
  doFetch: FetchFn = fetch,
): Promise<ConnectionTestResult> {
  const base = gatewayBaseUrl(provider, environment);
  const path = provider === "colocapay" ? "/public/payments/corridors" : "/api/v2/payment-methods";
  const checked_at = new Date().toISOString();
  const fail = (detail: string, http_status: number | null, credential_accepted = false): ConnectionTestResult => ({
    credential_accepted,
    method_available: null,
    detail,
    http_status,
    parser_confidence: "none",
    checked_at,
  });

  let res: Response;
  try {
    res = await doFetch(base + path, {
      method: "GET",
      headers: { "x-api-key": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch (_e) {
    return fail("Falha de rede ao consultar o gateway (sem resposta).", null);
  }
  if (res.status === 401 || res.status === 403) {
    return fail("Credencial recusada pelo gateway. Confira a chave e o ambiente selecionado.", res.status);
  }
  if (!res.ok) {
    return fail(`Gateway respondeu HTTP ${res.status}; não foi possível avaliar a conta.`, res.status);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch (_e) {
    return { ...fail("Credencial aceita, mas a resposta não é JSON legível.", res.status, true) };
  }
  const parsed = provider === "colocapay" ? parseColocaCorridors(body) : parseLeonaMethods(body);
  return { credential_accepted: true, http_status: res.status, checked_at, ...parsed };
}

/** Máscara para exibição: nunca devolve mais que os 4 últimos caracteres. */
export function maskSecret(last4: string | null | undefined): string | null {
  return last4 ? `••••••••${last4}` : null;
}
