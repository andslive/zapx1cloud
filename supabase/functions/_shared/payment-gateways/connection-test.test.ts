import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { maskSecret, parseColocaCorridors, parseLeonaMethods, testGatewayConnection } from "./connection-test.ts";
import { methodsFor } from "./catalog.ts";

const mk = (status: number, body: unknown) => () =>
  Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

Deno.test("Coloca: corredor SPEI/MEX/MXN disponível com limites", () => {
  const r = parseColocaCorridors({ corridors: [
    { rail: "BREB", country: "COL", currency: "COP", direction: "PAYIN", available: true, limits: [] },
    { rail: "SPEI", country: "MEX", currency: "MXN", direction: "PAYIN", available: true, unavailable_reason: null,
      limits: [{ payer_type: "COMPANY", min_amount: "1.00000000", max_amount: null }, { payer_type: "PERSON", min_amount: "10.00000000", max_amount: "50000.00000000" }] },
  ] });
  assertEquals(r.method_available, true);
  assertEquals(r.limits, { min: 10, max: 50000 });
  assertEquals(r.parser_confidence, "matched");
});
Deno.test("Coloca: sem SPEI → indisponível; desabilitado → indisponível", () => {
  assertEquals(parseColocaCorridors({ corridors: [{ rail: "PIX", country: "BRA", currency: "BRL", direction: "PAYIN", available: true }] }).method_available, false);
  const off = parseColocaCorridors({ corridors: [{ rail: "SPEI", country: "MEX", currency: "MXN", direction: "PAYIN", available: false, unavailable_reason: "rail_disabled" }] });
  assertEquals(off.method_available, false);
  assert(off.detail.includes("rail_disabled"));
  assertEquals(parseColocaCorridors({ corridors: [{ rail: "SPEI", country: "MEX", currency: "MXN", direction: "PAYOUT", available: true }] }).method_available, false);
  assertEquals(parseColocaCorridors([]).method_available, null);
});
Deno.test("Leona: OXXO/MXN habilitado; SPEI sozinho não basta", () => {
  assertEquals(parseLeonaMethods({ data: [{ method: "OXXO", currency: "MXN", available: true, minAmount: 10, maxAmount: 10000 }] }).method_available, true);
  assertEquals(parseLeonaMethods({ data: [{ method: "SPEI", currency: "MXN", available: true }] }).method_available, false);
  assertEquals(parseLeonaMethods({ data: [{ method: "OXXO", currency: "MXN", available: false }] }).method_available, false);
});
Deno.test("teste de conexão separa credencial aceita de método disponível", async () => {
  const ok = await testGatewayConnection("leonapay", "sandbox", "k", mk(200, { data: [{ method: "SPEI", currency: "MXN" }] }));
  assertEquals(ok.credential_accepted, true);
  assertEquals(ok.method_available, false);
  const bad = await testGatewayConnection("colocapay", "sandbox", "k", mk(401, { error: "x" }));
  assertEquals(bad.credential_accepted, false);
  assertEquals(bad.method_available, null);
  const net = await testGatewayConnection("colocapay", "sandbox", "k", () => Promise.reject(new Error("boom")));
  assertEquals(net.credential_accepted, false);
  assertEquals(net.http_status, null);
});
Deno.test("só consulta GET autenticada no endpoint certo, sem criar cobrança", async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const spy = (url: string, init: RequestInit) => { seen.push({ url, init }); return Promise.resolve(new Response("[]", { status: 200 })); };
  await testGatewayConnection("colocapay", "sandbox", "sk_x", spy);
  await testGatewayConnection("leonapay", "production", "lk_x", spy);
  assertEquals(seen[0].url, "https://api.qa.colocapayments.com/api/v1/public/payments/corridors");
  assertEquals(seen[1].url, "https://api.leonapay.com.br/api/v2/payment-methods");
  for (const s of seen) { assertEquals(s.init.method, "GET"); assertEquals((s.init.headers as Record<string,string>)["x-api-key"].length > 0, true); }
});
Deno.test("o resultado nunca contém a chave", async () => {
  const r = await testGatewayConnection("leonapay", "sandbox", "SEGREDO-123", mk(200, []));
  assert(!JSON.stringify(r).includes("SEGREDO-123"));
});
Deno.test("máscara e disponibilidade por moeda", () => {
  assertEquals(maskSecret("abcd"), "••••••••abcd");
  assertEquals(maskSecret(null), null);
  assertEquals(methodsFor("colocapay", "MXN").map((m) => m.method), ["SPEI"]);
  assertEquals(methodsFor("leonapay", "COP"), []);
});
