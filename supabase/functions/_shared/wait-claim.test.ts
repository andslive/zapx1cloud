// deno test --allow-import wait-claim.test.ts
// Reivindicação atômica da espera, com interleaving FORÇADO (determinístico).
import { CLAIM_TTL_MS, claimLossIsFinal, claimWait, releaseTimeoutWithoutPath } from "./wait-claim.ts";
import { waitKeyOf } from "./funnel-resume.ts";
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.208.0/assert/mod.ts";

const NOW = Date.parse("2026-10-01T12:00:00Z");
type Row = Record<string, any>;

function mkConv(over: Partial<Row> = {}): Row {
  return {
    id: "c1", current_flow_id: "f1", current_block_id: "b2", updated_at: "2026-10-01T11:00:00.000001Z", bot_locked_until: "2026-10-01T11:30:00Z",
    flow_variables: { nome: "x", __waiting_input: { block_id: "b2", question_sent_at: "2026-10-01T10:00:00Z", timeout_next_block_id: "b3" } },
    ...over,
  };
}

/** Cliente falso com "trigger" de updated_at e gancho para simular uma escrita concorrente entre leitura e escrita. */
function client(row: Row, hooks: { beforeUpdate?: (n: number) => void; failSelect?: boolean; failUpdate?: boolean } = {}) {
  let updates = 0;
  let ver = 1;
  return {
    row,
    get updates() { return updates; },
    from(_t: string) {
      return {
        select(_c: string) {
          return { eq(_k: string, id: string) { return { maybeSingle() { return Promise.resolve(hooks.failSelect ? { data: null, error: { m: 1 } } : { data: id === row.id ? structuredClone(row) : null, error: null }); } }; } };
        },
        update(values: Row) {
          const conds: [string, unknown][] = [];
          const q = {
            eq(k: string, v: unknown) { conds.push([k, v]); return q; },
            select(_c: string) {
              hooks.beforeUpdate?.(++updates);
              if (hooks.failUpdate) return Promise.resolve({ data: null, error: { m: 1 } });
              const ok = conds.every(([k, v]) => row[k] === v);
              if (ok) { Object.assign(row, structuredClone(values)); row.updated_at = `2026-10-01T11:00:00.${String(++ver).padStart(6, "0")}Z`; }
              return Promise.resolve({ data: ok ? [{ id: row.id }] : [], error: null });
            },
          };
          return q;
        },
      };
    },
  };
}

Deno.test("claimWait: o 1º vence, grava o marcador; o 2º recua (already_claimed) sem alterar nada", async () => {
  const row = mkConv();
  const c = client(row);
  const key = waitKeyOf(row);
  assertEquals(await claimWait(c, { conversationId: "c1", expectedBlockId: "b2", expectedWaitKey: key, by: "timeout", nowMs: NOW }), { won: true });
  assertEquals(row.flow_variables.__waiting_input.claimed_by, "timeout");
  const snap = JSON.stringify(row);
  assertEquals(await claimWait(c, { conversationId: "c1", expectedBlockId: "b2", by: "answer", nowMs: NOW + 1000 }), { won: false, reason: "already_claimed" });
  assertEquals(JSON.stringify(row), snap);
});

Deno.test("claimWait: escrita concorrente ENTRE a leitura e a escrita => a CAS falha, relê e perde (nunca vencem os dois)", async () => {
  const row = mkConv();
  // A lê; antes de A escrever, B completa a sua reivindicação inteira
  let injected = false;
  const c = client(row, {
    beforeUpdate: () => {
      if (injected) return;
      injected = true;
      row.flow_variables.__waiting_input = { ...row.flow_variables.__waiting_input, claimed_by: "answer", claimed_at: new Date(NOW).toISOString() };
      row.updated_at = "2026-10-01T11:00:00.999999Z"; // o trigger mudou updated_at
    },
  });
  const r = await claimWait(c, { conversationId: "c1", expectedBlockId: "b2", by: "timeout", nowMs: NOW });
  assertEquals(r, { won: false, reason: "already_claimed" });
  assertEquals(row.flow_variables.__waiting_input.claimed_by, "answer"); // o vencedor continua sendo o 1º
});

Deno.test("claimWait: conflito persistente esgota as tentativas e devolve 'conflict' (nunca vence sem CAS)", async () => {
  const row = mkConv();
  const c = client(row, { beforeUpdate: () => { row.updated_at = `2026-10-01T11:00:00.${Math.random().toString().slice(2, 8)}Z`; } });
  assertEquals(await claimWait(c, { conversationId: "c1", expectedBlockId: "b2", by: "timeout", nowMs: NOW }), { won: false, reason: "conflict" });
  assertFalse("claimed_by" in row.flow_variables.__waiting_input);
});

Deno.test("claimWait: espera de OUTRO bloco, de OUTRA pergunta, sem espera ou conversa inexistente => stale/not_found", async () => {
  const k = waitKeyOf(mkConv());
  assertEquals((await claimWait(client(mkConv({ current_block_id: "b9" })), { conversationId: "c1", expectedBlockId: "b2", by: "timeout", nowMs: NOW })), { won: false, reason: "stale" });
  assertEquals((await claimWait(client(mkConv({ flow_variables: { __waiting_input: { question_sent_at: "2026-10-01T10:30:00Z" } } })), { conversationId: "c1", expectedBlockId: "b2", expectedWaitKey: k, by: "timeout", nowMs: NOW })), { won: false, reason: "stale" });
  assertEquals((await claimWait(client(mkConv({ flow_variables: {} })), { conversationId: "c1", expectedBlockId: "b2", by: "answer", nowMs: NOW })), { won: false, reason: "stale" });
  assertEquals((await claimWait(client(mkConv()), { conversationId: "nao-existe", expectedBlockId: "b2", by: "answer", nowMs: NOW })), { won: false, reason: "not_found" });
});

Deno.test("claimWait: reivindicação ÓRFÃ expira (ttl) e a espera volta a poder ser reivindicada", async () => {
  const row = mkConv();
  row.flow_variables.__waiting_input.claimed_by = "answer";
  row.flow_variables.__waiting_input.claimed_at = new Date(NOW - CLAIM_TTL_MS - 1000).toISOString();
  const c = client(row);
  assertEquals(await claimWait(c, { conversationId: "c1", expectedBlockId: "b2", by: "timeout", nowMs: NOW }), { won: true });
  assertEquals(row.flow_variables.__waiting_input.claimed_by, "timeout");
  const fresh = mkConv();
  fresh.flow_variables.__waiting_input.claimed_by = "answer";
  fresh.flow_variables.__waiting_input.claimed_at = new Date(NOW - 1000).toISOString();
  assertEquals(await claimWait(client(fresh), { conversationId: "c1", expectedBlockId: "b2", by: "timeout", nowMs: NOW }), { won: false, reason: "already_claimed" });
});

Deno.test("claimWait: erro do banco nunca é vitória", async () => {
  assertEquals(await claimWait(client(mkConv(), { failSelect: true }), { conversationId: "c1", expectedBlockId: "b2", by: "timeout", nowMs: NOW }), { won: false, reason: "error" });
  assertEquals(await claimWait(client(mkConv(), { failUpdate: true }), { conversationId: "c1", expectedBlockId: "b2", by: "timeout", nowMs: NOW }), { won: false, reason: "error" });
});

Deno.test("releaseTimeoutWithoutPath: zera só o timer e marca a espera como tratada; nada mais muda", async () => {
  const row = mkConv({ last_message_at: "2026-10-01T09:00:00Z", current_block_id: "b5" });
  row.flow_variables.__waiting_input.block_id = "b5";
  const c = client(row);
  assertEquals(await releaseTimeoutWithoutPath(c, { conversationId: "c1", expectedBlockId: "b5", nowMs: NOW }), "released");
  assertEquals(row.bot_locked_until, null);
  assertEquals(row.current_block_id, "b5");
  assertEquals(row.last_message_at, "2026-10-01T09:00:00Z");
  assertEquals(row.flow_variables.__waiting_input.timeout_handled_reason, "no_timeout_path");
  assertEquals(row.flow_variables.nome, "x");
});

Deno.test("releaseTimeoutWithoutPath: respeita reivindicação em andamento, espera diferente e conflito", async () => {
  const claimed = mkConv();
  claimed.flow_variables.__waiting_input.claimed_by = "answer";
  claimed.flow_variables.__waiting_input.claimed_at = new Date(NOW - 1000).toISOString();
  assertEquals(await releaseTimeoutWithoutPath(client(claimed), { conversationId: "c1", expectedBlockId: "b2", nowMs: NOW }), "already_claimed");
  assertEquals(claimed.bot_locked_until, "2026-10-01T11:30:00Z"); // intacto
  assertEquals(await releaseTimeoutWithoutPath(client(mkConv({ current_block_id: "b9" })), { conversationId: "c1", expectedBlockId: "b2", nowMs: NOW }), "stale");
  const row = mkConv();
  const c = client(row, { beforeUpdate: () => { row.updated_at = `2026-10-01T11:00:00.${Math.random().toString().slice(2, 8)}Z`; } });
  assertEquals(await releaseTimeoutWithoutPath(c, { conversationId: "c1", expectedBlockId: "b2", nowMs: NOW }), "conflict");
  assertEquals(row.bot_locked_until, "2026-10-01T11:30:00Z");
  assert(true);
});

Deno.test("claimWait: 'extra' é gravado na MESMA escrita atômica, e só se a reivindicação vencer", async () => {
  const row = mkConv({ last_message_at: "2026-10-01T08:00:00Z" });
  const c = client(row);
  const extra = { last_message_at: "2026-10-01T12:00:00Z" };
  assertEquals(await claimWait(c, { conversationId: "c1", expectedBlockId: "b2", by: "timeout", nowMs: NOW, extra }), { won: true });
  assertEquals(row.last_message_at, "2026-10-01T12:00:00Z");
  // quem perde não toca em nada
  const row2 = mkConv({ last_message_at: "2026-10-01T08:00:00Z" });
  row2.flow_variables.__waiting_input.claimed_by = "answer";
  row2.flow_variables.__waiting_input.claimed_at = new Date(NOW - 1000).toISOString();
  assertEquals((await claimWait(client(row2), { conversationId: "c1", expectedBlockId: "b2", by: "timeout", nowMs: NOW, extra })).won, false);
  assertEquals(row2.last_message_at, "2026-10-01T08:00:00Z");
});

Deno.test("claimLossIsFinal: timeout recua em qualquer perda; a RESPOSTA do lead só recua com prova (já reivindicada/espera mudou), nunca por erro de infraestrutura", () => {
  const reasons = ["stale", "already_claimed", "conflict", "error", "not_found"] as const;
  for (const reason of reasons) assertEquals(claimLossIsFinal("timeout", { won: false, reason }), true, `timeout/${reason}`);
  assertEquals(claimLossIsFinal("answer", { won: false, reason: "already_claimed" }), true);
  assertEquals(claimLossIsFinal("answer", { won: false, reason: "stale" }), true);
  for (const reason of ["conflict", "error", "not_found"] as const) assertEquals(claimLossIsFinal("answer", { won: false, reason }), false, `answer/${reason}`);
  assertEquals(claimLossIsFinal("answer", { won: true }), false);
  assertEquals(claimLossIsFinal("timeout", { won: true }), false);
});
