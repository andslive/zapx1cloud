// deno test --allow-import supabase/functions/uazapi-webhook/instance-resolution.test.ts
//
// item B1 (hotfix/uazapi-ack-auth-isolation-20260828): tráfego externo
// UazAPI passa a exigir token obrigatório — sem nenhum fallback por
// nome/instance_id/metadata (removido fisicamente, junto com
// extractRawInstanceIdentifier). Só provider=uazapi (null/'' tratados
// como legado-uazapi, nunca outro provider por omissão) pode ser
// resolvido por este caminho. Instância arquivada (archived_at IS NOT
// NULL, não mais is_active) tenta redirecionar para uma parceira ativa
// da MESMA organização e MESMO provider antes de desistir. `resume_funnel`
// (payload.__is_resume, já autenticado por Bearer service-role no gate do
// topo do handler — item A) usa um caminho de resolução totalmente
// separado, que confia em `payload.instance` (== conv.evolution_instance_id,
// já lido do nosso próprio banco pelo handler) sem exigir token.
//
// Nenhum teste aqui chama rede real, envia mensagem real ou usa um token
// de produção — todos usam um sentinel fictício não-UUID.
//
// IMPORTANTE: nenhum destes testes deve jamais imprimir/persistir o
// sentinel de token em texto — o teste de vazamento (abaixo) verifica isso
// inspecionando diretamente os argumentos passados aos mocks, não apenas
// grepando a saída.

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  extractInstanceToken,
  redactSecrets,
  resolveInstanceForEvent,
} from "./index.ts";

const TOKEN_SENTINEL = "TEST-TOKEN-SENTINEL-not-a-real-uuid-xyz";

type Row = Record<string, any>;

/**
 * Mock encadeável (thenable): suporta `.eq(a,1).eq(b,2)`/`.is(a,null)`
 * acumulando filtros e só resolvendo quando efetivamente awaited/
 * `.then()`-ado — igual ao query builder real do supabase-js. Necessário
 * para a query de redirect de instância arquivada, que encadeia `.is()` +
 * dois `.eq()`.
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
          if (f.op === "is") {
            return f.value === null ? (cell === null || cell === undefined) : cell === f.value;
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
      is(column: string, value: any) {
        return makeQuery([...filters, { op: "is", column, value }]);
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
    provider: "uazapi",
    archived_at: null,
    status: "connected",
    ...overrides,
  };
}

// ── Token obrigatório: sem fallback por nome/id/metadata ──────────────

Deno.test("resolve por token (caminho único de resolução externa)", async () => {
  const row = baseRow({ name: "MEU CHIP P/ CLONE", instance_token: TOKEN_SENTINEL });
  const { client } = fakeSupabase([row]);
  const result = await resolveInstanceForEvent(client, { token: TOKEN_SENTINEL });
  assertEquals(result.reason, "resolved_by_token");
  assertExists(result.instance);
  assertEquals(result.instance!.id, row.id);
});

Deno.test("token ausente -> missing_token, nenhuma consulta ao banco é feita", async () => {
  const { client, calls } = fakeSupabase([]);
  const result = await resolveInstanceForEvent(client, {});
  assertEquals(result.instance, null);
  assertEquals(result.reason, "missing_token");
  assertEquals(calls.length, 0, "sem token, nenhum fallback por nome/id/metadata deve sequer consultar o banco");
});

Deno.test("token vazio (string vazia) -> missing_token, mesmo tratamento que ausente", async () => {
  const { client, calls } = fakeSupabase([]);
  const result = await resolveInstanceForEvent(client, { token: "" });
  assertEquals(result.reason, "missing_token");
  assertEquals(calls.length, 0);
});

Deno.test("payload trazendo instanceName/instance_id mas SEM token -> missing_token, nunca resolve por nome (fallback removido)", async () => {
  const row = baseRow({ name: "chip19", instance_id: "r-chip19" });
  const { client, calls } = fakeSupabase([row]);
  const result = await resolveInstanceForEvent(client, { instanceName: "chip19", instance_id: "r-chip19" });
  assertEquals(result.instance, null);
  assertEquals(result.reason, "missing_token");
  assertEquals(calls.length, 0, "identificadores textuais não devem gerar nenhuma consulta -- só token importa agora");
});

Deno.test("token desconhecido falha fechado (unknown_token)", async () => {
  const row = baseRow({ name: "meuchipp/clone" });
  const { client } = fakeSupabase([row]);
  const result = await resolveInstanceForEvent(client, { token: "token-que-nao-existe" });
  assertEquals(result.instance, null);
  assertEquals(result.reason, "unknown_token");
});

Deno.test("token duplicado (batendo mais de uma linha) falha fechado (token_conflict)", async () => {
  const sharedToken = TOKEN_SENTINEL;
  const rowA = baseRow({ instance_token: sharedToken });
  const rowB = baseRow({ instance_token: sharedToken });
  const { client } = fakeSupabase([rowA, rowB]);
  const result = await resolveInstanceForEvent(client, { token: sharedToken });
  assertEquals(result.instance, null);
  assertEquals(result.reason, "token_conflict");
});

Deno.test("token válido + organization_id divergente -> organization_mismatch (checado depois da resolução)", async () => {
  const row = baseRow({ instance_token: TOKEN_SENTINEL, organization_id: "org-real" });
  const { client } = fakeSupabase([row]);
  const result = await resolveInstanceForEvent(client, {
    token: TOKEN_SENTINEL,
    organization_id: "org-diferente",
  });
  assertEquals(result.instance, null);
  assertEquals(result.reason, "organization_mismatch");
});

// ── Provider: só uazapi (null/'' = legado-uazapi) ──────────────────────

Deno.test("provider='meta_cloud' -> unsupported_provider, mesmo com token exato batendo", async () => {
  const row = baseRow({ instance_token: TOKEN_SENTINEL, provider: "meta_cloud" });
  const { client } = fakeSupabase([row]);
  const result = await resolveInstanceForEvent(client, { token: TOKEN_SENTINEL });
  assertEquals(result.instance, null);
  assertEquals(result.reason, "unsupported_provider");
});

Deno.test("provider='hookcloud' (ou qualquer outro provider desconhecido) -> unsupported_provider", async () => {
  const row = baseRow({ instance_token: TOKEN_SENTINEL, provider: "hookcloud" });
  const { client } = fakeSupabase([row]);
  const result = await resolveInstanceForEvent(client, { token: TOKEN_SENTINEL });
  assertEquals(result.reason, "unsupported_provider");
});

Deno.test("provider null ou '' são tratados como legado-uazapi -- resolve normalmente", async () => {
  const rowNull = baseRow({ instance_token: TOKEN_SENTINEL, provider: null });
  const { client: clientNull } = fakeSupabase([rowNull]);
  const resultNull = await resolveInstanceForEvent(clientNull, { token: TOKEN_SENTINEL });
  assertEquals(resultNull.reason, "resolved_by_token");

  const rowEmpty = baseRow({ instance_token: TOKEN_SENTINEL, provider: "" });
  const { client: clientEmpty } = fakeSupabase([rowEmpty]);
  const resultEmpty = await resolveInstanceForEvent(clientEmpty, { token: TOKEN_SENTINEL });
  assertEquals(resultEmpty.reason, "resolved_by_token");
});

// ── Arquivada: archived_at IS NOT NULL (não mais is_active) ───────────

Deno.test("instância arquivada (archived_at preenchido) com UMA parceira não-arquivada de mesmo telefone, MESMA organização e provider=uazapi -> redireciona", async () => {
  const orgId = crypto.randomUUID();
  const archived = baseRow({ instance_token: TOKEN_SENTINEL, archived_at: new Date().toISOString(), phone_number: "5511999999999", organization_id: orgId });
  const activePartner = baseRow({ archived_at: null, phone_number: "5511999999999", organization_id: orgId });
  const { client } = fakeSupabase([archived, activePartner]);
  const result = await resolveInstanceForEvent(client, { token: TOKEN_SENTINEL });
  assertExists(result.instance);
  assertEquals(result.instance!.id, activePartner.id);
});

Deno.test("instância arquivada com parceira de mesmo telefone em OUTRA organização -> NUNCA redireciona", async () => {
  const archived = baseRow({ instance_token: TOKEN_SENTINEL, archived_at: new Date().toISOString(), phone_number: "5511999999999" });
  const partnerOtherOrg = baseRow({ archived_at: null, phone_number: "5511999999999" }); // organization_id aleatório e diferente
  const { client } = fakeSupabase([archived, partnerOtherOrg]);
  const result = await resolveInstanceForEvent(client, { token: TOKEN_SENTINEL });
  assertEquals(result.instance, null);
  assertEquals(result.reason, "inactive_instance");
});

Deno.test("instância arquivada com parceira de mesma org mas provider diferente (ex.: meta_cloud) -> NUNCA redireciona", async () => {
  const orgId = crypto.randomUUID();
  const archived = baseRow({ instance_token: TOKEN_SENTINEL, archived_at: new Date().toISOString(), phone_number: "5511999999999", organization_id: orgId });
  const metaPartner = baseRow({ archived_at: null, phone_number: "5511999999999", organization_id: orgId, provider: "meta_cloud" });
  const { client } = fakeSupabase([archived, metaPartner]);
  const result = await resolveInstanceForEvent(client, { token: TOKEN_SENTINEL });
  assertEquals(result.instance, null);
  assertEquals(result.reason, "inactive_instance");
});

Deno.test("instância arquivada SEM telefone -> não redireciona, inactive_instance (nunca compara null===null)", async () => {
  const archived = baseRow({ instance_token: TOKEN_SENTINEL, archived_at: new Date().toISOString(), phone_number: null });
  const otherArchivedNoPhone = baseRow({ archived_at: new Date().toISOString(), phone_number: null });
  const { client } = fakeSupabase([archived, otherArchivedNoPhone]);
  const result = await resolveInstanceForEvent(client, { token: TOKEN_SENTINEL });
  assertEquals(result.instance, null);
  assertEquals(result.reason, "inactive_instance");
});

Deno.test("instância arquivada SEM nenhuma parceira não-arquivada de mesmo telefone -> inactive_instance", async () => {
  const archived = baseRow({ instance_token: TOKEN_SENTINEL, archived_at: new Date().toISOString(), phone_number: "5511999999999" });
  const { client } = fakeSupabase([archived]);
  const result = await resolveInstanceForEvent(client, { token: TOKEN_SENTINEL });
  assertEquals(result.instance, null);
  assertEquals(result.reason, "inactive_instance");
});

Deno.test("instância arquivada com DUAS parceiras não-arquivadas de mesmo telefone NA MESMA organização -> falha fechada (nunca escolhe arbitrariamente)", async () => {
  const orgId = crypto.randomUUID();
  const archived = baseRow({ instance_token: TOKEN_SENTINEL, archived_at: new Date().toISOString(), phone_number: "5511999999999", organization_id: orgId });
  const partnerA = baseRow({ archived_at: null, phone_number: "5511999999999", organization_id: orgId });
  const partnerB = baseRow({ archived_at: null, phone_number: "5511999999999", organization_id: orgId });
  const { client } = fakeSupabase([archived, partnerA, partnerB]);
  const result = await resolveInstanceForEvent(client, { token: TOKEN_SENTINEL });
  assertEquals(result.instance, null);
  assertEquals(result.reason, "inactive_instance");
});

// ── Erro técnico vs recusa determinística ──────────────────────────────

Deno.test("erro de consulta ao banco (busca por token) -> error, nunca unknown_token/inactive_instance", async () => {
  const { client } = fakeSupabase([], { errorOnColumn: "instance_token" });
  const result = await resolveInstanceForEvent(client, { token: TOKEN_SENTINEL });
  assertEquals(result.instance, null);
  assertEquals(result.reason, "error");
});

Deno.test("erro de consulta na busca de parceira ativa (instância arquivada) -> error, nunca inactive_instance", async () => {
  const archived = baseRow({ instance_token: TOKEN_SENTINEL, archived_at: new Date().toISOString(), phone_number: "5511999999999" });
  const { client } = fakeSupabase([archived], { errorOnColumn: "phone_number" });
  const result = await resolveInstanceForEvent(client, { token: TOKEN_SENTINEL });
  assertEquals(result.instance, null);
  assertEquals(result.reason, "error");
});

// ── resume_funnel: caminho de resolução separado, sem exigir token ────

Deno.test("__is_resume=true com payload.instance (== conv.evolution_instance_id) resolve por id, sem token", async () => {
  const row = baseRow();
  const { client, calls } = fakeSupabase([row]);
  const result = await resolveInstanceForEvent(client, { __is_resume: true, instance: row.id });
  assertEquals(result.reason, "resolved_by_resume_context");
  assertExists(result.instance);
  assertEquals(result.instance!.id, row.id);
  // Busca por `id`, nunca por `instance_token` -- confirma que nenhum
  // token é exigido/lido neste caminho.
  assertEquals(calls.length, 1);
  assertEquals(calls[0].filters[0].column, "id");
});

Deno.test("__is_resume=true, id não encontrado -> error (fail-closed, nunca ignored silencioso)", async () => {
  const { client } = fakeSupabase([]);
  const result = await resolveInstanceForEvent(client, { __is_resume: true, instance: crypto.randomUUID() });
  assertEquals(result.instance, null);
  assertEquals(result.reason, "error");
});

Deno.test("__is_resume=true tem prioridade absoluta -- nunca avalia payload.token mesmo se presente", async () => {
  const row = baseRow();
  const { client, calls } = fakeSupabase([row]);
  const result = await resolveInstanceForEvent(client, {
    __is_resume: true,
    instance: row.id,
    token: "token-que-nao-deveria-importar-aqui",
  });
  assertEquals(result.reason, "resolved_by_resume_context");
  // Nenhuma consulta por instance_token foi feita.
  assertEquals(calls.every((c) => c.filters.every((f) => f.column !== "instance_token")), true);
});

// ── extractInstanceToken ────────────────────────────────────────────

Deno.test("extractInstanceToken só lê payload.token (raiz), não adivinha variantes", () => {
  assertEquals(extractInstanceToken({ token: "abc" }), "abc");
  assertEquals(extractInstanceToken({ data: { token: "abc" } }), "");
  assertEquals(extractInstanceToken({ apikey: "abc" }), "");
});

// ── redactSecrets: sanitização recursiva ───────────────────────────────

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
  let deepest = out;
  let sawMaxDepth = false;
  for (let i = 0; i < 10; i++) {
    if (deepest === "[MAX_DEPTH]") { sawMaxDepth = true; break; }
    deepest = deepest.child;
  }
  assertEquals(sawMaxDepth, true);
});

// ── Nenhum vazamento do sentinel de token nos argumentos de resolução ──

Deno.test("nenhum vazamento do sentinel de token nos argumentos de resolução (spy no mock, não grep na saída)", async () => {
  const row = baseRow({ instance_token: TOKEN_SENTINEL });
  const { client, calls } = fakeSupabase([row]);
  await resolveInstanceForEvent(client, { token: TOKEN_SENTINEL });
  assertEquals(calls.length, 1);
  assertEquals(JSON.stringify(calls).includes(TOKEN_SENTINEL), true); // esperado: é o valor de busca
});
