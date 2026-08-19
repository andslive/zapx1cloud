// deno test --allow-import index.test.ts
//
// Fase 14A — testes da fundação de rotação dos segredos HookCloud.
// `handleRotateCredentialsRequest` é testado com todas as dependências
// injetadas (nenhuma rede real, nenhum Vault real).

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  type AdminSupabaseLike,
  type AuthClientLike,
  handleRotateCredentialsRequest,
  type RotateHookCloudCredentialsDeps,
} from "./index.ts";
import { hashHookCloudVerifyToken, hashHookCloudWebhookSecret } from "../_shared/meta-webhook-hookcloud-secret.ts";

const CALLER_ID = "user-1";
const ORG_ID = "org-a";
const CONNECTION_ID = "conn-existing-1";
const CALLBACK_BASE_URL = "https://ydunpoqdhijhnrarohiz.supabase.co";

function authClient(userId: string | null): AuthClientLike {
  return { auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) } };
}

interface AdminMockConfig {
  profileOrgId?: string | null;
  profileDisabled?: boolean;
  profileIsActive?: boolean;
  roles?: string[];
  rpcResult?: { data: any; error: { code?: string; message?: string } | null };
  rpcCalls?: Array<{ fn: string; args: Record<string, unknown> }>;
}

function adminClient(config: AdminMockConfig): AdminSupabaseLike {
  const rpcCalls = config.rpcCalls ?? [];
  return {
    from(table: string) {
      return {
        select(_columns: string) {
          return {
            eq(_column: string, _value: unknown) {
              const thenable = {
                then(resolve: (v: { data: any[] | null; error: any }) => void) {
                  if (table === "user_roles") {
                    resolve({ data: (config.roles ?? []).map((role) => ({ role })), error: null });
                  } else {
                    resolve({ data: [], error: null });
                  }
                },
                async maybeSingle() {
                  if (table === "profiles") {
                    return {
                      data: config.profileOrgId !== undefined && config.profileOrgId !== null
                        ? {
                          organization_id: config.profileOrgId,
                          disabled: config.profileDisabled ?? false,
                          is_active: config.profileIsActive ?? true,
                        }
                        : null,
                      error: null,
                    };
                  }
                  return { data: null, error: null };
                },
              };
              return thenable as any;
            },
          };
        },
      };
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      return config.rpcResult ?? { data: { connection_id: CONNECTION_ID, onboarding_state: "pending" }, error: null };
    },
  };
}

function baseDeps(overrides: Partial<RotateHookCloudCredentialsDeps> = {}): RotateHookCloudCredentialsDeps {
  return {
    authClient: authClient(CALLER_ID),
    adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"] }),
    callbackBaseUrl: CALLBACK_BASE_URL,
    ...overrides,
  };
}

function req(body: unknown): Request {
  return new Request("https://x/hookcloud-rotate-credentials", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    connectionId: CONNECTION_ID,
    rotateCallbackSecret: true,
    rotateVerifyToken: true,
    ...overrides,
  };
}

Deno.test("não autenticado => 401", async () => {
  const res = await handleRotateCredentialsRequest(req(validPayload()), baseDeps({ authClient: authClient(null) }));
  assertEquals(res.status, 401);
});

Deno.test("papel insuficiente (seller) => 403", async () => {
  const res = await handleRotateCredentialsRequest(
    req(validPayload()),
    baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["seller"] }) }),
  );
  assertEquals(res.status, 403);
});

Deno.test("admin é suficiente => 200", async () => {
  const res = await handleRotateCredentialsRequest(req(validPayload()), baseDeps());
  assertEquals(res.status, 200);
});

Deno.test("super_admin também é suficiente => 200", async () => {
  const res = await handleRotateCredentialsRequest(
    req(validPayload()),
    baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["super_admin"] }) }),
  );
  assertEquals(res.status, 200);
});

Deno.test("usuário desativado (profiles.disabled=true) => 403", async () => {
  const res = await handleRotateCredentialsRequest(
    req(validPayload()),
    baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], profileDisabled: true }) }),
  );
  assertEquals(res.status, 403);
});

Deno.test("organization_id enviado divergente do real => 403, cross-tenant rejeitado ANTES da RPC", async () => {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const res = await handleRotateCredentialsRequest(
    req({ ...validPayload(), organizationId: "org-de-outra-organizacao" }),
    baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], rpcCalls }) }),
  );
  assertEquals(res.status, 403);
  assertEquals(rpcCalls.length, 0, "cross-tenant nunca deve chegar a chamar a RPC de rotação");
});

Deno.test("RPC devolve hookcloud_rotation_not_found (conexão de outra organização, simulado) => 404 genérico", async () => {
  const res = await handleRotateCredentialsRequest(
    req(validPayload()),
    baseDeps({
      adminClient: adminClient({
        profileOrgId: ORG_ID,
        roles: ["admin"],
        rpcResult: { data: null, error: { message: "hookcloud_rotation_not_found" } },
      }),
    }),
  );
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.error, "connection_not_found");
});

Deno.test("nem rotateCallbackSecret nem rotateVerifyToken solicitados => 400, RPC nunca chamada", async () => {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const res = await handleRotateCredentialsRequest(
    req({ connectionId: CONNECTION_ID }),
    baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], rpcCalls }) }),
  );
  assertEquals(res.status, 400);
  assertEquals(rpcCalls.length, 0);
});

Deno.test("rotação CONJUNTA: ambos os segredos são gerados e devolvidos, e o novo callback secret é diferente do antigo passado só para gerar (nunca reaproveitado)", async () => {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const res = await handleRotateCredentialsRequest(
    req(validPayload({ rotateCallbackSecret: true, rotateVerifyToken: true })),
    baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], rpcCalls }) }),
  );
  const body = await res.json();
  assertEquals(res.status, 200);
  assert(typeof body.callback_url === "string");
  assert(typeof body.verify_token === "string");
  const newCallbackSecret = new URL(body.callback_url).searchParams.get("hcs")!;
  assert(newCallbackSecret !== body.verify_token, "os dois valores novos nunca coincidem");
  assertEquals(rpcCalls[0].args.p_new_callback_secret_hash, await hashHookCloudWebhookSecret(newCallbackSecret));
  assertEquals(rpcCalls[0].args.p_new_verify_token_hash, await hashHookCloudVerifyToken(body.verify_token));
});

Deno.test("rotação SEPARADA (só callback secret): verify_token nunca aparece na resposta nem é enviado à RPC", async () => {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const res = await handleRotateCredentialsRequest(
    req(validPayload({ rotateCallbackSecret: true, rotateVerifyToken: false })),
    baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], rpcCalls }) }),
  );
  const body = await res.json();
  assertEquals(res.status, 200);
  assert("callback_url" in body);
  assertEquals("verify_token" in body, false);
  assertEquals(rpcCalls[0].args.p_new_verify_token_hash, null);
  assert(rpcCalls[0].args.p_new_callback_secret_hash !== null);
});

Deno.test("rotação SEPARADA (só verify token): callback_url nunca aparece na resposta nem é enviado à RPC", async () => {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const res = await handleRotateCredentialsRequest(
    req(validPayload({ rotateCallbackSecret: false, rotateVerifyToken: true })),
    baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], rpcCalls }) }),
  );
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals("callback_url" in body, false);
  assert("verify_token" in body);
  assertEquals(rpcCalls[0].args.p_new_callback_secret_hash, null);
  assert(rpcCalls[0].args.p_new_verify_token_hash !== null);
});

Deno.test("resposta de sucesso sempre reporta onboarding_state='pending' — a rotação sempre exige nova verificação", async () => {
  const res = await handleRotateCredentialsRequest(req(validPayload()), baseDeps());
  const body = await res.json();
  assertEquals(body.onboarding_state, "pending");
});

Deno.test("timestamps de rotação: a RPC é chamada com os hashes novos (prova indireta de que a atualização de rotated_at é responsabilidade da RPC, nunca do código da Edge Function)", async () => {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  await handleRotateCredentialsRequest(
    req(validPayload()),
    baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], rpcCalls }) }),
  );
  assertEquals(rpcCalls[0].fn, "rotate_hookcloud_webhook_credentials");
  assert(!("rotated_at" in rpcCalls[0].args), "o timestamp de rotação nunca é parâmetro do cliente — é sempre now() dentro da RPC");
});

Deno.test("nenhum valor bruto (callback secret novo ou verify token novo) aparece em console.* durante o fluxo", async () => {
  const originalLog = console.log, originalWarn = console.warn, originalError = console.error;
  const calls: unknown[] = [];
  console.log = (...a: unknown[]) => calls.push(a);
  console.warn = (...a: unknown[]) => calls.push(a);
  console.error = (...a: unknown[]) => calls.push(a);
  let rawCallbackSecret = "";
  let rawVerifyToken = "";
  try {
    const res = await handleRotateCredentialsRequest(req(validPayload()), baseDeps());
    const body = await res.json();
    rawCallbackSecret = new URL(body.callback_url).searchParams.get("hcs")!;
    rawVerifyToken = body.verify_token;
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
  const serialized = JSON.stringify(calls);
  assertEquals(serialized.includes(rawCallbackSecret), false);
  assertEquals(serialized.includes(rawVerifyToken), false);
});

Deno.test("callbackBaseUrl http:// num domínio real => 500, nunca constrói URL insegura", async () => {
  const res = await handleRotateCredentialsRequest(
    req(validPayload()),
    baseDeps({ callbackBaseUrl: "http://ydunpoqdhijhnrarohiz.supabase.co" }),
  );
  assertEquals(res.status, 500);
});

Deno.test("connectionId ausente/vazio => 400", async () => {
  const res = await handleRotateCredentialsRequest(req({ rotateCallbackSecret: true }), baseDeps());
  assertEquals(res.status, 400);
});

Deno.test("nenhum token Meta/Vault é tocado — a RPC de rotação nunca recebe p_access_token", async () => {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  await handleRotateCredentialsRequest(
    req(validPayload()),
    baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], rpcCalls }) }),
  );
  assert(!("p_access_token" in rpcCalls[0].args));
});
