// deno test --allow-import meta-onboarding-source.test.ts
//
// Fase 10A — cobre o parser/validador de onboarding_source: aceita
// 'hookcloud'/'direct_meta', trata null/vazio como legado (nunca erro),
// falha fechada (nunca converte silenciosamente, nunca vira provider) para
// qualquer outro valor, e prova que o log seguro nunca expõe segredo.

import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  logMetaCloudConnectionResolved,
  parseMetaCloudOnboardingSource,
  UnknownMetaCloudOnboardingSourceError,
} from "./meta-onboarding-source.ts";

Deno.test("'hookcloud' é aceito e retornado tipado", () => {
  assertEquals(parseMetaCloudOnboardingSource("hookcloud"), "hookcloud");
});

Deno.test("'direct_meta' é aceito e retornado tipado", () => {
  assertEquals(parseMetaCloudOnboardingSource("direct_meta"), "direct_meta");
});

Deno.test("null é tratado como legado/não informado — nunca lança erro", () => {
  assertEquals(parseMetaCloudOnboardingSource(null), null);
});

Deno.test("undefined é tratado como legado/não informado — nunca lança erro", () => {
  assertEquals(parseMetaCloudOnboardingSource(undefined), null);
});

Deno.test("string vazia é tratada como legado/não informado — nunca lança erro", () => {
  assertEquals(parseMetaCloudOnboardingSource(""), null);
});

Deno.test("valor desconhecido falha fechado (UnknownMetaCloudOnboardingSourceError), nunca converte silenciosamente", () => {
  const err = assertThrows(
    () => parseMetaCloudOnboardingSource("evohub"),
    UnknownMetaCloudOnboardingSourceError,
  );
  assertEquals(err.rawValue, "evohub");
});

Deno.test("valor desconhecido não é interpretado como 'uazapi' nem qualquer outro provider — sem fallback", () => {
  // A própria assinatura de retorno (MetaCloudOnboardingSource | null) já
  // impede sintaticamente um valor como 'uazapi' de ser retornado por esta
  // função — este teste prova em runtime que 'uazapi' (um valor real de
  // *provider*, não de onboarding_source) é rejeitado como desconhecido,
  // não silenciosamente aceito.
  assertThrows(() => parseMetaCloudOnboardingSource("uazapi"), UnknownMetaCloudOnboardingSourceError);
});

Deno.test("tipos não-string (number/object/boolean) também falham fechado", () => {
  assertThrows(() => parseMetaCloudOnboardingSource(42), UnknownMetaCloudOnboardingSourceError);
  assertThrows(() => parseMetaCloudOnboardingSource({}), UnknownMetaCloudOnboardingSourceError);
  assertThrows(() => parseMetaCloudOnboardingSource(true), UnknownMetaCloudOnboardingSourceError);
});

Deno.test("log seguro: só provider/onboarding_source/connection_id/organization_id — nunca token/phone/mensagem", () => {
  const originalLog = console.log;
  const calls: unknown[][] = [];
  console.log = (...args: unknown[]) => {
    calls.push(args);
  };
  try {
    logMetaCloudConnectionResolved({
      provider: "meta_cloud",
      onboardingSource: "hookcloud",
      connectionId: "conn-123",
      organizationId: "org-abc",
    });
  } finally {
    console.log = originalLog;
  }

  assertEquals(calls.length, 1);
  const loggedPayload = calls[0].find((a) => typeof a === "object" && a !== null) as Record<string, unknown>;
  assert(loggedPayload, "esperava um objeto estruturado no log");
  const keys = Object.keys(loggedPayload).sort();
  assertEquals(keys, ["connection_id", "onboarding_source", "organization_id", "provider"]);
  const serialized = JSON.stringify(calls);
  assert(!serialized.toLowerCase().includes("token"), "log não deve conter a palavra 'token'");
  assert(!serialized.toLowerCase().includes("bearer"), "log não deve conter credencial estilo Bearer");
});
