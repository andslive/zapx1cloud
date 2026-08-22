// deno test --allow-read --allow-env supabase/functions/_shared/uazapi-webhook-token-auth-rollout.test.ts
//
// Fase 18N — cobre o parser de modo, a avaliação isolada (observe nunca
// influencia o processamento, enforce bloqueia corretamente), a política
// de seleção de candidatos por modo, e a sanitização de telemetria.

import { assert, assertEquals, assertFalse, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  evaluateUazapiWebhookTokenAuth,
  parseUazapiWebhookTokenAuthMode,
  sanitizeUazapiWebhookEventTypeForTelemetry,
  selectCandidatesForProcessing,
  UnknownUazapiWebhookTokenAuthModeError,
  type UazapiWebhookTokenAuthCandidate,
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
