// deno test --no-check --allow-read --allow-env src/config/integrationsCatalog.test.ts
// (--no-check é necessário aqui: este arquivo fica em src/, fora de
// supabase/functions, e importa integrationsCatalog.ts, que por sua vez
// importa 'lucide-react' via node_modules (resolução estilo npm). Isso faz
// o `deno check`/`deno test` sem --no-check parar de injetar a lib
// "deno.ns" implícita e reportar TS2304 em cada `Deno.test(...)`, mesmo
// isoladamente — confirmado comparando com um teste de
// supabase/functions/_shared, que dá `deno check` limpo sem --no-check.
// Não é um erro de tipos do código deste arquivo; é uma limitação da
// reutilização do Deno para testar código de frontend aqui, registrada
// em vez de contornada. `deno test --no-check` executa e type-checa
// normalmente o corpo dos testes em runtime; só pula a checagem estática
// prévia.)
//
// Fase 5E — cobre a ocultação do card Meta Cloud API por feature flag:
// item ausente do catálogo renderizável (não "coming soon", não presente
// de forma alguma) quando a flag está desligada, presente quando ligada,
// UazAPI e demais integrações nunca afetadas.

import {
  filterIntegrationsCatalogByMetaFlag,
  rawIntegrationsCatalog,
  integrationsCatalog,
  injectHookCloudItem,
  hookCloudOnboardingItem,
} from "./integrationsCatalog.ts";
import { META_CLOUD_API_ENABLED } from "./metaCloudApiFeatureFlag.ts";
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.208.0/assert/mod.ts";

const META_ID = "meta-cloud-api-config";
const UAZAPI_ID = "whatsapp-config";

function findItem(catalog: ReturnType<typeof filterIntegrationsCatalogByMetaFlag>, id: string) {
  for (const cat of catalog) {
    const found = cat.items.find((i) => i.id === id);
    if (found) return found;
  }
  return undefined;
}

function countItems(catalog: ReturnType<typeof filterIntegrationsCatalogByMetaFlag>): number {
  return catalog.reduce((n, cat) => n + cat.items.length, 0);
}

Deno.test("flag false: item Meta está ausente do catálogo renderizável (não é coming_soon, é ausência total)", () => {
  const out = filterIntegrationsCatalogByMetaFlag(rawIntegrationsCatalog, false);
  const meta = findItem(out, META_ID);
  assertEquals(meta, undefined, "item Meta não deveria existir no catálogo filtrado");
});

Deno.test("flag false: busca por termos específicos do card Meta Cloud API não retorna nenhum item", () => {
  // Termo genérico "meta" de propósito NÃO é usado aqui: a integração
  // Facebook Leads Ads legitimamente tem 'meta' como keyword própria (Meta
  // é dona do Facebook) — isso é correto e não deve ser suprimido. Os
  // termos abaixo só existem no card removido.
  const out = filterIntegrationsCatalogByMetaFlag(rawIntegrationsCatalog, false);
  const specificTerms = ["cloud api", "embedded signup", "meta-cloud-api", "coexistência"];
  for (const term of specificTerms) {
    const matches = out.flatMap((cat) =>
      cat.items.filter((item) => {
        const haystack = [item.id, item.name, item.description, cat.label, ...(item.keywords ?? [])]
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      })
    );
    assertEquals(matches.length, 0, `nenhum item deveria casar com '${term}' quando a flag está desligada`);
  }
});

Deno.test("flag false: nenhuma categoria fica vazia/com espaço reservado (categoria 'whatsapp' mantém a UazAPI)", () => {
  const out = filterIntegrationsCatalogByMetaFlag(rawIntegrationsCatalog, false);
  for (const cat of out) {
    assert(cat.items.length > 0, `categoria '${cat.id}' ficou vazia — deveria ter sido removida`);
  }
  const whatsappCat = out.find((c) => c.id === "whatsapp");
  assert(whatsappCat, "categoria whatsapp deveria continuar existindo (tem a UazAPI)");
  assertEquals(whatsappCat!.items.length, 1, "categoria whatsapp deveria ter só a UazAPI restante");
});

Deno.test("flag true: item Meta está presente no catálogo filtrado", () => {
  const out = filterIntegrationsCatalogByMetaFlag(rawIntegrationsCatalog, true);
  const meta = findItem(out, META_ID);
  assert(meta, "item Meta deveria existir no catálogo quando a flag está ligada");
  assertEquals(meta!.configKey, "meta-cloud-api");
});

Deno.test("UazAPI está presente nos dois estados da flag, sem nenhuma alteração de seus campos", () => {
  const outFalse = filterIntegrationsCatalogByMetaFlag(rawIntegrationsCatalog, false);
  const outTrue = filterIntegrationsCatalogByMetaFlag(rawIntegrationsCatalog, true);
  const uazapiFalse = findItem(outFalse, UAZAPI_ID);
  const uazapiTrue = findItem(outTrue, UAZAPI_ID);
  assert(uazapiFalse, "UazAPI ausente com flag false — não deveria acontecer");
  assert(uazapiTrue, "UazAPI ausente com flag true — não deveria acontecer");
  assertEquals(uazapiFalse, uazapiTrue, "UazAPI não pode mudar entre os dois estados da flag");
});

Deno.test("demais itens do catálogo não são removidos — só o Meta é afetado pela flag", () => {
  const outFalse = filterIntegrationsCatalogByMetaFlag(rawIntegrationsCatalog, false);
  const outTrue = filterIntegrationsCatalogByMetaFlag(rawIntegrationsCatalog, true);
  assertEquals(
    countItems(outTrue) - countItems(outFalse),
    1,
    "a única diferença de contagem entre os dois estados deve ser exatamente 1 item (o Meta)",
  );
});

Deno.test("catálogo exportado para a UI (integrationsCatalog) já reflete o estado real de META_CLOUD_API_ENABLED", () => {
  const meta = findItem(integrationsCatalog, META_ID);
  if (META_CLOUD_API_ENABLED) {
    assert(meta, "flag real está true, mas o item Meta não está no catálogo exportado");
  } else {
    assertFalse(!!meta, "flag real está false, mas o item Meta está presente no catálogo exportado para a UI");
  }
});

Deno.test("flag ausente/não-booleana nunca inclui o item por omissão (falha fechada)", () => {
  // deno-lint-ignore no-explicit-any
  const out = filterIntegrationsCatalogByMetaFlag(rawIntegrationsCatalog, undefined as any);
  const meta = findItem(out, META_ID);
  assertEquals(meta, undefined, "valor não-true para a flag nunca deve incluir o item Meta");
});

// ── FASE 18A — card comercial HookCloud (injeção dinâmica) ──────────────

const HOOKCLOUD_ID = "hookcloud-onboarding";

Deno.test("injectHookCloudItem: visible=false nunca inclui o card (ausência completa, não 'em breve')", () => {
  const out = injectHookCloudItem(integrationsCatalog, false);
  assertEquals(findItem(out, HOOKCLOUD_ID), undefined);
});

Deno.test("injectHookCloudItem: visible=true inclui o card na categoria whatsapp", () => {
  const out = injectHookCloudItem(integrationsCatalog, true);
  const item = findItem(out, HOOKCLOUD_ID);
  assert(item, "card HookCloud ausente mesmo com visible=true");
  assertEquals(item?.name, "HookCloud — WhatsApp Oficial");
});

Deno.test("injectHookCloudItem: nunca duplica o card em chamadas repetidas", () => {
  const once = injectHookCloudItem(integrationsCatalog, true);
  const twice = injectHookCloudItem(once, true);
  const count = twice.reduce((n, cat) => n + cat.items.filter((i) => i.id === HOOKCLOUD_ID).length, 0);
  assertEquals(count, 1);
});

Deno.test("injectHookCloudItem: UazAPI (whatsapp-config) nunca é removida ou alterada pela injeção", () => {
  const before = findItem(integrationsCatalog, UAZAPI_ID);
  const out = injectHookCloudItem(integrationsCatalog, true);
  const after = findItem(out, UAZAPI_ID);
  assert(before && after);
  assertEquals(before, after);
});

Deno.test("injectHookCloudItem: card técnico Meta (meta-cloud-api-config) NUNCA aparece junto com o card HookCloud — sempre no máximo uma opção comercial de Meta oficial visível", () => {
  const out = injectHookCloudItem(integrationsCatalog, true);
  const metaTecnico = findItem(out, META_ID);
  const hookcloud = findItem(out, HOOKCLOUD_ID);
  assert(hookcloud, "card HookCloud deveria estar presente");
  // Com META_CLOUD_API_ENABLED=false (estado real hoje), o item técnico
  // nunca está no catálogo de origem — este teste falharia alto e claro
  // se algum dia alguém ligasse as duas flags ao mesmo tempo sem revisão.
  assertEquals(metaTecnico, undefined, "o card técnico Meta nunca deve coexistir com o card comercial HookCloud");
});

Deno.test("hookCloudOnboardingItem: nunca solicita configKey de outro provider, tem pilotLabel definido (nunca badge 'Ativo')", () => {
  assertEquals(hookCloudOnboardingItem.configKey, "hookcloud-onboarding");
  assert(hookCloudOnboardingItem.pilotLabel, "pilotLabel ausente — o card poderia mostrar o badge verde 'Ativo'");
  assertEquals(hookCloudOnboardingItem.alwaysActive, undefined);
});

Deno.test("hookCloudOnboardingItem: nome e descrição não mencionam EvoHub nem 'Meta Cloud API' como opção comercial separada", () => {
  const haystack = `${hookCloudOnboardingItem.name} ${hookCloudOnboardingItem.description}`.toLowerCase();
  assertFalse(haystack.includes("evohub"));
  assertFalse(haystack.includes("meta cloud api"));
});
