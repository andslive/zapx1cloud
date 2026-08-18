// FASE 2A — validação de assinatura do webhook da Meta (X-Hub-Signature-256).
//
// Requisito inegociável documentado na Fase 1: HMAC-SHA256 sobre o CORPO
// BRUTO (raw body, string/bytes exatos recebidos, antes de qualquer
// `JSON.parse`/re-serialização), comparação em tempo constante. Qualquer
// middleware que reserializasse o JSON antes desta checagem quebraria a
// validação — por isso o corpo bruto precisa ser capturado no handler da
// Edge Function ANTES de chamar `.json()`.
//
// Funções puras, sem I/O de rede — testáveis isoladamente.

const SIGNATURE_PREFIX = "sha256=";

/** SHA-256 HMAC em hex minúsculo, via Web Crypto (disponível no runtime Deno). */
export async function computeHmacSha256Hex(rawBody: string | Uint8Array, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const keyData = enc.encode(secret);
  const bodyBytes = typeof rawBody === "string" ? enc.encode(rawBody) : rawBody;

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, bodyBytes as BufferSource);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Comparação em tempo constante entre duas strings hex de mesmo tamanho
 * esperado. Não usa `===`/`localeCompare` (que podem retornar em curto-
 * circuito na primeira diferença) — acumula OR bit a bit em todos os
 * caracteres antes de decidir.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Ainda assim percorre `b` inteiro comparando contra `a` (módulo do
    // tamanho de `a`) para não vazar o tamanho via tempo de forma óbvia
    // em relação ao caso de tamanho igual — proteção best-effort, não uma
    // prova formal de constant-time em JS/V8.
    let dummy = 0;
    for (let i = 0; i < b.length; i++) dummy |= b.charCodeAt(i) ^ (a.charCodeAt(i % Math.max(a.length, 1)) || 0);
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export interface VerifyMetaWebhookSignatureResult {
  valid: boolean;
  reason?: "missing_header" | "malformed_header" | "mismatch" | "missing_secret";
}

/**
 * Valida o header `X-Hub-Signature-256` contra o corpo bruto recebido.
 * NUNCA parsear o JSON antes de chamar esta função — `rawBody` deve ser
 * exatamente os bytes/string recebidos na requisição.
 */
export async function verifyMetaWebhookSignature(
  rawBody: string | Uint8Array,
  signatureHeader: string | null | undefined,
  appSecret: string | null | undefined,
): Promise<VerifyMetaWebhookSignatureResult> {
  if (!appSecret) {
    return { valid: false, reason: "missing_secret" };
  }
  if (!signatureHeader) {
    return { valid: false, reason: "missing_header" };
  }
  if (!signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    return { valid: false, reason: "malformed_header" };
  }
  const receivedHex = signatureHeader.slice(SIGNATURE_PREFIX.length).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(receivedHex)) {
    return { valid: false, reason: "malformed_header" };
  }

  const expectedHex = await computeHmacSha256Hex(rawBody, appSecret);
  const valid = timingSafeEqualHex(expectedHex, receivedHex);
  return valid ? { valid: true } : { valid: false, reason: "mismatch" };
}
