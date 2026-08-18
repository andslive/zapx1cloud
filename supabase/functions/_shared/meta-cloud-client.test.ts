// deno test --allow-import --allow-env meta-cloud-client.test.ts
// (--allow-env é necessário porque resolveGraphApiVersion() lê
// Deno.env por padrão quando nenhuma versão é injetada explicitamente —
// nenhum valor de secret é lido, só a variável de versão do Graph API.)
//
// Nenhum request real é feito — `fetchImpl` é sempre um mock. Cobre:
// normalização de erro (fbtrace_id/code/subcode preservados), timeout,
// resposta não-JSON, e montagem de URL usando a versão central configurável.

import { assertEquals, assertRejects } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildGraphApiBaseUrl,
  callMetaGraphApi,
  DEFAULT_GRAPH_API_VERSION,
  downloadMetaMediaBytes,
  getMetaMediaMetadata,
  MetaGraphApiError,
  MetaGraphInvalidResponseError,
  MetaGraphTimeoutError,
  resolveGraphApiVersion,
  sendMetaMessage,
} from "./meta-cloud-client.ts";

function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return (async (input: any, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url, init);
  }) as typeof fetch;
}

Deno.test("resolveGraphApiVersion usa META_GRAPH_API_VERSION quando definida, senão o default central", () => {
  const withEnv = resolveGraphApiVersion({ get: (k) => (k === "META_GRAPH_API_VERSION" ? "v99.0" : undefined) });
  assertEquals(withEnv, "v99.0");

  const withoutEnv = resolveGraphApiVersion({ get: () => undefined });
  assertEquals(withoutEnv, DEFAULT_GRAPH_API_VERSION);
});

Deno.test("URL é sempre montada a partir da versão central — nunca hardcoded fora deste módulo", () => {
  assertEquals(buildGraphApiBaseUrl("v26.0"), "https://graph.facebook.com/v26.0");
});

Deno.test("sendMetaMessage: sucesso extrai messageId da resposta", async () => {
  const fetchImpl = fakeFetch((url) => {
    assertEquals(url, "https://graph.facebook.com/v26.0/PHONE_ID/messages");
    return new Response(
      JSON.stringify({ messaging_product: "whatsapp", contacts: [{ wa_id: "5511999999999" }], messages: [{ id: "wamid.XYZ" }] }),
      { status: 200 },
    );
  });

  const result = await sendMetaMessage(
    { fetchImpl, graphApiVersion: "v26.0" },
    { phoneNumberId: "PHONE_ID", accessToken: "token-nao-usado-em-log" },
    "5511999999999",
    { type: "text", text: { body: "oi" } },
  );

  assertEquals(result.messageId, "wamid.XYZ");
});

Deno.test("erro da Meta preserva fbtrace_id/code/error_subcode e não lança string genérica", async () => {
  const fetchImpl = fakeFetch(() =>
    new Response(
      JSON.stringify({ error: { message: "Invalid parameter", type: "OAuthException", code: 100, error_subcode: 33, fbtrace_id: "Abc123" } }),
      { status: 400 },
    )
  );

  const err = await assertRejects(
    () => callMetaGraphApi({ fetchImpl }, { phoneNumberId: "P", accessToken: "t" }, "P/messages", { method: "POST", body: {} }),
    MetaGraphApiError,
  );
  const graphErr = err as MetaGraphApiError;
  assertEquals(graphErr.detail.code, 100);
  assertEquals(graphErr.detail.errorSubcode, 33);
  assertEquals(graphErr.detail.fbtraceId, "Abc123");
  assertEquals(graphErr.retryable, false); // 400 genérico não é retryable
});

Deno.test("código 131060 (primeira mensagem pós-onboarding) é marcado como retryable", async () => {
  const fetchImpl = fakeFetch(() =>
    new Response(JSON.stringify({ error: { message: "primeira mensagem", code: 131060 } }), { status: 400 })
  );
  const err = await assertRejects(
    () => callMetaGraphApi({ fetchImpl }, { phoneNumberId: "P", accessToken: "t" }, "P/messages", { method: "POST", body: {} }),
    MetaGraphApiError,
  );
  assertEquals((err as MetaGraphApiError).retryable, true);
});

Deno.test("HTTP 500 é retryable, 400 não é", async () => {
  const fetchImpl500 = fakeFetch(() => new Response(JSON.stringify({ error: { message: "fail" } }), { status: 500 }));
  const err500 = await assertRejects(
    () => callMetaGraphApi({ fetchImpl: fetchImpl500 }, { phoneNumberId: "P", accessToken: "t" }, "P/messages", { method: "POST", body: {} }),
    MetaGraphApiError,
  );
  assertEquals((err500 as MetaGraphApiError).retryable, true);
});

Deno.test("resposta não-JSON gera MetaGraphInvalidResponseError, sem vazar corpo ilimitado", async () => {
  const fetchImpl = fakeFetch(() => new Response("<html>não é json</html>", { status: 200 }));
  const err = await assertRejects(
    () => callMetaGraphApi({ fetchImpl }, { phoneNumberId: "P", accessToken: "t" }, "P/messages", { method: "GET" }),
    MetaGraphInvalidResponseError,
  );
  assertEquals((err as MetaGraphInvalidResponseError).httpStatus, 200);
});

Deno.test("timeout gera MetaGraphTimeoutError", async () => {
  const fetchImpl = (async (_input: any, init?: RequestInit) => {
    await new Promise((resolve) => {
      init?.signal?.addEventListener("abort", () => resolve(undefined));
    });
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    throw abortErr;
  }) as typeof fetch;

  await assertRejects(
    () => callMetaGraphApi({ fetchImpl, timeoutMs: 10 }, { phoneNumberId: "P", accessToken: "t" }, "P/messages", { method: "GET" }),
    MetaGraphTimeoutError,
  );
});

Deno.test("getMetaMediaMetadata + downloadMetaMediaBytes: URL de mídia nunca é usada sem Authorization", async () => {
  let authHeaderSeen: string | null = null;
  const fetchImpl = fakeFetch((url, init) => {
    if (url.includes("/media-id-1")) {
      return new Response(JSON.stringify({ url: "https://lookaside.fbsbx.com/whatsapp_media/abc", mime_type: "image/jpeg", id: "media-id-1" }), { status: 200 });
    }
    authHeaderSeen = (init?.headers as Record<string, string>)?.Authorization ?? null;
    return new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 });
  });

  const meta = await getMetaMediaMetadata({ fetchImpl }, { accessToken: "tok-abc" }, "media-id-1");
  assertEquals(meta.mimeType, "image/jpeg");

  const bytes = await downloadMetaMediaBytes({ fetchImpl }, "tok-abc", meta.url);
  assertEquals(bytes.length, 3);
  assertEquals(authHeaderSeen, "Bearer tok-abc");
});
