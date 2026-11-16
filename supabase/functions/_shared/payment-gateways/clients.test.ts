import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { hmacSha256Hex } from "./crypto.ts";
import { createSpeiPayin, getPayin, interpretColocaEvent, isColocaPing, verifyColocaDelivery } from "./colocapay.ts";
import { createOxxoPayment, hasCompleteVoucher, interpretLeonaEvent, mapLeonaPayment, simulateSandboxPayment, verifyLeonaDelivery } from "./leonapay.ts";
import { GatewayError, requestWithRetry } from "./types.ts";

const J = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const noSleep = () => Promise.resolve();

// ── ColocaPay ──
Deno.test("Coloca: SPEI payin envia corpo oficial e preserva a CLABE como texto", async () => {
  let sent: any; let hdr: any;
  const f = (_u: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); hdr = init.headers; return Promise.resolve(J(201, { id: "p1", status: "CREATED", clabe: "012345678901234567", expires_at: "2026-11-14T00:00:00Z", gross_amount: "250.00" })); };
  const r = await createSpeiPayin(f, "sk_x", "sandbox", { amount: "250.10", payerName: "Juan Pérez", idempotencyKey: "11111111-1111-4111-8111-111111111111", concept: "ref123" });
  assertEquals(sent, { rail: "SPEI", country: "MEX", currency: "MXN", gross_amount: "250.10", payer: { name: "Juan Pérez" }, concept: "ref123", idempotency_key: "11111111-1111-4111-8111-111111111111" });
  assertEquals(hdr["x-api-key"], "sk_x");
  assertEquals(r.paymentCode, "012345678901234567"); // zero à esquerda preservado
  assertEquals(typeof r.paymentCode, "string");
  assertEquals(r.status, "pending");
});
Deno.test("Coloca: status do gateway mapeados", async () => {
  const s = async (st: string, fr?: string) => (await getPayin(() => Promise.resolve(J(200, { id: "p", status: st, failure_reason: fr, gross_amount: "10" })), "k", "sandbox", "p")).status;
  assertEquals(await s("CONFIRMED"), "paid");
  assertEquals(await s("CREATED"), "pending");
  assertEquals(await s("REJECTED", "expired"), "expired");
  assertEquals(await s("REJECTED", "provider_rejected"), "failed");
});
Deno.test("Coloca: assinatura t=..,v1=.. + x-secret", async () => {
  const secret = "whsec_test_secret_123456"; const body = '{"id":"e1","type":"payments","event":"payin_confirmed","data":{}}';
  const t = 1_800_000_000; const v1 = await hmacSha256Hex(secret, `${t}.${body}`);
  const ok = await verifyColocaDelivery({ secretHeader: secret, signatureHeader: `t=${t},v1=${v1}`, rawBody: body, secret, nowSec: t + 10 });
  assertEquals(ok.ok, true);
  assertEquals((await verifyColocaDelivery({ secretHeader: "outro", signatureHeader: `t=${t},v1=${v1}`, rawBody: body, secret, nowSec: t })).reason, "bad_secret");
  assertEquals((await verifyColocaDelivery({ secretHeader: secret, signatureHeader: `t=${t},v1=${v1}`, rawBody: body + " ", secret, nowSec: t })).reason, "bad_signature");
  assertEquals((await verifyColocaDelivery({ secretHeader: secret, signatureHeader: `t=${t},v1=${v1}`, rawBody: body, secret, nowSec: t + 301 })).reason, "stale_timestamp");
  assertEquals((await verifyColocaDelivery({ secretHeader: secret, signatureHeader: null, rawBody: body, secret })).reason, "missing_signature");
});
Deno.test("Coloca: ping e eventos de payin", () => {
  assertEquals(isColocaPing({ type: "test", event: "ping" }), true);
  const ev = interpretColocaEvent({ id: "e", type: "payments", event: "payin_confirmed", created_at: "", data: { id: "p1", status: "CONFIRMED", gross_amount: "250.00", concept: "ref" } });
  assert(ev.kind === "payin" && ev.state.status === "paid" && ev.concept === "ref");
  assertEquals(interpretColocaEvent({ id: "e", type: "cards", event: "card_created", created_at: "", data: { id: "x" } }).kind, "ignored");
});

// ── LeonaPay ──
const voucher = { success: true, leonapayCode: "LP201", data: { id: "pay_1", status: "PENDING", method: "OXXO", currency: "MXN", amount: 250, nextAction: { type: "CASH_VOUCHER", reference: "00930002625184", barcodeUrl: "https://x.test/v.png", expiresAt: "2026-11-15T15:00:00Z" } } };
Deno.test("Leona: cria OXXO com idempotency-key e mapeia voucher (referência como texto)", async () => {
  let sent: any; let hdr: any; let url = "";
  const f = (u: string, init: RequestInit) => { url = u; sent = JSON.parse(String(init.body)); hdr = init.headers; return Promise.resolve(J(201, voucher)); };
  const r = await createOxxoPayment(f, "lk", "sandbox", { amount: "250.00", payerName: "Juan", payerEmail: "j@x.com", idempotencyKey: "22222222-2222-4222-8222-222222222222", reference: "ref1" });
  assertEquals(url, "https://sandbox.api.leonapay.com.br/api/v2/payments");
  assertEquals(hdr["idempotency-key"], "22222222-2222-4222-8222-222222222222");
  assertEquals(sent, { method: "OXXO", currency: "MXN", amount: 250, instructionType: "CASH", payer: { name: "Juan", email: "j@x.com" }, reference: "ref1" });
  assertEquals(r.paymentCode, "00930002625184"); assertEquals(typeof r.paymentCode, "string");
  assertEquals(r.paymentQrcode, "https://x.test/v.png"); assertEquals(r.expiresAt, "2026-11-15T15:00:00Z");
  assert(hasCompleteVoucher(r));
});
Deno.test("Leona: voucher incompleto fica pendente sem referência/imagem", () => {
  const s = mapLeonaPayment({ success: true, data: { id: "pay_2", status: "PENDING", amount: 250 } });
  assertEquals(hasCompleteVoucher(s), false);
  assertEquals(s.status, "pending");
});
Deno.test("Leona: assinatura sha256=HMAC(ts.eventId.corpo) com tolerância e corpo bruto", async () => {
  const secret = "whsec_abc"; const body = '{"id":"evt_1","event":"payment.paid","data":{"id":"pay_1"}}';
  const ts = "1800000000"; const sig = "sha256=" + await hmacSha256Hex(secret, `${ts}.evt_1.${body}`);
  assertEquals((await verifyLeonaDelivery({ timestamp: ts, eventId: "evt_1", signature: sig, rawBody: body, secret, nowSec: 1800000100 })).ok, true);
  assertEquals((await verifyLeonaDelivery({ timestamp: ts, eventId: "evt_2", signature: sig, rawBody: body, secret, nowSec: 1800000100 })).reason, "bad_signature");
  assertEquals((await verifyLeonaDelivery({ timestamp: ts, eventId: "evt_1", signature: sig, rawBody: body.replace("pay_1", "pay_9"), secret, nowSec: 1800000100 })).reason, "bad_signature");
  assertEquals((await verifyLeonaDelivery({ timestamp: ts, eventId: "evt_1", signature: sig, rawBody: body, secret, nowSec: 1800000301 })).reason, "stale_timestamp");
  assertEquals((await verifyLeonaDelivery({ timestamp: null, eventId: "evt_1", signature: sig, rawBody: body, secret })).reason, "missing_headers");
});
Deno.test("Leona: eventos payment.* (formatos event/type) e ignorados", () => {
  const a = interpretLeonaEvent({ id: "e", event: "payment.paid", data: { id: "pay_1", reference: "ref1", amount: 250, status: "PAID", method: "OXXO", currency: "MXN" } });
  assert(a.kind === "payment" && a.state.status === "paid" && a.reference === "ref1" && a.state.amount === "250.00");
  const b = interpretLeonaEvent({ id: "e", type: "payment.expired", data: { id: "pay_1", status: "PENDING" } });
  assert(b.kind === "payment" && b.state.status === "expired");
  assertEquals(interpretLeonaEvent({ event: "withdrawal.paid", data: { id: "w" } }).kind, "ignored");
});
Deno.test("Leona: erro conclusivo vs retentável; sandbox simula PAID", async () => {
  const err = await assertRejects(() => createOxxoPayment(() => Promise.resolve(J(422, { success: false, leonapayCode: "LP422_OXXO_REJECTED" })), "k", "sandbox", { amount: "10.00", payerName: "a", payerEmail: "a@b.c", idempotencyKey: "i", reference: "r" }), GatewayError);
  assertEquals((err as GatewayError).code, "LP422_OXXO_REJECTED"); assertEquals((err as GatewayError).retryable, false);
  let url = ""; let b = "";
  await simulateSandboxPayment((u, i) => { url = u; b = String(i.body); return Promise.resolve(J(200, { success: true })); }, "k", "pay_1", "PAID");
  assertEquals(url, "https://sandbox.api.leonapay.com.br/api/v2/simulations/payments/pay_1"); assertEquals(b, '{"status":"PAID"}');
});
Deno.test("retry: timeout/5xx repete a MESMA requisição (mesma chave); 4xx não", async () => {
  const calls: { key: string }[] = []; let n = 0;
  const f = (_u: string, init: RequestInit) => { calls.push({ key: (init.headers as any)["idempotency-key"] }); n++; return Promise.resolve(n < 3 ? J(503, {}) : J(201, voucher)); };
  const res = await requestWithRetry(f, "u", { method: "POST", headers: { "idempotency-key": "K1" }, body: "{}" }, { sleep: noSleep });
  assertEquals(res.status, 201); assertEquals(calls.map((c) => c.key), ["K1", "K1", "K1"]);
  let m = 0; const g = () => { m++; return Promise.resolve(J(400, {})); };
  assertEquals((await requestWithRetry(g, "u", {}, { sleep: noSleep })).status, 400); assertEquals(m, 1);
  await assertRejects(() => requestWithRetry(() => Promise.reject(new Error("x")), "u", {}, { sleep: noSleep }), GatewayError);
});
