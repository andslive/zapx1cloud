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
  | "token_auth_internal_error";

const SAFE_EVENT_TYPE_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

/**
 * Extrai um rótulo de tipo de evento seguro para telemetria — nunca o
 * payload inteiro, nunca um valor de tamanho/forma arbitrária. Qualquer
 * coisa fora do padrão seguro (alfanumérico + `._-`, até 64 caracteres)
 * vira `"unknown"`, nunca é passada adiante como está.
 */
export function sanitizeUazapiWebhookEventTypeForTelemetry(payload: unknown): string {
  if (payload === null || typeof payload !== "object") return "unknown";
  const raw = (payload as Record<string, unknown>).event ??
    (payload as Record<string, unknown>).type ??
    (payload as Record<string, unknown>).Event ??
    (payload as Record<string, unknown>).EventType;
  if (typeof raw !== "string") return "unknown";
  return SAFE_EVENT_TYPE_PATTERN.test(raw) ? raw : "unknown";
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
