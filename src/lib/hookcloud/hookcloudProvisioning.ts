// FASE 18A — lógica pura do onboarding manual HookCloud (frontend).
//
// Extraído do componente React em módulos sem dependência de DOM/React,
// no MESMO padrão já usado em `src/config/integrationsCatalog.ts` — só
// assim é possível testar via Deno (`deno test`), já que este repositório
// não tem infraestrutura de teste de componente React (nenhum Vitest/
// Jest/Testing Library instalado — confirmado por leitura de
// `package.json` antes de implementar; ver relatório da Fase 18A).
//
// Responsabilidades, e SOMENTE estas:
//   1) validar os campos do formulário como o backend já auditado exige
//      (strings opacas, nunca número — mesma regra de
//      `hookcloud-provision-connection/index.ts`, `isPlausibleOpaqueId`);
//   2) montar o corpo EXATO da requisição — nunca inclui organizationId,
//      provider ou onboardingSource (fixados exclusivamente no backend);
//   3) validar a FORMA da resposta de sucesso antes de exibir qualquer
//      segredo — falha fechada para qualquer resposta inesperada/
//      malformada, nunca finge sucesso;
//   4) classificar erros de forma seguRA (rede/timeout vs. erro HTTP
//      conhecido) sem nunca inventar ou ecoar texto interno do backend.

const MAX_OPAQUE_ID_LENGTH = 64; // mesmo limite de isPlausibleOpaqueId no backend

/** Mesma regra do backend: string não vazia, comprimento razoável, NUNCA convertida para número. */
export function isPlausibleOpaqueId(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_OPAQUE_ID_LENGTH;
}

export interface HookCloudOnboardingFormValues {
  connectionName: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  accessToken: string;
}

export interface FieldErrors {
  connectionName?: string;
  wabaId?: string;
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  accessToken?: string;
}

/**
 * Valida os campos do formulário ANTES de montar a requisição — mesmas
 * regras do backend (strings opacas não vazias, limite de 64
 * caracteres), para dar feedback imediato sem depender de uma resposta
 * 400 do servidor. Nunca é a autoridade final: o backend revalida tudo
 * de forma idêntica e independente.
 */
export function validateHookCloudOnboardingForm(values: HookCloudOnboardingFormValues): FieldErrors {
  const errors: FieldErrors = {};
  if (!isPlausibleOpaqueId(values.connectionName)) {
    errors.connectionName = 'Informe um nome para identificar esta conexão.';
  }
  if (!isPlausibleOpaqueId(values.wabaId)) {
    errors.wabaId = 'Informe o WABA ID exatamente como exibido no painel.';
  }
  if (!isPlausibleOpaqueId(values.phoneNumberId)) {
    errors.phoneNumberId = 'Informe o Phone Number ID exatamente como exibido no painel.';
  }
  if (!isPlausibleOpaqueId(values.displayPhoneNumber)) {
    errors.displayPhoneNumber = 'Informe o número de telefone desta conexão.';
  }
  if (typeof values.accessToken !== 'string' || values.accessToken.trim().length === 0) {
    errors.accessToken = 'Cole o Meta Access Token fornecido pela HookCloud.';
  }
  return errors;
}

export function hasFieldErrors(errors: FieldErrors): boolean {
  return Object.values(errors).some((v) => v !== undefined);
}

/**
 * Corpo EXATO enviado a `hookcloud-provision-connection` — trim externo
 * em cada string opaca, nunca conversão numérica. Deliberadamente NUNCA
 * inclui `organizationId`, `provider` ou `onboardingSource`: esses
 * valores são fixados exclusivamente no backend (RPC
 * `provision_hookcloud_meta_connection`), nunca influenciáveis pelo
 * cliente — confirmado no contrato já auditado nas Fases 13A/13B/16A.
 */
export function buildHookCloudProvisionRequestBody(values: HookCloudOnboardingFormValues): Record<string, string> {
  return {
    connectionName: values.connectionName.trim(),
    wabaId: values.wabaId.trim(),
    phoneNumberId: values.phoneNumberId.trim(),
    displayPhoneNumber: values.displayPhoneNumber.trim(),
    accessToken: values.accessToken.trim(),
  };
}

export interface HookCloudProvisionSuccess {
  connectionId: string;
  onboardingState: 'pending';
  callbackUrl: string;
  verifyToken: string;
}

export type ProvisionResultOutcome =
  | { kind: 'success'; data: HookCloudProvisionSuccess }
  | { kind: 'unexpected_response' } // 2xx mas corpo não bate com o contrato esperado — nunca finge sucesso
  | { kind: 'not_pending' } // resposta tecnicamente válida mas onboarding_state != 'pending' — nunca deveria acontecer, falha fechada mesmo assim
  | { kind: 'network_or_timeout' } // resultado AMBÍGUO — pode ter commitado no backend sem a resposta chegar
  | { kind: 'http_error'; status: number; code: string };

/**
 * Valida a FORMA da resposta de sucesso — nunca confia cegamente que um
 * status 2xx significa que os campos esperados existem. Exige
 * explicitamente: `connection_id` (string não vazia), `onboarding_state
 * === 'pending'` (NUNCA 'active' — se algum dia vier diferente de
 * 'pending', trata como resposta inesperada, nunca mostra um segredo
 * como se a conexão estivesse ativa), `callback_url` iniciando com
 * `https://` e contendo o caminho real do webhook com o parâmetro `hcs`,
 * `verify_token` não vazio.
 */
export function parseHookCloudProvisionSuccessBody(body: unknown): ProvisionResultOutcome {
  if (typeof body !== 'object' || body === null) return { kind: 'unexpected_response' };
  const b = body as Record<string, unknown>;

  const connectionId = b.connection_id;
  const onboardingState = b.onboarding_state;
  const callbackUrl = b.callback_url;
  const verifyToken = b.verify_token;

  if (typeof connectionId !== 'string' || connectionId.trim().length === 0) {
    return { kind: 'unexpected_response' };
  }
  if (typeof callbackUrl !== 'string' || !isTrustedHookCloudCallbackUrl(callbackUrl)) {
    return { kind: 'unexpected_response' };
  }
  if (typeof verifyToken !== 'string' || verifyToken.trim().length === 0) {
    return { kind: 'unexpected_response' };
  }
  if (onboardingState !== 'pending') {
    return { kind: 'not_pending' };
  }

  return {
    kind: 'success',
    data: { connectionId, onboardingState: 'pending', callbackUrl, verifyToken },
  };
}

/**
 * A UI recusa exibir uma callback URL que não seja HTTPS e que não
 * aponte para o caminho real do webhook com o parâmetro `hcs` — mesmo
 * que, por alguma falha, o backend algum dia devolvesse algo diferente
 * (defesa em profundidade do lado do cliente; o backend já é auditado
 * para nunca fazer isso, mas a UI nunca confia cegamente).
 */
export function isTrustedHookCloudCallbackUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (!parsed.pathname.endsWith('/functions/v1/meta-cloud-webhook')) return false;
  if (!parsed.searchParams.has('hcs') || parsed.searchParams.get('hcs')!.trim().length === 0) return false;
  return true;
}

/**
 * Classifica o resultado de uma chamada a `supabase.functions.invoke`.
 * NUNCA ecoa `error.message`/`error.context` bruto do SDK na interface —
 * só um código curto e seguro. Erro de rede/timeout é tratado como
 * AMBÍGUO (nunca "falhou"), porque o provisionamento já pode ter
 * commitado no banco antes da resposta se perder — ver Fase 18A, Parte 5.
 */
/** Lê `context.status` de um erro do SDK de forma segura, sem `any` — o SDK tipa `context` como `any`, mas em runtime é um objeto com `status?: number` para `FunctionsHttpError`. */
function extractHttpStatus(context: unknown): number | undefined {
  if (context && typeof context === 'object' && 'status' in context) {
    const status = (context as Record<string, unknown>).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

export function classifyProvisionInvokeResult(
  data: unknown,
  error: { message?: string; context?: unknown } | null,
): ProvisionResultOutcome {
  if (error) {
    const status = extractHttpStatus(error.context);
    if (typeof status !== 'number') {
      // Sem status HTTP identificável — falha de rede/timeout, nunca
      // presumida como "não criou nada".
      return { kind: 'network_or_timeout' };
    }
    const errorField = typeof data === 'object' && data !== null && 'error' in data
      ? (data as Record<string, unknown>).error
      : undefined;
    const code = typeof errorField === 'string' ? errorField : 'unknown_error';
    return { kind: 'http_error', status, code };
  }
  return parseHookCloudProvisionSuccessBody(data);
}

/** Mensagem pública curta e segura por código de erro conhecido — nunca texto interno do backend. */
export function publicErrorMessageForCode(status: number, code: string): string {
  switch (code) {
    case 'not_authenticated':
      return 'Sua sessão expirou. Atualize a página e faça login novamente.';
    case 'no_organization':
    case 'user_disabled':
      return 'Sua conta não tem permissão para provisionar conexões HookCloud.';
    case 'insufficient_role':
      return 'Apenas administradores podem provisionar conexões HookCloud.';
    case 'organization_mismatch':
      return 'Não foi possível confirmar sua organização. Atualize a página e tente novamente.';
    case 'hookcloud_disabled':
    case 'meta_cloud_disabled_for_organization':
      return 'O piloto HookCloud ainda não está habilitado para sua organização.';
    case 'invalid_connection_name':
    case 'invalid_waba_id':
    case 'invalid_phone_number_id':
    case 'invalid_display_phone_number':
    case 'invalid_business_id':
      return 'Verifique os dados informados e tente novamente.';
    case 'empty_token':
    case 'invalid_token':
      return 'O Meta Access Token informado não é válido.';
    case 'phone_number_id_or_waba_conflict':
      return 'Já existe uma conexão com este Phone Number ID ou WABA ID.';
    case 'origin_not_allowed':
    case 'unsupported_media_type':
    case 'malformed_json':
    case 'payload_too_large':
    case 'invalid_encoding':
      return 'Não foi possível enviar a solicitação. Atualize a página e tente novamente.';
    default:
      if (status >= 500) return 'Falha interna ao provisionar a conexão. Tente novamente em instantes.';
      return 'Não foi possível provisionar a conexão.';
  }
}
