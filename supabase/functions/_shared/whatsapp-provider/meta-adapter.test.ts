// deno test --allow-import --allow-env meta-adapter.test.ts
// (--allow-env: resolveGraphApiVersion() lê Deno.env quando a versão não é
// injetada explicitamente — nenhum secret é lido.)
//
// Prova: (a) sem accessTokenProvider, falha explícita com
// MISSING_CREDENTIALS antes de qualquer request de rede; (b) conexão sem
// linha em evolution_instances_meta_cloud falha com PROVIDER_NOT_CONFIGURED;
// (c) onboarding_state != 'active' também falha, nunca tenta enviar;
// (d) quando configurado corretamente, chama SOMENTE graph.facebook.com,
// nunca whatsapp-send/uazapi-send;
// (e) FASE 10A — onboarding_source ('hookcloud' | 'direct_meta' | ausente)
// nunca muda qual adapter é usado (é sempre este MetaAdapter) e um valor
// desconhecido falha fechado, sem fallback de provider.

import { assertEquals, assertRejects } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createMetaCloudAdapter } from "./meta-adapter.ts";
import { isWhatsAppProviderError } from "./errors.ts";
import type { ConnectionRef } from "./types.ts";
import type { SupabaseLike } from "./resolve.ts";

const CONN: ConnectionRef = { connectionId: "conn-1", organizationId: "org-a", provider: "meta_cloud" };

function fakeSupabase(
  row: { phone_number_id: string; waba_id: string; onboarding_state: string; onboarding_source?: string | null } | null,
): SupabaseLike {
  return {
    from(_table: string) {
      return {
        select(_columns: string) {
          return {
            eq(_column: string, _value: unknown) {
              return { maybeSingle: async () => ({ data: row, error: null }) };
            },
          };
        },
      };
    },
  } as unknown as SupabaseLike;
}

function fakeFetch(handler: (url: string) => Response): typeof fetch {
  return (async (input: any) => handler(typeof input === "string" ? input : input.toString())) as typeof fetch;
}

Deno.test("sem accessTokenProvider: MISSING_CREDENTIALS, nenhuma chamada de rede é feita", async () => {
  let fetchCalled = false;
  const fetchImpl = fakeFetch(() => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  });
  const supabase = fakeSupabase({ phone_number_id: "PN1", waba_id: "WABA1", onboarding_state: "active" });
  const adapter = createMetaCloudAdapter(supabase, { fetchImpl });

  const err = await assertRejects(() => adapter.sendText(CONN, "5511999999999", "oi"));
  if (!isWhatsAppProviderError(err)) throw new Error("esperava WhatsAppProviderError");
  assertEquals(err.code, "MISSING_CREDENTIALS");
  assertEquals(fetchCalled, false);
});

Deno.test("conexão sem linha em evolution_instances_meta_cloud: PROVIDER_NOT_CONFIGURED", async () => {
  const supabase = fakeSupabase(null);
  const adapter = createMetaCloudAdapter(supabase, { accessTokenProvider: { getAccessToken: async () => "tok" } });
  const err = await assertRejects(() => adapter.sendText(CONN, "5511999999999", "oi"));
  if (!isWhatsAppProviderError(err)) throw new Error("esperava WhatsAppProviderError");
  assertEquals(err.code, "PROVIDER_NOT_CONFIGURED");
});

Deno.test("onboarding_state != 'active': PROVIDER_NOT_CONFIGURED, nunca tenta enviar", async () => {
  const supabase = fakeSupabase({ phone_number_id: "PN1", waba_id: "WABA1", onboarding_state: "pending" });
  let fetchCalled = false;
  const fetchImpl = fakeFetch(() => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  });
  const adapter = createMetaCloudAdapter(supabase, { fetchImpl, accessTokenProvider: { getAccessToken: async () => "tok" } });
  const err = await assertRejects(() => adapter.sendText(CONN, "5511999999999", "oi"));
  if (!isWhatsAppProviderError(err)) throw new Error("esperava WhatsAppProviderError");
  assertEquals(err.code, "PROVIDER_NOT_CONFIGURED");
  assertEquals(fetchCalled, false);
});

Deno.test("configurado corretamente: chama somente graph.facebook.com, nunca whatsapp-send/uazapi-send", async () => {
  const urlsSeen: string[] = [];
  const fetchImpl = fakeFetch((url) => {
    urlsSeen.push(url);
    return new Response(JSON.stringify({ messages: [{ id: "wamid.ABC" }] }), { status: 200 });
  });
  const supabase = fakeSupabase({ phone_number_id: "PN1", waba_id: "WABA1", onboarding_state: "active" });
  const adapter = createMetaCloudAdapter(supabase, {
    fetchImpl,
    graphApiVersion: "v26.0",
    accessTokenProvider: { getAccessToken: async () => "tok-secreto" },
  });

  const result = await adapter.sendText(CONN, "5511999999999", "oi");

  assertEquals(result.ok, true);
  assertEquals(result.providerMessageId, "wamid.ABC");
  assertEquals(urlsSeen.length, 1);
  assertEquals(urlsSeen[0], "https://graph.facebook.com/v26.0/PN1/messages");
  for (const url of urlsSeen) {
    assertEquals(url.includes("whatsapp-send"), false);
    assertEquals(url.includes("uazapi-send"), false);
  }
});

Deno.test("erro da Meta vira SendResult.ok=false com fbtrace_id preservado, nunca lança para o chamador de sendText", async () => {
  const fetchImpl = fakeFetch(() =>
    new Response(JSON.stringify({ error: { message: "fora da janela de 24h", code: 131047, fbtrace_id: "Trc1" } }), { status: 400 })
  );
  const supabase = fakeSupabase({ phone_number_id: "PN1", waba_id: "WABA1", onboarding_state: "active" });
  const adapter = createMetaCloudAdapter(supabase, { fetchImpl, accessTokenProvider: { getAccessToken: async () => "tok" } });

  const result = await adapter.sendText(CONN, "5511999999999", "oi");
  assertEquals(result.ok, false);
  assertEquals(result.errorCode, "131047");
  assertEquals((result.raw as any).fbtrace_id, "Trc1");
});

// ─── FASE 10A — onboarding_source: hookcloud e direct_meta usam o MESMO
//     MetaAdapter, nenhum dos dois vira UazAPI, valor desconhecido falha
//     fechado, token nunca aparece em erro/log. ──────────────────────────

Deno.test("onboarding_source='hookcloud': resolve e envia normalmente pelo MESMO MetaAdapter (graph.facebook.com)", async () => {
  const urlsSeen: string[] = [];
  const fetchImpl = fakeFetch((url) => {
    urlsSeen.push(url);
    return new Response(JSON.stringify({ messages: [{ id: "wamid.HC1" }] }), { status: 200 });
  });
  const supabase = fakeSupabase({ phone_number_id: "PN1", waba_id: "WABA1", onboarding_state: "active", onboarding_source: "hookcloud" });
  const adapter = createMetaCloudAdapter(supabase, {
    fetchImpl,
    graphApiVersion: "v26.0",
    accessTokenProvider: { getAccessToken: async () => "tok-secreto" },
  });

  const result = await adapter.sendText(CONN, "5511999999999", "oi");

  assertEquals(result.ok, true);
  assertEquals(adapter.name, "meta_cloud");
  assertEquals(urlsSeen[0], "https://graph.facebook.com/v26.0/PN1/messages");
  assertEquals(urlsSeen[0].includes("uazapi-send"), false);
});

Deno.test("onboarding_source='direct_meta': resolve e envia normalmente pelo MESMO MetaAdapter (graph.facebook.com)", async () => {
  const urlsSeen: string[] = [];
  const fetchImpl = fakeFetch((url) => {
    urlsSeen.push(url);
    return new Response(JSON.stringify({ messages: [{ id: "wamid.DM1" }] }), { status: 200 });
  });
  const supabase = fakeSupabase({ phone_number_id: "PN1", waba_id: "WABA1", onboarding_state: "active", onboarding_source: "direct_meta" });
  const adapter = createMetaCloudAdapter(supabase, {
    fetchImpl,
    graphApiVersion: "v26.0",
    accessTokenProvider: { getAccessToken: async () => "tok-secreto" },
  });

  const result = await adapter.sendText(CONN, "5511999999999", "oi");

  assertEquals(result.ok, true);
  assertEquals(adapter.name, "meta_cloud");
  assertEquals(urlsSeen[0], "https://graph.facebook.com/v26.0/PN1/messages");
});

Deno.test("onboarding_source ausente (null/undefined): tratado como legado, ainda resolve e envia pelo MetaAdapter normalmente", async () => {
  const fetchImpl = fakeFetch(() => new Response(JSON.stringify({ messages: [{ id: "wamid.LEGACY" }] }), { status: 200 }));
  const supabase = fakeSupabase({ phone_number_id: "PN1", waba_id: "WABA1", onboarding_state: "active", onboarding_source: null });
  const adapter = createMetaCloudAdapter(supabase, { fetchImpl, accessTokenProvider: { getAccessToken: async () => "tok" } });

  const result = await adapter.sendText(CONN, "5511999999999", "oi");
  assertEquals(result.ok, true);
});

Deno.test("onboarding_source desconhecido: PROVIDER_NOT_CONFIGURED, falha fechada, nunca tenta enviar, nunca vira uazapi", async () => {
  let fetchCalled = false;
  const fetchImpl = fakeFetch(() => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  });
  const supabase = fakeSupabase({ phone_number_id: "PN1", waba_id: "WABA1", onboarding_state: "active", onboarding_source: "evohub" });
  const adapter = createMetaCloudAdapter(supabase, { fetchImpl, accessTokenProvider: { getAccessToken: async () => "tok" } });

  const err = await assertRejects(() => adapter.sendText(CONN, "5511999999999", "oi"));
  if (!isWhatsAppProviderError(err)) throw new Error("esperava WhatsAppProviderError");
  assertEquals(err.code, "PROVIDER_NOT_CONFIGURED");
  assertEquals(fetchCalled, false);
  // O adapter continua sendo meta_cloud mesmo na falha — nunca degrada
  // silenciosamente para outro provider.
  assertEquals(adapter.name, "meta_cloud");
});

Deno.test("token nunca aparece na mensagem de erro de onboarding_source inválido", async () => {
  const supabase = fakeSupabase({ phone_number_id: "PN1", waba_id: "WABA1", onboarding_state: "active", onboarding_source: "evohub" });
  const adapter = createMetaCloudAdapter(supabase, {
    accessTokenProvider: { getAccessToken: async () => "tok-super-secreto-nao-pode-vazar" },
  });

  const err = await assertRejects(() => adapter.sendText(CONN, "5511999999999", "oi"));
  const serialized = JSON.stringify({ message: (err as Error).message });
  assertEquals(serialized.includes("tok-super-secreto-nao-pode-vazar"), false);
});
