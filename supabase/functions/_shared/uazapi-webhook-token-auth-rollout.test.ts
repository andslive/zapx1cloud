// deno test --allow-read --allow-env supabase/functions/_shared/uazapi-webhook-token-auth-rollout.test.ts
//
// Fase 18N — cobre o parser de modo, a avaliação isolada (observe nunca
// influencia o processamento, enforce bloqueia corretamente), a política
// de seleção de candidatos por modo, e a sanitização de telemetria.

import { assert, assertEquals, assertFalse, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildUazapiWebhookInternalServiceTelemetryRecord,
  buildUazapiWebhookTokenAuthTelemetryRecord,
  buildUazapiWebhookUnknownInternalActionTelemetryRecord,
  classifyUazapiWebhookEventAuthPolicy,
  deriveUazapiWebhookEventLabelSource,
  deriveUazapiWebhookTokenPresence,
  deriveUazapiWebhookTokenSource,
  evaluateUazapiWebhookInternalServiceAuth,
  evaluateUazapiWebhookTokenAuth,
  logUazapiWebhookTokenAuthTelemetry,
  parseUazapiWebhookTokenAuthMode,
  sanitizeUazapiWebhookEventTypeForTelemetry,
  selectCandidatesForProcessing,
  TOKEN_AUTH_TELEMETRY_SCHEMA_VERSION,
  UnknownUazapiWebhookTokenAuthModeError,
  type UazapiWebhookTokenAuthCandidate,
  type UazapiWebhookTokenAuthTelemetryDiagnostics,
} from "./uazapi-webhook-token-auth-rollout.ts";

interface FakeInstance extends UazapiWebhookTokenAuthCandidate {
  id: string;
  provider?: string | null;
  instance_token?: string | null;
  is_active: boolean;
  status: string;
}

function isUazapi(c: FakeInstance): boolean {
  return c.provider === null || c.provider === undefined || c.provider === "" || c.provider === "uazapi";
}

// Fase 19C — diagnósticos padrão usados pelos testes pré-existentes de
// `buildUazapiWebhookTokenAuthTelemetryRecord` que não exercitam
// especificamente os novos campos (esses ganham testes próprios abaixo).
const REQUIRED_DIAG: UazapiWebhookTokenAuthTelemetryDiagnostics = {
  normalizedKind: "connection",
  eventLabelSource: "explicit",
  authApplicability: "required",
};
const NOT_APPLICABLE_DIAG: UazapiWebhookTokenAuthTelemetryDiagnostics = {
  normalizedKind: "unknown",
  eventLabelSource: "fallback",
  authApplicability: "not_applicable_unknown",
};
const ALL_TELEMETRY_KEYS = [
  "auth_applicability",
  "auth_domain",
  "code",
  "connection_id",
  "event_label_source",
  "event_type",
  "internal_action",
  "internal_auth_result",
  "mode",
  "normalized_kind",
  "schema_version",
  "token_presence",
  "token_source",
].sort();

// ── Parser de modo ───────────────────────────────────────────────────

Deno.test("parseUazapiWebhookTokenAuthMode: ausente (undefined) => observe", () => {
  assertEquals(parseUazapiWebhookTokenAuthMode(undefined), "observe");
});

Deno.test("parseUazapiWebhookTokenAuthMode: null => observe", () => {
  assertEquals(parseUazapiWebhookTokenAuthMode(null), "observe");
});

Deno.test("parseUazapiWebhookTokenAuthMode: string vazia => observe", () => {
  assertEquals(parseUazapiWebhookTokenAuthMode(""), "observe");
});

Deno.test("parseUazapiWebhookTokenAuthMode: 'observe' válido", () => {
  assertEquals(parseUazapiWebhookTokenAuthMode("observe"), "observe");
});

Deno.test("parseUazapiWebhookTokenAuthMode: 'enforce' válido", () => {
  assertEquals(parseUazapiWebhookTokenAuthMode("enforce"), "enforce");
});

Deno.test("parseUazapiWebhookTokenAuthMode: espaço nas bordas é tolerado (trim explícito e documentado)", () => {
  assertEquals(parseUazapiWebhookTokenAuthMode("  enforce  "), "enforce");
  assertEquals(parseUazapiWebhookTokenAuthMode("\tobserve\n"), "observe");
});

Deno.test("parseUazapiWebhookTokenAuthMode: string só de espaços equivale a vazia => observe", () => {
  assertEquals(parseUazapiWebhookTokenAuthMode("   "), "observe");
});

Deno.test("parseUazapiWebhookTokenAuthMode: capitalização diferente é REJEITADA, nunca normalizada silenciosamente", () => {
  assertThrows(() => parseUazapiWebhookTokenAuthMode("Observe"), UnknownUazapiWebhookTokenAuthModeError);
  assertThrows(() => parseUazapiWebhookTokenAuthMode("ENFORCE"), UnknownUazapiWebhookTokenAuthModeError);
  assertThrows(() => parseUazapiWebhookTokenAuthMode("Enforce"), UnknownUazapiWebhookTokenAuthModeError);
});

Deno.test("parseUazapiWebhookTokenAuthMode: valor desconhecido é rejeitado, nunca vira observe/enforce por omissão", () => {
  assertThrows(() => parseUazapiWebhookTokenAuthMode("disabled"), UnknownUazapiWebhookTokenAuthModeError);
  assertThrows(() => parseUazapiWebhookTokenAuthMode("strict"), UnknownUazapiWebhookTokenAuthModeError);
  assertThrows(() => parseUazapiWebhookTokenAuthMode("true"), UnknownUazapiWebhookTokenAuthModeError);
});

Deno.test("parseUazapiWebhookTokenAuthMode: tipo não-string é rejeitado, nunca lança exceção não tipada", () => {
  assertThrows(() => parseUazapiWebhookTokenAuthMode(123), UnknownUazapiWebhookTokenAuthModeError);
  assertThrows(() => parseUazapiWebhookTokenAuthMode({}), UnknownUazapiWebhookTokenAuthModeError);
  assertThrows(() => parseUazapiWebhookTokenAuthMode(["enforce"]), UnknownUazapiWebhookTokenAuthModeError);
});

// ── sanitizeUazapiWebhookEventTypeForTelemetry ───────────────────────

Deno.test("sanitizeUazapiWebhookEventTypeForTelemetry: valor seguro passa intacto", () => {
  assertEquals(sanitizeUazapiWebhookEventTypeForTelemetry({ event: "messages.upsert" }), "messages.upsert");
  assertEquals(sanitizeUazapiWebhookEventTypeForTelemetry({ EventType: "connection" }), "connection");
});

Deno.test("sanitizeUazapiWebhookEventTypeForTelemetry: valor fora do padrão seguro vira 'unknown'", () => {
  assertEquals(sanitizeUazapiWebhookEventTypeForTelemetry({ event: "a".repeat(200) }), "unknown");
  assertEquals(sanitizeUazapiWebhookEventTypeForTelemetry({ event: "tem espaço e ; símbolo" }), "unknown");
  assertEquals(sanitizeUazapiWebhookEventTypeForTelemetry({ event: 42 }), "unknown");
  assertEquals(sanitizeUazapiWebhookEventTypeForTelemetry({}), "unknown");
  assertEquals(sanitizeUazapiWebhookEventTypeForTelemetry(null), "unknown");
});

// ── evaluateUazapiWebhookTokenAuth ───────────────────────────────────

Deno.test("evaluate: token correto + candidato único => token_auth_match", () => {
  const candidates: FakeInstance[] = [{ id: "c1", provider: "uazapi", instance_token: "tok-A", is_active: true, status: "connected" }];
  const result = evaluateUazapiWebhookTokenAuth(candidates, { token: "tok-A" }, isUazapi);
  assertEquals(result.code, "token_auth_match");
  assertEquals(result.authenticatedInstance?.id, "c1");
});

Deno.test("evaluate: token ausente (campo não existe no payload) => token_auth_missing", () => {
  const candidates: FakeInstance[] = [{ id: "c1", provider: "uazapi", instance_token: "tok-A", is_active: true, status: "connected" }];
  const result = evaluateUazapiWebhookTokenAuth(candidates, { EventType: "connection" }, isUazapi);
  assertEquals(result.code, "token_auth_missing");
  assertEquals(result.authenticatedInstance, null);
});

Deno.test("evaluate: token de tipo incorreto (number/object) => token_auth_invalid_type", () => {
  const candidates: FakeInstance[] = [{ id: "c1", provider: "uazapi", instance_token: "tok-A", is_active: true, status: "connected" }];
  assertEquals(evaluateUazapiWebhookTokenAuth(candidates, { token: 12345 }, isUazapi).code, "token_auth_invalid_type");
  assertEquals(evaluateUazapiWebhookTokenAuth(candidates, { token: { nested: true } }, isUazapi).code, "token_auth_invalid_type");
});

Deno.test("evaluate: token string vazia => token_auth_empty", () => {
  const candidates: FakeInstance[] = [{ id: "c1", provider: "uazapi", instance_token: "tok-A", is_active: true, status: "connected" }];
  const result = evaluateUazapiWebhookTokenAuth(candidates, { token: "" }, isUazapi);
  assertEquals(result.code, "token_auth_empty");
});

Deno.test("evaluate: nenhum candidato textual (identificador desconhecido) => token_auth_no_candidate", () => {
  const result = evaluateUazapiWebhookTokenAuth<FakeInstance>([], { token: "tok-A" }, isUazapi);
  assertEquals(result.code, "token_auth_no_candidate");
});

Deno.test("evaluate: candidatos textuais existem mas nenhum é UazAPI => token_auth_non_uazapi", () => {
  const candidates: FakeInstance[] = [{ id: "c1", provider: "meta_cloud", instance_token: null, is_active: true, status: "disconnected" }];
  const result = evaluateUazapiWebhookTokenAuth(candidates, { token: "tok-A" }, isUazapi);
  assertEquals(result.code, "token_auth_non_uazapi");
});

Deno.test("evaluate: token não corresponde a nenhum candidato UazAPI => token_auth_no_match", () => {
  const candidates: FakeInstance[] = [{ id: "c1", provider: "uazapi", instance_token: "tok-REAL", is_active: true, status: "connected" }];
  const result = evaluateUazapiWebhookTokenAuth(candidates, { token: "tok-ERRADO" }, isUazapi);
  assertEquals(result.code, "token_auth_no_match");
});

Deno.test("evaluate: dois candidatos UazAPI com o mesmo token => token_auth_ambiguous", () => {
  const candidates: FakeInstance[] = [
    { id: "c1", provider: "uazapi", instance_token: "tok-SHARED", is_active: true, status: "connected" },
    { id: "c2", provider: "uazapi", instance_token: "tok-SHARED", is_active: true, status: "connected" },
  ];
  const result = evaluateUazapiWebhookTokenAuth(candidates, { token: "tok-SHARED" }, isUazapi);
  assertEquals(result.code, "token_auth_ambiguous");
  assertEquals(result.authenticatedInstance, null);
});

Deno.test("evaluate: payload não-objeto (null) nunca lança exceção, sempre vira código válido", () => {
  const candidates: FakeInstance[] = [{ id: "c1", provider: "uazapi", instance_token: "tok-A", is_active: true, status: "connected" }];
  const result = evaluateUazapiWebhookTokenAuth(candidates, null, isUazapi);
  assertEquals(result.code, "token_auth_missing");
});

Deno.test("evaluate: exceção no filtro de provider vira token_auth_internal_error, nunca propaga", () => {
  const candidates: FakeInstance[] = [{ id: "c1", provider: "uazapi", instance_token: "tok-A", is_active: true, status: "connected" }];
  const throwingFilter = () => { throw new Error("boom"); };
  const result = evaluateUazapiWebhookTokenAuth(candidates, { token: "tok-A" }, throwingFilter);
  assertEquals(result.code, "token_auth_internal_error");
  assertEquals(result.authenticatedInstance, null);
});

// ── selectCandidatesForProcessing (a política real que o handler usa) ─

const baseCandidates: FakeInstance[] = [
  { id: "hookcloud-1", provider: "meta_cloud", instance_token: null, is_active: true, status: "disconnected" },
  { id: "uazapi-1", provider: "uazapi", instance_token: "tok-A", is_active: true, status: "connected" },
  { id: "uazapi-2", provider: null, instance_token: "tok-B", is_active: false, status: "disconnected" },
];

Deno.test("selectCandidatesForProcessing (observe): token correto — MESMO ASSIM devolve TODOS os candidatos UazAPI, nunca reduz ao autenticado", () => {
  const evaluation = evaluateUazapiWebhookTokenAuth(baseCandidates, { token: "tok-A" }, isUazapi);
  assertEquals(evaluation.code, "token_auth_match");
  const selected = selectCandidatesForProcessing("observe", baseCandidates, evaluation, isUazapi);
  assertEquals(selected.map((c) => c.id).sort(), ["uazapi-1", "uazapi-2"]);
});

Deno.test("selectCandidatesForProcessing (observe): token ausente — processamento legado preservado (mesmos 2 candidatos UazAPI)", () => {
  const evaluation = evaluateUazapiWebhookTokenAuth(baseCandidates, {}, isUazapi);
  assertEquals(evaluation.code, "token_auth_missing");
  const selected = selectCandidatesForProcessing("observe", baseCandidates, evaluation, isUazapi);
  assertEquals(selected.map((c) => c.id).sort(), ["uazapi-1", "uazapi-2"]);
});

Deno.test("selectCandidatesForProcessing (observe): token incorreto — processamento legado preservado", () => {
  const evaluation = evaluateUazapiWebhookTokenAuth(baseCandidates, { token: "tok-ERRADO" }, isUazapi);
  assertEquals(evaluation.code, "token_auth_no_match");
  const selected = selectCandidatesForProcessing("observe", baseCandidates, evaluation, isUazapi);
  assertEquals(selected.map((c) => c.id).sort(), ["uazapi-1", "uazapi-2"]);
});

Deno.test("selectCandidatesForProcessing (observe): ambiguidade de token — processamento legado preservado", () => {
  const ambiguous: FakeInstance[] = [
    { id: "uazapi-1", provider: "uazapi", instance_token: "tok-SHARED", is_active: true, status: "connected" },
    { id: "uazapi-2", provider: "uazapi", instance_token: "tok-SHARED", is_active: false, status: "disconnected" },
  ];
  const evaluation = evaluateUazapiWebhookTokenAuth(ambiguous, { token: "tok-SHARED" }, isUazapi);
  assertEquals(evaluation.code, "token_auth_ambiguous");
  const selected = selectCandidatesForProcessing("observe", ambiguous, evaluation, isUazapi);
  assertEquals(selected.map((c) => c.id).sort(), ["uazapi-1", "uazapi-2"]);
});

Deno.test("selectCandidatesForProcessing (observe): nunca inclui candidato não-UazAPI, mesmo preservando o resto (mesmo filtro de provider da Fase 18I)", () => {
  const evaluation = evaluateUazapiWebhookTokenAuth(baseCandidates, {}, isUazapi);
  const selected = selectCandidatesForProcessing("observe", baseCandidates, evaluation, isUazapi);
  assertFalse(selected.some((c) => c.id === "hookcloud-1"));
});

Deno.test("selectCandidatesForProcessing (enforce): token correto => usa exclusivamente a conexão autenticada", () => {
  const evaluation = evaluateUazapiWebhookTokenAuth(baseCandidates, { token: "tok-A" }, isUazapi);
  const selected = selectCandidatesForProcessing("enforce", baseCandidates, evaluation, isUazapi);
  assertEquals(selected.map((c) => c.id), ["uazapi-1"]);
});

Deno.test("selectCandidatesForProcessing (enforce): token ausente => bloqueia (lista vazia)", () => {
  const evaluation = evaluateUazapiWebhookTokenAuth(baseCandidates, {}, isUazapi);
  const selected = selectCandidatesForProcessing("enforce", baseCandidates, evaluation, isUazapi);
  assertEquals(selected.length, 0);
});

Deno.test("selectCandidatesForProcessing (enforce): token incorreto => bloqueia", () => {
  const evaluation = evaluateUazapiWebhookTokenAuth(baseCandidates, { token: "tok-ERRADO" }, isUazapi);
  const selected = selectCandidatesForProcessing("enforce", baseCandidates, evaluation, isUazapi);
  assertEquals(selected.length, 0);
});

Deno.test("selectCandidatesForProcessing (enforce): token ambíguo => bloqueia", () => {
  const ambiguous: FakeInstance[] = [
    { id: "uazapi-1", provider: "uazapi", instance_token: "tok-SHARED", is_active: true, status: "connected" },
    { id: "uazapi-2", provider: "uazapi", instance_token: "tok-SHARED", is_active: false, status: "disconnected" },
  ];
  const evaluation = evaluateUazapiWebhookTokenAuth(ambiguous, { token: "tok-SHARED" }, isUazapi);
  const selected = selectCandidatesForProcessing("enforce", ambiguous, evaluation, isUazapi);
  assertEquals(selected.length, 0);
});

Deno.test("selectCandidatesForProcessing (enforce): provider incorreto (só candidato HookCloud) => bloqueia", () => {
  const onlyHookCloud: FakeInstance[] = [
    { id: "hookcloud-1", provider: "meta_cloud", instance_token: null, is_active: true, status: "disconnected" },
  ];
  const evaluation = evaluateUazapiWebhookTokenAuth(onlyHookCloud, { token: "qualquer" }, isUazapi);
  assertEquals(evaluation.code, "token_auth_non_uazapi");
  const selected = selectCandidatesForProcessing("enforce", onlyHookCloud, evaluation, isUazapi);
  assertEquals(selected.length, 0);
});

Deno.test("selectCandidatesForProcessing (enforce): cross-tenant (token de outra organização não bate com o candidato local) => bloqueia", () => {
  const localCandidate: FakeInstance[] = [{ id: "org-a-conn", provider: "uazapi", instance_token: "tok-ORG-A", is_active: true, status: "connected" }];
  const evaluation = evaluateUazapiWebhookTokenAuth(localCandidate, { token: "tok-ORG-B" }, isUazapi);
  assertEquals(evaluation.code, "token_auth_no_match");
  const selected = selectCandidatesForProcessing("enforce", localCandidate, evaluation, isUazapi);
  assertEquals(selected.length, 0);
});

// ── Fase 18O — cobertura explícita adicional exigida pela revisão ────

Deno.test("selectCandidatesForProcessing (observe): avaliação que resultou em token_auth_internal_error NÃO impede o processamento legado", () => {
  const evaluationWithInternalError = evaluateUazapiWebhookTokenAuth<FakeInstance>(
    baseCandidates,
    { token: "tok-A" },
    () => { throw new Error("boom"); },
  );
  assertEquals(evaluationWithInternalError.code, "token_auth_internal_error");
  // Reavalia com o filtro real (não o que lança) só para obter o
  // conjunto esperado de candidatos UazAPI, já que o filtro usado na
  // avaliação acima não é o mesmo usado na seleção abaixo.
  const selected = selectCandidatesForProcessing("observe", baseCandidates, evaluationWithInternalError, isUazapi);
  assertEquals(selected.map((c) => c.id).sort(), ["uazapi-1", "uazapi-2"]);
});

Deno.test("selectCandidatesForProcessing (enforce): avaliação que resultou em token_auth_internal_error bloqueia (nunca cai para o fluxo legado)", () => {
  const evaluationWithInternalError: ReturnType<typeof evaluateUazapiWebhookTokenAuth<FakeInstance>> = {
    code: "token_auth_internal_error",
    authenticatedInstance: null,
  };
  const selected = selectCandidatesForProcessing("enforce", baseCandidates, evaluationWithInternalError, isUazapi);
  assertEquals(selected.length, 0);
});

Deno.test("logUazapiWebhookTokenAuthTelemetry: a assinatura da função não aceita nenhum campo que pudesse conter o token — prova estrutural, não apenas por convenção", () => {
  const captured: unknown[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => { captured.push(args); };
  try {
    logUazapiWebhookTokenAuthTelemetry({
      code: "token_auth_match",
      mode: "observe",
      sanitizedEventType: "messages",
    });
  } finally {
    console.log = originalLog;
  }
  const serialized = JSON.stringify(captured);
  assertFalse(serialized.toLowerCase().includes("token_value"));
  const loggedFields = (captured[0] as unknown[])[1] as Record<string, unknown>;
  assertFalse("token" in loggedFields);
});

// ── Fase 18S — buildUazapiWebhookTokenAuthTelemetryRecord ────────────

Deno.test("buildUazapiWebhookTokenAuthTelemetryRecord: match persiste code permitido e connection_id da linha autenticada", () => {
  const evaluation = evaluateUazapiWebhookTokenAuth(baseCandidates, { token: "tok-A" }, isUazapi);
  const record = buildUazapiWebhookTokenAuthTelemetryRecord("observe", evaluation, "connection", REQUIRED_DIAG);
  assertEquals(record.token_auth.code, "token_auth_match");
  assertEquals(record.token_auth.mode, "observe");
  assertEquals(record.token_auth.event_type, "connection");
  assertEquals(record.token_auth.connection_id, "uazapi-1");
  assertEquals(record.token_auth.schema_version, TOKEN_AUTH_TELEMETRY_SCHEMA_VERSION);
});

Deno.test("buildUazapiWebhookTokenAuthTelemetryRecord: missing persiste code permitido, connection_id null", () => {
  const evaluation = evaluateUazapiWebhookTokenAuth(baseCandidates, {}, isUazapi);
  assertEquals(evaluation.code, "token_auth_missing");
  const record = buildUazapiWebhookTokenAuthTelemetryRecord("observe", evaluation, "unknown", REQUIRED_DIAG);
  assertEquals(record.token_auth.code, "token_auth_missing");
  assertEquals(record.token_auth.connection_id, null);
});

Deno.test("buildUazapiWebhookTokenAuthTelemetryRecord: connection_id nunca vem do payload — só de evaluation.authenticatedInstance.id", () => {
  // Mesmo que um candidato tenha um id "parecido" com algo do payload,
  // connection_id só é preenchido quando o outcome é match E vem do
  // objeto authenticatedInstance já resolvido pelo banco — nunca de um
  // campo arbitrário construído a partir do payload recebido.
  const evaluationNoMatch = evaluateUazapiWebhookTokenAuth(baseCandidates, { token: "tok-nao-existe" }, isUazapi);
  assertEquals(evaluationNoMatch.code, "token_auth_no_match");
  const record = buildUazapiWebhookTokenAuthTelemetryRecord("enforce", evaluationNoMatch, "connection", REQUIRED_DIAG);
  assertEquals(record.token_auth.connection_id, null);
});

Deno.test("buildUazapiWebhookTokenAuthTelemetryRecord: ambiguous/non_uazapi/internal_error/no_candidate — connection_id sempre null", () => {
  const ambiguous: FakeInstance[] = [
    { id: "c1", provider: "uazapi", instance_token: "tok-X", is_active: true, status: "connected" },
    { id: "c2", provider: "uazapi", instance_token: "tok-X", is_active: true, status: "connected" },
  ];
  const ambiguousEval = evaluateUazapiWebhookTokenAuth(ambiguous, { token: "tok-X" }, isUazapi);
  assertEquals(buildUazapiWebhookTokenAuthTelemetryRecord("observe", ambiguousEval, "connection", REQUIRED_DIAG).token_auth.connection_id, null);

  const onlyHookCloud: FakeInstance[] = [{ id: "h1", provider: "meta_cloud", instance_token: null, is_active: true, status: "disconnected" }];
  const nonUazapiEval = evaluateUazapiWebhookTokenAuth(onlyHookCloud, { token: "x" }, isUazapi);
  assertEquals(buildUazapiWebhookTokenAuthTelemetryRecord("observe", nonUazapiEval, "connection", REQUIRED_DIAG).token_auth.connection_id, null);

  const internalErrorEval = evaluateUazapiWebhookTokenAuth(baseCandidates, { token: "tok-A" }, () => { throw new Error("boom"); });
  assertEquals(buildUazapiWebhookTokenAuthTelemetryRecord("observe", internalErrorEval, "connection", REQUIRED_DIAG).token_auth.connection_id, null);

  const noCandidateEval = evaluateUazapiWebhookTokenAuth<FakeInstance>([], { token: "x" }, isUazapi);
  assertEquals(buildUazapiWebhookTokenAuthTelemetryRecord("observe", noCandidateEval, "connection", REQUIRED_DIAG).token_auth.connection_id, null);
});

Deno.test("buildUazapiWebhookTokenAuthTelemetryRecord: objeto resultante nunca contém token/payload/PII — só as chaves fechadas esperadas", () => {
  const evaluation = evaluateUazapiWebhookTokenAuth(baseCandidates, { token: "SECRET-VALUE-NEVER-PERSISTED" }, isUazapi);
  const record = buildUazapiWebhookTokenAuthTelemetryRecord("enforce", evaluation, "connection", REQUIRED_DIAG);
  const keys = Object.keys(record.token_auth).sort();
  assertEquals(keys, ALL_TELEMETRY_KEYS);
  assertFalse(JSON.stringify(record).includes("SECRET-VALUE-NEVER-PERSISTED"));
});

Deno.test("buildUazapiWebhookTokenAuthTelemetryRecord: code é sempre um dos 9 valores fechados (garantido pelo tipo, verificado em runtime)", () => {
  const ALLOWED = new Set([
    "token_auth_match", "token_auth_missing", "token_auth_invalid_type", "token_auth_empty",
    "token_auth_no_candidate", "token_auth_no_match", "token_auth_ambiguous", "token_auth_non_uazapi",
    "token_auth_internal_error",
  ]);
  const evaluation = evaluateUazapiWebhookTokenAuth(baseCandidates, { token: "tok-A" }, isUazapi);
  const record = buildUazapiWebhookTokenAuthTelemetryRecord("observe", evaluation, "connection", REQUIRED_DIAG);
  assert(ALLOWED.has(record.token_auth.code));
});

// ── Fase 18T — cobertura explícita adicional exigida pela revisão ────

Deno.test("buildUazapiWebhookTokenAuthTelemetryRecord: propriedades extras num objeto de avaliação 'malicioso' nunca vazam — a função constrói um literal, nunca faz spread da entrada", () => {
  const matchedEvaluation = evaluateUazapiWebhookTokenAuth(baseCandidates, { token: "tok-A" }, isUazapi);
  // Simula um chamador que anexou campos extras/inesperados ao objeto de
  // avaliação (ex.: um bug em outro lugar do código que injetasse
  // `raw_token`/`payload`/`headers`) — mesmo assim, só as chaves
  // fechadas devem sobreviver, porque a função nunca faz `...evaluation`
  // no retorno, só lê `.code` e `.authenticatedInstance.id` de propósito.
  const maliciousEvaluation = {
    ...matchedEvaluation,
    raw_token: "SHOULD-NEVER-APPEAR",
    payload: { secret: "SHOULD-NEVER-APPEAR-EITHER" },
    headers: { authorization: "Bearer SHOULD-NOT-LEAK" },
  } as typeof matchedEvaluation;
  const record = buildUazapiWebhookTokenAuthTelemetryRecord("enforce", maliciousEvaluation, "connection", REQUIRED_DIAG);
  const keys = Object.keys(record.token_auth).sort();
  assertEquals(keys, ALL_TELEMETRY_KEYS);
  const serialized = JSON.stringify(record);
  assertFalse(serialized.includes("SHOULD-NEVER-APPEAR"));
  assertFalse(serialized.includes("SHOULD-NOT-LEAK"));
});

Deno.test("buildUazapiWebhookTokenAuthTelemetryRecord: authenticatedInstance com propriedades extras (ex. instance_token) nunca vaza — só .id é lido", () => {
  const candidatesWithExtraFields: FakeInstance[] = [
    { id: "uazapi-1", provider: "uazapi", instance_token: "REAL-SECRET-TOKEN-VALUE", is_active: true, status: "connected" },
  ];
  const evaluation = evaluateUazapiWebhookTokenAuth(candidatesWithExtraFields, { token: "REAL-SECRET-TOKEN-VALUE" }, isUazapi);
  assertEquals(evaluation.code, "token_auth_match");
  const record = buildUazapiWebhookTokenAuthTelemetryRecord("enforce", evaluation, "connection", REQUIRED_DIAG);
  assertEquals(record.token_auth.connection_id, "uazapi-1");
  assertFalse(JSON.stringify(record).includes("REAL-SECRET-TOKEN-VALUE"));
});

// ── Fase 18X — classifyUazapiWebhookEventAuthPolicy ──────────────────

Deno.test("classifyUazapiWebhookEventAuthPolicy: message e message_delete => AUTH_REQUIRED_BUSINESS", () => {
  assertEquals(classifyUazapiWebhookEventAuthPolicy("message"), "AUTH_REQUIRED_BUSINESS");
  assertEquals(classifyUazapiWebhookEventAuthPolicy("message_delete"), "AUTH_REQUIRED_BUSINESS");
});

Deno.test("classifyUazapiWebhookEventAuthPolicy: ack, connection e qrcode => AUTH_REQUIRED_OPERATIONAL", () => {
  assertEquals(classifyUazapiWebhookEventAuthPolicy("ack"), "AUTH_REQUIRED_OPERATIONAL");
  assertEquals(classifyUazapiWebhookEventAuthPolicy("connection"), "AUTH_REQUIRED_OPERATIONAL");
  assertEquals(classifyUazapiWebhookEventAuthPolicy("qrcode"), "AUTH_REQUIRED_OPERATIONAL");
});

Deno.test("classifyUazapiWebhookEventAuthPolicy: 'unknown' literal => IGNORE_UNKNOWN", () => {
  assertEquals(classifyUazapiWebhookEventAuthPolicy("unknown"), "IGNORE_UNKNOWN");
});

Deno.test("classifyUazapiWebhookEventAuthPolicy: null/undefined => REJECT_MALFORMED", () => {
  assertEquals(classifyUazapiWebhookEventAuthPolicy(null), "REJECT_MALFORMED");
  assertEquals(classifyUazapiWebhookEventAuthPolicy(undefined), "REJECT_MALFORMED");
});

Deno.test("classifyUazapiWebhookEventAuthPolicy: kind desconhecido/futuro nunca vira IGNORE_UNKNOWN por omissão — falha fechada para AUTH_REQUIRED_OPERATIONAL", () => {
  assertEquals(classifyUazapiWebhookEventAuthPolicy("some_future_kind_not_yet_modeled"), "AUTH_REQUIRED_OPERATIONAL");
  assertEquals(classifyUazapiWebhookEventAuthPolicy("Unknown"), "AUTH_REQUIRED_OPERATIONAL");
  assertEquals(classifyUazapiWebhookEventAuthPolicy("UNKNOWN"), "AUTH_REQUIRED_OPERATIONAL");
  assertEquals(classifyUazapiWebhookEventAuthPolicy("unknown_extra"), "AUTH_REQUIRED_OPERATIONAL");
  assertEquals(classifyUazapiWebhookEventAuthPolicy("xunknown"), "AUTH_REQUIRED_OPERATIONAL");
});

Deno.test("classifyUazapiWebhookEventAuthPolicy: string vazia nunca vira IGNORE_UNKNOWN", () => {
  assertEquals(classifyUazapiWebhookEventAuthPolicy(""), "AUTH_REQUIRED_OPERATIONAL");
});

// ── Fase 18X — telemetria not-applicable para IGNORE_UNKNOWN ─────────

Deno.test("buildUazapiWebhookTokenAuthTelemetryRecord: token_auth_not_applicable_unknown sempre tem connection_id null", () => {
  const record = buildUazapiWebhookTokenAuthTelemetryRecord(
    "observe",
    { code: "token_auth_not_applicable_unknown", authenticatedInstance: null },
    "unknown",
    NOT_APPLICABLE_DIAG,
  );
  assertEquals(record.token_auth.code, "token_auth_not_applicable_unknown");
  assertEquals(record.token_auth.connection_id, null);
  assertEquals(record.token_auth.event_type, "unknown");
  const keys = Object.keys(record.token_auth).sort();
  assertEquals(keys, ALL_TELEMETRY_KEYS);
});

Deno.test("buildUazapiWebhookTokenAuthTelemetryRecord: token_auth_not_applicable_unknown funciona nos dois modos", () => {
  const observeRecord = buildUazapiWebhookTokenAuthTelemetryRecord(
    "observe",
    { code: "token_auth_not_applicable_unknown", authenticatedInstance: null },
    "unknown",
    NOT_APPLICABLE_DIAG,
  );
  const enforceRecord = buildUazapiWebhookTokenAuthTelemetryRecord(
    "enforce",
    { code: "token_auth_not_applicable_unknown", authenticatedInstance: null },
    "unknown",
    NOT_APPLICABLE_DIAG,
  );
  assertEquals(observeRecord.token_auth.mode, "observe");
  assertEquals(enforceRecord.token_auth.mode, "enforce");
  assertEquals(observeRecord.token_auth.connection_id, null);
  assertEquals(enforceRecord.token_auth.connection_id, null);
});

// ── Fase 19C — sanitizeUazapiWebhookEventTypeForTelemetry: correção de
// precedência (era `??`+ordem diferente de normalizePayload; agora `||`
// + mesma ordem `event, EventType, type, Event`) ─────────────────────

Deno.test("sanitizeUazapiWebhookEventTypeForTelemetry: campo falsy-mas-definido antes de um campo real não bloqueia mais o rótulo real (bug corrigido na Fase 19C)", () => {
  // Antes da correção, `??` só pulava null/undefined — uma string vazia
  // num campo checado ANTES do campo real (na ordem antiga, diferente da
  // de normalizePayload) fazia esta função reportar "unknown" mesmo
  // quando normalizePayload reconhecia corretamente o evento.
  assertEquals(sanitizeUazapiWebhookEventTypeForTelemetry({ type: "", EventType: "messages" }), "messages");
  assertEquals(sanitizeUazapiWebhookEventTypeForTelemetry({ type: 0, EventType: "messages" }), "messages");
  assertEquals(sanitizeUazapiWebhookEventTypeForTelemetry({ event: "", type: "", Event: "connection" }), "connection");
});

Deno.test("sanitizeUazapiWebhookEventTypeForTelemetry: precedência agora idêntica à de normalizePayload (event, EventType, type, Event)", () => {
  assertEquals(sanitizeUazapiWebhookEventTypeForTelemetry({ event: "a", EventType: "b", type: "c", Event: "d" }), "a");
  assertEquals(sanitizeUazapiWebhookEventTypeForTelemetry({ EventType: "b", type: "c", Event: "d" }), "b");
  assertEquals(sanitizeUazapiWebhookEventTypeForTelemetry({ type: "c", Event: "d" }), "c");
  assertEquals(sanitizeUazapiWebhookEventTypeForTelemetry({ Event: "d" }), "d");
});

Deno.test("sanitizeUazapiWebhookEventTypeForTelemetry: todos os campos falsy => unknown (nunca undefined/erro)", () => {
  assertEquals(sanitizeUazapiWebhookEventTypeForTelemetry({ event: "", EventType: "", type: "", Event: "" }), "unknown");
  assertEquals(sanitizeUazapiWebhookEventTypeForTelemetry({ event: 0, EventType: null }), "unknown");
});

// ── Fase 19C — deriveUazapiWebhookEventLabelSource ───────────────────

Deno.test("deriveUazapiWebhookEventLabelSource: campo explícito não-vazio => explicit, independente de normalizedKind", () => {
  assertEquals(deriveUazapiWebhookEventLabelSource({ event: "messages.upsert" }, "message"), "explicit");
  // Mesmo se normalizePayload não reconheceu o valor (kind ainda unknown),
  // o rótulo explícito existia — a fonte é "explicit", não "fallback".
  assertEquals(deriveUazapiWebhookEventLabelSource({ event: "algum-evento-nao-mapeado" }, "unknown"), "explicit");
});

Deno.test("deriveUazapiWebhookEventLabelSource: sem campo explícito mas kind reconhecido => structural", () => {
  assertEquals(deriveUazapiWebhookEventLabelSource({ data: { key: {}, message: {} } }, "message"), "structural");
  assertEquals(deriveUazapiWebhookEventLabelSource({ MessageIDs: ["1"], Type: "Read" }, "ack"), "structural");
});

Deno.test("deriveUazapiWebhookEventLabelSource: sem campo explícito e kind unknown => fallback", () => {
  assertEquals(deriveUazapiWebhookEventLabelSource({}, "unknown"), "fallback");
  assertEquals(deriveUazapiWebhookEventLabelSource({ foo: "bar" }, null), "fallback");
  assertEquals(deriveUazapiWebhookEventLabelSource(null, undefined), "fallback");
});

Deno.test("deriveUazapiWebhookEventLabelSource: campo falsy-mas-definido (string vazia) não conta como explícito", () => {
  assertEquals(deriveUazapiWebhookEventLabelSource({ event: "", type: "" }, "unknown"), "fallback");
});

// ── Fase 19C — deriveUazapiWebhookTokenPresence / deriveUazapiWebhookTokenSource ──

Deno.test("deriveUazapiWebhookTokenPresence: match/no_match/ambiguous => present (token existia e era string não-vazia)", () => {
  assertEquals(deriveUazapiWebhookTokenPresence("token_auth_match"), "present");
  assertEquals(deriveUazapiWebhookTokenPresence("token_auth_no_match"), "present");
  assertEquals(deriveUazapiWebhookTokenPresence("token_auth_ambiguous"), "present");
});

Deno.test("deriveUazapiWebhookTokenPresence: missing/invalid_type/empty mapeiam 1:1", () => {
  assertEquals(deriveUazapiWebhookTokenPresence("token_auth_missing"), "missing");
  assertEquals(deriveUazapiWebhookTokenPresence("token_auth_invalid_type"), "invalid_type");
  assertEquals(deriveUazapiWebhookTokenPresence("token_auth_empty"), "empty");
});

Deno.test("deriveUazapiWebhookTokenPresence: no_candidate/non_uazapi/internal_error/not_applicable_unknown => not_evaluated (nunca chegou a checar o token)", () => {
  assertEquals(deriveUazapiWebhookTokenPresence("token_auth_no_candidate"), "not_evaluated");
  assertEquals(deriveUazapiWebhookTokenPresence("token_auth_non_uazapi"), "not_evaluated");
  assertEquals(deriveUazapiWebhookTokenPresence("token_auth_internal_error"), "not_evaluated");
  assertEquals(deriveUazapiWebhookTokenPresence("token_auth_not_applicable_unknown"), "not_evaluated");
});

Deno.test("deriveUazapiWebhookTokenSource: present/invalid_type/empty => root; missing/not_evaluated => none", () => {
  assertEquals(deriveUazapiWebhookTokenSource("present"), "root");
  assertEquals(deriveUazapiWebhookTokenSource("invalid_type"), "root");
  assertEquals(deriveUazapiWebhookTokenSource("empty"), "root");
  assertEquals(deriveUazapiWebhookTokenSource("missing"), "none");
  assertEquals(deriveUazapiWebhookTokenSource("not_evaluated"), "none");
});

// ── Fase 19C — buildUazapiWebhookTokenAuthTelemetryRecord: novos campos ──

Deno.test("buildUazapiWebhookTokenAuthTelemetryRecord: campos diagnósticos novos refletem exatamente o que foi passado, sem transformação extra", () => {
  const evaluation = evaluateUazapiWebhookTokenAuth(
    [{ id: "c1", provider: "uazapi", instance_token: "tok-A", is_active: true, status: "connected" }],
    {},
    isUazapi,
  );
  assertEquals(evaluation.code, "token_auth_missing");
  const record = buildUazapiWebhookTokenAuthTelemetryRecord("observe", evaluation, "unknown", {
    normalizedKind: "message",
    eventLabelSource: "structural",
    authApplicability: "required",
  });
  assertEquals(record.token_auth.normalized_kind, "message");
  assertEquals(record.token_auth.event_label_source, "structural");
  assertEquals(record.token_auth.auth_applicability, "required");
  assertEquals(record.token_auth.token_presence, "missing");
  assertEquals(record.token_auth.token_source, "none");
});

Deno.test("buildUazapiWebhookTokenAuthTelemetryRecord: prova direta do achado da Fase 19C — normalized_kind pode ser 'message' mesmo quando event_type sanitizado é 'unknown'", () => {
  // Reproduz exatamente o payload que expôs o bug de precedência: rótulo
  // explícito ausente/vazio no campo checado primeiro, mas o normalizador
  // canônico (fora do escopo deste arquivo) teria chegado a kind="message"
  // via outro campo ou via fallback estrutural. Este teste prova que,
  // com a correção da Fase 19C, o par (event_type, normalized_kind) pode
  // ser corretamente distinguido na telemetria persistida.
  const payload = { type: "", EventType: "messages" };
  const sanitizedLabel = sanitizeUazapiWebhookEventTypeForTelemetry(payload);
  // Pós-correção da Fase 19C, este caso específico já não produz mais
  // "unknown" — mas o objeto de telemetria abaixo simula o caso genérico
  // em que normalizedKind diverge de sanitizedEventType (ex.: qualquer
  // fallback estrutural remanescente), provando que o schema consegue
  // representar essa divergência quando ela ocorrer.
  const evaluation = evaluateUazapiWebhookTokenAuth(
    [{ id: "c1", provider: "uazapi", instance_token: "tok-A", is_active: true, status: "connected" }],
    {},
    isUazapi,
  );
  const record = buildUazapiWebhookTokenAuthTelemetryRecord("observe", evaluation, "unknown", {
    normalizedKind: "message",
    eventLabelSource: "structural",
    authApplicability: "required",
  });
  assertEquals(record.token_auth.event_type, "unknown");
  assertEquals(record.token_auth.normalized_kind, "message");
  assertEquals(sanitizedLabel, "messages"); // corrigido: já não é mais "unknown"
});

// ── FASE 19J — evaluateUazapiWebhookInternalServiceAuth ───────────────

const REAL_SERVICE_KEY = "sb-service-role-eyJhbGciOiJIUzI1NiJ9.fake-jwt-body.fake-signature";

Deno.test("evaluateUazapiWebhookInternalServiceAuth: Bearer exatamente igual ao service-role => match", () => {
  assertEquals(
    evaluateUazapiWebhookInternalServiceAuth(`Bearer ${REAL_SERVICE_KEY}`, REAL_SERVICE_KEY),
    "match",
  );
});

Deno.test("evaluateUazapiWebhookInternalServiceAuth: sem Authorization => missing", () => {
  assertEquals(evaluateUazapiWebhookInternalServiceAuth(null, REAL_SERVICE_KEY), "missing");
  assertEquals(evaluateUazapiWebhookInternalServiceAuth(undefined, REAL_SERVICE_KEY), "missing");
});

Deno.test("evaluateUazapiWebhookInternalServiceAuth: Bearer vazio => missing", () => {
  assertEquals(evaluateUazapiWebhookInternalServiceAuth("Bearer ", REAL_SERVICE_KEY), "missing");
  assertEquals(evaluateUazapiWebhookInternalServiceAuth("Bearer", REAL_SERVICE_KEY), "missing");
});

Deno.test("evaluateUazapiWebhookInternalServiceAuth: anon key (valor sintaticamente plausível mas errado) => invalid", () => {
  const anonKeyLookalike = "sb-anon-eyJhbGciOiJIUzI1NiJ9.fake-jwt-body.fake-signature";
  assertEquals(
    evaluateUazapiWebhookInternalServiceAuth(`Bearer ${anonKeyLookalike}`, REAL_SERVICE_KEY),
    "invalid",
  );
});

Deno.test("evaluateUazapiWebhookInternalServiceAuth: JWT de usuário (formato válido, valor errado) => invalid", () => {
  const userJwtLookalike = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyJ9.signature-abc";
  assertEquals(
    evaluateUazapiWebhookInternalServiceAuth(`Bearer ${userJwtLookalike}`, REAL_SERVICE_KEY),
    "invalid",
  );
});

Deno.test("evaluateUazapiWebhookInternalServiceAuth: service-role com prefixo extra => invalid", () => {
  assertEquals(
    evaluateUazapiWebhookInternalServiceAuth(`Bearer X${REAL_SERVICE_KEY}`, REAL_SERVICE_KEY),
    "invalid",
  );
});

Deno.test("evaluateUazapiWebhookInternalServiceAuth: service-role com sufixo extra => invalid", () => {
  assertEquals(
    evaluateUazapiWebhookInternalServiceAuth(`Bearer ${REAL_SERVICE_KEY}X`, REAL_SERVICE_KEY),
    "invalid",
  );
});

Deno.test("evaluateUazapiWebhookInternalServiceAuth: capitalização incorreta do prefixo Bearer => missing (extractBearerToken já rejeita)", () => {
  assertEquals(
    evaluateUazapiWebhookInternalServiceAuth(`bearer ${REAL_SERVICE_KEY}`, REAL_SERVICE_KEY),
    "missing",
  );
});

Deno.test("evaluateUazapiWebhookInternalServiceAuth: segredo correto em outro formato de header (sem 'Bearer ') => missing", () => {
  assertEquals(evaluateUazapiWebhookInternalServiceAuth(REAL_SERVICE_KEY, REAL_SERVICE_KEY), "missing");
});

Deno.test("evaluateUazapiWebhookInternalServiceAuth: variável de ambiente ausente/vazia => invalid, nunca autentica por omissão", () => {
  assertEquals(evaluateUazapiWebhookInternalServiceAuth(`Bearer ${REAL_SERVICE_KEY}`, undefined), "invalid");
  assertEquals(evaluateUazapiWebhookInternalServiceAuth(`Bearer ${REAL_SERVICE_KEY}`, null), "invalid");
  assertEquals(evaluateUazapiWebhookInternalServiceAuth(`Bearer ${REAL_SERVICE_KEY}`, ""), "invalid");
});

Deno.test("evaluateUazapiWebhookInternalServiceAuth: mesmo com o secret ausente, Authorization ausente ainda resulta em falha fechada (nunca undefined/exceção)", () => {
  assertEquals(evaluateUazapiWebhookInternalServiceAuth(null, undefined), "invalid");
});

Deno.test("evaluateUazapiWebhookInternalServiceAuth: token quase igual (1 caractere diferente, mesmo tamanho) => invalid", () => {
  const almostSame = REAL_SERVICE_KEY.slice(0, -1) + "X";
  assertEquals(evaluateUazapiWebhookInternalServiceAuth(`Bearer ${almostSame}`, REAL_SERVICE_KEY), "invalid");
});

Deno.test("evaluateUazapiWebhookInternalServiceAuth: nunca lança exceção mesmo com entradas exóticas", () => {
  assertEquals(evaluateUazapiWebhookInternalServiceAuth("Bearer " + "x".repeat(10000), REAL_SERVICE_KEY), "invalid");
  // Whitespace no valor do token falha o formato estrito de extractBearerToken
  // (nunca extrai um token com espaço) — resultado correto é "missing", não "invalid".
  assertEquals(evaluateUazapiWebhookInternalServiceAuth("Bearer \n\t", REAL_SERVICE_KEY), "missing");
});

// ── FASE 19J — buildUazapiWebhookInternalServiceTelemetryRecord ──────

Deno.test("buildUazapiWebhookInternalServiceTelemetryRecord: match => auth_domain/internal_action/internal_auth_result corretos, code dedicado, nunca token_auth_match/missing", () => {
  const record = buildUazapiWebhookInternalServiceTelemetryRecord("observe", "match");
  assertEquals(record.token_auth.auth_domain, "internal_service");
  assertEquals(record.token_auth.internal_action, "resume_funnel");
  assertEquals(record.token_auth.internal_auth_result, "match");
  assertEquals(record.token_auth.code, "token_auth_internal_service");
  assert(record.token_auth.code !== "token_auth_match");
  assert(record.token_auth.code !== "token_auth_missing");
  assertEquals(record.token_auth.connection_id, null);
  assertEquals(record.token_auth.schema_version, TOKEN_AUTH_TELEMETRY_SCHEMA_VERSION);
});

Deno.test("buildUazapiWebhookInternalServiceTelemetryRecord: missing/invalid mapeiam para internal_auth_result correspondente, nunca para o schema de erro de token UazAPI", () => {
  assertEquals(buildUazapiWebhookInternalServiceTelemetryRecord("observe", "missing").token_auth.internal_auth_result, "missing");
  assertEquals(buildUazapiWebhookInternalServiceTelemetryRecord("observe", "invalid").token_auth.internal_auth_result, "invalid");
  assertEquals(buildUazapiWebhookInternalServiceTelemetryRecord("observe", "missing").token_auth.code, "token_auth_internal_service");
  assertEquals(buildUazapiWebhookInternalServiceTelemetryRecord("observe", "invalid").token_auth.code, "token_auth_internal_service");
});

Deno.test("buildUazapiWebhookInternalServiceTelemetryRecord: nunca contém token/Bearer/payload — só as chaves fechadas esperadas", () => {
  const record = buildUazapiWebhookInternalServiceTelemetryRecord("enforce", "match");
  const keys = Object.keys(record.token_auth).sort();
  assertEquals(keys, ALL_TELEMETRY_KEYS);
  const serialized = JSON.stringify(record);
  assertFalse(serialized.toLowerCase().includes("bearer"));
  assertFalse(serialized.toLowerCase().includes(REAL_SERVICE_KEY.toLowerCase()));
});

Deno.test("buildUazapiWebhookInternalServiceTelemetryRecord: funciona nos dois modos", () => {
  assertEquals(buildUazapiWebhookInternalServiceTelemetryRecord("observe", "match").token_auth.mode, "observe");
  assertEquals(buildUazapiWebhookInternalServiceTelemetryRecord("enforce", "match").token_auth.mode, "enforce");
});

// ── FASE 19J — buildUazapiWebhookUnknownInternalActionTelemetryRecord ──

Deno.test("buildUazapiWebhookUnknownInternalActionTelemetryRecord: internal_action=none, internal_auth_result=not_applicable, domain=internal_service", () => {
  const record = buildUazapiWebhookUnknownInternalActionTelemetryRecord("observe");
  assertEquals(record.token_auth.auth_domain, "internal_service");
  assertEquals(record.token_auth.internal_action, "none");
  assertEquals(record.token_auth.internal_auth_result, "not_applicable");
  assertEquals(record.token_auth.code, "token_auth_internal_service");
  assertEquals(record.token_auth.connection_id, null);
});

Deno.test("buildUazapiWebhookUnknownInternalActionTelemetryRecord: nunca contém token/payload — só as chaves fechadas esperadas", () => {
  const record = buildUazapiWebhookUnknownInternalActionTelemetryRecord("enforce");
  const keys = Object.keys(record.token_auth).sort();
  assertEquals(keys, ALL_TELEMETRY_KEYS);
});

// ── FASE 19J — buildUazapiWebhookTokenAuthTelemetryRecord (caminho externo): auth_domain derivado ──

Deno.test("buildUazapiWebhookTokenAuthTelemetryRecord: caminho externo normal => auth_domain=external_uazapi, internal_action=none, internal_auth_result=not_applicable", () => {
  const evaluation = evaluateUazapiWebhookTokenAuth(baseCandidates, { token: "tok-A" }, isUazapi);
  const record = buildUazapiWebhookTokenAuthTelemetryRecord("observe", evaluation, "connection", REQUIRED_DIAG);
  assertEquals(record.token_auth.auth_domain, "external_uazapi");
  assertEquals(record.token_auth.internal_action, "none");
  assertEquals(record.token_auth.internal_auth_result, "not_applicable");
});

Deno.test("buildUazapiWebhookTokenAuthTelemetryRecord: ramo IGNORE_UNKNOWN => auth_domain=not_applicable_unknown, espelhando auth_applicability", () => {
  const record = buildUazapiWebhookTokenAuthTelemetryRecord(
    "observe",
    { code: "token_auth_not_applicable_unknown", authenticatedInstance: null },
    "unknown",
    NOT_APPLICABLE_DIAG,
  );
  assertEquals(record.token_auth.auth_domain, "not_applicable_unknown");
  assertEquals(record.token_auth.internal_action, "none");
  assertEquals(record.token_auth.internal_auth_result, "not_applicable");
});

Deno.test("buildUazapiWebhookTokenAuthTelemetryRecord: evento externo NUNCA pode ser confundido com chamada interna — auth_domain nunca é internal_service", () => {
  const evaluation = evaluateUazapiWebhookTokenAuth(baseCandidates, {}, isUazapi);
  assertEquals(evaluation.code, "token_auth_missing");
  const record = buildUazapiWebhookTokenAuthTelemetryRecord("observe", evaluation, "unknown", REQUIRED_DIAG);
  assert(record.token_auth.auth_domain !== "internal_service");
  assert(record.token_auth.code !== "token_auth_internal_service");
});
