import { assert, assertEquals } from "https://deno.land/std@0.207.0/assert/mod.ts";
import { resolveEvolutionProviderConfig } from "./evolution-provider-config.ts";

// Mock em memória de duas tabelas: integration_settings e platform_settings.
// Sem rede, sem banco real.
function makeSupabase(opts: {
  integrationSettings?: { evolution_go_url?: string; evolution_go_global_api_key?: string } | null;
  platformSettings?: { evolution_go_url?: string; evolution_go_global_api_key?: string } | null;
  calls: { integration: number; platform: number };
}) {
  return {
    from(table: string) {
      if (table === "integration_settings") {
        return {
          select: (_c: string) => ({
            eq: (_c1: string, _v1: any) => ({
              eq: (_c2: string, _v2: any) => ({
                maybeSingle: async () => {
                  opts.calls.integration++;
                  return {
                    data: opts.integrationSettings ? { settings: opts.integrationSettings } : null,
                    error: null,
                  };
                },
              }),
            }),
          }),
        };
      }
      if (table === "platform_settings") {
        return {
          select: (_c: string) => ({
            limit: (_n: number) => ({
              maybeSingle: async () => {
                opts.calls.platform++;
                return { data: opts.platformSettings ?? null, error: null };
              },
            }),
          }),
        };
      }
      throw new Error("unexpected table " + table);
    },
  };
}

Deno.test("resolução via integration_settings: usa URL e chaves da organização, sem consultar platform_settings", async () => {
  const calls = { integration: 0, platform: 0 };
  const supabase = makeSupabase({
    integrationSettings: { evolution_go_url: "https://evo.example.com/", evolution_go_global_api_key: "org-global-key" },
    calls,
  });
  const result = await resolveEvolutionProviderConfig(supabase, "org-1", "instance-token-abc");

  assertEquals(result.evoUrl, "https://evo.example.com"); // barra final removida
  assert(result.apiKeys.includes("instance-token-abc"), "inclui o token da instância");
  assert(result.apiKeys.includes("org-global-key"), "inclui a chave global da organização");
  assertEquals(calls.integration, 1, "consulta integration_settings exatamente uma vez");
  assertEquals(calls.platform, 0, "não consulta platform_settings quando integration_settings já resolve");
});

Deno.test("fallback para platform_settings: dispara quando integration_settings não existe", async () => {
  const calls = { integration: 0, platform: 0 };
  const supabase = makeSupabase({
    integrationSettings: null,
    platformSettings: { evolution_go_url: "https://platform.example.com/", evolution_go_global_api_key: "platform-key" },
    calls,
  });
  const result = await resolveEvolutionProviderConfig(supabase, "org-2", "instance-token-xyz");

  assertEquals(result.evoUrl, "https://platform.example.com");
  assert(result.apiKeys.includes("platform-key"), "inclui a chave global da plataforma como fallback");
  assertEquals(calls.integration, 1, "consulta integration_settings primeiro");
  assertEquals(calls.platform, 1, "cai no fallback platform_settings exatamente uma vez");
});

Deno.test("fallback para platform_settings: dispara quando integration_settings existe mas sem URL nem chaves", async () => {
  const calls = { integration: 0, platform: 0 };
  const supabase = makeSupabase({
    integrationSettings: {},
    platformSettings: { evolution_go_url: "https://platform2.example.com", evolution_go_global_api_key: "platform-key-2" },
    calls,
  });
  const result = await resolveEvolutionProviderConfig(supabase, "org-3", null);

  assertEquals(result.evoUrl, "https://platform2.example.com");
  assertEquals(calls.platform, 1, "cai no fallback quando settings da org está vazio");
});

Deno.test("valores ausentes em ambas as fontes: retorna evoUrl vazio e apiKeys sem crashar", async () => {
  const calls = { integration: 0, platform: 0 };
  const supabase = makeSupabase({ integrationSettings: null, platformSettings: null, calls });
  const result = await resolveEvolutionProviderConfig(supabase, "org-4", null);

  assertEquals(result.evoUrl, "");
  assertEquals(Array.isArray(result.apiKeys), true);
  assert(result.apiKeys.every((k) => !k), "nenhuma chave válida presente, mas não lança exceção");
});

Deno.test("isolamento entre organizações: duas chamadas concorrentes para orgs diferentes não vazam configuração entre si", async () => {
  const callsA = { integration: 0, platform: 0 };
  const callsB = { integration: 0, platform: 0 };
  const supabaseA = makeSupabase({
    integrationSettings: { evolution_go_url: "https://org-a.example.com", evolution_go_global_api_key: "key-a" },
    calls: callsA,
  });
  const supabaseB = makeSupabase({
    integrationSettings: { evolution_go_url: "https://org-b.example.com", evolution_go_global_api_key: "key-b" },
    calls: callsB,
  });

  const [resultA, resultB] = await Promise.all([
    resolveEvolutionProviderConfig(supabaseA, "org-a", "token-a"),
    resolveEvolutionProviderConfig(supabaseB, "org-b", "token-b"),
  ]);

  assertEquals(resultA.evoUrl, "https://org-a.example.com");
  assertEquals(resultB.evoUrl, "https://org-b.example.com");
  assert(resultA.apiKeys.includes("key-a") && !resultA.apiKeys.includes("key-b"), "config de A não contém dados de B");
  assert(resultB.apiKeys.includes("key-b") && !resultB.apiKeys.includes("key-a"), "config de B não contém dados de A");
});
