// deno test --allow-import meta-webhook-hookcloud-secret.test.ts
//
// Fase 11A — hash/comparação do segredo opaco de callback HookCloud.
// Prova: valor correto aceito, incorreto/ausente rejeitado, GET
// verify_token nunca é aceito como substituto (este módulo nem sabe o que
// é hub.verify_token), e nenhuma chamada aqui loga o segredo bruto.

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  generateHookCloudCallbackSecret,
  generateHookCloudVerifyToken,
  hashHookCloudVerifyToken,
  hashHookCloudWebhookSecret,
  hasMinimumHookCloudSecretEntropy,
  MIN_HOOKCLOUD_SECRET_HEX_LENGTH,
  verifyHookCloudVerifyToken,
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

// ─── FASE 13A — geração CSPRNG do segredo bruto (provisionamento) ───────

Deno.test("generateHookCloudCallbackSecret: CSPRNG gera segredos distintos a cada chamada", () => {
  const a = generateHookCloudCallbackSecret();
  const b = generateHookCloudCallbackSecret();
  assert(a !== b, "duas gerações consecutivas nunca devem coincidir");
});

Deno.test("generateHookCloudCallbackSecret: formato e entropia — 64 caracteres hex (256 bits), sempre válido pelo mínimo já exigido", () => {
  const secret = generateHookCloudCallbackSecret();
  assertEquals(secret.length, MIN_HOOKCLOUD_SECRET_HEX_LENGTH);
  assert(/^[0-9a-f]{64}$/.test(secret), "deve ser hex minúsculo puro — URL-safe por construção");
  assert(hasMinimumHookCloudSecretEntropy(secret.length));
});

Deno.test("generateHookCloudCallbackSecret: 100 gerações consecutivas nunca colidem (checagem estatística leve de CSPRNG)", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 100; i++) seen.add(generateHookCloudCallbackSecret());
  assertEquals(seen.size, 100);
});

Deno.test("generateHookCloudCallbackSecret: o valor gerado é aceito pelo verificador quando hasheado corretamente (compatível com o gate existente)", async () => {
  const raw = generateHookCloudCallbackSecret();
  const hash = await hashHookCloudWebhookSecret(raw);
  assertEquals(await verifyHookCloudWebhookSecret(raw, hash), true);
});

// ─── FASE 14A — verify token individual por conexão (GET) ───────────────
// Segredo INDEPENDENTE do callback secret — mesmo formato, gerado por uma
// chamada separada a crypto.getRandomValues, nunca derivado/reaproveitado
// do callback secret. Autentica exclusivamente o GET, nunca o POST.

Deno.test("generateHookCloudVerifyToken: formato e entropia — 64 caracteres hex (256 bits)", () => {
  const token = generateHookCloudVerifyToken();
  assertEquals(token.length, MIN_HOOKCLOUD_SECRET_HEX_LENGTH);
  assert(/^[0-9a-f]{64}$/.test(token), "deve ser hex minúsculo puro — URL-safe por construção");
});

Deno.test("generateHookCloudVerifyToken: CSPRNG gera valores distintos a cada chamada", () => {
  const a = generateHookCloudVerifyToken();
  const b = generateHookCloudVerifyToken();
  assert(a !== b);
});

Deno.test("generateHookCloudVerifyToken: 100 gerações consecutivas nunca colidem", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 100; i++) seen.add(generateHookCloudVerifyToken());
  assertEquals(seen.size, 100);
});

Deno.test("callback secret e verify token gerados juntos NUNCA coincidem (independência real, não só nominal)", () => {
  for (let i = 0; i < 50; i++) {
    const callbackSecret = generateHookCloudCallbackSecret();
    const verifyToken = generateHookCloudVerifyToken();
    assert(callbackSecret !== verifyToken, "os dois segredos nunca podem ter o mesmo valor bruto");
  }
});

Deno.test("verify token correto (mesmo hash) é aceito; incorreto é rejeitado", async () => {
  const raw = generateHookCloudVerifyToken();
  const hash = await hashHookCloudVerifyToken(raw);
  assertEquals(await verifyHookCloudVerifyToken(raw, hash), true);
  assertEquals(await verifyHookCloudVerifyToken("valor-errado", hash), false);
});

Deno.test("verify token: ausente na requisição ou hash ausente sempre rejeita", async () => {
  const hash = await hashHookCloudVerifyToken("verify-token-real");
  assertEquals(await verifyHookCloudVerifyToken(null, hash), false);
  assertEquals(await verifyHookCloudVerifyToken(undefined, hash), false);
  assertEquals(await verifyHookCloudVerifyToken("", hash), false);
  assertEquals(await verifyHookCloudVerifyToken("qualquer-coisa", null), false);
  assertEquals(await verifyHookCloudVerifyToken("qualquer-coisa", undefined), false);
  assertEquals(await verifyHookCloudVerifyToken("qualquer-coisa", ""), false);
});

Deno.test("verify token: o callback secret NUNCA é aceito no lugar do verify token, e vice-versa (segredos não intercambiáveis)", async () => {
  const callbackSecret = generateHookCloudCallbackSecret();
  const verifyToken = generateHookCloudVerifyToken();
  const callbackHash = await hashHookCloudWebhookSecret(callbackSecret);
  const verifyTokenHash = await hashHookCloudVerifyToken(verifyToken);

  // O callback secret bruto não é aceito contra o hash do verify token.
  assertEquals(await verifyHookCloudVerifyToken(callbackSecret, verifyTokenHash), false);
  // O verify token bruto não é aceito contra o hash do callback secret.
  assertEquals(await verifyHookCloudWebhookSecret(verifyToken, callbackHash), false);
});

Deno.test("verify token: nenhuma função deste módulo chama console.* — o valor bruto nunca é logado", async () => {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  let called = false;
  console.log = () => { called = true; };
  console.error = () => { called = true; };
  console.warn = () => { called = true; };
  try {
    const raw = generateHookCloudVerifyToken();
    const hash = await hashHookCloudVerifyToken(raw);
    await verifyHookCloudVerifyToken(raw, hash);
    await verifyHookCloudVerifyToken("errado", hash);
  } finally {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  }
  assertEquals(called, false, "nenhuma função deste módulo deve chamar console.* em nenhuma circunstância");
});
