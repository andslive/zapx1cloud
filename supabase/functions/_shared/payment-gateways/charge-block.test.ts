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

import { aliasDomain, aliasSeqFor } from "./charge-block.ts";
import { buildAliasEmail, resolvePayerEmail } from "./payer-data.ts";

Deno.test("e-mail aleatório: domínio válido/padrão e sufixo estável por execução", () => {
  assertEquals(aliasDomain("@Minha-Loja.com.br"), "minha-loja.com.br");
  assertEquals(aliasDomain(""), "example.com");
  assertEquals(aliasDomain("sem dominio"), "example.com");
  assertEquals(aliasSeqFor("c1:b:1"), aliasSeqFor("c1:b:1"));
  const cfg = { enabled: true, providerAcceptsAlias: true, domain: "example.com" };
  const r = resolvePayerEmail({ leadEmail: null, name: "Anderson Silva", seq: aliasSeqFor("c1:b:1"), alias: cfg });
  assertEquals(r?.source, "alias");
  assertEquals(/^andersonsilva\d{4}@example\.com$/.test(r!.email), true);
  // e-mail do lead tem prioridade
  assertEquals(resolvePayerEmail({ leadEmail: "a@b.com", name: "X Y", seq: 1, alias: cfg })?.source, "lead");
  assertEquals(buildAliasEmail("Ana", 7, cfg), "ana0007@example.com");
});
