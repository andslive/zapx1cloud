import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { settleChargeState } from "./settle.ts";

// Banco em memória que imita as garantias do SQL (índice único de evento + mark_paid atômico).
function fakeDb(chargeOverrides: Record<string, unknown> = {}) {
  const charges: any[] = [{ id: "c1", organization_id: "org1", gateway_account_id: "acc1", provider: "leonapay", method: "OXXO", status: "pending", amount: "250.00", external_id: "pay_1", internal_reference: "ref1", order_ref: "o1", resume_claimed_at: null, consumed_at: null, ...chargeOverrides }];
  const events: any[] = [];
  const q = (table: string) => {
    let rows: any[] = table === "payment_charges" ? charges : events; let upd: any = null; let isIns = false; let ins: any = null; let filters: [string, any][] = []; let inF: [string, any[]] | null = null; let single = false;
    const api: any = {
      select: () => api, eq: (k: string, v: any) => { filters.push([k, v]); return api; }, in: (k: string, v: any[]) => { inF = [k, v]; return api; },
      insert: (r: any) => { isIns = true; ins = r; return api; }, update: (p: any) => { upd = p; return api; },
      single: () => { single = true; return api; }, maybeSingle: () => { single = true; return api; },
      then: (res: any, rej: any) => Promise.resolve().then(() => {
        if (isIns) {
          if (table === "payment_gateway_events" && events.some((e) => e.gateway_account_id === ins.gateway_account_id && e.event_id === ins.event_id)) return { data: null, error: { code: "23505" } };
          const row = { id: "ev" + (events.length + 1), processed_at: null, ...ins }; rows.push(row); return { data: row, error: null };
        }
        let m = rows.filter((r) => filters.every(([k, v]) => r[k] === v) && (!inF || inF[1].includes(r[inF[0]])));
        if (upd) { m.forEach((r) => Object.assign(r, upd)); return { data: m, error: null }; }
        return { data: single ? (m[0] ?? null) : m, error: null };
      }).then(res, rej),
    };
    return api;
  };
  const sb = {
    from: q,
    rpc: (fn: string, a: any) => {
      if (fn !== "payment_charge_mark_paid") throw new Error(fn);
      const c = charges.find((x) => x.id === a.p_charge_id);
      let outcome: string, first = false;
      if (!c) outcome = "unknown_charge";
      else if (c.organization_id !== a.p_organization_id || c.gateway_account_id !== a.p_gateway_account_id || c.method !== a.p_method) outcome = "mismatch";
      else if (Number(c.amount) !== a.p_paid_amount) outcome = "amount_mismatch";
      else if (c.status === "paid") outcome = "already_paid";
      else if (charges.some((o) => o.id !== c.id && o.order_ref === c.order_ref && o.status === "paid")) { c.status = "paid"; c.consumed_at = "x"; outcome = "second_payment"; }
      else { c.status = "paid"; outcome = "applied"; first = true; }
      return Promise.resolve({ data: [{ outcome, first_time: first }], error: null });
    },
  };
  return { sb, charges, events };
}
const acct = { id: "acc1", organization_id: "org1", provider: "leonapay" };
const paid = (amount = "250.00") => ({ externalId: "pay_1", status: "paid" as const, paymentCode: null, paymentQrcode: null, paymentLink: null, expiresAt: null, bankName: null, beneficiary: null, amount, errorCode: null });

Deno.test("webhook duplicado: persiste uma vez, retoma uma vez", async () => {
  const { sb, events } = fakeDb(); let resumes = 0;
  const deps = { supabase: sb, resume: () => { resumes++; return Promise.resolve(); } };
  const args = { account: acct, eventId: "evt1", eventType: "payment.paid", payload: {}, state: paid(), lookup: {}, source: "webhook" as const };
  assertEquals((await settleChargeState(deps, args)).outcome, "applied");
  assertEquals((await settleChargeState(deps, args)).outcome, "duplicate");
  assertEquals(events.length, 1); assertEquals(resumes, 1);
});
Deno.test("webhook + consulta (evento diferente, mesma cobrança): uma única retomada", async () => {
  const { sb } = fakeDb(); let resumes = 0;
  const deps = { supabase: sb, resume: () => { resumes++; return Promise.resolve(); } };
  await settleChargeState(deps, { account: acct, eventId: "evt1", eventType: "payment.paid", payload: {}, state: paid(), lookup: {}, source: "webhook" });
  const r = await settleChargeState(deps, { account: acct, eventType: "poll", payload: {}, state: paid(), lookup: {}, source: "poll" });
  assertEquals(r.outcome, "already_paid"); assertEquals(resumes, 1);
});
Deno.test("valor divergente / organização errada: não confirma nem retoma", async () => {
  const { sb, charges } = fakeDb(); let resumes = 0;
  const deps = { supabase: sb, resume: () => { resumes++; return Promise.resolve(); } };
  assertEquals((await settleChargeState(deps, { account: acct, eventId: "e1", eventType: "payment.paid", payload: {}, state: paid("100.00"), lookup: {}, source: "webhook" })).outcome, "amount_mismatch");
  assertEquals((await settleChargeState(deps, { account: { ...acct, organization_id: "orgX" }, eventId: "e2", eventType: "payment.paid", payload: {}, state: paid(), lookup: {}, source: "webhook" })).outcome, "unknown_charge");
  assertEquals(charges[0].status, "pending"); assertEquals(resumes, 0);
});
Deno.test("cobrança desconhecida: evento persistido (2xx seguro), nenhum efeito", async () => {
  const { sb, events } = fakeDb(); let resumes = 0;
  const r = await settleChargeState({ supabase: sb, resume: () => { resumes++; return Promise.resolve(); } }, { account: acct, eventId: "e9", eventType: "payment.paid", payload: {}, state: { ...paid(), externalId: "pay_zzz" }, lookup: {}, source: "webhook" });
  assertEquals(r.outcome, "unknown_charge"); assertEquals(events.length, 1); assertEquals(events[0].outcome, "unknown_charge"); assertEquals(resumes, 0);
});
Deno.test("mesmo pedido pago por 2 cobranças (SPEI e OXXO): 1 entrega, 2º pagamento registrado", async () => {
  const { sb, charges } = fakeDb(); charges.push({ id: "c2", organization_id: "org1", gateway_account_id: "acc1", provider: "leonapay", method: "OXXO", status: "pending", amount: "250.00", external_id: "pay_2", internal_reference: "ref2", order_ref: "o1" });
  let resumes = 0; const deps = { supabase: sb, resume: () => { resumes++; return Promise.resolve(); } };
  await settleChargeState(deps, { account: acct, eventId: "e1", eventType: "payment.paid", payload: {}, state: paid(), lookup: {}, source: "webhook" });
  const r2 = await settleChargeState(deps, { account: acct, eventId: "e2", eventType: "payment.paid", payload: {}, state: { ...paid(), externalId: "pay_2" }, lookup: {}, source: "webhook" });
  assertEquals(r2.outcome, "second_payment"); assertEquals(resumes, 1);
});
Deno.test("voucher que chega depois: libera a mensagem uma única vez", async () => {
  const { sb } = fakeDb({ status: "awaiting_instructions" }); let reasons: string[] = [];
  const deps = { supabase: sb, resume: (_c: any, why: string) => { reasons.push(why); return Promise.resolve(); } };
  const st = { ...paid(), status: "pending" as const, paymentCode: "0093", paymentQrcode: "https://x/v.png", expiresAt: "2026-11-15T15:00:00Z" };
  assertEquals((await settleChargeState(deps, { account: acct, eventId: "e1", eventType: "payment.action_required", payload: {}, state: st, lookup: {}, source: "webhook" })).outcome, "instructions_ready");
  assertEquals((await settleChargeState(deps, { account: acct, eventId: "e2", eventType: "payment.pending", payload: {}, state: st, lookup: {}, source: "webhook" })).outcome, "ignored");
  assertEquals(reasons, ["instructions"]);
});
Deno.test("expiração e falha atualizam o estado sem retomar", async () => {
  const { sb, charges } = fakeDb(); let resumes = 0;
  const deps = { supabase: sb, resume: () => { resumes++; return Promise.resolve(); } };
  await settleChargeState(deps, { account: acct, eventId: "e1", eventType: "payment.expired", payload: {}, state: { ...paid(), status: "expired" }, lookup: {}, source: "webhook" });
  assertEquals(charges[0].status, "expired"); assertEquals(resumes, 0);
});
Deno.test("evento recebido mas execução caiu antes de processar: reprocessa no reenvio", async () => {
  const { sb, events } = fakeDb(); events.push({ id: "ev0", gateway_account_id: "acc1", event_id: "evt1", processed_at: null });
  let resumes = 0; const deps = { supabase: sb, resume: () => { resumes++; return Promise.resolve(); } };
  const r = await settleChargeState(deps, { account: acct, eventId: "evt1", eventType: "payment.paid", payload: {}, state: paid(), lookup: {}, source: "webhook" });
  assertEquals(r.outcome, "applied"); assert(events[0].processed_at); assertEquals(resumes, 1);
});
