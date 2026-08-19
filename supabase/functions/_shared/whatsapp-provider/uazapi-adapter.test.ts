// deno test --allow-import uazapi-adapter.test.ts
//
// Prova que o adapter UazAPI (a) chama exatamente o endpoint whatsapp-send
// já em produção, com o mesmo corpo `{organization_id, instance_id, type,
// to, payload}` que os pontos de envio reais já usam (SendBody, ver
// uazapi-send/index.ts:10-16), e (b) nunca chama nenhum endpoint da Meta.

import { assertEquals, assertRejects, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createUazapiAdapter } from "./uazapi-adapter.ts";
import { isWhatsAppProviderError } from "./errors.ts";
import type { ConnectionRef } from "./types.ts";

const CONN: ConnectionRef = { connectionId: "conn-1", organizationId: "org-a", provider: "uazapi" };

function fakeFetch(handler: (url: string, body: any) => Response): typeof fetch {
  return (async (input: any, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    return handler(url, body);
  }) as typeof fetch;
}

Deno.test("sendText chama whatsapp-send com type=text e o corpo SendBody esperado", async () => {
  let seenUrl = "";
  let seenBody: any = null;
  const fetchImpl = fakeFetch((url, body) => {
    seenUrl = url;
    seenBody = body;
    return new Response(JSON.stringify({ success: true, debug: { uazapi_response_json: { id: "msg-1" } } }), { status: 200 });
  });

  const adapter = createUazapiAdapter({ fetchImpl, supabaseUrl: "https://proj.supabase.co", supabaseServiceRoleKey: "srv-key" });
  const result = await adapter.sendText(CONN, "5511999999999", "oi");

  assertEquals(seenUrl, "https://proj.supabase.co/functions/v1/whatsapp-send");
  // Nunca chama a Meta — só o endpoint UazAPI existente.
  assertEquals(seenUrl.includes("graph.facebook.com"), false);
  assertEquals(seenBody, {
    organization_id: "org-a",
    instance_id: "conn-1",
    type: "text",
    to: "5511999999999",
    payload: { text: "oi" },
  });
  assertEquals(result.ok, true);
  assertEquals(result.providerMessageId, "msg-1");
});

Deno.test("sendMedia usa type=media", async () => {
  const fetchImpl = fakeFetch((_url, body) => {
    assertEquals(body.type, "media");
    return new Response(JSON.stringify({ success: true, debug: {} }), { status: 200 });
  });
  const adapter = createUazapiAdapter({ fetchImpl, supabaseUrl: "https://proj.supabase.co", supabaseServiceRoleKey: "k" });
  await adapter.sendMedia(CONN, "5511999999999", { url: "https://x/img.jpg", mimeType: "image/jpeg" });
});

Deno.test("falha da UazAPI (success=false) mapeia para SendResult.ok=false com errorMessage", async () => {
  const fetchImpl = fakeFetch(() =>
    new Response(JSON.stringify({ success: false, error_code: "UAZAPI_SEND_FAILED", message: "instância offline" }), { status: 400 })
  );
  const adapter = createUazapiAdapter({ fetchImpl, supabaseUrl: "https://proj.supabase.co", supabaseServiceRoleKey: "k" });
  const result = await adapter.sendText(CONN, "5511999999999", "oi");
  assertEquals(result.ok, false);
  assertEquals(result.errorCode, "UAZAPI_SEND_FAILED");
  assertEquals(result.errorMessage, "instância offline");
});

Deno.test("sendTemplate falha explicitamente (UazAPI não suporta template) — nunca finge sucesso", async () => {
  const adapter = createUazapiAdapter({});
  const err = await assertRejects(() => adapter.sendTemplate(CONN, "5511999999999", { name: "x", language: "pt_BR" }));
  if (!isWhatsAppProviderError(err)) throw new Error("esperava WhatsAppProviderError");
  assertEquals(err.code, "TEMPLATE_NOT_SUPPORTED");
});

Deno.test("downloadMedia não implementado nesta fase — falha explícita, não silenciosa", async () => {
  const adapter = createUazapiAdapter({});
  const err = await assertRejects(() => adapter.downloadMedia(CONN, "some-media-ref"));
  if (!isWhatsAppProviderError(err)) throw new Error("esperava WhatsAppProviderError");
  assertEquals(err.code, "NOT_IMPLEMENTED_FASE_2A");
  assertStringIncludes(err.message, "downloadMedia");
});

Deno.test("resposta não-JSON do whatsapp-send não quebra silenciosamente — erro tipado", async () => {
  const fetchImpl = fakeFetch(() => new Response("<html>erro</html>", { status: 500 }));
  const adapter = createUazapiAdapter({ fetchImpl, supabaseUrl: "https://proj.supabase.co", supabaseServiceRoleKey: "k" });
  const err = await assertRejects(() => adapter.sendText(CONN, "5511999999999", "oi"));
  if (!isWhatsAppProviderError(err)) throw new Error("esperava WhatsAppProviderError");
  assertEquals(err.code, "UPSTREAM_INVALID_RESPONSE");
});
