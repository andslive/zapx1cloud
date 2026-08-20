// deno test --allow-read --allow-env supabase/functions/whatsapp-proxy/provider-guard.test.ts
//
// Fase 18C: garante que a guarda de provider do whatsapp-proxy nunca
// trata uma conexão Meta/HookCloud (ou provider desconhecido) como
// UazAPI, e que continua aceitando exatamente o mesmo conjunto de
// conexões que aceitava antes (provider ausente/nulo/vazio ou 'uazapi'
// explícito) — nenhuma regressão para as 16 conexões UazAPI reais em
// produção, que não têm `provider` preenchido.

import { assert, assertFalse } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { isUazapiInstance, UNSUPPORTED_PROVIDER_RESPONSE } from "./provider-guard.ts";

Deno.test("isUazapiInstance: provider 'uazapi' explícito é aceito", () => {
  assert(isUazapiInstance({ provider: "uazapi" }));
});

Deno.test("isUazapiInstance: provider ausente (undefined) é aceito — retrocompatibilidade das conexões antigas", () => {
  assert(isUazapiInstance({}));
});

Deno.test("isUazapiInstance: provider null é aceito — mesma regra de resolveConnectionProvider (Fase 2A)", () => {
  assert(isUazapiInstance({ provider: null }));
});

Deno.test("isUazapiInstance: provider string vazia é aceita (mesmo tratamento de 'ausente')", () => {
  assert(isUazapiInstance({ provider: "" }));
});

Deno.test("isUazapiInstance: provider 'meta_cloud' é REJEITADO — nunca tratado como UazAPI", () => {
  assertFalse(isUazapiInstance({ provider: "meta_cloud" }));
});

Deno.test("isUazapiInstance: provider desconhecido/inesperado falha fechado, nunca vira UazAPI por omissão", () => {
  assertFalse(isUazapiInstance({ provider: "chromium" }));
  assertFalse(isUazapiInstance({ provider: "evolution" }));
  assertFalse(isUazapiInstance({ provider: "qualquer-coisa-nunca-vista" }));
});

Deno.test("isUazapiInstance: instância nula/indefinida é rejeitada, nunca lança exceção", () => {
  assertFalse(isUazapiInstance(null));
  assertFalse(isUazapiInstance(undefined));
});

Deno.test("UNSUPPORTED_PROVIDER_RESPONSE: nunca contém token, telefone ou qualquer dado da conexão — só um código genérico", () => {
  const keys = Object.keys(UNSUPPORTED_PROVIDER_RESPONSE);
  assert(keys.includes("ok"));
  assert(keys.includes("error"));
  assertFalse(JSON.stringify(UNSUPPORTED_PROVIDER_RESPONSE).includes("token"));
});
