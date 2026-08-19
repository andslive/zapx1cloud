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
