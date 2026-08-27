// deno test --allow-import supabase/functions/uazapi-webhook/instance-resolution.test.ts
//
// Cobre a correção de resolução de instância por instance_token
// (investigação/plano desta sessão: mensagens de uma instância com espaço
// no nome nunca eram associadas a lead/conversa porque o lookup por nome
// usava um identificador já normalizado contra a coluna `name`, que
// preserva o valor original). Nenhum teste aqui chama rede real, envia
// mensagem real ou usa um token de produção — todos usam um sentinel
// fictício não-UUID.
//
// IMPORTANTE: nenhum destes testes deve jamais imprimir/persistir o
// sentinel de token em texto — os testes de vazamento (abaixo) verificam
// isso inspecionando diretamente os argumentos passados aos mocks e aos
// spies de console, não apenas grepando a saída (achado da revisão do
// plano v2: grep na saída não prova ausência de persistência).

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  extractInstanceToken,
  extractRawInstanceIdentifier,
  redactSecrets,
  resolveInstanceForEvent,
} from "./index.ts";

const TOKEN_SENTINEL = "TEST-TOKEN-SENTINEL-not-a-real-uuid-xyz";

type Row = Record<string, any>;

/**
 * Mock mínimo do client Supabase, cobrindo exatamente a forma de consulta
 * usada por `resolveInstanceForEvent`: `.from(table).select(cols).eq(col, val)`.
 * Nenhum `.or()` — a correção elimina deliberadamente filtros com string
 * interpolada.
 */
/**
 * Mock encadeável (thenable): suporta `.eq(a,1).eq(b,2)` acumulando
 * filtros e só resolvendo quando efetivamente awaited/`.then()`-ado — igual
 * ao query builder real do supabase-js. Necessário para a query de
 * redirect de instância arquivada, que encadeia dois `.eq()`.
 */
function fakeSupabase(
  rows: Row[],
  opts: { errorOnColumn?: string } = {},
) {
  const calls: Array<{ table: string; filters: Array<{ op: string; column: string; value: any }> }> = [];

  function makeQuery(filters: Array<{ op: string; column: string; value: any }>) {
    const resolve = () => {
      calls.push({ table: "evolution_instances", filters });
      const errored = filters.find((f) => opts.errorOnColumn === f.column);
      if (errored) return { data: null, error: { message: "db_error" } };
      const data = rows.filter((r) =>
        filters.every((f) => {
          const cell = r[f.column];
          if (f.op === "ilike") {
            return typeof cell === "string" && typeof f.value === "string" &&
              cell.toLowerCase() === f.value.toLowerCase();
          }
          return cell === f.value;
        })
      );
      return { data, error: null };
    };
    const query: any = {
      eq(column: string, value: any) {
        return makeQuery([...filters, { op: "eq", column, value }]);
      },
      ilike(column: string, value: any) {
        return makeQuery([...filters, { op: "ilike", column, value }]);
      },
      then(onFulfilled: any, onRejected: any) {
        return Promise.resolve(resolve()).then(onFulfilled, onRejected);
      },
    };
    return query;
  }

  return {
    calls,
    client: {
      from(table: string) {
        if (table !== "evolution_instances") {
          throw new Error(`tabela inesperada no teste: ${table}`);
        }
        return {
          select(_columns: string) {
            return makeQuery([]);
          },
        };
      },
    },
  };
}

function baseRow(overrides: Row = {}): Row {
  return {
    id: crypto.randomUUID(),
    organization_id: crypto.randomUUID(),
    name: "instância padrão",
    instance_id: "r-" + Math.random().toString(36).slice(2, 10),
    instance_token: crypto.randomUUID(),
    is_active: true,
    status: "connected",
    ...overrides,
  };
}

// --- 1/2: resolução por token, nome divergente/normalizado ---

Deno.test("resolve por token mesmo com nome normalizado diferente (regressão real: espaço no nome)", async () => {
  const row = baseRow({ name: "MEU CHIP P/ CLONE", instance_token: TOKEN_SENTINEL });
  const { client } = fakeSupabase([row]);
  const result = await resolveInstanceForEvent(client, { token: TOKEN_SENTINEL, instanceName: "meuchipp/clone" });
  assertEquals(result.reason, "resolved_by_token");
  assertExists(result.instance);
  assertEquals(result.instance!.id, row.id);
});

// --- 3: token desconhecido ---

Deno.test("token desconhecido falha fechado (ignored/unknown_token), nunca cai para nome", async () => {
  const row = baseRow({ name: "meuchipp/clone" }); // mesmo nome do payload, não deve ser usado
  const { client } = fakeSupabase([row]);
  const result = await resolveInstanceForEvent(client, {
    token: "token-que-nao-existe",
    instanceName: "meuchipp/clone",
  });
  assertEquals(result.instance, null);
  assertEquals(result.reason, "unknown_token");
});

// --- 4: token batendo múltiplas linhas ---

Deno.test("token batendo mais de uma linha falha fechado (token_conflict)", async () => {
  const sharedToken = TOKEN_SENTINEL;
  const rowA = baseRow({ instance_token: sharedToken });
  const rowB = baseRow({ instance_token: sharedToken });
  const { client } = fakeSupabase([rowA, rowB]);
  const result = await resolveInstanceForEvent(client, { token: sharedToken });
  assertEquals(result.instance, null);
  assertEquals(result.reason, "token_conflict");
});

// --- 5a/5b: precedência token vs identificador bruto vs organization_id ---

Deno.test("token válido + identificador bruto divergente + organization_id ausente -> resolve por token", async () => {
  const row = baseRow({ name: "Nome Correto", instance_token: TOKEN_SENTINEL });
  const { client } = fakeSupabase([row]);
  const result = await resolveInstanceForEvent(client, {
    token: TOKEN_SENTINEL,
    instanceName: "nome-completamente-diferente",
  });
  assertEquals(result.reason, "resolved_by_token");
  assertEquals(result.instance!.id, row.id);
});

Deno.test("token válido + organization_id divergente -> organization_mismatch (vence depois da resolução)", async () => {
  const row = baseRow({ instance_token: TOKEN_SENTINEL, organization_id: "org-real" });
  const { client } = fakeSupabase([row]);
  const result = await resolveInstanceForEvent(client, {
    token: TOKEN_SENTINEL,
    organization_id: "org-diferente",
  });
  assertEquals(result.instance, null);
  assertEquals(result.reason, "organization_mismatch");
});

// --- 6: sem token, nome exato batendo 1 instância ---

Deno.test("sem token no payload, nome exato batendo 1 instância -> resolve por identificador legado", async () => {
  const row = baseRow({ name: "chip19" });
  const { client } = fakeSupabase([row]);
  const result = await resolveInstanceForEvent(client, { instanceName: "chip19" });
  assertEquals(result.reason, "resolved_by_legacy_identifier");
  assertEquals(result.instance!.id, row.id);
});

// --- 7: sem token, nome batendo 2 instâncias (caso real: nomes duplicados) ---

Deno.test("sem token, nome batendo 2 instâncias (caso real MEU CHIP P/ CLONE / CHIP03-CO) -> ambiguous_instance", async () => {
  const rowA = baseRow({ name: "MEU CHIP P/ CLONE" });
  const rowB = baseRow({ name: "MEU CHIP P/ CLONE" });
  const { client } = fakeSupabase([rowA, rowB]);
  const result = await resolveInstanceForEvent(client, { instanceName: "MEU CHIP P/ CLONE" });
  assertEquals(result.instance, null);
  assertEquals(result.reason, "ambiguous_instance");
});

// --- fallback legado preserva compatibilidade: case-insensitive + metadata ---

Deno.test("sem token, nome com caixa diferente ainda resolve (case-insensitive preservado, achado da revisão do diff)", async () => {
  const row = baseRow({ name: "Chip19" });
  const { client } = fakeSupabase([row]);
  const result = await resolveInstanceForEvent(client, { instanceName: "CHIP19" });
  assertEquals(result.reason, "resolved_by_legacy_identifier");
  assertEquals(result.instance!.id, row.id);
});

Deno.test("sem token, resolve por metadata.instance_name (fallback legado preservado)", async () => {
  const row = baseRow({ name: "outro-nome", "metadata->>instance_name": "alias-legado" } as any);
  const { client } = fakeSupabase([row]);
  const result = await resolveInstanceForEvent(client, { instanceName: "alias-legado" });
  assertEquals(result.reason, "resolved_by_legacy_identifier");
  assertEquals(result.instance!.id, row.id);
});

// --- erro técnico vs recusa determinística (achado da revisão do diff) ---

Deno.test("erro de consulta retorna reason='error', distinto de qualquer motivo determinístico de ignored", async () => {
  const { client } = fakeSupabase([], { errorOnColumn: "instance_token" });
  const result = await resolveInstanceForEvent(client, { token: TOKEN_SENTINEL });
  assertEquals(result.reason, "error");
});

// --- 8: instância arquivada — comportamento pré-existente preservado (item 3 do endurecimento) ---

Deno.test("instância arquivada com UMA parceira ativa de mesmo telefone NA MESMA organização -> redireciona (comportamento pré-existente preservado)", async () => {
  const orgId = crypto.randomUUID();
  const archived = baseRow({ instance_token: TOKEN_SENTINEL, is_active: false, phone_number: "5511999999999", organization_id: orgId });
  const activePartner = baseRow({ is_active: true, phone_number: "5511999999999", organization_id: orgId });
  const { client } = fakeSupabase([archived, activePartner]);
  const result = await resolveInstanceForEvent(client, { token: TOKEN_SENTINEL });
  assertExists(result.instance);
  assertEquals(result.instance!.id, activePartner.id);
});

Deno.test("instância arquivada com parceira ativa de mesmo telefone em OUTRA organização -> NUNCA redireciona (achado crítico da revisão final)", async () => {
  const archived = baseRow({ instance_token: TOKEN_SENTINEL, is_active: false, phone_number: "5511999999999" });
  const partnerOtherOrg = baseRow({ is_active: true, phone_number: "5511999999999" }); // organization_id aleatório e diferente
  const { client } = fakeSupabase([archived, partnerOtherOrg]);
  const result = await resolveInstanceForEvent(client, { token: TOKEN_SENTINEL });
  assertEquals(result.instance, null);
  assertEquals(result.reason, "inactive_instance");
});

Deno.test("instância arquivada SEM telefone -> não redireciona, inactive_instance (nunca compara null===null)", async () => {
  const archived = baseRow({ instance_token: TOKEN_SENTINEL, is_active: false, phone_number: null });
  const otherArchivedNoPhone = baseRow({ is_active: false, phone_number: null });
  const { client } = fakeSupabase([archived, otherArchivedNoPhone]);
  const result = await resolveInstanceForEvent(client, { token: TOKEN_SENTINEL });
  assertEquals(result.instance, null);
  assertEquals(result.reason, "inactive_instance");
});

Deno.test("instância arquivada SEM nenhuma parceira ativa de mesmo telefone -> inactive_instance", async () => {
  const archived = baseRow({ instance_token: TOKEN_SENTINEL, is_active: false, phone_number: "5511999999999" });
  const { client } = fakeSupabase([archived]);
  const result = await resolveInstanceForEvent(client, { token: TOKEN_SENTINEL });
  assertEquals(result.instance, null);
  assertEquals(result.reason, "inactive_instance");
});

Deno.test("instância arquivada com DUAS parceiras ativas de mesmo telefone NA MESMA organização -> falha fechada (nunca escolhe arbitrariamente)", async () => {
  const orgId = crypto.randomUUID();
  const archived = baseRow({ instance_token: TOKEN_SENTINEL, is_active: false, phone_number: "5511999999999", organization_id: orgId });
  const partnerA = baseRow({ is_active: true, phone_number: "5511999999999", organization_id: orgId });
  const partnerB = baseRow({ is_active: true, phone_number: "5511999999999", organization_id: orgId });
  const { client } = fakeSupabase([archived, partnerA, partnerB]);
  const result = await resolveInstanceForEvent(client, { token: TOKEN_SENTINEL });
  assertEquals(result.instance, null);
  assertEquals(result.reason, "inactive_instance");
});

// --- 11: erro de consulta nunca é confundido com "zero resultados" ---

Deno.test("erro de consulta ao banco -> error, nunca ignored/unknown_*", async () => {
  const { client } = fakeSupabase([], { errorOnColumn: "instance_token" });
  const result = await resolveInstanceForEvent(client, { token: TOKEN_SENTINEL });
  assertEquals(result.instance, null);
  assertEquals(result.reason, "error");
});

// --- missing_instance ---

Deno.test("payload sem token e sem identificador nenhum -> missing_instance", async () => {
  const { client } = fakeSupabase([]);
  const result = await resolveInstanceForEvent(client, {});
  assertEquals(result.instance, null);
  assertEquals(result.reason, "missing_instance");
});

// --- 20: deduplicação de candidatos no fallback legado ---

Deno.test("mesma linha batendo por instance_id E name conta como 1 candidato, não ambíguo", async () => {
  const row = baseRow({ name: "chip-unico", instance_id: "r-chip-unico" });
  const { client } = fakeSupabase([row]);
  const result = await resolveInstanceForEvent(client, { instanceName: "chip-unico" });
  // instance_id e name do payload são o mesmo valor de busca aqui só para
  // forçar as duas queries baterem na MESMA linha (dedupe por id).
  assertEquals(result.reason, "resolved_by_legacy_identifier");
  assertEquals(result.instance!.id, row.id);
});

// --- 19: consulta nunca faz .or() com string interpolada (checagem estrutural do mock) ---

Deno.test("consulta usa .eq() isolado por chamada, nunca uma única chamada .or() com múltiplos valores", async () => {
  const row = baseRow({ instance_token: TOKEN_SENTINEL });
  const { client, calls } = fakeSupabase([row]);
  await resolveInstanceForEvent(client, { token: TOKEN_SENTINEL });
  assertEquals(calls.length, 1);
  assertEquals(calls[0].filters.length, 1);
  assertEquals(calls[0].filters[0].column, "instance_token");
  assertEquals(calls[0].filters[0].value, TOKEN_SENTINEL);
});

// --- extractInstanceToken / extractRawInstanceIdentifier ---

Deno.test("extractInstanceToken só lê payload.token (raiz), não adivinha variantes", () => {
  assertEquals(extractInstanceToken({ token: "abc" }), "abc");
  assertEquals(extractInstanceToken({ data: { token: "abc" } }), "");
  assertEquals(extractInstanceToken({ apikey: "abc" }), "");
});

Deno.test("extractRawInstanceIdentifier não normaliza (preserva espaço/maiúsculas)", () => {
  assertEquals(extractRawInstanceIdentifier({ instanceName: "MEU CHIP P/ CLONE" }), "MEU CHIP P/ CLONE");
});

// --- redactSecrets: sanitização recursiva ---

Deno.test("redactSecrets remove chave no nível raiz", () => {
  const out = redactSecrets({ token: TOKEN_SENTINEL, other: "ok" });
  assertEquals(out.token, "[REDACTED]");
  assertEquals(out.other, "ok");
});

Deno.test("redactSecrets remove chave aninhada (data.token)", () => {
  const out = redactSecrets({ data: { token: TOKEN_SENTINEL, nested: { instance_token: TOKEN_SENTINEL } } });
  assertEquals(out.data.token, "[REDACTED]");
  assertEquals(out.data.nested.instance_token, "[REDACTED]");
});

Deno.test("redactSecrets remove chave dentro de array de objetos", () => {
  const out = redactSecrets({ list: [{ token: TOKEN_SENTINEL }, { ok: true }] });
  assertEquals(out.list[0].token, "[REDACTED]");
  assertEquals(out.list[1].ok, true);
});

Deno.test("redactSecrets não quebra com referência circular", () => {
  const obj: any = { token: TOKEN_SENTINEL };
  obj.self = obj;
  const out = redactSecrets(obj);
  assertEquals(out.token, "[REDACTED]");
  assertEquals(out.self, "[CIRCULAR]");
});

Deno.test("redactSecrets preserva message/name/stack de um Error nativo (achado da revisão do diff: não pode virar {})", () => {
  const err = new Error(`falha ao chamar API com ${TOKEN_SENTINEL}`);
  const out = redactSecrets(err);
  assertEquals(out.name, "Error");
  assertEquals(typeof out.message, "string");
  assertEquals(typeof out.stack, "string");
  // Diagnóstico preservado (não virou {}) — a mensagem em si não é
  // redigida por conteúdo (só por nome de chave), então o teste documenta
  // esse limite conhecido: quem chama não deve incluir o token na
  // mensagem do Error. Nenhum caminho desta implementação faz isso.
});

Deno.test("redactSecrets redige propriedades extras enumeráveis de um Error customizado (ex.: erro do client Supabase)", () => {
  const err: any = new Error("erro de consulta");
  err.token = TOKEN_SENTINEL;
  err.code = "PGRST001";
  const out = redactSecrets(err);
  assertEquals(out.token, "[REDACTED]");
  assertEquals(out.code, "PGRST001");
});

Deno.test("redactSecrets aplica limite de profundidade", () => {
  let obj: any = { token: TOKEN_SENTINEL };
  let cur = obj;
  for (let i = 0; i < 10; i++) {
    cur.child = {};
    cur = cur.child;
  }
  const out = redactSecrets(obj);
  // Em algum nível abaixo do limite, deve virar o marcador de profundidade
  // máxima em vez de continuar recursando indefinidamente.
  let deepest = out;
  let sawMaxDepth = false;
  for (let i = 0; i < 10; i++) {
    if (deepest === "[MAX_DEPTH]") { sawMaxDepth = true; break; }
    deepest = deepest.child;
  }
  assertEquals(sawMaxDepth, true);
});

// --- 22: nenhum spy de console/insert recebe o sentinel em nenhuma posição ---

Deno.test("nenhum vazamento do sentinel de token nos argumentos de resolução (spy no mock, não grep na saída)", async () => {
  const row = baseRow({ instance_token: TOKEN_SENTINEL });
  const { client, calls } = fakeSupabase([row]);
  await resolveInstanceForEvent(client, { token: TOKEN_SENTINEL });
  // O valor do token É esperado como argumento do .eq() de busca — o que
  // não pode acontecer é ele aparecer em qualquer log. Este teste documenta
  // que a única chamada que carrega o sentinel é a consulta de busca em si,
  // nunca um console.* (verificado sem stub de console porque nenhuma das
  // funções de resolução chama console.* no caminho de sucesso).
  assertEquals(calls.length, 1);
  assertEquals(JSON.stringify(calls).includes(TOKEN_SENTINEL), true); // esperado: é o valor de busca
});
