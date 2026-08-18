// Prova: (a) delega para getMetaSecretForConnection com os IDs corretos e
// secretKind fixo "access_token"; (b) nunca inventa isolamento próprio —
// propaga exatamente o que recebeu; (c) erro do Vault propaga como
// WhatsAppProviderError (SECRET_ACCESS_DENIED), nunca mascarado.

import { assertEquals, assertRejects } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createMetaAccessTokenProvider } from "./meta-access-token-provider.ts";
import { isWhatsAppProviderError } from "./errors.ts";

function fakeSupabase(handler: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>) {
  return { rpc: handler };
}

Deno.test("getAccessToken chama a RPC correta com connectionId e organizationId propagados", async () => {
  let capturedFn: string | undefined;
  let capturedArgs: Record<string, unknown> | undefined;
  const supabase = fakeSupabase(async (fn, args) => {
    capturedFn = fn;
    capturedArgs = args;
    return { data: "tok-real-do-vault", error: null };
  });

  const provider = createMetaAccessTokenProvider(supabase);
  const token = await provider.getAccessToken("conn-1", "org-1");

  assertEquals(token, "tok-real-do-vault");
  assertEquals(capturedFn, "get_meta_connection_access_token");
  assertEquals(capturedArgs, { p_connection_id: "conn-1", p_organization_id: "org-1" });
});

Deno.test("getAccessToken propaga negacao do Vault como SECRET_ACCESS_DENIED, nunca com fallback", async () => {
  const supabase = fakeSupabase(async () => ({ data: null, error: { message: "denied", code: "42501" } }));
  const provider = createMetaAccessTokenProvider(supabase);

  const err = await assertRejects(() => provider.getAccessToken("conn-x", "org-x"));
  if (!isWhatsAppProviderError(err)) throw new Error("esperava WhatsAppProviderError");
  assertEquals(err.code, "SECRET_ACCESS_DENIED");
});

Deno.test("getAccessToken nunca troca organizationId por outro — dois pares distintos geram chamadas distintas", async () => {
  const calls: Record<string, unknown>[] = [];
  const supabase = fakeSupabase(async (_fn, args) => {
    calls.push(args);
    return { data: "tok", error: null };
  });
  const provider = createMetaAccessTokenProvider(supabase);

  await provider.getAccessToken("conn-1", "org-A");
  await provider.getAccessToken("conn-1", "org-B");

  assertEquals(calls.length, 2);
  assertEquals(calls[0].p_organization_id, "org-A");
  assertEquals(calls[1].p_organization_id, "org-B");
});
