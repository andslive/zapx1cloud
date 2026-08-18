// Prova do gate de roteamento multi-provider (FASE 2B.0.EVOHUB-2): conexão
// UazAPI (provider ausente/nulo/vazio/'uazapi'/qualquer outro valor
// diferente de 'meta_cloud') NUNCA é desviada — mesma regra de
// retrocompatibilidade de resolve.ts. Só 'meta_cloud' exato aciona o
// desvio. O restante do handler (lógica UazAPI real) não é exercitado
// aqui deliberadamente — não foi alterado nesta fase (ver diff), e
// depende de um client Supabase real / rede, fora do escopo de um teste
// unitário seguro.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { isMetaCloudConnection } from "./index.ts";

Deno.test("provider ausente (undefined) -> permanece UazAPI", () => {
  assertEquals(isMetaCloudConnection({}), false);
});

Deno.test("provider nulo -> permanece UazAPI", () => {
  assertEquals(isMetaCloudConnection({ provider: null }), false);
});

Deno.test("provider vazio -> permanece UazAPI", () => {
  assertEquals(isMetaCloudConnection({ provider: "" }), false);
});

Deno.test("provider 'uazapi' explícito -> permanece UazAPI", () => {
  assertEquals(isMetaCloudConnection({ provider: "uazapi" }), false);
});

Deno.test("provider desconhecido/legado -> permanece UazAPI (falha fechada para o lado seguro/atual)", () => {
  assertEquals(isMetaCloudConnection({ provider: "chromium" }), false);
});

Deno.test("instance nula/indefinida -> permanece UazAPI", () => {
  assertEquals(isMetaCloudConnection(null), false);
  assertEquals(isMetaCloudConnection(undefined), false);
});

Deno.test("provider 'meta_cloud' exato -> é desviado para o núcleo Meta", () => {
  assertEquals(isMetaCloudConnection({ provider: "meta_cloud" }), true);
});

Deno.test("provider 'META_CLOUD' (caixa diferente) -> NÃO é reconhecido (comparação estrita, sem normalização surpresa)", () => {
  assertEquals(isMetaCloudConnection({ provider: "META_CLOUD" }), false);
});
