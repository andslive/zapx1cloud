// FASE 2A — erros normalizados do contrato de provider de WhatsApp.
// Todo adapter (UazAPI, Meta Cloud API) deve lançar `WhatsAppProviderError`
// através de `createWhatsAppProviderError`, nunca um Error genérico — isso
// permite que o chamador (Fase 2B) trate falhas de forma consistente entre
// providers, sem precisar conhecer os detalhes internos de cada um.

import type { WhatsAppProviderError } from "./types.ts";

export type WhatsAppErrorCode =
  | "PROVIDER_UNKNOWN" // valor de `provider` na conexão não é 'uazapi' nem 'meta_cloud' — falha fechado, nunca assume um default
  | "PROVIDER_NOT_CONFIGURED" // provider reconhecido, mas sem credenciais/config suficientes para operar
  | "FEATURE_DISABLED" // feature flag da Meta Cloud API desligada (global ou por organização)
  | "ORG_MISMATCH" // connection_id não pertence à organization_id informada — nunca revela a organização real
  | "CONNECTION_NOT_FOUND"
  | "MISSING_CREDENTIALS"
  | "TEMPLATE_NOT_SUPPORTED" // ex.: UazAPI não tem conceito de template aprovado pela Meta
  | "OUTSIDE_WINDOW_NO_TEMPLATE" // Cloud API: fora da janela de 24h e nenhum template foi passado
  | "NOT_IMPLEMENTED_FASE_2A" // funcionalidade deliberadamente não implementada nesta fase (ex.: downloadMedia do adapter UazAPI)
  | "UPSTREAM_HTTP_ERROR"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_INVALID_RESPONSE"
  | "SECRET_ACCESS_DENIED"; // FASE 2B.0 — RPC de Vault negou acesso (config ausente, cross-org, revogado, etc.) — mensagem sempre genérica, nunca revela o motivo exato

const RETRYABLE_CODES: ReadonlySet<WhatsAppErrorCode> = new Set([
  "UPSTREAM_HTTP_ERROR",
  "UPSTREAM_TIMEOUT",
]);

export interface CreateWhatsAppProviderErrorOptions {
  retryable?: boolean;
  providerErrorCode?: string;
  providerErrorSubcode?: string;
  providerTraceId?: string;
  cause?: unknown;
}

export function createWhatsAppProviderError(
  code: WhatsAppErrorCode,
  message: string,
  opts: CreateWhatsAppProviderErrorOptions = {},
): WhatsAppProviderError {
  const err = new Error(message) as WhatsAppProviderError;
  err.name = "WhatsAppProviderError";
  err.code = code;
  err.retryable = opts.retryable ?? RETRYABLE_CODES.has(code);
  if (opts.providerErrorCode) err.providerErrorCode = opts.providerErrorCode;
  if (opts.providerErrorSubcode) err.providerErrorSubcode = opts.providerErrorSubcode;
  if (opts.providerTraceId) err.providerTraceId = opts.providerTraceId;
  if (opts.cause !== undefined) {
    // @ts-ignore — Error.cause existe no runtime (ES2022/Deno), tipagem pode divergir conforme lib alvo.
    err.cause = opts.cause;
  }
  return err;
}

export function isWhatsAppProviderError(err: unknown): err is WhatsAppProviderError {
  return !!err && typeof err === "object" && (err as any).name === "WhatsAppProviderError" &&
    typeof (err as any).code === "string";
}
