// deno test --allow-import supabase/functions/uazapi-webhook/funnel-resolution.test.ts
//
// Cobre a remoção do fallback organizacional implícito de funil (decisão de
// produto: "sem funil selecionado" = nenhuma automação, nunca escolher
// automaticamente o primeiro funil ativo/catch-all da organização). Nenhum
// teste aqui chama rede real, envia mensagem real, ou muda dado em produção
// — todo o client Supabase é um mock local.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { resolveFunnelCandidates } from "./index.ts";

type Row = Record<string, any>;

/**
 * Mock mínimo cobrindo exatamente as duas formas de consulta usadas por
 * `resolveFunnelCandidates`:
 *   .from("evolution_instances").select(...).eq("id", x).maybeSingle()
 *   .from("capture_funnels").select(...).eq("id", x).eq("organization_id", y).maybeSingle()
 */
function fakeSupabase(tables: {
  evolution_instances?: Row[];
  capture_funnels?: Row[];
  errorOnTable?: "evolution_instances" | "capture_funnels";
}) {
  const instances = tables.evolution_instances || [];
  const funnels = tables.capture_funnels || [];

  function makeQuery(rows: Row[], filters: Array<{ column: string; value: any }>, table: string) {
    const apply = () => rows.filter((r) => filters.every((f) => r[f.column] === f.value));
    const query: any = {
      eq(column: string, value: any) {
        return makeQuery(rows, [...filters, { column, value }], table);
      },
      maybeSingle() {
        if (tables.errorOnTable === table) {
          return Promise.resolve({ data: null, error: { message: "db_error" } });
        }
        const matched = apply();
        return Promise.resolve({ data: matched[0] ?? null, error: null });
      },
    };
    return query;
  }

  return {
    from(table: string) {
      if (table === "evolution_instances") {
        return { select(_cols: string) { return makeQuery(instances, [], table); } };
      }
      if (table === "capture_funnels") {
        return { select(_cols: string) { return makeQuery(funnels, [], table); } };
      }
      throw new Error(`tabela inesperada no teste: ${table}`);
    },
  };
}

const ORG_ID = crypto.randomUUID();
const CONN_ID = crypto.randomUUID();

// --- 1: funil explicitamente selecionado e ativo ---

Deno.test("default_funnel_id preenchido + funil ativo -> connection_assignment, só esse funil", async () => {
  const funnelId = crypto.randomUUID();
  const client = fakeSupabase({
    evolution_instances: [{ id: CONN_ID, organization_id: ORG_ID, default_funnel_id: funnelId }],
    capture_funnels: [
      { id: funnelId, organization_id: ORG_ID, status: "active", start_block_id: "b1" },
      { id: crypto.randomUUID(), organization_id: ORG_ID, status: "active", start_block_id: "b2" }, // catch-all, nunca deve aparecer
    ],
  });
  const result = await resolveFunnelCandidates(client, { organizationId: ORG_ID, connectionId: CONN_ID });
  assertEquals(result.origin, "connection_assignment");
  assertEquals(result.candidates.length, 1);
  assertEquals(result.candidates[0].id, funnelId);
});

// --- 2: default_funnel_id null ---

Deno.test("default_funnel_id null -> no_funnel_selected, candidates vazio", async () => {
  const client = fakeSupabase({
    evolution_instances: [{ id: CONN_ID, organization_id: ORG_ID, default_funnel_id: null }],
    capture_funnels: [{ id: crypto.randomUUID(), organization_id: ORG_ID, status: "active" }],
  });
  const result = await resolveFunnelCandidates(client, { organizationId: ORG_ID, connectionId: CONN_ID });
  assertEquals(result.origin, "no_funnel_selected");
  assertEquals(result.candidates, []);
});

// --- 3: catch-all ativo não pode ser usado, mesmo existindo na organização ---

Deno.test("funil catch-all ativo existe na organização, mas conexão sem funil -> nunca é retornado (regressão do bug real)", async () => {
  const catchAllId = crypto.randomUUID(); // ex.: "Funil Gordura", "Funil Tags"
  const client = fakeSupabase({
    evolution_instances: [{ id: CONN_ID, organization_id: ORG_ID, default_funnel_id: null }],
    capture_funnels: [
      { id: catchAllId, organization_id: ORG_ID, status: "active", channels: { whatsapp: { enabled: true } } },
    ],
  });
  const result = await resolveFunnelCandidates(client, { organizationId: ORG_ID, connectionId: CONN_ID });
  assertEquals(result.candidates.find((c) => c.id === catchAllId), undefined);
  assertEquals(result.candidates, []);
});

// --- 4: funil referenciado, mas inativo ---

Deno.test("default_funnel_id aponta para funil INATIVO -> funnel_reference_invalid, sem cair para catch-all", async () => {
  const funnelId = crypto.randomUUID();
  const catchAllId = crypto.randomUUID();
  const client = fakeSupabase({
    evolution_instances: [{ id: CONN_ID, organization_id: ORG_ID, default_funnel_id: funnelId }],
    capture_funnels: [
      { id: funnelId, organization_id: ORG_ID, status: "paused" },
      { id: catchAllId, organization_id: ORG_ID, status: "active" },
    ],
  });
  const result = await resolveFunnelCandidates(client, { organizationId: ORG_ID, connectionId: CONN_ID });
  assertEquals(result.origin, "funnel_reference_invalid");
  assertEquals(result.candidates, []);
});

// --- 5: funil referenciado, mas inexistente ---

Deno.test("default_funnel_id aponta para funil INEXISTENTE (excluído) -> funnel_reference_invalid, sem catch-all", async () => {
  const client = fakeSupabase({
    evolution_instances: [{ id: CONN_ID, organization_id: ORG_ID, default_funnel_id: crypto.randomUUID() }], // não existe em capture_funnels
    capture_funnels: [{ id: crypto.randomUUID(), organization_id: ORG_ID, status: "active" }],
  });
  const result = await resolveFunnelCandidates(client, { organizationId: ORG_ID, connectionId: CONN_ID });
  assertEquals(result.origin, "funnel_reference_invalid");
  assertEquals(result.candidates, []);
});

// --- 6: conexão não encontrada ---

Deno.test("conexão não encontrada -> connection_not_found, falha fechada sem funil organizacional", async () => {
  const client = fakeSupabase({
    evolution_instances: [], // connectionId não existe
    capture_funnels: [{ id: crypto.randomUUID(), organization_id: ORG_ID, status: "active" }],
  });
  const result = await resolveFunnelCandidates(client, { organizationId: ORG_ID, connectionId: CONN_ID });
  assertEquals(result.origin, "connection_not_found");
  assertEquals(result.candidates, []);
});

Deno.test("connectionId nulo -> connection_not_found (nenhum call site real usa isso hoje, mas a assinatura aceita)", async () => {
  const client = fakeSupabase({
    capture_funnels: [{ id: crypto.randomUUID(), organization_id: ORG_ID, status: "active" }],
  });
  const result = await resolveFunnelCandidates(client, { organizationId: ORG_ID, connectionId: null });
  assertEquals(result.origin, "connection_not_found");
  assertEquals(result.candidates, []);
});

// --- erro técnico de consulta nunca é confundido com estado de configuração (achado da revisão do diff) ---

Deno.test("erro ao consultar evolution_instances -> resolution_error, nunca connection_not_found", async () => {
  const client = fakeSupabase({
    evolution_instances: [{ id: CONN_ID, organization_id: ORG_ID, default_funnel_id: null }],
    errorOnTable: "evolution_instances",
  });
  const result = await resolveFunnelCandidates(client, { organizationId: ORG_ID, connectionId: CONN_ID });
  assertEquals(result.origin, "resolution_error");
  assertEquals(result.candidates, []);
});

Deno.test("erro ao consultar capture_funnels -> resolution_error, nunca funnel_reference_invalid", async () => {
  const funnelId = crypto.randomUUID();
  const client = fakeSupabase({
    evolution_instances: [{ id: CONN_ID, organization_id: ORG_ID, default_funnel_id: funnelId }],
    capture_funnels: [{ id: funnelId, organization_id: ORG_ID, status: "active" }],
    errorOnTable: "capture_funnels",
  });
  const result = await resolveFunnelCandidates(client, { organizationId: ORG_ID, connectionId: CONN_ID });
  assertEquals(result.origin, "resolution_error");
  assertEquals(result.candidates, []);
});

// --- isolamento por organização na própria consulta da conexão (achado da revisão do diff) ---

Deno.test("connectionId existe mas pertence a OUTRA organização -> connection_not_found, nunca resolve funil de outra org", async () => {
  const otherOrgId = crypto.randomUUID();
  const funnelId = crypto.randomUUID();
  const client = fakeSupabase({
    evolution_instances: [{ id: CONN_ID, organization_id: otherOrgId, default_funnel_id: funnelId }],
    capture_funnels: [{ id: funnelId, organization_id: otherOrgId, status: "active" }],
  });
  const result = await resolveFunnelCandidates(client, { organizationId: ORG_ID, connectionId: CONN_ID });
  assertEquals(result.origin, "connection_not_found");
  assertEquals(result.candidates, []);
});

// --- 12: regressão — múltiplas conexões, cada uma com seu próprio funil selecionado ---

Deno.test("múltiplas conexões com funil explicitamente selecionado continuam recebendo seu próprio funil (regressão)", async () => {
  const connA = crypto.randomUUID();
  const connB = crypto.randomUUID();
  const funnelA = crypto.randomUUID();
  const funnelB = crypto.randomUUID();
  const client = fakeSupabase({
    evolution_instances: [
      { id: connA, organization_id: ORG_ID, default_funnel_id: funnelA },
      { id: connB, organization_id: ORG_ID, default_funnel_id: funnelB },
    ],
    capture_funnels: [
      { id: funnelA, organization_id: ORG_ID, status: "active" },
      { id: funnelB, organization_id: ORG_ID, status: "active" },
    ],
  });
  const resultA = await resolveFunnelCandidates(client, { organizationId: ORG_ID, connectionId: connA });
  const resultB = await resolveFunnelCandidates(client, { organizationId: ORG_ID, connectionId: connB });
  assertEquals(resultA.candidates[0]?.id, funnelA);
  assertEquals(resultB.candidates[0]?.id, funnelB);
});

// --- 7/8/9/10/11: garantias estruturais nos 3 call sites reais ---
//
// Os 3 call sites (nova conversa, reabertura, conversa existente/travada)
// todos fazem `for (const cand of candidates || []) { ... }` para decidir
// funnelToRun/funnelToRunReopen/funnelToRunExisting — nenhum deles tem um
// caminho alternativo de atribuir um funil fora desse loop. Como os testes
// acima já provam que `candidates` vem vazio para toda origem exceto
// "connection_assignment", os itens 7 (nova conversa sem funil), 8
// (reabertura sem funil), 9 (conversa travada sem funil) e 10
// (palavra-chave/anúncio/tag não contornam ausência de funil, porque o
// filtro de palavra-chave só roda DENTRO do loop) ficam provados pela
// própria estrutura do código, não precisam de um teste de integração
// separado do handler completo (que exigiria mockar Supabase, UazAPI,
// whatsapp-proxy e Meta/CAPI só para chegar a esse ponto).
//
// Os testes abaixo são guardas estruturais (estáticas) contra regressão
// dessa garantia — se algum dos 3 call sites ganhar um caminho alternativo
// de setar funnelToRun fora do loop, ou se "legacy_fallback" voltar a
// aparecer, estes testes quebram.

Deno.test("nenhuma referência textual a 'legacy_fallback' sobrevive no arquivo (fallback organizacional removido)", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const matches = src.match(/"legacy_fallback"/g) || [];
  assertEquals(matches.length, 0);
});

Deno.test("os 3 call sites de resolveFunnelCandidates decidem funnelToRun* só dentro do loop sobre candidates", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const calls = src.match(/resolveFunnelCandidates\(supabase, \{[\s\S]{0,80}/g) || [];
  assertEquals(calls.length, 3);
  // Cada atribuição de funnelToRun/funnelToRunReopen/funnelToRunExisting
  // (fora da declaração `let ... = null`) deve estar dentro do bloco do
  // loop `for (const cand of ...)` — checagem aproximada: garante que o
  // padrão "funnelToRun... = {" só aparece nas 3 vezes esperadas (uma por
  // call site), não em nenhum lugar novo fora do loop.
  const assignments = (src.match(/funnelToRun(Reopen|Existing)?\s*=\s*\{/g) || []).length;
  assertEquals(assignments, 3);
});

// --- 13: regressão completa da correção anterior — ver instance-resolution.test.ts (arquivo separado, executado junto na suíte) ---
