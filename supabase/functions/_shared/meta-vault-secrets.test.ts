// deno test --allow-import meta-vault-secrets.test.ts

import { assertEquals, assertRejects } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { getMetaSecretForConnection, type VaultSupabaseLike } from "./meta-vault-secrets.ts";
import { isWhatsAppProviderError } from "./whatsapp-provider/errors.ts";

function mockSupabase(handler: (fn: string, args: Record<string, unknown>) => { data: unknown; error: { message?: string } | null }): VaultSupabaseLike {
  return {
    async rpc(fn, args) {
      return handler(fn, args);
    },
  };
}

Deno.test("connectionId ausente falha fechado, nunca chama a RPC", async () => {
  let called = false;
  const supabase = mockSupabase(() => {
    called = true;
    return { data: "should-not-be-used", error: null };
  });
  await assertRejects(() => getMetaSecretForConnection(supabase, "", "org-a", "access_token"));
  assertEquals(called, false);
});

Deno.test("organizationId ausente falha fechado, nunca chama a RPC", async () => {
  let called = false;
  const supabase = mockSupabase(() => {
    called = true;
    return { data: "x", error: null };
  });
  await assertRejects(() => getMetaSecretForConnection(supabase, "conn-1", "", "access_token"));
  assertEquals(called, false);
});

Deno.test("access_token chama get_meta_connection_access_token com connectionId+organizationId", async () => {
  let seenFn = "";
  let seenArgs: Record<string, unknown> = {};
  const supabase = mockSupabase((fn, args) => {
    seenFn = fn;
    seenArgs = args;
    return { data: "tok-123", error: null };
  });
  const result = await getMetaSecretForConnection(supabase, "conn-1", "org-a", "access_token");
  assertEquals(result, "tok-123");
  assertEquals(seenFn, "get_meta_connection_access_token");
  assertEquals(seenArgs, { p_connection_id: "conn-1", p_organization_id: "org-a" });
});

Deno.test("app_secret chama get_meta_platform_secret, nunca get_meta_connection_access_token", async () => {
  let seenFn = "";
  const supabase = mockSupabase((fn) => {
    seenFn = fn;
    return { data: "app-secret-value", error: null };
  });
  const result = await getMetaSecretForConnection(supabase, "conn-1", "org-a", "app_secret");
  assertEquals(result, "app-secret-value");
  assertEquals(seenFn, "get_meta_platform_secret");
});

Deno.test("webhook_verify_token chama get_meta_platform_secret com o kind correto", async () => {
  let seenArgs: Record<string, unknown> = {};
  const supabase = mockSupabase((_fn, args) => {
    seenArgs = args;
    return { data: "verify-value", error: null };
  });
  await getMetaSecretForConnection(supabase, "conn-1", "org-a", "webhook_verify_token");
  assertEquals(seenArgs, { p_secret_kind: "webhook_verify_token" });
});

Deno.test("erro da RPC vira SECRET_ACCESS_DENIED, nunca propaga a mensagem original do Postgres", async () => {
  const supabase = mockSupabase(() => ({ data: null, error: { message: "meta_secret_access_denied (org B secret detail leak attempt)" } }));
  const err = await assertRejects(() => getMetaSecretForConnection(supabase, "conn-1", "org-a", "access_token"));
  if (!isWhatsAppProviderError(err)) throw new Error("esperava WhatsAppProviderError");
  assertEquals(err.code, "SECRET_ACCESS_DENIED");
  assertEquals(err.message.includes("org B"), false);
  assertEquals(err.message.includes("detail leak"), false);
});

Deno.test("RPC retorna data vazio/null sem erro explícito ainda assim falha fechado (nunca retorna string vazia como sucesso)", async () => {
  const supabase = mockSupabase(() => ({ data: "", error: null }));
  await assertRejects(() => getMetaSecretForConnection(supabase, "conn-1", "org-a", "access_token"));
});

Deno.test("nunca há fallback: erro numa chamada não tenta outro secretKind nem outro connectionId", async () => {
  let callCount = 0;
  const supabase = mockSupabase(() => {
    callCount++;
    return { data: null, error: { message: "denied" } };
  });
  await assertRejects(() => getMetaSecretForConnection(supabase, "conn-1", "org-a", "access_token"));
  assertEquals(callCount, 1); // exatamente uma tentativa, nenhum retry/fallback automático
});
