// deno test --allow-import resolve.test.ts
//
// Cobre as regras obrigatórias de resolução de provider (Fase 2A):
// retrocompatibilidade (provider ausente = uazapi), falha fechada para
// provider desconhecido, e isolamento multi-tenant (organização A nunca
// resolve conexão de organização B).

import { assertEquals, assertRejects } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { resolveConnectionProvider, type SupabaseLike } from "./resolve.ts";
import { isWhatsAppProviderError } from "./errors.ts";

type Row = { id: string; organization_id: string; provider: string | null };

function fakeSupabase(rows: Row[]): SupabaseLike {
  return {
    from(table: string) {
      if (table !== "evolution_instances") throw new Error(`tabela inesperada: ${table}`);
      return {
        select(_columns: string) {
          return {
            eq(_column: string, value: unknown) {
              return {
                async maybeSingle() {
                  const row = rows.find((r) => r.id === value);
                  return { data: row ?? null, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

Deno.test("provider ausente/nulo resolve exclusivamente para uazapi (retrocompatibilidade)", async () => {
  const supabase = fakeSupabase([{ id: "conn-1", organization_id: "org-a", provider: null }]);
  const ref = await resolveConnectionProvider(supabase, "conn-1", "org-a");
  assertEquals(ref.provider, "uazapi");
});

Deno.test("provider vazio (string) resolve exclusivamente para uazapi", async () => {
  const supabase = fakeSupabase([{ id: "conn-1", organization_id: "org-a", provider: "" }]);
  const ref = await resolveConnectionProvider(supabase, "conn-1", "org-a");
  assertEquals(ref.provider, "uazapi");
});

Deno.test("provider 'meta_cloud' explícito resolve como meta_cloud", async () => {
  const supabase = fakeSupabase([{ id: "conn-1", organization_id: "org-a", provider: "meta_cloud" }]);
  const ref = await resolveConnectionProvider(supabase, "conn-1", "org-a");
  assertEquals(ref.provider, "meta_cloud");
});

Deno.test("provider desconhecido falha fechado (nunca assume um default)", async () => {
  const supabase = fakeSupabase([{ id: "conn-1", organization_id: "org-a", provider: "chromium" }]);
  const err = await assertRejects(() => resolveConnectionProvider(supabase, "conn-1", "org-a"));
  if (!isWhatsAppProviderError(err)) throw new Error("esperava WhatsAppProviderError");
  assertEquals(err.code, "PROVIDER_UNKNOWN");
});

Deno.test("organização A nunca resolve conexão de organização B (isolamento multi-tenant)", async () => {
  const supabase = fakeSupabase([{ id: "conn-1", organization_id: "org-b", provider: "meta_cloud" }]);
  const err = await assertRejects(() => resolveConnectionProvider(supabase, "conn-1", "org-a"));
  if (!isWhatsAppProviderError(err)) throw new Error("esperava WhatsAppProviderError");
  assertEquals(err.code, "ORG_MISMATCH");
  // A mensagem de erro nunca deve revelar a organização real (org-b).
  assertEquals(err.message.includes("org-b"), false);
});

Deno.test("conexão inexistente falha com CONNECTION_NOT_FOUND", async () => {
  const supabase = fakeSupabase([]);
  const err = await assertRejects(() => resolveConnectionProvider(supabase, "conn-x", "org-a"));
  if (!isWhatsAppProviderError(err)) throw new Error("esperava WhatsAppProviderError");
  assertEquals(err.code, "CONNECTION_NOT_FOUND");
});

Deno.test("organizationId ausente é recusado antes de qualquer consulta", async () => {
  const supabase = fakeSupabase([{ id: "conn-1", organization_id: "org-a", provider: "uazapi" }]);
  const err = await assertRejects(() => resolveConnectionProvider(supabase, "conn-1", ""));
  if (!isWhatsAppProviderError(err)) throw new Error("esperava WhatsAppProviderError");
  assertEquals(err.code, "ORG_MISMATCH");
});

Deno.test("connectionId ausente (string vazia) é recusado antes de qualquer consulta, com CONNECTION_NOT_FOUND", async () => {
  const supabase = fakeSupabase([{ id: "conn-1", organization_id: "org-a", provider: "uazapi" }]);
  const err = await assertRejects(() => resolveConnectionProvider(supabase, "", "org-a"));
  if (!isWhatsAppProviderError(err)) throw new Error("esperava WhatsAppProviderError");
  assertEquals(err.code, "CONNECTION_NOT_FOUND");
});
