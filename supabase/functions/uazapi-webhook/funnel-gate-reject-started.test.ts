// deno test --allow-import --no-check supabase/functions/uazapi-webhook/funnel-gate-reject-started.test.ts
// Regra "cada lead inicia cada funil uma única vez" no gate de entrada automática (rejectIfStarted).
// Todo o client Supabase é um mock local: nenhuma rede, nenhuma escrita real.
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { acquireFunnelRunGate } from "./index.ts";

const LEAD = crypto.randomUUID();
const FUNNEL = crypto.randomUUID();

function fake(rows: Array<{ id: string; status: string; funnel_id?: string; lead_id?: string }>, opts: { selectError?: boolean } = {}) {
  const calls = { selects: 0, inserts: [] as any[] };
  return {
    calls,
    from(table: string) {
      if (table !== "lead_funnel_history") throw new Error(`tabela inesperada: ${table}`);
      return {
        select(_c: string) {
          calls.selects++;
          const f: any = { lead: null, funnel: null, statuses: null };
          const b: any = {
            eq(col: string, v: string) { if (col === "lead_id") f.lead = v; if (col === "funnel_id") f.funnel = v; return b; },
            in(_c: string, v: string[]) { f.statuses = v; return b; },
            limit(_n: number) {
              if (opts.selectError) return Promise.resolve({ data: null, error: { message: "boom (simulado)" } });
              const data = rows.filter((r) => (r.lead_id ?? LEAD) === f.lead && (r.funnel_id ?? FUNNEL) === f.funnel && f.statuses.includes(r.status));
              return Promise.resolve({ data, error: null });
            },
          };
          return b;
        },
        insert(row: any) {
          calls.inserts.push(row);
          return { select() { return { single() { return Promise.resolve({ data: { id: crypto.randomUUID() }, error: null }); } }; } };
        },
      };
    },
  };
}

for (const status of ["running", "completed", "stopped", "abandoned"]) {
  Deno.test(`gate rejectIfStarted: histórico '${status}' bloqueia e não insere`, async () => {
    const c = fake([{ id: "h1", status }]);
    const r: any = await acquireFunnelRunGate(c, { leadId: LEAD, funnelId: FUNNEL, rejectIfStarted: true });
    assertEquals(r.acquired, false);
    assertEquals(r.reason, "already_started");
    assertEquals(r.status, status);
    assertEquals(c.calls.inserts.length, 0);
  });
}

for (const status of ["released", "reserved", "cancelled"]) {
  Deno.test(`gate rejectIfStarted: histórico '${status}' NÃO conta como iniciado`, async () => {
    const c = fake([{ id: "h1", status }]);
    const r: any = await acquireFunnelRunGate(c, { leadId: LEAD, funnelId: FUNNEL, rejectIfStarted: true });
    assertEquals(r.acquired, true);
    assertEquals(c.calls.inserts.length, 1);
  });
}

Deno.test("gate rejectIfStarted: outro funil do mesmo lead não bloqueia", async () => {
  const c = fake([{ id: "h1", status: "completed", funnel_id: crypto.randomUUID() }]);
  const r: any = await acquireFunnelRunGate(c, { leadId: LEAD, funnelId: FUNNEL, rejectIfStarted: true });
  assertEquals(r.acquired, true);
});

Deno.test("gate rejectIfStarted: erro na consulta => falha fechada, sem insert", async () => {
  const c = fake([], { selectError: true });
  const r: any = await acquireFunnelRunGate(c, { leadId: LEAD, funnelId: FUNNEL, rejectIfStarted: true });
  assertEquals(r.acquired, false);
  assertEquals(r.reason, "error");
  assertEquals(c.calls.inserts.length, 0);
});

Deno.test("gate rejectIfStarted vale também em legacyMode (regra do produto)", async () => {
  const c = fake([{ id: "h1", status: "stopped" }]);
  const r: any = await acquireFunnelRunGate(c, { leadId: LEAD, funnelId: FUNNEL, legacyMode: true, rejectIfStarted: true });
  assertEquals(r.acquired, false);
  assertEquals(r.reason, "already_started");
});

Deno.test("gate sem rejectIfStarted: comportamento anterior (nenhuma consulta de histórico)", async () => {
  const c = fake([{ id: "h1", status: "completed" }]);
  const r: any = await acquireFunnelRunGate(c, { leadId: LEAD, funnelId: FUNNEL });
  assertEquals(r.acquired, true);
  assertEquals(c.calls.selects, 0);
});
