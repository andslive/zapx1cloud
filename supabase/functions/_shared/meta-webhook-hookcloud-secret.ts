// FASE 11A — verificação do segredo opaco de callback do modo webhook
// direto HookCloud. MITIGAÇÃO, NÃO substitui HMAC — só participa do gate
// quando `onboarding_source = 'hookcloud'` (ver meta-webhook-hookcloud-gate.ts).
// O caminho `direct_meta` continua exigindo exclusivamente HMAC válido via
// meta-webhook-signature.ts, intocado nesta fase.
//
// Reaproveita, em vez de duplicar: `sha256Hex` (meta-webhook-idempotency.ts)
// para o hash, e `timingSafeEqualHex` (meta-webhook-signature.ts) para a
// comparação em tempo constante do hash hex.
//
// Requisitos atendidos aqui (ver também a migration
// 20260819100000_meta_cloud_hookcloud_webhook_secret.sql, NÃO aplicada):
//   - valor bruto do segredo nunca é logado por este módulo — nenhuma
//     função aqui recebe um "logger" ou chama console.*; quem chamar isto
//     é responsável por nunca logar o `rawSecret` de entrada.
//   - comparação em tempo constante via timingSafeEqualHex (já auditado).
//   - GET verify_token nunca é aceito como substituto: este módulo não
//     tem nenhuma referência a `hub.verify_token`/GET — é deliberadamente
//     um mecanismo separado, só para POST.

import { sha256Hex } from "./meta-webhook-idempotency.ts";
import { timingSafeEqualHex } from "./meta-webhook-signature.ts";

/** >= 256 bits = 32 bytes. Um segredo hex de 32 bytes tem 64 caracteres. */
export const MIN_HOOKCLOUD_SECRET_HEX_LENGTH = 64;
const RAW_SECRET_BYTES = 32; // 256 bits

/**
 * Verifica se `rawSecretHexLength` (o comprimento em caracteres hex do
 * segredo bruto, não o segredo em si) atende ao mínimo de entropia
 * exigido. Não decide nada sobre validade de conteúdo — só é usado ao
 * PROVISIONAR um novo segredo (fora do escopo desta fase: nenhuma conexão
 * HookCloud existe ainda), nunca durante a verificação de um POST
 * recebido (onde o comprimento não é reavaliado — só o hash importa).
 */
export function hasMinimumHookCloudSecretEntropy(rawSecretHexLength: number): boolean {
  return rawSecretHexLength >= MIN_HOOKCLOUD_SECRET_HEX_LENGTH;
}

/** Hash SHA-256 (hex) do segredo bruto — é isto, nunca o valor bruto, que é armazenado. */
export async function hashHookCloudWebhookSecret(rawSecret: string): Promise<string> {
  return await sha256Hex(rawSecret);
}

/**
 * Compara o segredo bruto recebido num POST contra o hash armazenado para
 * a conexão, em tempo constante. `storedHash` ausente (null/undefined/"")
 * é tratado como "nenhum segredo configurado" — SEMPRE reprova, nunca é
 * interpretado como "qualquer segredo serve".
 */
export async function verifyHookCloudWebhookSecret(
  rawSecretFromRequest: string | null | undefined,
  storedHash: string | null | undefined,
): Promise<boolean> {
  if (!storedHash) return false;
  if (!rawSecretFromRequest) return false;
  const computedHash = await hashHookCloudWebhookSecret(rawSecretFromRequest);
  return timingSafeEqualHex(computedHash, storedHash);
}

// FASE 13A — geração do segredo bruto (provisionamento, não verificação).
//
// CSPRNG via `crypto.getRandomValues` (Web Crypto, disponível no runtime
// Deno — mesma API já usada em `meta-webhook-signature.ts` para HMAC).
// Codificação hex: já é URL-safe por construção (alfabeto `0-9a-f`, sem
// `+`/`/`/`=` que exigiriam escaping numa query string) — consistente com
// `MIN_HOOKCLOUD_SECRET_HEX_LENGTH`/`hasMinimumHookCloudSecretEntropy`
// já existentes acima, que assumem exatamente este formato. 32 bytes
// aleatórios = 256 bits de entropia real (não apenas comprimento de
// string) = 64 caracteres hex.
//
// O valor retornado aqui NUNCA deve ser persistido em nenhuma tabela —
// só `hashHookCloudWebhookSecret(valor)` é persistido. O chamador (Edge
// Function de provisionamento) é responsável por devolver este valor ao
// administrador exatamente uma vez, e nunca logá-lo.
export function generateHookCloudCallbackSecret(): string {
  const bytes = new Uint8Array(RAW_SECRET_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// FASE 14A — verify token individual por conexão HookCloud.
//
// Segredo INDEPENDENTE do callback secret acima: gerado por uma chamada
// SEPARADA a `crypto.getRandomValues` (nunca deriva um do outro, nunca
// reaproveita os mesmos bytes), com o mesmo formato (32 bytes = 256 bits,
// hex, URL-safe por construção). Autentica EXCLUSIVAMENTE o GET
// `hub.verify_token` — nunca participa da verificação do POST (essa
// continua sendo só `verifyHookCloudWebhookSecret`, acima, inalterada).
// Só o hash SHA-256 é persistido (ver migration 20260819300000, NÃO
// aplicada); o valor bruto só existe em memória e na resposta única do
// provisionamento/rotação.

export function generateHookCloudVerifyToken(): string {
  const bytes = new Uint8Array(RAW_SECRET_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hash SHA-256 (hex) do verify token bruto — é isto, nunca o valor bruto, que é armazenado. */
export async function hashHookCloudVerifyToken(rawToken: string): Promise<string> {
  return await sha256Hex(rawToken);
}

/**
 * Compara o `hub.verify_token` recebido num GET contra o hash armazenado
 * para a conexão, em tempo constante — mesmo padrão de
 * `verifyHookCloudWebhookSecret`. `storedHash` ausente é tratado como
 * "nenhum verify token configurado" — SEMPRE reprova.
 */
export async function verifyHookCloudVerifyToken(
  rawTokenFromRequest: string | null | undefined,
  storedHash: string | null | undefined,
): Promise<boolean> {
  if (!storedHash) return false;
  if (!rawTokenFromRequest) return false;
  const computedHash = await hashHookCloudVerifyToken(rawTokenFromRequest);
  return timingSafeEqualHex(computedHash, storedHash);
}
