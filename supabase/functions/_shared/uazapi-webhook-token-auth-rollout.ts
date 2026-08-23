// Fase 18N — rollout seguro `observe → enforce` para a autenticação por
// token de instância do webhook UazAPI (Fase 18K).
//
// POR QUE ISTO EXISTE: a Fase 18K exige token fail-closed
// incondicionalmente. As 16 conexões produtivas têm `instance_token`
// válido e distinto (confirmado por contagem, Fase 18K/18M), mas a
// PRESENÇA do campo `token` em eventos reais nunca foi confirmada
// diretamente — só por fontes externas de terceiros (Fase 18J). Um
// deploy direto em modo obrigatório, se essa premissa estiver errada
// para algum tipo de evento real, bloquearia mensagens de produção sem
// aviso prévio. Este módulo permite implantar primeiro em modo
// `observe` (silencioso, não bloqueia nada), confirmar com tráfego real
// que o token chega e casa como esperado, e só então promover para
// `enforce` numa fase separada.
//
// LIMITAÇÕES — não esconder:
// - `observe` NÃO corrige o risco de nenhuma forma; serve só para medir
//   compatibilidade do fornecedor com tráfego real antes de bloquear.
// - O sistema só fica protegido pela autenticação por token quando
//   `UAZAPI_WEBHOOK_TOKEN_AUTH_MODE=enforce` estiver de fato configurado
//   E implantado.
// - O token continua sendo um segredo compartilhado por instância, NÃO
//   uma assinatura HMAC (ver `uazapi-webhook-token-auth.ts`).
// - Proteção contra replay continua dependendo exclusivamente dos
//   mecanismos de idempotência já existentes (`processed_messages`/
//   `message_id`/ledger) — este módulo não adiciona nenhuma.
// - O piloto HookCloud não deve ser ativado para nenhuma organização
//   real enquanto este rollout estiver incompleto (`enforce` ainda não
//   confirmado em produção), se o plano de endurecimento decidir exigir
//   isso como pré-condição — decisão de produto, não imposta por este
//   módulo.
//
// Funções puras, sem I/O de rede — testáveis isoladamente via `deno test`.

import {
  extractUazapiWebhookToken,
  resolveUazapiInstanceByToken,
  type UazapiTokenCandidate,
} from "./uazapi-webhook-token-auth.ts";

// ── Modo de rollout ──────────────────────────────────────────────────

export type UazapiWebhookTokenAuthMode = "observe" | "enforce";

const KNOWN_MODES: readonly UazapiWebhookTokenAuthMode[] = ["observe", "enforce"];

/** Falha fechada: nunca convertido silenciosamente para observe/enforce. */
export class UnknownUazapiWebhookTokenAuthModeError extends Error {
  constructor(public readonly rawValue: unknown) {
    super(
      `UAZAPI_WEBHOOK_TOKEN_AUTH_MODE desconhecido (${JSON.stringify(rawValue)}) — falha fechada, nenhuma conversão silenciosa para observe/enforce`,
    );
    this.name = "UnknownUazapiWebhookTokenAuthModeError";
  }
}

/**
 * Interpreta `UAZAPI_WEBHOOK_TOKEN_AUTH_MODE`.
 * - `undefined`/`null`/string vazia (após trim) → `"observe"`. Este é o
 *   DEFAULT TEMPORÁRIO DE MIGRAÇÃO — não representa isolamento completo,
 *   só evita interrupção acidental de tráfego real durante o rollout.
 *   REMOVER este default numa fase futura, depois que `enforce` for
 *   confirmado em produção e se tornar a única configuração aceita
 *   operacionalmente (ver plano de promoção no relatório da Fase 18N).
 * - `"observe"` / `"enforce"` (com espaço nas bordas tolerado — variável
 *   de ambiente configurada via CLI/dashboard costuma carregar espaço
 *   acidental) → o valor correspondente.
 * - Capitalização diferente (`"Observe"`, `"ENFORCE"`) ou qualquer outro
 *   valor não reconhecido → lança `UnknownUazapiWebhookTokenAuthModeError`.
 *   Não normalizamos capitalização porque um valor com case errado é
 *   mais provavelmente um erro de configuração do operador do que uma
 *   variação intencional — deve falhar visivelmente, não ser adivinhado.
 */
export function parseUazapiWebhookTokenAuthMode(raw: unknown): UazapiWebhookTokenAuthMode {
  if (raw === null || raw === undefined) return "observe";
  if (typeof raw !== "string") throw new UnknownUazapiWebhookTokenAuthModeError(raw);
  const trimmed = raw.trim();
  if (trimmed === "") return "observe";
  if ((KNOWN_MODES as readonly string[]).includes(trimmed)) {
    return trimmed as UazapiWebhookTokenAuthMode;
  }
  throw new UnknownUazapiWebhookTokenAuthModeError(raw);
}

// ── Telemetria segura ────────────────────────────────────────────────

export type UazapiWebhookTokenAuthTelemetryCode =
  | "token_auth_match"
  | "token_auth_missing"
  | "token_auth_invalid_type"
  | "token_auth_empty"
  | "token_auth_no_candidate"
  | "token_auth_no_match"
  | "token_auth_ambiguous"
  | "token_auth_non_uazapi"
  | "token_auth_internal_error"
  // FASE 18X — nunca produzido por `evaluateUazapiWebhookTokenAuth`. Usado
  // exclusivamente pela integração para eventos classificados
  // `IGNORE_UNKNOWN` (ver `classifyUazapiWebhookEventAuthPolicy`) — deixa
  // explícito, na telemetria, que a autenticação nem foi tentada, em vez
  // de aparecer como `token_auth_missing` (que significa "deveria
  // autenticar e o token não veio", uma afirmação diferente e mais forte
  // do que "este evento nunca precisou de token").
  | "token_auth_not_applicable_unknown";

const SAFE_EVENT_TYPE_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

/**
 * Extrai um rótulo de tipo de evento seguro para telemetria — nunca o
 * payload inteiro, nunca um valor de tamanho/forma arbitrária. Qualquer
 * coisa fora do padrão seguro (alfanumérico + `._-`, até 64 caracteres)
 * vira `"unknown"`, nunca é passada adiante como está.
 *
 * FASE 19C — precedência corrigida para ficar IDÊNTICA à extração de
 * `event` em `normalizePayload` (`uazapi-webhook/index.ts`, ~linha 851):
 * mesma ordem de campos (`event, EventType, type, Event`) e mesmo
 * operador `||` (em vez do `??` usado até a Fase 18N). Comprovado por
 * execução de código contra fixtures sintéticas (Fase 19C) que a versão
 * anterior, por usar `??`, "travava" num campo falsy-mas-definido (ex.:
 * `type: ""`) antes de alcançar um campo posterior com o nome real do
 * evento — fazendo esta função reportar `"unknown"` para payloads que
 * `normalizePayload` reconhecia corretamente (ex.: `kind: "message"`).
 * Este rótulo é usado SÓ para telemetria (nunca para a decisão de
 * autenticação, que usa exclusivamente `norm.kind` via
 * `classifyUazapiWebhookEventAuthPolicy`) — corrigir a precedência aqui
 * não altera nenhuma decisão de negócio ou de autenticação.
 */
export function sanitizeUazapiWebhookEventTypeForTelemetry(payload: unknown): string {
  if (payload === null || typeof payload !== "object") return "unknown";
  const raw = (payload as Record<string, unknown>).event ||
    (payload as Record<string, unknown>).EventType ||
    (payload as Record<string, unknown>).type ||
    (payload as Record<string, unknown>).Event ||
    "";
  if (typeof raw !== "string" || raw.length === 0) return "unknown";
  return SAFE_EVENT_TYPE_PATTERN.test(raw) ? raw : "unknown";
}

/**
 * FASE 19C — diagnóstico sanitizado adicional (nunca usado para decisão
 * de autenticação ou de negócio, só para permitir que uma futura janela
 * de observação distinga, por SQL, entre os dois conceitos que a Fase
 * 18W conflacionou: o rótulo de telemetria (`event_type`) e `norm.kind`
 * (o que de fato controla `classifyUazapiWebhookEventAuthPolicy`).
 */
export type UazapiWebhookEventLabelSource = "explicit" | "structural" | "fallback";
export type UazapiWebhookTokenPresence =
  | "present"
  | "missing"
  | "invalid_type"
  | "empty"
  | "not_evaluated";
export type UazapiWebhookTokenSource = "root" | "none";
export type UazapiWebhookAuthApplicability = "required" | "not_applicable_unknown";

/**
 * Verifica, com a MESMA precedência de campos e o MESMO operador `||`
 * usados por `normalizePayload` para extrair `event`, se o payload trazia
 * um rótulo de evento explícito e não-vazio — nunca retorna o valor em
 * si, só um booleano.
 */
function hasExplicitUazapiWebhookEventLabel(payload: unknown): boolean {
  if (payload === null || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  const raw = p.event || p.EventType || p.type || p.Event || "";
  return typeof raw === "string" && raw.length > 0;
}

/**
 * Classifica COMO `norm.kind` foi determinado, em 3 categorias fechadas:
 * - `explicit`: existia um campo `event`/`EventType`/`type`/`Event` não
 *   vazio (independente de `norm.kind` ter reconhecido esse valor ou
 *   não).
 * - `structural`: não havia rótulo explícito, mas o normalizador ainda
 *   assim reconheceu um `kind` != "unknown" — só é possível via um dos
 *   fallbacks estruturais já mapeados por leitura de código na Fase 19C
 *   (ex.: `!event && data.key && data.message` para mensagens; o bloco
 *   de recibo por `MessageIDs[]`/`Type` para `ack`, que nem sequer
 *   depende de `event`).
 * - `fallback`: nem rótulo explícito nem reconhecimento estrutural —
 *   caiu no catch-all final (`kind: "unknown"`).
 *
 * Não recebe o payload inteiro para gravar — só o usa para computar um
 * booleano, e o valor de retorno é sempre um dos 3 literais acima.
 */
export function deriveUazapiWebhookEventLabelSource(
  payload: unknown,
  normalizedKind: string | null | undefined,
): UazapiWebhookEventLabelSource {
  if (hasExplicitUazapiWebhookEventLabel(payload)) return "explicit";
  return normalizedKind && normalizedKind !== "unknown" ? "structural" : "fallback";
}

/**
 * Deriva `token_presence` a partir do CÓDIGO de avaliação já computado
 * por `evaluateUazapiWebhookTokenAuth` — nunca re-lê o payload. Códigos
 * onde um token válido foi extraído e comparado (`match`/`no_match`/
 * `ambiguous`) contam como `present` mesmo quando não houve
 * correspondência, porque a pergunta aqui é só "o campo `token` existia
 * como string não-vazia?", não "autenticou?". Códigos onde a avaliação
 * nunca chegou a checar o token (`no_candidate`/`non_uazapi`/
 * `internal_error`/`not_applicable_unknown`) retornam `not_evaluated` —
 * um 5º valor fora da lista ilustrativa da tarefa, adicionado
 * deliberadamente para não forçar uma resposta enganosa quando a
 * pergunta nem chegou a ser feita.
 */
export function deriveUazapiWebhookTokenPresence(
  evaluationCode: UazapiWebhookTokenAuthTelemetryCode,
): UazapiWebhookTokenPresence {
  switch (evaluationCode) {
    case "token_auth_match":
    case "token_auth_no_match":
    case "token_auth_ambiguous":
      return "present";
    case "token_auth_missing":
      return "missing";
    case "token_auth_invalid_type":
      return "invalid_type";
    case "token_auth_empty":
      return "empty";
    default:
      return "not_evaluated";
  }
}

/**
 * Deriva `token_source` a partir de `token_presence` — hoje
 * `extractUazapiWebhookToken` só aceita `payload.token` na raiz (Fase
 * 18K, confirmado por leitura de código na Fase 19C: nenhum caminho
 * aninhado, header ou query é aceito), então "havia algo na raiz"
 * (`present`/`invalid_type`/`empty`, mesmo que o tipo/conteúdo fosse
 * inválido) é suficiente para `root`; caso contrário `none`.
 */
export function deriveUazapiWebhookTokenSource(
  tokenPresence: UazapiWebhookTokenPresence,
): UazapiWebhookTokenSource {
  return tokenPresence === "present" || tokenPresence === "invalid_type" ||
      tokenPresence === "empty"
    ? "root"
    : "none";
}

export interface UazapiWebhookTokenAuthTelemetryFields {
  code: UazapiWebhookTokenAuthTelemetryCode;
  mode: UazapiWebhookTokenAuthMode;
  sanitizedEventType: string;
}

/**
 * Único ponto de log da telemetria de autenticação por token. Campos
 * permitidos: código, modo, tipo de evento já sanitizado, timestamp.
 * NUNCA token, hash de token, prefixo/sufixo, payload, telefone,
 * conteúdo de mensagem, nome de lead, `instance_token`, Authorization,
 * segredo ou qualquer PII — nenhum desses é aceito como parâmetro desta
 * função, então não há como um chamador vazar isso por aqui por engano.
 */
export function logUazapiWebhookTokenAuthTelemetry(fields: UazapiWebhookTokenAuthTelemetryFields): void {
  console.log("[UAZAPI_WEBHOOK_TOKEN_AUTH_TELEMETRY]", {
    code: fields.code,
    mode: fields.mode,
    event_type: fields.sanitizedEventType,
    ts: new Date().toISOString(),
  });
}

// ── Avaliação (nunca decide sozinha o que processar — só informa) ─────

export interface UazapiWebhookTokenAuthCandidate extends UazapiTokenCandidate {
  provider?: string | null;
}

export interface UazapiWebhookTokenAuthEvaluation<T> {
  code: UazapiWebhookTokenAuthTelemetryCode;
  authenticatedInstance: T | null;
}

/**
 * Avalia a autenticação por token de forma isolada do processamento de
 * negócio — NUNCA lança exceção (qualquer erro inesperado vira
 * `token_auth_internal_error`, nunca derruba o handler), e NUNCA decide
 * sozinha se o evento deve ser bloqueado — essa decisão é de
 * `selectCandidatesForProcessing`, por modo.
 *
 * `rawTextCandidates` deve ser a lista de candidatos JÁ resolvidos por
 * nome/`instance_id` (a mesma consulta textual de sempre), ANTES de
 * qualquer filtro de provider — esta função distingue "nenhum candidato
 * textual" (`token_auth_no_candidate`) de "candidatos textuais existem,
 * mas nenhum é UazAPI" (`token_auth_non_uazapi`), útil para telemetria.
 */
export function evaluateUazapiWebhookTokenAuth<T extends UazapiWebhookTokenAuthCandidate>(
  rawTextCandidates: readonly T[],
  payload: unknown,
  isUazapiInstanceFn: (candidate: T) => boolean,
): UazapiWebhookTokenAuthEvaluation<T> {
  try {
    if (rawTextCandidates.length === 0) {
      return { code: "token_auth_no_candidate", authenticatedInstance: null };
    }

    const uazapiCandidates = rawTextCandidates.filter(isUazapiInstanceFn);
    if (uazapiCandidates.length === 0) {
      return { code: "token_auth_non_uazapi", authenticatedInstance: null };
    }

    if (payload === null || typeof payload !== "object") {
      return { code: "token_auth_missing", authenticatedInstance: null };
    }
    const hasTokenKey = "token" in (payload as Record<string, unknown>);
    if (!hasTokenKey) {
      return { code: "token_auth_missing", authenticatedInstance: null };
    }
    const rawToken = (payload as Record<string, unknown>).token;
    if (typeof rawToken !== "string") {
      return { code: "token_auth_invalid_type", authenticatedInstance: null };
    }
    if (rawToken.length === 0) {
      return { code: "token_auth_empty", authenticatedInstance: null };
    }

    const receivedToken = extractUazapiWebhookToken(payload);
    const resolution = resolveUazapiInstanceByToken(uazapiCandidates, receivedToken);
    if (resolution.outcome === "matched") {
      return { code: "token_auth_match", authenticatedInstance: resolution.instance };
    }
    if (resolution.reason === "ambiguous_match") {
      return { code: "token_auth_ambiguous", authenticatedInstance: null };
    }
    // "no_match" e o defensivo "no_receivable_token" (inalcançável aqui,
    // já tratado acima) caem no mesmo código público.
    return { code: "token_auth_no_match", authenticatedInstance: null };
  } catch {
    // Nunca deixa um formato de candidato inesperado derrubar o handler
    // nem interferir no processamento legado em `observe`.
    return { code: "token_auth_internal_error", authenticatedInstance: null };
  }
}

// ── Política por modo (o único lugar que decide o que o processamento recebe) ─

/**
 * Decide quais candidatos o processamento de negócio (lógica de
 * prioridade `is_active`/`status`, já existente e inalterada) deve
 * receber, dado o modo e a avaliação.
 *
 * - `enforce`: só a linha autenticada (ou nenhuma) — idêntico ao
 *   comportamento incondicional introduzido na Fase 18K.
 * - `observe`: SEMPRE `rawTextCandidates` completo, filtrado só por
 *   `isUazapiInstanceFn` (o mesmo filtro de provider da Fase 18I) —
 *   nunca reduzido pela autenticação por token, nunca influenciado por
 *   `evaluation` de forma alguma. Isto é o que garante que `observe`
 *   nunca bloqueia, nunca substitui a conexão escolhida, e nunca duplica
 *   processamento: o caminho é byte-a-byte o mesmo da Fase 18I.
 */
export function selectCandidatesForProcessing<T extends UazapiWebhookTokenAuthCandidate>(
  mode: UazapiWebhookTokenAuthMode,
  rawTextCandidates: readonly T[],
  evaluation: UazapiWebhookTokenAuthEvaluation<T>,
  isUazapiInstanceFn: (candidate: T) => boolean,
): readonly T[] {
  if (mode === "enforce") {
    return evaluation.code === "token_auth_match" && evaluation.authenticatedInstance
      ? [evaluation.authenticatedInstance]
      : [];
  }
  return rawTextCandidates.filter(isUazapiInstanceFn);
}

// ── Persistência consultável (Fase 18S) ────────────────────────────────

/**
 * Versão do schema do objeto `token_auth` gravado em
 * `webhook_logs.parsed_fields`. Incrementar só se o formato mudar de
 * forma incompatível com consultas já escritas contra a versão 1.
 */
export const TOKEN_AUTH_TELEMETRY_SCHEMA_VERSION = 2;

export interface UazapiWebhookTokenAuthTelemetryRecord {
  token_auth: {
    schema_version: number;
    mode: UazapiWebhookTokenAuthMode;
    code: UazapiWebhookTokenAuthTelemetryCode;
    event_type: string;
    connection_id: string | null;
    normalized_kind: string | null;
    event_label_source: UazapiWebhookEventLabelSource;
    token_presence: UazapiWebhookTokenPresence;
    token_source: UazapiWebhookTokenSource;
    auth_applicability: UazapiWebhookAuthApplicability;
  };
}

/**
 * Constrói o objeto sanitizado a persistir em `webhook_logs.parsed_fields`
 * (Fase 18S — menor extensão consultável por SQL da telemetria já emitida
 * pela Fase 18N). Função pura: nunca recebe `payload`/token/candidatos
 * crus — só o já-computado `mode`/`evaluation`/`sanitizedEventType` — o
 * que torna estruturalmente impossível vazar um campo não permitido por
 * aqui, não apenas por convenção.
 *
 * `connection_id` só é preenchido quando `evaluation.code ===
 * "token_auth_match"` e vem exclusivamente de `evaluation.authenticatedInstance.id`
 * (a linha já autenticada pelo banco) — nunca de qualquer identificador
 * fornecido pelo payload. Para qualquer outro código, `connection_id` é
 * sempre `null`.
 */
export interface UazapiWebhookTokenAuthTelemetryDiagnostics {
  /** `norm.kind` já computado — nunca recomputado aqui, nunca o payload. */
  normalizedKind: string | null;
  /** Ver `deriveUazapiWebhookEventLabelSource` — computado pelo chamador. */
  eventLabelSource: UazapiWebhookEventLabelSource;
  /** `"not_applicable_unknown"` só no ramo `IGNORE_UNKNOWN`; `"required"` em qualquer outro. */
  authApplicability: UazapiWebhookAuthApplicability;
}

export function buildUazapiWebhookTokenAuthTelemetryRecord<T extends UazapiWebhookTokenAuthCandidate>(
  mode: UazapiWebhookTokenAuthMode,
  evaluation: UazapiWebhookTokenAuthEvaluation<T>,
  sanitizedEventType: string,
  diagnostics: UazapiWebhookTokenAuthTelemetryDiagnostics,
): UazapiWebhookTokenAuthTelemetryRecord {
  const tokenPresence = deriveUazapiWebhookTokenPresence(evaluation.code);
  return {
    token_auth: {
      schema_version: TOKEN_AUTH_TELEMETRY_SCHEMA_VERSION,
      mode,
      code: evaluation.code,
      event_type: sanitizedEventType,
      connection_id: evaluation.code === "token_auth_match" && evaluation.authenticatedInstance
        ? evaluation.authenticatedInstance.id
        : null,
      normalized_kind: diagnostics.normalizedKind,
      event_label_source: diagnostics.eventLabelSource,
      token_presence: tokenPresence,
      token_source: deriveUazapiWebhookTokenSource(tokenPresence),
      auth_applicability: diagnostics.authApplicability,
    },
  };
}

// ── Classificação fechada de política de autenticação (Fase 18X) ─────

export type UazapiWebhookEventAuthPolicy =
  | "AUTH_REQUIRED_BUSINESS"
  | "AUTH_REQUIRED_OPERATIONAL"
  | "IGNORE_UNKNOWN"
  | "REJECT_MALFORMED";

/**
 * Classifica `norm.kind` (o resultado do normalizador canônico,
 * `normalizePayload` — NUNCA um campo bruto do payload lido diretamente
 * aqui) numa das 4 categorias fechadas.
 *
 * - `AUTH_REQUIRED_BUSINESS`: pode criar/alterar lead, mensagem,
 *   conversa, avançar funil, processar comprovante, registrar compra,
 *   chamar pixel/CAPI — sempre exige autenticação em `enforce`.
 * - `AUTH_REQUIRED_OPERATIONAL`: altera estado/metadados/configuração
 *   vinculados à instância (conexão, QR code) — também exige
 *   autenticação em `enforce`. NOTA: `ack` (confirmação de
 *   entrega/leitura) é classificado aqui conceitualmente, mas o handler
 *   já o trata num ramo próprio e anterior a esta classificação (Fase
 *   28, pré-existente) — este módulo não altera esse comportamento já
 *   existente, só o documenta.
 * - `IGNORE_UNKNOWN`: o normalizador não reconheceu o formato do evento
 *   (`kind === "unknown"`) mas conseguiu extrair um identificador de
 *   instância válido o bastante para não cair no caminho de payload
 *   malformado. Comprovado por leitura de código (Fase 18W) que este
 *   ramo nunca alcança nenhuma ação de negócio ou operacional — só o
 *   fallback final, que loga e retorna um ACK genérico.
 * - `REJECT_MALFORMED`: `norm === null` (o normalizador não conseguiu
 *   nem extrair um identificador de instância) — já tratado pelo
 *   caminho pré-existente `!norm`, mantido inalterado por esta fase.
 *   Este valor é retornado aqui só por completude da função pura; a
 *   integração real nunca chama esta função para o caso `norm === null`
 *   (o `!norm` já retorna antes).
 *
 * Função pura: recebe só o `kind` já normalizado, nunca o payload.
 */
export function classifyUazapiWebhookEventAuthPolicy(
  normKind: string | null | undefined,
): UazapiWebhookEventAuthPolicy {
  if (normKind === null || normKind === undefined) return "REJECT_MALFORMED";
  switch (normKind) {
    case "message":
    case "message_delete":
      return "AUTH_REQUIRED_BUSINESS";
    case "ack":
    case "connection":
    case "qrcode":
      return "AUTH_REQUIRED_OPERATIONAL";
    case "unknown":
      return "IGNORE_UNKNOWN";
    default:
      // Falha fechada: qualquer `kind` futuro não listado aqui exige
      // autenticação por padrão — nunca vira `IGNORE_UNKNOWN` por
      // omissão. Só `"unknown"` literal (o catch-all comprovadamente
      // inerte) é ignorado.
      return "AUTH_REQUIRED_OPERATIONAL";
  }
}
