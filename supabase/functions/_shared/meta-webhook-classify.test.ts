// deno test --allow-import meta-webhook-classify.test.ts
//
// Correção 4 do Gate 2A.2: cobertura exaustiva dos 13 rótulos, incluindo
// `state_sync` explicitamente documentado como alias de `contact_sync`
// (não uma rota de código separada — ver comentário em
// meta-webhook-classify.ts).

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { classifyMetaWebhookEvent, isCustomerInboundLabel, type MetaWebhookEventLabel } from "./meta-webhook-classify.ts";
import type { NormalizedInboundEvent } from "./whatsapp-provider/types.ts";

function ev(overrides: Partial<NormalizedInboundEvent>): NormalizedInboundEvent {
  return { kind: "unknown", provider: "meta_cloud", automationForbidden: true, raw: {}, ...overrides };
}

Deno.test("customer_inbound: message com fromMe=false (ou ausente)", () => {
  assertEquals(classifyMetaWebhookEvent(ev({ kind: "message", fromMe: false })), "customer_inbound");
  assertEquals(classifyMetaWebhookEvent(ev({ kind: "message" })), "customer_inbound");
});

Deno.test("outbound: message com fromMe=true (defensivo — nunca produzido de fato pela normalização atual)", () => {
  assertEquals(classifyMetaWebhookEvent(ev({ kind: "message", fromMe: true })), "outbound");
});

Deno.test("smb_message_echo: kind message_echo", () => {
  assertEquals(classifyMetaWebhookEvent(ev({ kind: "message_echo" })), "smb_message_echo");
});

Deno.test("history: kind history", () => {
  assertEquals(classifyMetaWebhookEvent(ev({ kind: "history" })), "history");
});

Deno.test("contact_sync: kind contact_sync", () => {
  assertEquals(classifyMetaWebhookEvent(ev({ kind: "contact_sync" })), "contact_sync");
});

Deno.test("state_sync: NÃO é um kind real (nenhum NormalizedInboundKind mapeia para ele) — documentado como alias de contact_sync, nunca retornado por classifyMetaWebhookEvent", () => {
  // Este teste existe para tornar a correspondência explícita, conforme
  // exigido: `contact_sync`-kind é a origem tanto conceitual de
  // "contact_sync" quanto de "state_sync" — a função sempre retorna
  // "contact_sync" para esse kind, e "state_sync" nunca é alcançável.
  const label = classifyMetaWebhookEvent(ev({ kind: "contact_sync" }));
  assertEquals(label, "contact_sync");
  assertEquals(label === ("state_sync" as MetaWebhookEventLabel), false);
});

Deno.test("sent/delivered/read/failed: kind status com cada subtipo real", () => {
  assertEquals(classifyMetaWebhookEvent(ev({ kind: "status", status: "sent" })), "sent");
  assertEquals(classifyMetaWebhookEvent(ev({ kind: "status", status: "delivered" })), "delivered");
  assertEquals(classifyMetaWebhookEvent(ev({ kind: "status", status: "read" })), "read");
  assertEquals(classifyMetaWebhookEvent(ev({ kind: "status", status: "failed" })), "failed");
});

Deno.test("status com subtipo não mapeado => unknown (nunca customer_inbound)", () => {
  assertEquals(classifyMetaWebhookEvent(ev({ kind: "status", status: undefined })), "unknown");
});

Deno.test("account_update: kind account_update", () => {
  assertEquals(classifyMetaWebhookEvent(ev({ kind: "account_update" })), "account_update");
});

Deno.test("error: kind error", () => {
  assertEquals(classifyMetaWebhookEvent(ev({ kind: "error" })), "error");
});

Deno.test("unknown: kind unknown, message_delete, connection, qrcode (nenhum produzido pela Meta Cloud API) => unknown", () => {
  assertEquals(classifyMetaWebhookEvent(ev({ kind: "unknown" })), "unknown");
  assertEquals(classifyMetaWebhookEvent(ev({ kind: "message_delete" })), "unknown");
  assertEquals(classifyMetaWebhookEvent(ev({ kind: "connection" })), "unknown");
  assertEquals(classifyMetaWebhookEvent(ev({ kind: "qrcode" })), "unknown");
});

Deno.test("isCustomerInboundLabel: true SOMENTE para customer_inbound, entre os 13 rótulos", () => {
  const all: MetaWebhookEventLabel[] = [
    "customer_inbound", "outbound", "smb_message_echo", "history", "contact_sync", "state_sync",
    "sent", "delivered", "read", "failed", "account_update", "error", "unknown",
  ];
  assertEquals(all.length, 13);
  for (const label of all) {
    assertEquals(isCustomerInboundLabel(label), label === "customer_inbound");
  }
});
