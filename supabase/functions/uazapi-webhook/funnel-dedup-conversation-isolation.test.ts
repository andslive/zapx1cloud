// deno test --allow-import --no-check supabase/functions/uazapi-webhook/funnel-dedup-conversation-isolation.test.ts
//
// Cobre a Parte A (conversa separada por conexão, sem fallback para
// conversa de outra conexão) e a Parte B (gate atômico de execução de
// funil por lead_id+funnel_id) — decisão de produto de 2026-08-27, achado
// original: mensagem do chip17new sendo anexada à conversa da instância
// piloto, e ausência de garantia atômica contra o mesmo funil rodando em
// duas conexões ao mesmo tempo. Nenhum teste aqui chama rede real, envia
// mensagem real, aplica migration ou muda dado em produção — todo o client
// Supabase é um mock local.

import { assertEquals, assertMatch } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { acquireFunnelRunGate, releaseFunnelRunGate } from "./index.ts";

const LEAD_ID = crypto.randomUUID();
const FUNNEL_ID = crypto.randomUUID();

// ---------------------------------------------------------------------
// Mock mínimo de lead_funnel_history: insert (com conflito único
// simulável) e delete.
// ---------------------------------------------------------------------
function fakeSupabase(opts: {
  conflictOnInsert?: boolean;
  genericErrorOnInsert?: boolean;
  errorOnDelete?: boolean;
} = {}) {
  const insertCalls: any[] = [];
  const deleteCalls: string[] = [];

  return {
    _insertCalls: insertCalls,
    _deleteCalls: deleteCalls,
    from(table: string) {
      if (table !== "lead_funnel_history") {
        throw new Error(`tabela inesperada no teste: ${table}`);
      }
      return {
        insert(row: any) {
          insertCalls.push(row);
          return {
            select(_cols: string) {
              return {
                single() {
                  if (opts.conflictOnInsert) {
                    return Promise.resolve({
                      data: null,
                      error: { code: "23505", message: "duplicate key value violates unique constraint" },
                    });
                  }
                  if (opts.genericErrorOnInsert) {
                    return Promise.resolve({
                      data: null,
                      error: { code: "40001", message: "could not serialize access (simulado)" },
                    });
                  }
                  return Promise.resolve({ data: { id: crypto.randomUUID() }, error: null });
                },
              };
            },
          };
        },
        delete() {
          return {
            eq(_col: string, value: string) {
              deleteCalls.push(value);
              if (opts.errorOnDelete) {
                return Promise.resolve({ error: { message: "delete failed (simulado)" } });
              }
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

// --- acquireFunnelRunGate: aquisição bem-sucedida ---

Deno.test("acquireFunnelRunGate: sem running existente -> acquired=true, gated=true, historyId retornado", async () => {
  const client = fakeSupabase();
  const result = await acquireFunnelRunGate(client, { leadId: LEAD_ID, funnelId: FUNNEL_ID });
  assertEquals(result.acquired, true);
  if (result.acquired) {
    assertEquals(result.gated, true);
    if (result.gated) {
      assertMatch(result.historyId, /^[0-9a-f-]{36}$/);
    }
  }
  assertEquals(client._insertCalls.length, 1);
  assertEquals(client._insertCalls[0].lead_id, LEAD_ID);
  assertEquals(client._insertCalls[0].funnel_id, FUNNEL_ID);
  assertEquals(client._insertCalls[0].status, "running");
});

Deno.test("acquireFunnelRunGate: já running (23505) -> acquired=false, reason=already_running, não lança exceção", async () => {
  const client = fakeSupabase({ conflictOnInsert: true });
  const result = await acquireFunnelRunGate(client, { leadId: LEAD_ID, funnelId: FUNNEL_ID });
  assertEquals(result.acquired, false);
  if (!result.acquired) {
    assertEquals((result as any).reason, "already_running");
  }
});

Deno.test("acquireFunnelRunGate: erro genérico de banco -> acquired=false, reason=error, fail-closed (nunca inicia)", async () => {
  const client = fakeSupabase({ genericErrorOnInsert: true });
  const result = await acquireFunnelRunGate(client, { leadId: LEAD_ID, funnelId: FUNNEL_ID });
  assertEquals(result.acquired, false);
  if (!result.acquired) {
    assertEquals((result as any).reason, "error");
    assertMatch((result as any).message, /simulado/);
  }
});

Deno.test("acquireFunnelRunGate: sem leadId (null) -> acquired=false, reason=missing_lead_id, FALHA FECHADA, nenhum insert (revisão adversarial 2026-08-27)", async () => {
  const client = fakeSupabase();
  const result = await acquireFunnelRunGate(client, { leadId: null, funnelId: FUNNEL_ID });
  assertEquals(result.acquired, false);
  if (!result.acquired) {
    assertEquals((result as any).reason, "missing_lead_id");
  }
  assertEquals(client._insertCalls.length, 0);
});

Deno.test("acquireFunnelRunGate: leadId undefined (não só null) também falha fechada e não insere", async () => {
  const client = fakeSupabase();
  const result = await acquireFunnelRunGate(client, { leadId: undefined, funnelId: FUNNEL_ID });
  assertEquals(result.acquired, false);
  if (!result.acquired) {
    assertEquals((result as any).reason, "missing_lead_id");
  }
  assertEquals(client._insertCalls.length, 0);
});

Deno.test("acquireFunnelRunGate: leadId vazio ('') também falha fechada (mesmo tratamento que null/undefined)", async () => {
  const client = fakeSupabase();
  const result = await acquireFunnelRunGate(client, { leadId: "", funnelId: FUNNEL_ID });
  assertEquals(result.acquired, false);
  assertEquals(client._insertCalls.length, 0);
});

// --- releaseFunnelRunGate: compensação ---

Deno.test("releaseFunnelRunGate: deleta exatamente a linha adquirida (por id), não por lead+funil", async () => {
  const client = fakeSupabase();
  const historyId = crypto.randomUUID();
  await releaseFunnelRunGate(client, historyId);
  assertEquals(client._deleteCalls, [historyId]);
});

Deno.test("releaseFunnelRunGate: erro no delete não lança exceção (loga, mas não derruba a request)", async () => {
  const client = fakeSupabase({ errorOnDelete: true });
  const historyId = crypto.randomUUID();
  // Não deve lançar.
  await releaseFunnelRunGate(client, historyId);
  assertEquals(client._deleteCalls, [historyId]);
});

// ---------------------------------------------------------------------
// Guardas estruturais/textuais para as partes que vivem embutidas no
// handler gigante (não extraídas para função pura testável isoladamente,
// mesmo padrão já usado nas outras frentes desta sessão).
// ---------------------------------------------------------------------

Deno.test("Parte A: busca de conversa existente é escopada por connection_id QUANDO a flag de rollout está ligada (achado: mensagem do chip17new anexada à conversa da piloto)", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertEquals(
    src.includes('if (conversationIsolationEnabled) {\n        existingByPhoneQuery = existingByPhoneQuery.eq("connection_id", instance.id);'),
    true,
  );
});

Deno.test("Parte A: NENHUM fallback textual para 'qualquer conversa aberta do mesmo telefone' sobrevive (proibido por decisão de produto)", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertEquals(src.includes("busca qualquer conversa aberta do mesmo (org, telefone, whatsapp)"), false);
  assertEquals(src.includes("sem filtrar instância — assim PRESERVAMOS"), false);
});

Deno.test("Parte A: query de reaproveitamento após 23505 na criação de conversa nova também é escopada por connection_id QUANDO a flag está ligada", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertEquals(
    src.includes('if (conversationIsolationEnabled) {\n              raceQuery = raceQuery.eq("connection_id", instance.id);'),
    true,
  );
});

Deno.test("Parte B: os 3 call sites (reopen/existing/new) chamam acquireFunnelRunGate antes de setar funnelToRun*", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const occurrences = src.split("await acquireFunnelRunGate(supabase,").length - 1;
  assertEquals(occurrences, 3);
});

Deno.test("Parte B: nenhum INSERT direto e não-gateado de status='running' sobrevive nos 3 call sites — os únicos 2 inserts restantes vivem dentro de acquireFunnelRunGate (modo normal + legacyMode)", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const gateFnStart = src.indexOf("export async function acquireFunnelRunGate(");
  const gateFnEnd = src.indexOf("\n}\n\n/**\n * Compensação:");
  const gateFnBody = src.slice(gateFnStart, gateFnEnd);
  const occurrencesInGate = gateFnBody.split("status: \"running\"").length - 1 + gateFnBody.split("status: 'running'").length - 1;
  const occurrencesTotal = src.split("status: \"running\"").length - 1 + src.split("status: 'running'").length - 1;
  // As 2 ocorrências que sobram (modo normal + legacyMode) estão AMBAS
  // dentro de acquireFunnelRunGate — nenhuma nos 3 call sites do handler.
  assertEquals(occurrencesInGate, 2);
  assertEquals(occurrencesTotal, 2);
});

Deno.test("Parte B: nenhum catch silencioso (/* noop */) envolve mais o registro de running no ledger", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertEquals(src.includes("status: 'running',\n                  started_at: new Date().toISOString()\n                });\n              } catch (_) { /* noop */ }"), false);
});

Deno.test("Parte B: compensação (releaseFunnelRunGate) é chamada quando a corrida de CAS é perdida (existing e reopen)", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const occurrences = src.split("await releaseFunnelRunGate(supabase,").length - 1;
  // existing (CAS de conversa aberta), reopen (CAS de reabertura), e o
  // branch de erro na criação da conversa nova (convErr) = 3 pontos.
  assertEquals(occurrences, 3);
});

Deno.test("Parte B: acquireFunnelRunGate e releaseFunnelRunGate são exportados (testáveis isoladamente)", async () => {
  assertEquals(typeof acquireFunnelRunGate, "function");
  assertEquals(typeof releaseFunnelRunGate, "function");
});

Deno.test("Achado da revisão adversarial: convData.lead_id local é atualizado após vincular/criar lead (evita gate stale-null)", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertEquals(
    src.includes("(convData as any).lead_id = lead.id;"),
    true,
  );
});

Deno.test("Nenhum call site pode chegar ao gate com leadId potencialmente stale sem o fix acima presente antes da checagem de funil existente", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const fixIdx = src.indexOf("(convData as any).lead_id = lead.id;");
  const gateIdx = src.indexOf("leadId: convData?.lead_id,");
  assertEquals(fixIdx > 0 && gateIdx > 0 && fixIdx < gateIdx, true);
});

// ---------------------------------------------------------------------
// legacyMode: rollout gradual via conversation_isolation_feature_flags
// (achado da revisão adversarial: janela de proteção reduzida entre o
// DROP do índice antigo e o deploy da function nova).
// ---------------------------------------------------------------------

Deno.test("acquireFunnelRunGate legacyMode=true, com lead_id: insere sem gate, SEMPRE acquired=true/gated=false (replica be3116b)", async () => {
  const client = fakeSupabase({ conflictOnInsert: true }); // mesmo com "conflito" simulado
  const result = await acquireFunnelRunGate(client, { leadId: LEAD_ID, funnelId: FUNNEL_ID, legacyMode: true });
  assertEquals(result.acquired, true);
  if (result.acquired) {
    assertEquals(result.gated, false);
  }
  // Em legacyMode, tenta inserir (ignorando erro) — não retorna já_running
  // mesmo diante de conflito, pois não há checagem, só insert-e-ignora.
  assertEquals(client._insertCalls.length, 1);
});

Deno.test("acquireFunnelRunGate legacyMode=true, SEM lead_id: não insere nada, mas ainda acquired=true (comportamento antigo nunca bloqueava por falta de lead)", async () => {
  const client = fakeSupabase();
  const result = await acquireFunnelRunGate(client, { leadId: null, funnelId: FUNNEL_ID, legacyMode: true });
  assertEquals(result.acquired, true);
  assertEquals(client._insertCalls.length, 0);
});

Deno.test("acquireFunnelRunGate legacyMode=true com erro genérico de banco: ainda acquired=true (fail-open, replica catch/noop antigo)", async () => {
  const client = fakeSupabase({ genericErrorOnInsert: true });
  const result = await acquireFunnelRunGate(client, { leadId: LEAD_ID, funnelId: FUNNEL_ID, legacyMode: true });
  assertEquals(result.acquired, true);
});

Deno.test("Rollout: flag resolvida uma vez por request logo após a resolução de instância, via isConversationIsolationEnabled", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertEquals(src.includes("isConversationIsolationEnabled(\n      supabase as any,\n      instance.organization_id,\n    )"), true);
});

Deno.test("Rollout: os 3 call sites de acquireFunnelRunGate passam legacyMode: !conversationIsolationEnabled", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const occurrences = src.split("legacyMode: !conversationIsolationEnabled").length - 1;
  assertEquals(occurrences, 3);
});

Deno.test("Rollout: a busca de conversa existente só filtra por connection_id quando a flag está ligada", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertEquals(
    src.includes("if (conversationIsolationEnabled) {\n        existingByPhoneQuery = existingByPhoneQuery.eq(\"connection_id\", instance.id);"),
    true,
  );
});

Deno.test("Rollout: a recuperação pós-23505 na criação de conversa nova só filtra por connection_id quando a flag está ligada", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertEquals(
    src.includes("if (conversationIsolationEnabled) {\n              raceQuery = raceQuery.eq(\"connection_id\", instance.id);"),
    true,
  );
});
