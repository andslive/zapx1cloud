import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isChargeStale } from "./charge-block.ts";

const prev = { status: "pending" as const, gateway_account_id: "colo", method: "SPEI" as const, amount: "100.00" };

Deno.test("mesma conta, meio e valor: reaproveita", () => {
  assertEquals(isChargeStale(prev, "colo", "SPEI", "100"), false);
  assertEquals(isChargeStale(prev, "colo", "spei", "100,00"), false);
});
Deno.test("bloco reconfigurado para outra conta/meio: cobrança antiga não vale", () => {
  assertEquals(isChargeStale(prev, "leona", "OXXO", "100"), true);
  assertEquals(isChargeStale(prev, "colo", "OXXO", "100"), true);
});
Deno.test("valor diferente: cobrança antiga não vale", () => {
  assertEquals(isChargeStale(prev, "colo", "SPEI", "150"), true);
});
Deno.test("já paga ou sem cobrança anterior: nunca é descartada por configuração", () => {
  assertEquals(isChargeStale({ ...prev, status: "paid" as any }, "leona", "OXXO", "5"), false);
  assertEquals(isChargeStale(null, "colo", "SPEI", "100"), false);
});
