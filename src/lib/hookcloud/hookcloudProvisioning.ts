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

/**
 * Timeout real da chamada de rede (Fase 18B, verificação obrigatória):
 * confirmado, lendo `FunctionsClient.ts` da versão instalada do SDK
 * (`@supabase/supabase-js@2.90.1`), que `invoke()` aceita uma opção
 * `timeout` (milissegundos) e internamente cria um `AbortController`
 * próprio — não é uma afirmação sem lastro, é um recurso real desta
 * versão do SDK. 20s é generoso o bastante para uma rede lenta sem
 * deixar o administrador esperando indefinidamente por uma função que
 * já deveria responder em segundos. Nunca há retry automático depois de
 * um timeout.
 */
export const HOOKCLOUD_PROVISION_TIMEOUT_MS = 20_000;

/** Estado sensível comunicado ao componente proprietário do drawer — NUNCA carrega o segredo em si, só o que precisa ser protegido. */
export type HookCloudSensitiveLifecycle = 'idle' | 'submitting' | 'secret_unacknowledged';

/**
 * FASE 18F — decisão ÚNICA e testada sobre se uma tentativa de sair do
 * estado sensível deve ser bloqueada, e qual aviso mostrar. Extraída de
 * `IntegrationsManager.tsx` (onde vivia inline, sem teste próprio) para
 * ser a mesma função usada nos 3 pontos de interceptação — fechar o
 * drawer, trocar de item, e (novo nesta fase) clicar num link de
 * navegação interna — em vez de reimplementar a mesma regra 3 vezes.
 * `null` significa "não bloquear".
 */
export function hookCloudLifecycleBlockMessage(state: HookCloudSensitiveLifecycle): string | null {
  if (state === 'submitting') return 'Aguarde a conclusão do provisionamento HookCloud antes de continuar.';
  if (state === 'secret_unacknowledged') {
    return 'Confirme, na janela já aberta, que você salvou o callback e o verify token antes de continuar.';
  }
  return null;
}

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
export function parseHookCloudProvisionSuccessBody(body: unknown, expectedCallbackOrigin: string): ProvisionResultOutcome {
  if (typeof body !== 'object' || body === null) return { kind: 'unexpected_response' };
  const b = body as Record<string, unknown>;

  const connectionId = b.connection_id;
  const onboardingState = b.onboarding_state;
  const callbackUrl = b.callback_url;
  const verifyToken = b.verify_token;

  if (typeof connectionId !== 'string' || connectionId.trim().length === 0) {
    return { kind: 'unexpected_response' };
  }
  if (typeof callbackUrl !== 'string' || !isTrustedHookCloudCallbackUrl(callbackUrl, expectedCallbackOrigin)) {
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
 * A UI recusa exibir uma callback URL que não pertença EXATAMENTE ao
 * projeto Supabase configurado neste frontend — não basta ser HTTPS com
 * o caminho certo (Fase 18B, achado 4: uma URL `https://dominio-
 * falso.example/functions/v1/meta-cloud-webhook?hcs=x` passava na
 * checagem anterior). `expectedOrigin` é o origin canônico do projeto
 * (`new URL(import.meta.env.VITE_SUPABASE_URL).origin`, resolvido pelo
 * chamador — este módulo continua sem depender de env/DOM para
 * permanecer testável via Deno). Exige, sem exceção por sufixo/
 * subdomínio: protocolo https, origin idêntico, nenhuma credencial
 * embutida na URL, pathname EXATO (não apenas terminando com o
 * caminho), nenhum fragmento, e exatamente um parâmetro `hcs` não
 * vazio — nenhum parâmetro adicional.
 */
export function isTrustedHookCloudCallbackUrl(url: string, expectedOrigin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.origin !== expectedOrigin) return false;
  if (parsed.username !== '' || parsed.password !== '') return false;
  if (parsed.pathname !== '/functions/v1/meta-cloud-webhook') return false;
  if (parsed.hash !== '') return false;
  const hcsValues = parsed.searchParams.getAll('hcs');
  if (hcsValues.length !== 1) return false;
  if (hcsValues[0].trim().length === 0) return false;
  if (Array.from(parsed.searchParams.keys()).length !== 1) return false;
  return true;
}

/**
 * Classifica o resultado de uma chamada a `supabase.functions.invoke`.
 *
 * Fase 18B, achado 5 (comportamento real do SDK, verificado lendo
 * `node_modules/@supabase/functions-js/src/FunctionsClient.ts` da versão
 * instalada — `@supabase/supabase-js@2.90.1`): quando `invoke()` lança
 * `FunctionsHttpError` (status HTTP não-2xx), o SDK retorna `data: null`
 * SEMPRE — o corpo JSON do erro NUNCA vem em `data`, só em
 * `error.context`, que é o objeto `Response` real (ainda não lido, então
 * seguro ler `.json()` uma única vez aqui). A implementação anterior
 * (Fase 18A) assumia, incorretamente, que o código de erro viria em
 * `data.error` — na prática isso nunca acontecia, e todo erro HTTP
 * virava sempre `unknown_error`. `error.name` distingue as 3 classes
 * reais exportadas por `@supabase/supabase-js`
 * (`FunctionsHttpError`/`FunctionsFetchError`/`FunctionsRelayError`) sem
 * precisar de `instanceof` — o que mantém este módulo testável via Deno
 * sem importar o SDK inteiro (os testes passam objetos simples com
 * `name`/`context` no mesmo formato).
 *
 * `FunctionsFetchError` (falha de rede/DNS/CORS antes de qualquer
 * resposta) e `FunctionsRelayError` (o gateway da Supabase não
 * conseguiu alcançar a função — nível de infraestrutura, não é a
 * resposta da nossa função) são tratados como AMBÍGUOS, nunca "falhou"
 * — o provisionamento pode já ter commitado no banco antes da resposta
 * se perder. Timeout (via `AbortController`/opção `timeout` do
 * `invoke`) produz `FunctionsFetchError`/`AbortError` pelo mesmo
 * caminho — também ambíguo. Ver Fase 18A, Parte 5.
 */
function extractResponseStatus(context: unknown): number | undefined {
  if (context && typeof context === 'object' && 'status' in context) {
    const status = (context as Record<string, unknown>).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

/** Lê o corpo JSON do `Response` de erro UMA ÚNICA VEZ — nunca relê, nunca expõe o corpo bruto, só o campo `error` (código curto). */
async function extractErrorCodeFromResponse(context: unknown): Promise<string> {
  if (!context || typeof context !== 'object' || typeof (context as Record<string, unknown>).json !== 'function') {
    return 'unknown_error';
  }
  try {
    const body: unknown = await (context as { json: () => Promise<unknown> }).json();
    if (body && typeof body === 'object' && 'error' in body) {
      const code = (body as Record<string, unknown>).error;
      if (typeof code === 'string' && code.trim().length > 0) return code;
    }
    return 'unknown_error';
  } catch {
    return 'unknown_error';
  }
}

export async function classifyProvisionInvokeResult(
  data: unknown,
  error: { name?: string; message?: string; context?: unknown } | null,
  expectedCallbackOrigin: string,
): Promise<ProvisionResultOutcome> {
  if (!error) {
    return parseHookCloudProvisionSuccessBody(data, expectedCallbackOrigin);
  }

  if (error.name === 'FunctionsHttpError') {
    const status = extractResponseStatus(error.context);
    if (typeof status !== 'number') return { kind: 'network_or_timeout' };
    const code = await extractErrorCodeFromResponse(error.context);
    return { kind: 'http_error', status, code };
  }

  // FunctionsFetchError, FunctionsRelayError, AbortError (nosso próprio
  // timeout) ou qualquer erro não reconhecido: sempre ambíguo, nunca
  // tratado como falha definitiva.
  return { kind: 'network_or_timeout' };
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
