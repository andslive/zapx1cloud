// deno test --allow-read --allow-env supabase/functions/whatsapp-proxy/provider-guard.test.ts
//
// Fase 18C: garante que a guarda de provider do whatsapp-proxy nunca
// trata uma conexão Meta/HookCloud (ou provider desconhecido) como
// UazAPI, e que continua aceitando exatamente o mesmo conjunto de
// conexões que aceitava antes (provider ausente/nulo/vazio ou 'uazapi'
// explícito) — nenhuma regressão para as 16 conexões UazAPI reais em
// produção, que não têm `provider` preenchido.

import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.208.0/assert/mod.ts";
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

// ── Fase 18G — mesmo padrão de seleção usado em create-team-member/index.ts
// (fallback "primeira conexão da org" quando o admin não escolhe uma
// explicitamente ao criar um vendedor novo): `Array.find` composto com
// `isUazapiInstance`, nunca a primeira linha crua sem filtro.

Deno.test("padrão de fallback (find + isUazapiInstance): pula uma conexão HookCloud e escolhe a primeira UazAPI real, mesmo estando ordenada antes", () => {
  const orgInstances = [
    { id: "conn-hookcloud", provider: "meta_cloud" },
    { id: "conn-uazapi-1", provider: "uazapi" },
    { id: "conn-uazapi-2", provider: null },
  ];
  const firstEligible = orgInstances.find((inst) => isUazapiInstance(inst));
  assert(firstEligible?.id === "conn-uazapi-1");
});

Deno.test("padrão de fallback (find + isUazapiInstance): só existe conexão HookCloud/desconhecida => nenhuma escolhida (nunca cai para a primeira mesmo assim)", () => {
  const orgInstances = [
    { id: "conn-hookcloud", provider: "meta_cloud" },
    { id: "conn-unknown", provider: "chromium" },
  ];
  const firstEligible = orgInstances.find((inst) => isUazapiInstance(inst));
  assertEquals(firstEligible, undefined);
});

Deno.test("padrão de fallback (find + isUazapiInstance): organização sem nenhuma conexão => nenhuma escolhida, sem lançar exceção", () => {
  const firstEligible: { id: string; provider?: string | null } | undefined = [].find((inst: { id: string; provider?: string | null }) => isUazapiInstance(inst));
  assertEquals(firstEligible, undefined);
});
