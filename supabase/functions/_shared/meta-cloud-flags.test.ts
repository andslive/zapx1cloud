// deno test --allow-import meta-cloud-flags.test.ts
//
// Regra obrigatória: desligada por padrão, globalmente E por organização.
// Linha de organização tem prioridade sobre a global quando presente.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { isMetaCloudApiEnabled } from "./meta-cloud-flags.ts";
import type { SupabaseLike } from "./whatsapp-provider/resolve.ts";

type FlagRow = { scope: "global" | "organization"; organization_id: string | null; enabled: boolean };

function fakeSupabase(rows: FlagRow[]): SupabaseLike {
  return {
    from(table: string) {
      if (table !== "meta_cloud_feature_flags") throw new Error(`tabela inesperada: ${table}`);
      return {
        select(_columns: string) {
          const state: { scope?: string; organization_id?: string | null; orgFilterApplied: boolean } = {
            orgFilterApplied: false,
          };
          const builder: any = {
            eq(column: string, value: unknown) {
              if (column === "scope") state.scope = value as string;
              if (column === "organization_id") {
                state.organization_id = value as string;
                state.orgFilterApplied = true;
              }
              return builder;
            },
            is(column: string, value: unknown) {
              if (column === "organization_id" && value === null) {
                state.organization_id = null;
                state.orgFilterApplied = true;
              }
              return builder;
            },
            async maybeSingle() {
              const row = rows.find((r) =>
                r.scope === state.scope &&
                (state.orgFilterApplied ? r.organization_id === state.organization_id : true)
              );
              return { data: row ?? null, error: null };
            },
          };
          return builder;
        },
      };
    },
  } as unknown as SupabaseLike;
}

Deno.test("sem nenhuma linha (global ou org) => desligada", async () => {
  const supabase = fakeSupabase([]);
  assertEquals(await isMetaCloudApiEnabled(supabase, "org-a"), false);
});

Deno.test("apenas global=true, sem linha de organização => usa global", async () => {
  const supabase = fakeSupabase([{ scope: "global", organization_id: null, enabled: true }]);
  assertEquals(await isMetaCloudApiEnabled(supabase, "org-a"), true);
});

Deno.test("global=true mas organização tem override explícito false => desligada para essa organização", async () => {
  const supabase = fakeSupabase([
    { scope: "global", organization_id: null, enabled: true },
    { scope: "organization", organization_id: "org-a", enabled: false },
  ]);
  assertEquals(await isMetaCloudApiEnabled(supabase, "org-a"), false);
});

Deno.test("global=false mas organização piloto tem override true => ligada só para essa organização", async () => {
  const supabase = fakeSupabase([
    { scope: "global", organization_id: null, enabled: false },
    { scope: "organization", organization_id: "org-piloto", enabled: true },
  ]);
  assertEquals(await isMetaCloudApiEnabled(supabase, "org-piloto"), true);
  assertEquals(await isMetaCloudApiEnabled(supabase, "org-outra"), false);
});

Deno.test("organizationId nulo consulta só a flag global", async () => {
  const supabase = fakeSupabase([{ scope: "global", organization_id: null, enabled: true }]);
  assertEquals(await isMetaCloudApiEnabled(supabase, null), true);
});
