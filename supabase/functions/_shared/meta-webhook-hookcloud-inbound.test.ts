// deno test --allow-import meta-webhook-hookcloud-inbound.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildHookCloudQuarantineRecord,
  extractEventTimestampSeconds,
  isValidMetaWebhookPayloadShape,
  peekUntrustedWebhookIdentifiers,
} from "./meta-webhook-hookcloud-inbound.ts";

function samplePayload(overrides: Record<string, unknown> = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "WABA1",
      changes: [{
        field: "messages",
        value: {
          metadata: { phone_number_id: "PN1" },
          messages: [{ id: "wamid.1", from: "5511999999999", type: "text", text: { body: "conteudo sensivel" }, timestamp: "1800000000" }],
        },
      }],
    }],
    ...overrides,
  };
}

Deno.test("peek: extrai entryId e phoneNumberId de um payload válido", () => {
  assertEquals(peekUntrustedWebhookIdentifiers(samplePayload()), { entryId: "WABA1", phoneNumberId: "PN1" });
});

Deno.test("peek: payload sem entry retorna ambos null", () => {
  assertEquals(peekUntrustedWebhookIdentifiers({ object: "whatsapp_business_account", entry: [] }), {
    entryId: null,
    phoneNumberId: null,
  });
});

Deno.test("peek: payload malformado/não-objeto nunca lança exceção", () => {
  assertEquals(peekUntrustedWebhookIdentifiers(null), { entryId: null, phoneNumberId: null });
  assertEquals(peekUntrustedWebhookIdentifiers("string"), { entryId: null, phoneNumberId: null });
  assertEquals(peekUntrustedWebhookIdentifiers(42), { entryId: null, phoneNumberId: null });
  assertEquals(peekUntrustedWebhookIdentifiers(undefined), { entryId: null, phoneNumberId: null });
});

Deno.test("peek: entry.id não-string ou phone_number_id não-string vira null (nunca coerção)", () => {
  const p = { object: "whatsapp_business_account", entry: [{ id: 123, changes: [{ value: { metadata: { phone_number_id: 456 } } }] }] };
  assertEquals(peekUntrustedWebhookIdentifiers(p), { entryId: null, phoneNumberId: null });
});

Deno.test("schema: payload válido é aceito", () => {
  assert(isValidMetaWebhookPayloadShape(samplePayload()));
});

Deno.test("schema: object diferente de whatsapp_business_account é rejeitado", () => {
  assert(!isValidMetaWebhookPayloadShape(samplePayload({ object: "outra_coisa" })));
});

Deno.test("schema: entry ausente/vazio/não-array é rejeitado", () => {
  assert(!isValidMetaWebhookPayloadShape({ object: "whatsapp_business_account" }));
  assert(!isValidMetaWebhookPayloadShape({ object: "whatsapp_business_account", entry: [] }));
  assert(!isValidMetaWebhookPayloadShape({ object: "whatsapp_business_account", entry: "nao-e-array" }));
});

Deno.test("schema: entry[0].id ausente ou changes ausente é rejeitado", () => {
  assert(!isValidMetaWebhookPayloadShape({ object: "whatsapp_business_account", entry: [{ changes: [] }] }));
  assert(!isValidMetaWebhookPayloadShape({ object: "whatsapp_business_account", entry: [{ id: "W1" }] }));
});

Deno.test("schema: não-objeto (null, string, array, número) é rejeitado", () => {
  assert(!isValidMetaWebhookPayloadShape(null));
  assert(!isValidMetaWebhookPayloadShape("x"));
  assert(!isValidMetaWebhookPayloadShape([]));
  assert(!isValidMetaWebhookPayloadShape(42));
});

Deno.test("timestamp: extrai de messages[0].timestamp (string) como número", () => {
  assertEquals(extractEventTimestampSeconds(samplePayload()), 1_800_000_000);
});

Deno.test("timestamp: extrai de statuses[0].timestamp quando não há messages", () => {
  const p = {
    object: "whatsapp_business_account",
    entry: [{ id: "W1", changes: [{ value: { metadata: { phone_number_id: "PN1" }, statuses: [{ timestamp: "1750000000" }] } }] }],
  };
  assertEquals(extractEventTimestampSeconds(p), 1_750_000_000);
});

Deno.test("timestamp: ausente retorna null (nunca assume 'agora')", () => {
  const p = { object: "whatsapp_business_account", entry: [{ id: "W1", changes: [{ value: { metadata: {} } }] }] };
  assertEquals(extractEventTimestampSeconds(p), null);
});

Deno.test("timestamp: valor inválido (não-numérico, negativo, zero) retorna null", () => {
  const mk = (ts: unknown) => ({
    object: "whatsapp_business_account",
    entry: [{ id: "W1", changes: [{ value: { metadata: {}, messages: [{ timestamp: ts }] } }] }],
  });
  assertEquals(extractEventTimestampSeconds(mk("nao-e-numero")), null);
  assertEquals(extractEventTimestampSeconds(mk(-5)), null);
  assertEquals(extractEventTimestampSeconds(mk(0)), null);
});

Deno.test("registro de quarentena: nunca inclui telefone, conteúdo de mensagem, token ou payload bruto completo", () => {
  const record = buildHookCloudQuarantineRecord({
    connectionId: "conn-1",
    organizationId: "org-a",
    provider: "meta_cloud",
    onboardingSource: "hookcloud",
    eventKind: "message",
    wabaId: "WABA1",
    phoneNumberId: "PN1",
    reasonCode: "OK",
  });
  const serialized = JSON.stringify(record);
  assert(!serialized.includes("5511999999999"), "não deve conter telefone do lead");
  assert(!serialized.includes("conteudo sensivel"), "não deve conter corpo de mensagem");
  assert(!serialized.toLowerCase().includes("token"), "não deve conter token");
  const keys = Object.keys(record).sort();
  assertEquals(keys, [
    "connection_id",
    "event_kind",
    "onboarding_source",
    "organization_id",
    "phone_number_id",
    "provider",
    "quarantine",
    "reason",
    "waba_id",
  ]);
});
