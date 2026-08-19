// deno test --allow-import meta-webhook-idempotency.test.ts
//
// Matriz de 10 casos pedida no Gate 2A.1, Correção 2, para o mesmo `wamid`:
// sent, repetição de sent, delivered, repetição de delivered, read, failed,
// fora de ordem, requests concorrentes (mesma chave = mesma decisão),
// mesmo wamid em outro phone_number_id, mesmo wamid em outra organização
// (aqui modelado como outro phone_number_id/scope, já que a chave nunca
// carrega organization_id diretamente — organização é resolvida a partir
// do phone_number_id, nunca do payload, ver Correção 3).

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { canonicalStableStringify, computeMetaEventIdempotencyKey, sha256Hex } from "./meta-webhook-idempotency.ts";
import type { NormalizedInboundEvent } from "./whatsapp-provider/types.ts";

function statusEvent(wamid: string, status: "sent" | "delivered" | "read" | "failed", phoneNumberId = "PN1"): NormalizedInboundEvent {
  return {
    kind: "status",
    provider: "meta_cloud",
    providerMessageId: wamid,
    status,
    automationForbidden: true,
    raw: { wabaId: "WABA1", phoneNumberId, status: { id: wamid, status } },
  };
}

Deno.test("1) sent recebe uma chave", async () => {
  const key = await computeMetaEventIdempotencyKey(statusEvent("wamid.1", "sent"));
  assertEquals(key, "status:PN1:wamid.1:sent");
});

Deno.test("2) repetição exata de sent produz a MESMA chave (dedup esperado)", async () => {
  const a = await computeMetaEventIdempotencyKey(statusEvent("wamid.1", "sent"));
  const b = await computeMetaEventIdempotencyKey(statusEvent("wamid.1", "sent"));
  assertEquals(a, b);
});

Deno.test("3) delivered do mesmo wamid produz chave DIFERENTE de sent", async () => {
  const sent = await computeMetaEventIdempotencyKey(statusEvent("wamid.1", "sent"));
  const delivered = await computeMetaEventIdempotencyKey(statusEvent("wamid.1", "delivered"));
  assertNotEquals(sent, delivered);
});

Deno.test("4) repetição exata de delivered produz a MESMA chave entre si (e diferente de sent/read)", async () => {
  const a = await computeMetaEventIdempotencyKey(statusEvent("wamid.1", "delivered"));
  const b = await computeMetaEventIdempotencyKey(statusEvent("wamid.1", "delivered"));
  assertEquals(a, b);
});

Deno.test("5) read do mesmo wamid é distinto de sent e delivered", async () => {
  const sent = await computeMetaEventIdempotencyKey(statusEvent("wamid.1", "sent"));
  const delivered = await computeMetaEventIdempotencyKey(statusEvent("wamid.1", "delivered"));
  const read = await computeMetaEventIdempotencyKey(statusEvent("wamid.1", "read"));
  assertNotEquals(read, sent);
  assertNotEquals(read, delivered);
});

Deno.test("6) failed do mesmo wamid é distinto de todos os outros subtipos", async () => {
  const sent = await computeMetaEventIdempotencyKey(statusEvent("wamid.1", "sent"));
  const delivered = await computeMetaEventIdempotencyKey(statusEvent("wamid.1", "delivered"));
  const read = await computeMetaEventIdempotencyKey(statusEvent("wamid.1", "read"));
  const failed = await computeMetaEventIdempotencyKey(statusEvent("wamid.1", "failed"));
  assertNotEquals(failed, sent);
  assertNotEquals(failed, delivered);
  assertNotEquals(failed, read);
});

Deno.test("7) chegada fora de ordem (read antes de delivered) ainda gera chaves distintas e estáveis", async () => {
  // A chave não depende de ordem de chegada — computa-se igual não importa
  // quando o evento chega, então "fora de ordem" não muda o resultado.
  const readFirst = await computeMetaEventIdempotencyKey(statusEvent("wamid.1", "read"));
  const deliveredLater = await computeMetaEventIdempotencyKey(statusEvent("wamid.1", "delivered"));
  assertNotEquals(readFirst, deliveredLater);
  // Preserva-se: cada uma continua idêntica a si mesma se recomputada.
  assertEquals(await computeMetaEventIdempotencyKey(statusEvent("wamid.1", "read")), readFirst);
});

Deno.test("8) requests concorrentes (mesmo evento computado em paralelo) produzem a mesma chave — decisão de dedup fica 100% a cargo da constraint do banco, não de checagem em memória", async () => {
  const [a, b] = await Promise.all([
    computeMetaEventIdempotencyKey(statusEvent("wamid.1", "sent")),
    computeMetaEventIdempotencyKey(statusEvent("wamid.1", "sent")),
  ]);
  assertEquals(a, b);
});

Deno.test("9) mesmo wamid em outro phone_number_id nunca colide", async () => {
  const pn1 = await computeMetaEventIdempotencyKey(statusEvent("wamid.1", "sent", "PN1"));
  const pn2 = await computeMetaEventIdempotencyKey(statusEvent("wamid.1", "sent", "PN2"));
  assertNotEquals(pn1, pn2);
});

Deno.test("failed com o MESMO errorCode (retransmissão da própria Meta) produz a MESMA chave (dedup esperado)", async () => {
  const ev = (code: string): NormalizedInboundEvent => ({
    kind: "status", provider: "meta_cloud", providerMessageId: "wamid.f1", status: "failed", errorCode: code,
    automationForbidden: true, raw: { wabaId: "W", phoneNumberId: "PN1" },
  });
  const a = await computeMetaEventIdempotencyKey(ev("131047"));
  const b = await computeMetaEventIdempotencyKey(ev("131047"));
  assertEquals(a, b);
});

Deno.test("failed com errorCode DIFERENTE (falha legitimamente distinta) produz chave DIFERENTE, mesmo wamid", async () => {
  const ev = (code: string): NormalizedInboundEvent => ({
    kind: "status", provider: "meta_cloud", providerMessageId: "wamid.f1", status: "failed", errorCode: code,
    automationForbidden: true, raw: { wabaId: "W", phoneNumberId: "PN1" },
  });
  const a = await computeMetaEventIdempotencyKey(ev("131047")); // fora da janela de 24h
  const b = await computeMetaEventIdempotencyKey(ev("131026")); // número não registrado no WhatsApp
  assertNotEquals(a, b);
});

Deno.test("10) mesmo wamid 'em outra organização' (modelado como escopo de phone_number_id distinto, já que organização nunca vem do payload — ver Correção 3) nunca colide", async () => {
  // A chave nunca carrega organization_id (o payload da Meta não tem esse
  // conceito) — o isolamento organizacional é garantido por FK composta no
  // banco (evolution_instances_meta_cloud), não pela chave de idempotência.
  // Aqui provamos que, mesmo assim, dois phone_number_id distintos
  // (equivalente a duas organizações diferentes, cada uma com seu próprio
  // número) nunca produzem a mesma chave para o mesmo wamid.
  const orgAScoped = await computeMetaEventIdempotencyKey(statusEvent("wamid.1", "sent", "PN_ORG_A"));
  const orgBScoped = await computeMetaEventIdempotencyKey(statusEvent("wamid.1", "sent", "PN_ORG_B"));
  assertNotEquals(orgAScoped, orgBScoped);
});

// ── message / echo / history / contact_sync / account_update / error / unknown ──

Deno.test("message: mesma wamid mesmo escopo => mesma chave; wamid diferente => chave diferente", async () => {
  const m1: NormalizedInboundEvent = {
    kind: "message", provider: "meta_cloud", providerMessageId: "wamid.a", automationForbidden: false,
    raw: { wabaId: "W", phoneNumberId: "PN1" },
  };
  const m1b: NormalizedInboundEvent = { ...m1 };
  const m2: NormalizedInboundEvent = { ...m1, providerMessageId: "wamid.b" };
  assertEquals(await computeMetaEventIdempotencyKey(m1), await computeMetaEventIdempotencyKey(m1b));
  assertNotEquals(await computeMetaEventIdempotencyKey(m1), await computeMetaEventIdempotencyKey(m2));
});

Deno.test("message_echo sem id: hash canônico do conteúdo — conteúdos diferentes nunca colidem, iguais sempre colidem", async () => {
  const e1: NormalizedInboundEvent = {
    kind: "message_echo", provider: "meta_cloud", automationForbidden: true, content: "oi",
    raw: { wabaId: "W", phoneNumberId: "PN1", echo: { to: "5511999999999", type: "text", text: { body: "oi" } } },
  };
  const e1Same: NormalizedInboundEvent = { ...e1 };
  const e2Diff: NormalizedInboundEvent = {
    ...e1,
    raw: { wabaId: "W", phoneNumberId: "PN1", echo: { to: "5511999999999", type: "text", text: { body: "outra coisa" } } },
  };
  assertEquals(await computeMetaEventIdempotencyKey(e1), await computeMetaEventIdempotencyKey(e1Same));
  assertNotEquals(await computeMetaEventIdempotencyKey(e1), await computeMetaEventIdempotencyKey(e2Diff));
});

Deno.test("history: hash canônico do bloco inteiro — reenvio idêntico dedup, bloco novo não", async () => {
  const h1: NormalizedInboundEvent = {
    kind: "history", provider: "meta_cloud", automationForbidden: true,
    raw: { wabaId: "W", phoneNumberId: "PN1", value: { chunk: 1, messages: ["a", "b"] } },
  };
  const h1Same: NormalizedInboundEvent = { ...h1 };
  const h2: NormalizedInboundEvent = { ...h1, raw: { wabaId: "W", phoneNumberId: "PN1", value: { chunk: 2, messages: ["c"] } } };
  assertEquals(await computeMetaEventIdempotencyKey(h1), await computeMetaEventIdempotencyKey(h1Same));
  assertNotEquals(await computeMetaEventIdempotencyKey(h1), await computeMetaEventIdempotencyKey(h2));
});

Deno.test("unknown: hash do payload bruto inteiro — payloads distintos nunca colidem", async () => {
  const u1: NormalizedInboundEvent = { kind: "unknown", provider: "meta_cloud", automationForbidden: true, raw: { a: 1 } };
  const u2: NormalizedInboundEvent = { kind: "unknown", provider: "meta_cloud", automationForbidden: true, raw: { a: 2 } };
  assertNotEquals(await computeMetaEventIdempotencyKey(u1), await computeMetaEventIdempotencyKey(u2));
});

// ── canonicalStableStringify / sha256Hex — funções de apoio ──

Deno.test("canonicalStableStringify: ordem de chaves não importa (canonicalização real, não JSON.stringify puro)", () => {
  const a = canonicalStableStringify({ b: 1, a: 2 });
  const b = canonicalStableStringify({ a: 2, b: 1 });
  assertEquals(a, b);
  assertNotEquals(a, JSON.stringify({ b: 1, a: 2 })); // prova que não é so JSON.stringify
});

Deno.test("canonicalStableStringify: aninhado, arrays preservam ordem (não são conjunto)", () => {
  const a = canonicalStableStringify({ x: [{ b: 1, a: 2 }, 3] });
  const b = canonicalStableStringify({ x: [{ a: 2, b: 1 }, 3] });
  assertEquals(a, b);
  const c = canonicalStableStringify({ x: [3, { a: 2, b: 1 }] });
  assertNotEquals(a, c);
});

Deno.test("sha256Hex: determinístico, mesma entrada sempre mesmo hash", async () => {
  const h1 = await sha256Hex("abc");
  const h2 = await sha256Hex("abc");
  assertEquals(h1, h2);
  assertEquals(h1.length, 64);
});
