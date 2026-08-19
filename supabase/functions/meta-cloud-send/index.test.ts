// Prova: (a) MISSING_FIELDS/MISCONFIGURED; (b) flag por organização
// desligada -> FEATURE_DISABLED; (c) modo "off" -> MODE_DISABLED, mesmo
// com flag ligada; (d) modo "shadow" resolve conexão+token reais mas
// nunca envia (nenhuma chamada de rede simulada é necessária, pois o
// código não chama fetch no caminho shadow); (e) modo "canary" nega
// conexão fora da allowlist mesmo com flag ligada; (f) isolamento
// cross-tenant (ORG_MISMATCH) mesmo com flag e modo liberando.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { handleSendRequest, type HandleSendRequestDeps } from "./index.ts";

interface Row {
  id: string;
  organization_id: string;
  provider: string | null;
}

interface FlagRow {
  scope: "global" | "organization";
  organization_id: string | null;
  enabled: boolean;
}

function fakeSupabase(opts: {
  connections?: Row[];
  flags?: FlagRow[];
  metaCloudRows?: Record<string, { phone_number_id: string; waba_id: string; onboarding_state: string }>;
  rpcHandler?: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
}): HandleSendRequestDeps["supabase"] {
  const connections = opts.connections ?? [];
  const flags = opts.flags ?? [];
  const metaCloudRows = opts.metaCloudRows ?? {};

  return {
    from(table: string) {
      if (table === "evolution_instances") {
        return {
          select() {
            return {
              eq(_col: string, value: unknown) {
                return {
                  async maybeSingle() {
                    const row = connections.find((r) => r.id === value);
                    return { data: row ?? null, error: null };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "meta_cloud_feature_flags") {
        return {
          select() {
            const state: { scope?: string; orgId?: string | null } = {};
            const builder = {
              eq(col: string, value: unknown) {
                if (col === "scope") state.scope = value as string;
                if (col === "organization_id") state.orgId = value as string;
                return builder;
              },
              is(col: string, _value: null) {
                if (col === "organization_id") state.orgId = null;
                return builder;
              },
              async maybeSingle() {
                const row = flags.find(
                  (f) => f.scope === state.scope && f.organization_id === (state.orgId ?? null),
                );
                return { data: row ? { enabled: row.enabled } : null, error: null };
              },
            };
            return builder;
          },
        };
      }
      if (table === "evolution_instances_meta_cloud") {
        return {
          select() {
            return {
              eq(_col: string, value: unknown) {
                return {
                  async maybeSingle() {
                    const row = metaCloudRows[value as string];
                    return { data: row ?? null, error: null };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`tabela inesperada no teste: ${table}`);
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      if (opts.rpcHandler) return opts.rpcHandler(fn, args);
      return { data: "tok-fake", error: null };
    },
  } as any;
}

function req(body: unknown): Request {
  return new Request("http://local/meta-cloud-send", { method: "POST", body: JSON.stringify(body) });
}

function fakeEnv(vars: Record<string, string>) {
  return { get: (k: string) => vars[k] };
}

Deno.test("campos obrigatórios ausentes -> MISSING_FIELDS", async () => {
  const res = await handleSendRequest(req({ organization_id: "org-1" }), { supabase: fakeSupabase({}) });
  const json = await res.json();
  assertEquals(res.status, 400);
  assertEquals(json.error_code, "MISSING_FIELDS");
});

Deno.test("supabase não configurado -> MISCONFIGURED", async () => {
  const res = await handleSendRequest(
    req({ organization_id: "org-1", connection_id: "c1", to: "55...", type: "text", payload: {} }),
    { supabase: null },
  );
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error_code, "MISCONFIGURED");
});

Deno.test("flag desligada para a organização -> FEATURE_DISABLED, mesmo com modo active", async () => {
  const supabase = fakeSupabase({ flags: [] });
  const res = await handleSendRequest(
    req({ organization_id: "org-1", connection_id: "c1", to: "55...", type: "text", payload: {} }),
    { supabase, env: fakeEnv({ META_CLOUD_API_MODE: "active" }) },
  );
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error_code, "FEATURE_DISABLED");
});

Deno.test("flag ligada mas modo off -> MODE_DISABLED", async () => {
  const supabase = fakeSupabase({ flags: [{ scope: "organization", organization_id: "org-1", enabled: true }] });
  const res = await handleSendRequest(
    req({ organization_id: "org-1", connection_id: "c1", to: "55...", type: "text", payload: {} }),
    { supabase, env: fakeEnv({}) }, // default off
  );
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error_code, "MODE_DISABLED");
});

Deno.test("modo canary nega conexão fora da allowlist, mesmo com flag ligada", async () => {
  const supabase = fakeSupabase({ flags: [{ scope: "organization", organization_id: "org-1", enabled: true }] });
  const res = await handleSendRequest(
    req({ organization_id: "org-1", connection_id: "c-nao-permitida", to: "55...", type: "text", payload: {} }),
    { supabase, env: fakeEnv({ META_CLOUD_API_MODE: "canary", META_CLOUD_CANARY_CONNECTION_IDS: "c-permitida" }) },
  );
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error_code, "MODE_DISABLED");
});

Deno.test("modo shadow resolve conexão e token reais, mas nunca envia (sem PROVIDER_MISMATCH nem erro de rede)", async () => {
  let rpcCalled = false;
  const supabase = fakeSupabase({
    flags: [{ scope: "organization", organization_id: "org-1", enabled: true }],
    connections: [{ id: "c1", organization_id: "org-1", provider: "meta_cloud" }],
    rpcHandler: async (fn, args) => {
      rpcCalled = true;
      assertEquals(fn, "get_meta_connection_access_token");
      assertEquals(args.p_connection_id, "c1");
      assertEquals(args.p_organization_id, "org-1");
      return { data: "tok-fake", error: null };
    },
  });
  const res = await handleSendRequest(
    req({ organization_id: "org-1", connection_id: "c1", to: "55...", type: "text", payload: { text: "oi" } }),
    { supabase, env: fakeEnv({ META_CLOUD_API_MODE: "shadow" }) },
  );
  const json = await res.json();
  assertEquals(res.status, 200);
  assertEquals(json.success, true);
  assertEquals(json.debug.shadow, true);
  assertEquals(rpcCalled, true);
});

Deno.test("cross-tenant: conexão de outra organização é recusada (ORG_MISMATCH), mesmo com flag e modo liberando", async () => {
  const supabase = fakeSupabase({
    flags: [{ scope: "organization", organization_id: "org-A", enabled: true }],
    connections: [{ id: "c1", organization_id: "org-B", provider: "meta_cloud" }],
  });
  const res = await handleSendRequest(
    req({ organization_id: "org-A", connection_id: "c1", to: "55...", type: "text", payload: {} }),
    { supabase, env: fakeEnv({ META_CLOUD_API_MODE: "active" }) },
  );
  const json = await res.json();
  assertEquals(res.status, 403);
  assertEquals(json.error_code, "ORG_MISMATCH");
});

Deno.test("modo active sem secret no Vault -> SECRET_ACCESS_DENIED, nunca sucesso falso", async () => {
  const supabase = fakeSupabase({
    flags: [{ scope: "organization", organization_id: "org-1", enabled: true }],
    connections: [{ id: "c1", organization_id: "org-1", provider: "meta_cloud" }],
    metaCloudRows: { c1: { phone_number_id: "123", waba_id: "456", onboarding_state: "active" } },
    rpcHandler: async () => ({ data: null, error: { message: "denied", code: "42501" } }),
  });
  const res = await handleSendRequest(
    req({ organization_id: "org-1", connection_id: "c1", to: "55...", type: "text", payload: { text: "oi" } }),
    { supabase, env: fakeEnv({ META_CLOUD_API_MODE: "active" }) },
  );
  const json = await res.json();
  assertEquals(res.status, 400);
  assertEquals(json.error_code, "SECRET_ACCESS_DENIED");
});
