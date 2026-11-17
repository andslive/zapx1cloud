import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type ChargeRow, type ChargeStore, createCharge, parseAmount, varsFromCharge } from "./charge.ts";

// PostgREST devolve numeric como NÚMERO: o store de teste reproduz isso (regressão do E2E).
const J = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s });
function memStore(): ChargeStore & { rows: ChargeRow[]; inserts: number } {
  const rows: ChargeRow[] = []; const st = { rows, inserts: 0 };
  return Object.assign(st, {
    findOpenByExecution: (o: string, k: string) => Promise.resolve(rows.find((r) => r.organization_id === o && r.execution_key === k && ["creating", "awaiting_instructions", "pending"].includes(r.status)) ?? null),
    insert: (r: any) => { st.inserts++; const row = { ...r, amount: Number(r.amount) as any, id: crypto.randomUUID(), internal_reference: crypto.randomUUID().replace(/-/g, "") } as ChargeRow; rows.push(row); return Promise.resolve({ ...row }); },
    update: (id: string, p: Partial<ChargeRow>) => { Object.assign(rows.find((r) => r.id === id)!, p); return Promise.resolve(); },
  });
}
const acct = (provider: "colocapay" | "leonapay", enabled = true) => ({ id: "acc1", organization_id: "org1", provider, environment: "sandbox" as const, enabled });
const base = { apiKey: "k", orderRef: "ord1", executionKey: "conv1:blk1:1", lead: { name: "Ana Souza", email: "ana@x.com" } };
const speiOk = () => Promise.resolve(J(201, { id: "p1", status: "CREATED", clabe: "012180004567890123", expires_at: "2026-11-14T00:00:00Z", gross_amount: "250.10" }));
const oxxoOk = { success: true, data: { id: "pay_1", status: "PENDING", amount: 250, nextAction: { type: "CASH_VOUCHER", reference: "00930002625184", barcodeUrl: "https://x/v.png", expiresAt: "2026-11-15T15:00:00Z" } } };

Deno.test("valor: validado no backend", () => {
  assertEquals(parseAmount("250"), "250.00"); assertEquals(parseAmount("1.250,5"), "1250.50"); assertEquals(parseAmount("250.10"), "250.10");
  for (const b of ["", "0", "-5", "abc", "1e3", "10.999", null, undefined]) assertEquals(parseAmount(b), null, String(b));
});
Deno.test("SPEI: persiste ANTES da chamada, mantém CLABE como texto e preenche variáveis", async () => {
  const store = memStore(); let seenRowBeforeCall = false;
  const f = (...a: [string, RequestInit]) => { seenRowBeforeCall = store.rows.length === 1 && store.rows[0].status === "creating"; return speiOk(); };
  const r = await createCharge({ store, fetch: f }, { ...base, account: acct("colocapay"), method: "SPEI", rawAmount: "250.10" });
  assert(seenRowBeforeCall);
  assert(r.status === "ready");
  assertEquals(r.vars.payment_code, "012180004567890123"); assertEquals(r.vars.transaction_id, "p1"); assertEquals(r.vars.value, "250.10"); assertEquals(r.vars.erro, "");
  assertEquals(store.rows[0].status, "pending");
});
Deno.test("OXXO: voucher completo → referência (texto), imagem e prazo", async () => {
  const store = memStore();
  const r = await createCharge({ store, fetch: () => Promise.resolve(J(201, oxxoOk)) }, { ...base, account: acct("leonapay"), method: "OXXO", rawAmount: "250" });
  assert(r.status === "ready");
  assertEquals(r.vars.payment_code, "00930002625184"); assertEquals(r.vars.payment_qrcode, "https://x/v.png"); assertEquals(r.vars.expires_at, "2026-11-15T15:00:00Z");
});
Deno.test("OXXO: voucher chega depois da criação (retentativa controlada, sem 2ª cobrança)", async () => {
  const store = memStore(); let posts = 0, gets = 0;
  const f = (_u: string, init: RequestInit) => {
    if (init.method === "POST") { posts++; return Promise.resolve(J(201, { success: true, data: { id: "pay_1", status: "PENDING", amount: 250 } })); }
    gets++; return Promise.resolve(J(200, gets < 2 ? { data: { id: "pay_1", status: "PENDING", amount: 250 } } : oxxoOk));
  };
  const r = await createCharge({ store, fetch: f, sleep: () => Promise.resolve() }, { ...base, account: acct("leonapay"), method: "OXXO", rawAmount: "250" });
  assert(r.status === "ready"); assertEquals(posts, 1); assertEquals(r.vars.payment_code, "00930002625184");
});
Deno.test("OXXO: voucher não chega → awaiting_instructions (não avança), sem nova cobrança", async () => {
  const store = memStore(); let posts = 0;
  const f = (_u: string, init: RequestInit) => { if (init.method === "POST") posts++; return Promise.resolve(J(init.method === "POST" ? 201 : 200, { success: true, data: { id: "pay_1", status: "PENDING", amount: 250 } })); };
  const r = await createCharge({ store, fetch: f, sleep: () => Promise.resolve() }, { ...base, account: acct("leonapay"), method: "OXXO", rawAmount: "250" });
  assertEquals(r.status, "awaiting_instructions"); assertEquals(store.rows[0].status, "awaiting_instructions"); assertEquals(posts, 1);
  const again = await createCharge({ store, fetch: f, sleep: () => Promise.resolve() }, { ...base, account: acct("leonapay"), method: "OXXO", rawAmount: "250" });
  assertEquals(again.status, "awaiting_instructions"); assertEquals(posts, 1); assertEquals(store.inserts, 1);
});
Deno.test("timeout: mantém 'creating' e o retry usa a MESMA idempotency-key e o MESMO payload", async () => {
  const store = memStore(); const keys: string[] = []; const bodies: string[] = []; let n = 0;
  const f = (_u: string, init: RequestInit) => { keys.push((init.headers as any)["idempotency-key"]); bodies.push(String(init.body)); n++; return n <= 3 ? Promise.reject(new Error("timeout")) : Promise.resolve(J(201, oxxoOk)); };
  const deps = { store, fetch: f, sleep: () => Promise.resolve() };
  const r1 = await createCharge(deps, { ...base, account: acct("leonapay"), method: "OXXO", rawAmount: "250" });
  assert(r1.status === "error" && r1.retryable); assertEquals(store.rows[0].status, "creating");
  const r2 = await createCharge(deps, { ...base, account: acct("leonapay"), method: "OXXO", rawAmount: "250" });
  assert(r2.status === "ready"); assertEquals(store.inserts, 1);
  assertEquals(new Set(keys).size, 1); assertEquals(new Set(bodies).size, 1);
});
Deno.test("falha conclusiva: erro em gateway.erro e cobrança 'failed'", async () => {
  const store = memStore();
  const r = await createCharge({ store, fetch: () => Promise.resolve(J(422, { success: false, leonapayCode: "LP422_OXXO_REJECTED" })) }, { ...base, account: acct("leonapay"), method: "OXXO", rawAmount: "250" });
  assert(r.status === "error" && !r.retryable); assertEquals(r.vars.erro, "LP422_OXXO_REJECTED"); assertEquals(store.rows[0].status, "failed");
});
Deno.test("faltou dado: pede só nome; só e-mail; retoma a mesma execução", async () => {
  const store = memStore(); const deps = { store, fetch: () => Promise.resolve(J(201, oxxoOk)), sleep: () => Promise.resolve() };
  const noName = await createCharge(deps, { ...base, lead: { name: "5574991946784", email: "a@b.co" }, account: acct("leonapay"), method: "OXXO", rawAmount: "250" });
  assertEquals(noName, { status: "need_input", need: "name" }); assertEquals(store.inserts, 0);
  const noEmail = await createCharge(deps, { ...base, lead: { name: "Ana", email: null }, account: acct("leonapay"), method: "OXXO", rawAmount: "250" });
  assertEquals(noEmail, { status: "need_input", need: "email" });
  const ok = await createCharge(deps, { ...base, lead: { name: "Ana", email: null }, askedEmail: "ana@mail.com", account: acct("leonapay"), method: "OXXO", rawAmount: "250" });
  assert(ok.status === "ready"); assertEquals(store.rows[0].payer_email_source, "asked"); assertEquals(store.inserts, 1);
});
Deno.test("validações: conta inativa, valor fora do limite OXXO, método incompatível", async () => {
  const store = memStore(); const deps = { store, fetch: () => Promise.resolve(J(201, oxxoOk)) };
  assertEquals((await createCharge(deps, { ...base, account: acct("leonapay", false), method: "OXXO", rawAmount: "250" }) as any).code, "account_disabled");
  assertEquals((await createCharge(deps, { ...base, account: acct("leonapay"), method: "OXXO", rawAmount: "9.99" }) as any).code, "amount_below_minimum");
  assertEquals((await createCharge(deps, { ...base, account: acct("leonapay"), method: "OXXO", rawAmount: "10000.01" }) as any).code, "amount_above_maximum");
  assertEquals((await createCharge(deps, { ...base, account: acct("colocapay"), method: "OXXO", rawAmount: "250" }) as any).code, "method_unavailable");
  assertEquals((await createCharge(deps, { ...base, account: acct("leonapay"), method: "OXXO", rawAmount: "" }) as any).code, "invalid_amount");
  assertEquals(store.inserts, 0);
});
Deno.test("variáveis nunca vazam segredo e mantêm tipos texto", () => {
  const v = varsFromCharge({ id: "c", external_id: "e", payment_code: "000123", payment_qrcode: null, payment_link: null, expires_at: null, amount: "10.00", bank_name: null, beneficiary: null, error_code: null, status: "pending" });
  assertEquals(typeof v.payment_code, "string"); assertEquals(v.payment_code, "000123");
});

Deno.test("regressão E2E: amount numérico vindo do banco ainda vai ao gateway como string 250.10", async () => {
  const store = memStore(); let sent: any;
  const f = (_u: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return Promise.resolve(J(201, { id: "p1", status: "CREATED", clabe: "012180004567890123", gross_amount: "250.10" })); };
  const r = await createCharge({ store, fetch: f }, { ...base, account: acct("colocapay"), method: "SPEI", rawAmount: "250.10" });
  assertEquals(sent.gross_amount, "250.10"); assertEquals(typeof sent.gross_amount, "string");
  assert(r.status === "ready" && r.vars.value === "250.10");
});
