// deno test --allow-import meta-webhook-signature.test.ts

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { computeHmacSha256Hex, timingSafeEqualHex, verifyMetaWebhookSignature } from "./meta-webhook-signature.ts";

const SECRET = "test-app-secret";
const BODY = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

Deno.test("assinatura correta é aceita", async () => {
  const hex = await computeHmacSha256Hex(BODY, SECRET);
  const result = await verifyMetaWebhookSignature(BODY, `sha256=${hex}`, SECRET);
  assertEquals(result, { valid: true });
});

Deno.test("assinatura ausente é rejeitada", async () => {
  const result = await verifyMetaWebhookSignature(BODY, null, SECRET);
  assertEquals(result.valid, false);
  assertEquals(result.reason, "missing_header");
});

Deno.test("header sem prefixo sha256= é rejeitado", async () => {
  const hex = await computeHmacSha256Hex(BODY, SECRET);
  const result = await verifyMetaWebhookSignature(BODY, hex, SECRET);
  assertEquals(result.valid, false);
  assertEquals(result.reason, "malformed_header");
});

Deno.test("assinatura de outro corpo é rejeitada (corpo re-serializado quebra a validação)", async () => {
  const hex = await computeHmacSha256Hex(BODY, SECRET);
  const bodyReserialized = JSON.stringify(JSON.parse(BODY)); // mesmo conteúdo lógico, bytes podem diferir
  const tamperedBody = BODY + " "; // simula qualquer alteração de byte
  const result = await verifyMetaWebhookSignature(tamperedBody, `sha256=${hex}`, SECRET);
  assertEquals(result.valid, false);
  assertEquals(result.reason, "mismatch");
  // nota: valida especificamente que qualquer diferença de bytes quebra a
  // assinatura, mesmo que o JSON "signifique" a mesma coisa.
  void bodyReserialized;
});

Deno.test("segredo errado é rejeitado", async () => {
  const hex = await computeHmacSha256Hex(BODY, SECRET);
  const result = await verifyMetaWebhookSignature(BODY, `sha256=${hex}`, "outro-segredo");
  assertEquals(result.valid, false);
  assertEquals(result.reason, "mismatch");
});

Deno.test("app secret ausente é rejeitado antes de qualquer cálculo", async () => {
  const result = await verifyMetaWebhookSignature(BODY, "sha256=deadbeef", undefined);
  assertEquals(result.valid, false);
  assertEquals(result.reason, "missing_secret");
});

Deno.test("hex com tamanho errado é rejeitado (não tenta comparar)", async () => {
  const result = await verifyMetaWebhookSignature(BODY, "sha256=abcd", SECRET);
  assertEquals(result.valid, false);
  assertEquals(result.reason, "malformed_header");
});

Deno.test("timingSafeEqualHex: iguais retorna true, diferentes retorna false", () => {
  assertEquals(timingSafeEqualHex("aaaa", "aaaa"), true);
  assertEquals(timingSafeEqualHex("aaaa", "aaab"), false);
  assertEquals(timingSafeEqualHex("aaaa", "aaa"), false);
});
