// FASE 18G — lógica pura do frontend de rotação de credenciais HookCloud
// (callback secret e/ou verify token de uma conexão JÁ existente).
//
// Contexto: a Fase 18F concluiu que o bloqueio de navegação SPA para
// `navigate()` programático (fora de um clique em `<a>`) não é
// alcançável de forma confiável sem migrar o roteador para
// `createBrowserRouter`/`RouterProvider` (mudança estrutural fora de
// proporção para este problema — ver relatório da Fase 18G). Em vez de
// tentar bloquear TODA forma possível de perder o segredo (impossível de
// garantir por completo — fechamento abrupto do navegador nunca é
// controlável), esta fase implementa a Alternativa B explicitamente
// preferida: uma UI real de recuperação, chamando o endpoint já
// implantado (inerte) `hookcloud-rotate-credentials` (Fases 14A/16A/16B/
// 17B) — se o administrador perder o callback URL/verify token por
// qualquer motivo, pode gerar um par novo, invalidando o anterior.
//
// Mesmo padrão de segurança já auditado em `hookcloudProvisioning.ts`:
// nunca envia `organizationId` (o backend deriva do perfil autenticado,
// só aceita o campo para comparação cross-tenant, nunca como
// autoridade); valida estritamente a forma da resposta de sucesso antes
// de exibir qualquer segredo; nunca finge sucesso; erro de rede/timeout
// é sempre ambíguo, nunca "falhou" definitivo; nunca ecoa texto bruto do
// backend.

import { extractErrorCodeFromResponse, extractResponseStatus, isTrustedHookCloudCallbackUrl } from './hookcloudProvisioning';

export interface RotateHookCloudCredentialsRequest {
  connectionId: string;
  rotateCallbackSecret: boolean;
  rotateVerifyToken: boolean;
}

/**
 * Corpo EXATO enviado a `hookcloud-rotate-credentials`. Nunca inclui
 * `organizationId` — o backend já deriva a organização do perfil
 * autenticado (mesmo contrato de `hookcloud-provision-connection`).
 */
export function buildRotateHookCloudRequestBody(input: RotateHookCloudCredentialsRequest): Record<string, unknown> {
  return {
    connectionId: input.connectionId.trim(),
    rotateCallbackSecret: input.rotateCallbackSecret === true,
    rotateVerifyToken: input.rotateVerifyToken === true,
  };
}

export interface HookCloudRotateSuccess {
  connectionId: string;
  onboardingState: 'pending';
  /** `null` quando `rotateCallbackSecret` não foi pedido nesta chamada — nunca reaproveita um valor de uma chamada anterior. */
  callbackUrl: string | null;
  /** `null` quando `rotateVerifyToken` não foi pedido nesta chamada. */
  verifyToken: string | null;
}

export type RotateResultOutcome =
  | { kind: 'success'; data: HookCloudRotateSuccess }
  | { kind: 'unexpected_response' }
  | { kind: 'not_pending' }
  | { kind: 'network_or_timeout' }
  | { kind: 'http_error'; status: number; code: string };

/**
 * Valida a FORMA da resposta de sucesso — nunca confia num status 2xx
 * sozinho. Exige exatamente os campos que foram PEDIDOS nesta chamada
 * (`requested`): se `rotateCallbackSecret` foi pedido, `callback_url`
 * precisa existir e ser confiável (mesmo validador de origin exato de
 * `hookcloudProvisioning.ts`); se não foi pedido, o campo é ignorado
 * (o backend também não o envia). `onboarding_state` precisa ser
 * SEMPRE `'pending'` — uma rotação bem-sucedida nunca deveria produzir
 * outro estado; qualquer outro valor falha fechado.
 */
export function parseRotateHookCloudSuccessBody(
  body: unknown,
  expectedCallbackOrigin: string,
  requested: Pick<RotateHookCloudCredentialsRequest, 'rotateCallbackSecret' | 'rotateVerifyToken'>,
): RotateResultOutcome {
  if (typeof body !== 'object' || body === null) return { kind: 'unexpected_response' };
  const b = body as Record<string, unknown>;

  const connectionId = b.connection_id;
  if (typeof connectionId !== 'string' || connectionId.trim().length === 0) {
    return { kind: 'unexpected_response' };
  }

  let callbackUrl: string | null = null;
  if (requested.rotateCallbackSecret) {
    const raw = b.callback_url;
    if (typeof raw !== 'string' || !isTrustedHookCloudCallbackUrl(raw, expectedCallbackOrigin)) {
      return { kind: 'unexpected_response' };
    }
    callbackUrl = raw;
  }

  let verifyToken: string | null = null;
  if (requested.rotateVerifyToken) {
    const raw = b.verify_token;
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return { kind: 'unexpected_response' };
    }
    verifyToken = raw;
  }

  if (b.onboarding_state !== 'pending') {
    return { kind: 'not_pending' };
  }

  return { kind: 'success', data: { connectionId, onboardingState: 'pending', callbackUrl, verifyToken } };
}

/** Mesma classificação de erro real do SDK já auditada em `classifyProvisionInvokeResult` — reutiliza os mesmos extratores, nunca duplica a lógica de leitura do `Response`. */
export async function classifyRotateInvokeResult(
  data: unknown,
  error: { name?: string; message?: string; context?: unknown } | null,
  expectedCallbackOrigin: string,
  requested: Pick<RotateHookCloudCredentialsRequest, 'rotateCallbackSecret' | 'rotateVerifyToken'>,
): Promise<RotateResultOutcome> {
  if (!error) {
    return parseRotateHookCloudSuccessBody(data, expectedCallbackOrigin, requested);
  }

  if (error.name === 'FunctionsHttpError') {
    const status = extractResponseStatus(error.context);
    if (typeof status !== 'number') return { kind: 'network_or_timeout' };
    const code = await extractErrorCodeFromResponse(error.context);
    return { kind: 'http_error', status, code };
  }

  return { kind: 'network_or_timeout' };
}

/** Mensagens públicas curtas e seguras por código de erro real de `hookcloud-rotate-credentials` — nunca texto interno do backend. */
export function publicRotateErrorMessageForCode(status: number, code: string): string {
  switch (code) {
    case 'not_authenticated':
      return 'Sua sessão expirou. Atualize a página e faça login novamente.';
    case 'no_organization':
    case 'user_disabled':
      return 'Sua conta não tem permissão para rotacionar credenciais HookCloud.';
    case 'insufficient_role':
      return 'Apenas administradores podem rotacionar credenciais HookCloud.';
    case 'organization_mismatch':
      return 'Não foi possível confirmar sua organização. Atualize a página e tente novamente.';
    case 'invalid_connection_id':
      return 'Conexão inválida.';
    case 'nothing_to_rotate':
      return 'Selecione pelo menos um valor para rotacionar.';
    case 'connection_not_found':
      return 'Conexão não encontrada.';
    case 'origin_not_allowed':
    case 'unsupported_media_type':
    case 'malformed_json':
    case 'payload_too_large':
    case 'invalid_encoding':
    case 'method_not_allowed':
      return 'Não foi possível enviar a solicitação. Atualize a página e tente novamente.';
    default:
      if (status >= 500) return 'Falha interna ao rotacionar as credenciais. Tente novamente em instantes.';
      return 'Não foi possível rotacionar as credenciais.';
  }
}
