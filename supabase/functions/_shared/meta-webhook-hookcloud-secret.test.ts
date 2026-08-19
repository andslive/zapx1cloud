// deno test --allow-import meta-webhook-hookcloud-secret.test.ts
//
// Fase 11A — hash/comparação do segredo opaco de callback HookCloud.
// Prova: valor correto aceito, incorreto/ausente rejeitado, GET
// verify_token nunca é aceito como substituto (este módulo nem sabe o que
// é hub.verify_token), e nenhuma chamada aqui loga o segredo bruto.

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  hashHookCloudWebhookSecret,
  hasMinimumHookCloudSecretEntropy,
  MIN_HOOKCLOUD_SECRET_HEX_LENGTH,
  verifyHookCloudWebhookSecret,
} from "./meta-webhook-hookcloud-secret.ts";

Deno.test("hash é determinístico para a mesma entrada", async () => {
  const h1 = await hashHookCloudWebhookSecret("segredo-de-teste");
  const h2 = await hashHookCloudWebhookSecret("segredo-de-teste");
  assertEquals(h1, h2);
});

Deno.test("hashes de segredos diferentes são diferentes", async () => {
  const h1 = await hashHookCloudWebhookSecret("segredo-A");
  const h2 = await hashHookCloudWebhookSecret("segredo-B");
  assert(h1 !== h2);
});

Deno.test("segredo correto (mesmo hash) é aceito", async () => {
  const raw = "segredo-correto-de-64-caracteres-hex-simulado-para-o-teste-aqui";
  const hash = await hashHookCloudWebhookSecret(raw);
  assertEquals(await verifyHookCloudWebhookSecret(raw, hash), true);
});

Deno.test("segredo incorreto é rejeitado", async () => {
  const hash = await hashHookCloudWebhookSecret("segredo-real");
  assertEquals(await verifyHookCloudWebhookSecret("segredo-errado", hash), false);
});

Deno.test("segredo ausente na requisição é rejeitado, mesmo com hash configurado", async () => {
  const hash = await hashHookCloudWebhookSecret("segredo-real");
  assertEquals(await verifyHookCloudWebhookSecret(null, hash), false);
  assertEquals(await verifyHookCloudWebhookSecret(undefined, hash), false);
  assertEquals(await verifyHookCloudWebhookSecret("", hash), false);
});

Deno.test("hash ausente (conexão sem segredo configurado / revogado) sempre rejeita, mesmo com um valor 'plausível' enviado", async () => {
  assertEquals(await verifyHookCloudWebhookSecret("qualquer-coisa", null), false);
  assertEquals(await verifyHookCloudWebhookSecret("qualquer-coisa", undefined), false);
  assertEquals(await verifyHookCloudWebhookSecret("qualquer-coisa", ""), false);
});

Deno.test("entropia mínima: hex de 64 caracteres (256 bits) é aceito, mais curto é rejeitado", () => {
  assertEquals(MIN_HOOKCLOUD_SECRET_HEX_LENGTH, 64);
  assert(hasMinimumHookCloudSecretEntropy(64));
  assert(hasMinimumHookCloudSecretEntropy(128));
  assert(!hasMinimumHookCloudSecretEntropy(32));
  assert(!hasMinimumHookCloudSecretEntropy(0));
});

Deno.test("verificação nunca chama console.* — o segredo bruto nunca é logado por este módulo", async () => {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  let called = false;
  console.log = () => { called = true; };
  console.error = () => { called = true; };
  console.warn = () => { called = true; };
  try {
    const hash = await hashHookCloudWebhookSecret("segredo-super-secreto-nao-pode-vazar-em-log");
    await verifyHookCloudWebhookSecret("valor-errado-tambem-nao-pode-vazar", hash);
    await verifyHookCloudWebhookSecret(null, hash);
  } finally {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  }
  assertEquals(called, false, "nenhuma função deste módulo deve chamar console.* em nenhuma circunstância");
});
