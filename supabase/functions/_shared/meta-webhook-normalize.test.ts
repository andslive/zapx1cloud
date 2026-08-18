// deno test --allow-import meta-webhook-normalize.test.ts
//
// Cobre a regra central: apenas `kind: "message"` tem `automationForbidden
// === false`. Tudo mais (status, echo, history, contact_sync,
// account_update, error, unknown) é `automationForbidden === true` —
// prova de que status não vira mensagem, echo não vira inbound, history
// não inicia automação, sync não cria lead/dispara funil.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { normalizeMetaWebhookChange, normalizeMetaWebhookPayload } from "./meta-webhook-normalize.ts";

function entryPayload(changes: Array<{ field: string; value: unknown }>, wabaId = "waba-123") {
  return { object: "whatsapp_business_account", entry: [{ id: wabaId, changes }] };
}

Deno.test("mensagem inbound real: kind=message, automationForbidden=false", () => {
  const events = normalizeMetaWebhookChange(
    { field: "messages", value: { messages: [{ id: "wamid.1", from: "5511999999999", type: "text", text: { body: "oi" } }] } },
    "waba-123",
  );
  assertEquals(events.length, 1);
  assertEquals(events[0].kind, "message");
  assertEquals(events[0].automationForbidden, false);
  assertEquals(events[0].providerMessageId, "wamid.1");
  assertEquals(events[0].content, "oi");
  assertEquals(events[0].fromMe, false);
});

Deno.test("status (sent/delivered/read/failed) NUNCA vira mensagem", () => {
  for (const status of ["sent", "delivered", "read", "failed"]) {
    const events = normalizeMetaWebhookChange(
      { field: "messages", value: { statuses: [{ id: "wamid.2", status, recipient_id: "5511999999999" }] } },
      "waba-123",
    );
    assertEquals(events.length, 1);
    assertEquals(events[0].kind, "status");
    assertEquals(events[0].automationForbidden, true);
    assertEquals(events[0].status, status);
  }
});

Deno.test("errors: kind=error, automationForbidden=true, preserva code/message", () => {
  const events = normalizeMetaWebhookChange(
    { field: "messages", value: { errors: [{ code: 131060, message: "primeira mensagem" }] } },
    "waba-123",
  );
  assertEquals(events[0].kind, "error");
  assertEquals(events[0].automationForbidden, true);
  assertEquals(events[0].errorCode, "131060");
});

Deno.test("smb_message_echoes: kind=message_echo, fromMe=true, automationForbidden=true (nunca vira inbound)", () => {
  const events = normalizeMetaWebhookChange(
    { field: "smb_message_echoes", value: { message_echoes: [{ id: "wamid.3", to: "5511999999999", type: "text", text: { body: "resposta do dono pelo app" } }] } },
    "waba-123",
  );
  assertEquals(events.length, 1);
  assertEquals(events[0].kind, "message_echo");
  assertEquals(events[0].fromMe, true);
  assertEquals(events[0].automationForbidden, true);
});

Deno.test("history: kind=history, automationForbidden=true (nunca inicia automação)", () => {
  const events = normalizeMetaWebhookChange({ field: "history", value: { some: "history-payload" } }, "waba-123");
  assertEquals(events[0].kind, "history");
  assertEquals(events[0].automationForbidden, true);
});

Deno.test("smb_app_state_sync: kind=contact_sync, automationForbidden=true (nunca cria lead ativo/dispara funil)", () => {
  const events = normalizeMetaWebhookChange({ field: "smb_app_state_sync", value: { contacts: [{ phone: "5511999999999" }] } }, "waba-123");
  assertEquals(events[0].kind, "contact_sync");
  assertEquals(events[0].automationForbidden, true);
});

Deno.test("account_update: kind=account_update, automationForbidden=true", () => {
  const events = normalizeMetaWebhookChange({ field: "account_update", value: { event: "PARTNER_REMOVED" } }, "waba-123");
  assertEquals(events[0].kind, "account_update");
  assertEquals(events[0].automationForbidden, true);
});

Deno.test("campo desconhecido/futuro: kind=unknown, automationForbidden=true (falha fechado por padrão)", () => {
  const events = normalizeMetaWebhookChange({ field: "algum_campo_novo_da_meta_2027", value: { x: 1 } }, "waba-123");
  assertEquals(events[0].kind, "unknown");
  assertEquals(events[0].automationForbidden, true);
});

Deno.test("payload malformado nunca lança exceção — vira unknown com raw anexado", () => {
  const events = normalizeMetaWebhookPayload({ nada_a_ver: true });
  assertEquals(events.length, 1);
  assertEquals(events[0].kind, "unknown");
  assertEquals(events[0].automationForbidden, true);
});

Deno.test("payload completo (entry/changes) com múltiplos eventos no mesmo change", () => {
  const payload = entryPayload([
    {
      field: "messages",
      value: {
        messages: [{ id: "wamid.a", from: "5511111111111", type: "text", text: { body: "oi" } }],
        statuses: [{ id: "wamid.b", status: "delivered" }],
      },
    },
  ]);
  const events = normalizeMetaWebhookPayload(payload);
  assertEquals(events.length, 2);
  assertEquals(events.map((e) => e.kind).sort(), ["message", "status"]);
});

Deno.test("mídia inbound: extrai mimeType/fileName/caption, url referencia media_id (não é URL real)", () => {
  const events = normalizeMetaWebhookChange(
    {
      field: "messages",
      value: {
        messages: [{
          id: "wamid.media",
          from: "5511999999999",
          type: "image",
          image: { id: "media-id-123", mime_type: "image/jpeg", caption: "comprovante" },
        }],
      },
    },
    "waba-123",
  );
  assertEquals(events[0].media?.mimeType, "image/jpeg");
  assertEquals(events[0].media?.caption, "comprovante");
  assertEquals(events[0].media?.url, "meta-media-id:media-id-123");
});
