// deno test --allow-read --allow-env supabase/functions/_shared/uazapi-webhook-token-auth.test.ts
//
// Fase 18K — cobre a lista de casos exigida: correspondência única,
// token ausente/vazio/tipo errado, correspondência incorreta (mesmo
// tamanho e tamanho diferente), zero candidatos, ambiguidade textual
// resolvida pelo token, ambiguidade de token (falha fechada), e
// redação do payload antes de log.

import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  extractUazapiWebhookToken,
  redactUazapiWebhookPayloadForLog,
  resolveUazapiInstanceByToken,
  timingSafeEqualString,
} from "./uazapi-webhook-token-auth.ts";

// ── timingSafeEqualString ────────────────────────────────────────────

Deno.test("timingSafeEqualString: strings idênticas são iguais", () => {
  assert(timingSafeEqualString("abc123", "abc123"));
});

Deno.test("timingSafeEqualString: mesmo tamanho, conteúdo diferente", () => {
  assertFalse(timingSafeEqualString("abc123", "abc124"));
});

Deno.test("timingSafeEqualString: tamanhos diferentes nunca são iguais", () => {
  assertFalse(timingSafeEqualString("abc", "abc123"));
  assertFalse(timingSafeEqualString("abc123", "abc"));
});

Deno.test("timingSafeEqualString: strings vazias são iguais entre si", () => {
  assert(timingSafeEqualString("", ""));
});

// ── extractUazapiWebhookToken ────────────────────────────────────────

Deno.test("extractUazapiWebhookToken: token string não vazia é aceito", () => {
  assertEquals(extractUazapiWebhookToken({ token: "real-token-123" }), "real-token-123");
});

Deno.test("extractUazapiWebhookToken: token ausente é rejeitado (null)", () => {
  assertEquals(extractUazapiWebhookToken({}), null);
});

Deno.test("extractUazapiWebhookToken: token string vazia é rejeitado", () => {
  assertEquals(extractUazapiWebhookToken({ token: "" }), null);
});

Deno.test("extractUazapiWebhookToken: token de tipo incorreto é rejeitado (number/object/array/bool)", () => {
  assertEquals(extractUazapiWebhookToken({ token: 12345 }), null);
  assertEquals(extractUazapiWebhookToken({ token: { nested: true } }), null);
  assertEquals(extractUazapiWebhookToken({ token: ["a"] }), null);
  assertEquals(extractUazapiWebhookToken({ token: true }), null);
  assertEquals(extractUazapiWebhookToken({ token: null }), null);
});

Deno.test("extractUazapiWebhookToken: payload não-objeto (null/undefined/string/número) nunca lança exceção", () => {
  assertEquals(extractUazapiWebhookToken(null), null);
  assertEquals(extractUazapiWebhookToken(undefined), null);
  assertEquals(extractUazapiWebhookToken("not-an-object"), null);
  assertEquals(extractUazapiWebhookToken(42), null);
});

// ── resolveUazapiInstanceByToken ─────────────────────────────────────

interface FakeInstance {
  id: string;
  instance_token?: string | null;
  organization_id: string;
}

Deno.test("resolveUazapiInstanceByToken: token correto + candidato único => matched", () => {
  const candidates: FakeInstance[] = [{ id: "conn-1", instance_token: "tok-A", organization_id: "org-1" }];
  const result = resolveUazapiInstanceByToken(candidates, "tok-A");
  assertEquals(result.outcome, "matched");
  assert(result.outcome === "matched" && result.instance.id === "conn-1");
});

Deno.test("resolveUazapiInstanceByToken: token recebido null (ausente/inválido) => rejeitado, no_receivable_token", () => {
  const candidates: FakeInstance[] = [{ id: "conn-1", instance_token: "tok-A", organization_id: "org-1" }];
  const result = resolveUazapiInstanceByToken(candidates, null);
  assertEquals(result.outcome, "rejected");
  assert(result.outcome === "rejected" && result.reason === "no_receivable_token");
});

Deno.test("resolveUazapiInstanceByToken: token incorreto, mesmo tamanho do armazenado => rejeitado, no_match", () => {
  const candidates: FakeInstance[] = [{ id: "conn-1", instance_token: "tok-AAAA", organization_id: "org-1" }];
  const result = resolveUazapiInstanceByToken(candidates, "tok-BBBB");
  assertEquals(result.outcome, "rejected");
  assert(result.outcome === "rejected" && result.reason === "no_match");
});

Deno.test("resolveUazapiInstanceByToken: token incorreto, tamanho diferente do armazenado => rejeitado, no_match", () => {
  const candidates: FakeInstance[] = [{ id: "conn-1", instance_token: "tok-AAAA", organization_id: "org-1" }];
  const result = resolveUazapiInstanceByToken(candidates, "tok-muito-mais-longo-que-o-armazenado");
  assertEquals(result.outcome, "rejected");
  assert(result.outcome === "rejected" && result.reason === "no_match");
});

Deno.test("resolveUazapiInstanceByToken: nenhum candidato (organização/identificador inexistente) => rejeitado, no_match, sem lançar exceção", () => {
  const result = resolveUazapiInstanceByToken([], "tok-A");
  assertEquals(result.outcome, "rejected");
  assert(result.outcome === "rejected" && result.reason === "no_match" && result.matchCount === 0);
});

Deno.test("resolveUazapiInstanceByToken: dois candidatos textuais (mesmo name/instance_id), só um token compatível => aceita somente a linha compatível", () => {
  const candidates: FakeInstance[] = [
    { id: "conn-archived", instance_token: "tok-old", organization_id: "org-1" },
    { id: "conn-active", instance_token: "tok-new", organization_id: "org-1" },
  ];
  const result = resolveUazapiInstanceByToken(candidates, "tok-new");
  assertEquals(result.outcome, "matched");
  assert(result.outcome === "matched" && result.instance.id === "conn-active");
});

Deno.test("resolveUazapiInstanceByToken: dois candidatos com o MESMO token => falha fechada, ambiguous_match, nenhum escolhido", () => {
  const candidates: FakeInstance[] = [
    { id: "conn-1", instance_token: "tok-shared", organization_id: "org-1" },
    { id: "conn-2", instance_token: "tok-shared", organization_id: "org-2" },
  ];
  const result = resolveUazapiInstanceByToken(candidates, "tok-shared");
  assertEquals(result.outcome, "rejected");
  assert(result.outcome === "rejected" && result.reason === "ambiguous_match" && result.matchCount === 2);
});

Deno.test("resolveUazapiInstanceByToken: candidatos com instance_token nulo/vazio nunca combinam por acidente com token vazio", () => {
  const candidates: FakeInstance[] = [
    { id: "conn-null", instance_token: null, organization_id: "org-1" },
    { id: "conn-empty", instance_token: "", organization_id: "org-1" },
  ];
  // extractUazapiWebhookToken já rejeitaria token vazio antes de chegar aqui,
  // mas testamos a função pura isoladamente para garantir que ela também
  // nunca casa string vazia recebida com coluna nula/vazia armazenada.
  const result = resolveUazapiInstanceByToken(candidates, "");
  assertEquals(result.outcome, "rejected");
});

Deno.test("resolveUazapiInstanceByToken: organização nunca é derivada do payload — vem exclusivamente da linha autenticada", () => {
  const candidates: FakeInstance[] = [
    { id: "conn-1", instance_token: "tok-A", organization_id: "org-real" },
  ];
  const result = resolveUazapiInstanceByToken(candidates, "tok-A");
  assert(result.outcome === "matched");
  assertEquals(result.outcome === "matched" ? result.instance.organization_id : null, "org-real");
});

// ── redactUazapiWebhookPayloadForLog ─────────────────────────────────

Deno.test("redactUazapiWebhookPayloadForLog: remove o valor de `token`, preserva os demais campos", () => {
  const payload = { token: "super-secret-value", instanceName: "abc", owner: "5581999999999" };
  const redacted = redactUazapiWebhookPayloadForLog(payload) as Record<string, unknown>;
  assertEquals(redacted.token, "[REDACTED]");
  assertEquals(redacted.instanceName, "abc");
  assertEquals(redacted.owner, "5581999999999");
  assertFalse(JSON.stringify(redacted).includes("super-secret-value"));
});

Deno.test("redactUazapiWebhookPayloadForLog: payload sem campo `token` passa intacto, sem lançar exceção", () => {
  const payload = { EventType: "connection" };
  const redacted = redactUazapiWebhookPayloadForLog(payload) as Record<string, unknown>;
  assertEquals(redacted.EventType, "connection");
  assertFalse("token" in redacted);
});

Deno.test("redactUazapiWebhookPayloadForLog: payload não-objeto (null/array/string) nunca lança exceção", () => {
  assertEquals(redactUazapiWebhookPayloadForLog(null), null);
  assertEquals(redactUazapiWebhookPayloadForLog("raw-string"), "raw-string");
  assertEquals(redactUazapiWebhookPayloadForLog([1, 2, 3]), [1, 2, 3]);
});

Deno.test("redactUazapiWebhookPayloadForLog: não muta o objeto original", () => {
  const payload = { token: "secret-abc" };
  redactUazapiWebhookPayloadForLog(payload);
  assertEquals(payload.token, "secret-abc");
});
