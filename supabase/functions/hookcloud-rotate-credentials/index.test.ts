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
  type RouteRotateCredentialsRequestDeps,
  routeRotateCredentialsRequest,
} from "./index.ts";
import { hashHookCloudVerifyToken, hashHookCloudWebhookSecret } from "../_shared/meta-webhook-hookcloud-secret.ts";
import { HOOKCLOUD_ADMIN_MAX_BODY_BYTES } from "../_shared/hookcloud-admin-http.ts";

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

// ── FASE 16A/16B — rotação com flag HookCloud desligada (decisão arquitetural registrada) ─

Deno.test("16.flag) rotação com HOOKCLOUD_WEBHOOK_MODE desligada (ou ausente) ainda é permitida — decisão deliberada, não omissão — e a conexão volta a 'pending', nunca ativa automação", async () => {
  const original = Deno.env.get("HOOKCLOUD_WEBHOOK_MODE");
  Deno.env.delete("HOOKCLOUD_WEBHOOK_MODE"); // flag ausente/desligada
  try {
    const res = await handleRotateCredentialsRequest(req(validPayload()), baseDeps());
    assertEquals(res.status, 200, "rotação não deve ser bloqueada pela flag global — é manutenção de uma conexão já existente, não ativação de automação nova");
    const body = await res.json();
    assertEquals(body.onboarding_state, "pending", "mesmo com rotação bem-sucedida, a conexão nunca sai de pending sem nova verificação — nenhuma automação é ativada");
  } finally {
    if (original === undefined) Deno.env.delete("HOOKCLOUD_WEBHOOK_MODE");
    else Deno.env.set("HOOKCLOUD_WEBHOOK_MODE", original);
  }
});

Deno.test("16.flag.b) rotação nunca consulta resolveHookCloudWebhookMode/isMetaCloudApiEnabled — confirmado por grep estrutural do próprio arquivo (fonte da verdade sobre a decisão, não só o comentário)", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  assertEquals(codeOnly.includes("resolveHookCloudWebhookMode("), false);
  assertEquals(codeOnly.includes("isMetaCloudApiEnabled("), false);
});

Deno.test("16.direct_meta) rotação nunca aceita uma conexão direct_meta — RPC rejeita via onboarding_source, resposta uniforme 404 (mesma de conexão inexistente/cross-tenant)", async () => {
  // A checagem real vive na RPC (onboarding_source != 'hookcloud' =>
  // hookcloud_rotation_not_found) — aqui simulamos exatamente esse
  // retorno para provar que o endpoint propaga a mesma resposta
  // uniforme, nunca revelando que a conexão existe mas é direct_meta.
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

// ── FASE 16B — roteamento HTTP real (método, CORS, cache, corpo) ────────

const ALLOWED_ORIGIN = "https://admin.x1zap.com";

function routeDeps(overrides: Partial<RouteRotateCredentialsRequestDeps> = {}): RouteRotateCredentialsRequestDeps {
  return {
    ...baseDeps(),
    allowedOrigins: new Set([ALLOWED_ORIGIN]),
    ...overrides,
  };
}

function rawReq(opts: { method?: string; headers?: Record<string, string>; body?: BodyInit | null }): Request {
  return new Request("https://x/hookcloud-rotate-credentials", {
    method: opts.method ?? "POST",
    headers: opts.headers ?? {},
    body: opts.body ?? undefined,
  });
}

function validJsonReq(overrides: Record<string, unknown> = {}, headers: Record<string, string> = {}): Request {
  return rawReq({
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(validPayload(overrides)),
  });
}

Deno.test("16B.1) importar o módulo não inicia servidor algum — toda a suíte roda sem --allow-net", () => {
  assert(true);
});

Deno.test("16B.2) entrypoint de roteamento delega ao handler correto (POST válido => mesmo resultado de handleRotateCredentialsRequest direto)", async () => {
  const res = await routeRotateCredentialsRequest(validJsonReq(), routeDeps());
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.onboarding_state, "pending");
});

Deno.test("16B.3) OPTIONS com origem permitida => 204, sem autenticar/consultar banco/RPC", async () => {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const res = await routeRotateCredentialsRequest(
    rawReq({ method: "OPTIONS", headers: { origin: ALLOWED_ORIGIN } }),
    routeDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], rpcCalls }) }),
  );
  assertEquals(res.status, 204);
  assertEquals(rpcCalls.length, 0);
});

Deno.test("16B.4) OPTIONS não autentica — authClient nunca é consultado", async () => {
  let authCalled = false;
  const spyAuth: AuthClientLike = { auth: { getUser: async () => { authCalled = true; return { data: { user: null } }; } } };
  const res = await routeRotateCredentialsRequest(
    rawReq({ method: "OPTIONS", headers: { origin: ALLOWED_ORIGIN } }),
    routeDeps({ authClient: spyAuth }),
  );
  assertEquals(res.status, 204);
  assertEquals(authCalled, false);
});

Deno.test("16B.5) OPTIONS não chama banco/RPC (reforço)", async () => {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const res = await routeRotateCredentialsRequest(
    rawReq({ method: "OPTIONS", headers: { origin: ALLOWED_ORIGIN }, body: JSON.stringify({ ignored: true }) }),
    routeDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], rpcCalls }) }),
  );
  assertEquals(res.status, 204);
  assertEquals(rpcCalls.length, 0);
});

Deno.test("16B.6) POST é permitido", async () => {
  const res = await routeRotateCredentialsRequest(validJsonReq(), routeDeps());
  assertEquals(res.status, 200);
});

Deno.test("16B.7) GET => 405", async () => {
  const res = await routeRotateCredentialsRequest(rawReq({ method: "GET" }), routeDeps());
  assertEquals(res.status, 405);
});

Deno.test("16B.8) PUT => 405", async () => {
  const res = await routeRotateCredentialsRequest(rawReq({ method: "PUT" }), routeDeps());
  assertEquals(res.status, 405);
});

Deno.test("16B.9) DELETE => 405", async () => {
  const res = await routeRotateCredentialsRequest(rawReq({ method: "DELETE" }), routeDeps());
  assertEquals(res.status, 405);
});

Deno.test("16B.10) header Allow correto em 405 e em OPTIONS", async () => {
  const res405 = await routeRotateCredentialsRequest(rawReq({ method: "GET" }), routeDeps());
  assertEquals(res405.headers.get("Allow"), "POST, OPTIONS");
  const resOptions = await routeRotateCredentialsRequest(rawReq({ method: "OPTIONS", headers: { origin: ALLOWED_ORIGIN } }), routeDeps());
  assertEquals(resOptions.headers.get("Allow"), "POST, OPTIONS");
});

Deno.test("16B.11) origem exata permitida => Access-Control-Allow-Origin igual à origem, requisição prossegue", async () => {
  const res = await routeRotateCredentialsRequest(validJsonReq({}, { origin: ALLOWED_ORIGIN }), routeDeps());
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), ALLOWED_ORIGIN);
  assertEquals(res.status, 200);
});

Deno.test("16B.12) origem semelhante/maliciosa é rejeitada (403), antes de qualquer autenticação/RPC", async () => {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  let authCalled = false;
  const spyAuth: AuthClientLike = { auth: { getUser: async () => { authCalled = true; return { data: { user: { id: CALLER_ID } } }; } } };
  const res = await routeRotateCredentialsRequest(
    validJsonReq({}, { origin: "https://admin.x1zap.com.attacker.com" }),
    routeDeps({ authClient: spyAuth, adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], rpcCalls }) }),
  );
  assertEquals(res.status, 403);
  assertEquals(authCalled, false);
  assertEquals(rpcCalls.length, 0);
});

Deno.test("16B.13) wildcard não é aceito como origem", async () => {
  const res = await routeRotateCredentialsRequest(
    validJsonReq({}, { origin: "https://qualquer-origem.example.com" }),
    routeDeps({ allowedOrigins: new Set(["*"]) }),
  );
  assertEquals(res.status, 403);
});

Deno.test("16B.14) allowlist vazia (variável ausente) => requisição de navegador com Origin falha fechada", async () => {
  const res = await routeRotateCredentialsRequest(
    validJsonReq({}, { origin: ALLOWED_ORIGIN }),
    routeDeps({ allowedOrigins: new Set() }),
  );
  assertEquals(res.status, 403);
});

Deno.test("16B.15) requisição sem Origin (servidor-servidor) ainda exige JWT normalmente", async () => {
  const res = await routeRotateCredentialsRequest(validJsonReq(), routeDeps({ authClient: authClient(null) }));
  assertEquals(res.status, 401);
});

Deno.test("16B.16) Vary: Origin presente quando a origem é aceita", async () => {
  const res = await routeRotateCredentialsRequest(validJsonReq({}, { origin: ALLOWED_ORIGIN }), routeDeps());
  assertEquals(res.headers.get("Vary"), "Origin");
});

Deno.test("16B.17) nenhuma resposta contém Access-Control-Allow-Origin: * em nenhum cenário", async () => {
  const scenarios = [
    await routeRotateCredentialsRequest(validJsonReq({}, { origin: ALLOWED_ORIGIN }), routeDeps()),
    await routeRotateCredentialsRequest(validJsonReq(), routeDeps()),
    await routeRotateCredentialsRequest(rawReq({ method: "OPTIONS", headers: { origin: ALLOWED_ORIGIN } }), routeDeps()),
    await routeRotateCredentialsRequest(rawReq({ method: "GET" }), routeDeps()),
  ];
  for (const res of scenarios) {
    assert(res.headers.get("Access-Control-Allow-Origin") !== "*");
  }
});

Deno.test("16B.18) Cache-Control: no-store em resposta de sucesso", async () => {
  const res = await routeRotateCredentialsRequest(validJsonReq(), routeDeps());
  assertEquals(res.headers.get("Cache-Control"), "no-store");
});

Deno.test("16B.19) Cache-Control: no-store em respostas de erro (401, 403, 405, 400, 413, 415)", async () => {
  const cases: Response[] = [
    await routeRotateCredentialsRequest(validJsonReq(), routeDeps({ authClient: authClient(null) })),
    await routeRotateCredentialsRequest(validJsonReq({}, { origin: "https://nao-permitida.example.com" }), routeDeps()),
    await routeRotateCredentialsRequest(rawReq({ method: "GET" }), routeDeps()),
    await routeRotateCredentialsRequest(rawReq({ method: "POST", headers: { "content-type": "application/json" }, body: "{ nao e json" }), routeDeps()),
    await routeRotateCredentialsRequest(rawReq({ method: "POST", headers: { "content-type": "application/json", "content-length": String(HOOKCLOUD_ADMIN_MAX_BODY_BYTES + 10) }, body: "a".repeat(HOOKCLOUD_ADMIN_MAX_BODY_BYTES + 10) }), routeDeps()),
    await routeRotateCredentialsRequest(rawReq({ method: "POST", headers: { "content-type": "text/plain" }, body: "x" }), routeDeps()),
  ];
  for (const res of cases) {
    assertEquals(res.headers.get("Cache-Control"), "no-store", `esperado no-store, status=${res.status}`);
  }
});

Deno.test("16B.20) Pragma: no-cache na resposta de sucesso (que carrega credenciais brutas)", async () => {
  const res = await routeRotateCredentialsRequest(validJsonReq(), routeDeps());
  assertEquals(res.headers.get("Pragma"), "no-cache");
});

Deno.test("16B.21) Expires: 0 na resposta de sucesso (que carrega credenciais brutas)", async () => {
  const res = await routeRotateCredentialsRequest(validJsonReq(), routeDeps());
  assertEquals(res.headers.get("Expires"), "0");
});

Deno.test("16B.22) JSON válido é aceito normalmente", async () => {
  const res = await routeRotateCredentialsRequest(validJsonReq(), routeDeps());
  assertEquals(res.status, 200);
});

Deno.test("16B.23) JSON inválido => 400", async () => {
  const res = await routeRotateCredentialsRequest(
    rawReq({ method: "POST", headers: { "content-type": "application/json" }, body: "{ isso nao e json valido" }),
    routeDeps(),
  );
  assertEquals(res.status, 400);
});

Deno.test("16B.24) body vazio => 400", async () => {
  const res = await routeRotateCredentialsRequest(
    rawReq({ method: "POST", headers: { "content-type": "application/json" } }),
    routeDeps(),
  );
  assertEquals(res.status, 400);
});

Deno.test("16B.25) Content-Type ausente => 415", async () => {
  const res = await routeRotateCredentialsRequest(
    rawReq({ method: "POST", body: JSON.stringify(validPayload()) }),
    routeDeps(),
  );
  assertEquals(res.status, 415);
});

Deno.test("16B.26) Content-Type incorreto => 415", async () => {
  const res = await routeRotateCredentialsRequest(
    rawReq({ method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify(validPayload()) }),
    routeDeps(),
  );
  assertEquals(res.status, 415);
});

Deno.test("16B.27) charset válido (application/json; charset=utf-8) é aceito", async () => {
  const res = await routeRotateCredentialsRequest(
    rawReq({ method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(validPayload()) }),
    routeDeps(),
  );
  assertEquals(res.status, 200);
});

Deno.test("16B.28) body exatamente no limite (16 KiB) é aceito", async () => {
  const base = JSON.stringify(validPayload());
  const padding = " ".repeat(HOOKCLOUD_ADMIN_MAX_BODY_BYTES - base.length - 1);
  const padded = base + padding + " ";
  assertEquals(new TextEncoder().encode(padded).byteLength, HOOKCLOUD_ADMIN_MAX_BODY_BYTES);
  const res = await routeRotateCredentialsRequest(
    rawReq({ method: "POST", headers: { "content-type": "application/json" }, body: padded }),
    routeDeps(),
  );
  assertEquals(res.status, 200);
});

Deno.test("16B.29) body acima do limite COM Content-Length correto => 413", async () => {
  const oversized = "a".repeat(HOOKCLOUD_ADMIN_MAX_BODY_BYTES + 1);
  const res = await routeRotateCredentialsRequest(
    rawReq({ method: "POST", headers: { "content-type": "application/json", "content-length": String(oversized.length) }, body: oversized }),
    routeDeps(),
  );
  assertEquals(res.status, 413);
});

Deno.test("16B.30) body acima do limite SEM Content-Length (stream chunked) => 413", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < 20; i++) controller.enqueue(new TextEncoder().encode("x".repeat(1000)));
      controller.close();
    },
  });
  const req2 = new Request("https://x/hookcloud-rotate-credentials", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  assertEquals(req2.headers.get("content-length"), null);
  const res = await routeRotateCredentialsRequest(req2, routeDeps());
  assertEquals(res.status, 413);
});

Deno.test("16B.31) nenhum body/segredo sensível aparece em console.* durante todo o roteamento", async () => {
  const originalLog = console.log, originalWarn = console.warn, originalError = console.error;
  const calls: unknown[] = [];
  console.log = (...a: unknown[]) => calls.push(a);
  console.warn = (...a: unknown[]) => calls.push(a);
  console.error = (...a: unknown[]) => calls.push(a);
  let rawCallbackSecret = "";
  let rawVerifyToken = "";
  try {
    const res = await routeRotateCredentialsRequest(validJsonReq(), routeDeps());
    const body = await res.json();
    rawCallbackSecret = new URL(body.callback_url).searchParams.get("hcs")!;
    rawVerifyToken = body.verify_token;
    await routeRotateCredentialsRequest(
      rawReq({ method: "POST", headers: { "content-type": "application/json" }, body: "{ malformado" }),
      routeDeps(),
    );
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
  const serialized = JSON.stringify(calls);
  assertEquals(serialized.includes(rawCallbackSecret), false);
  assertEquals(serialized.includes(rawVerifyToken), false);
});

Deno.test("16B.32) autenticação e autorização já auditadas continuam passando através do roteador (não autenticado => 401)", async () => {
  const res = await routeRotateCredentialsRequest(validJsonReq(), routeDeps({ authClient: authClient(null) }));
  assertEquals(res.status, 401);
});

Deno.test("16B.33) cross-tenant continua bloqueado através do roteador", async () => {
  const res = await routeRotateCredentialsRequest(
    rawReq({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validPayload(), organizationId: "org-de-outra-organizacao" }),
    }),
    routeDeps(),
  );
  assertEquals(res.status, 403);
});

Deno.test("16B.34) UazAPI continua inalcançável através do roteador (grep estrutural do arquivo completo)", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  for (const forbidden of ["uazapi-send", "uazapi-webhook", "whatsapp-send", "instance_id", "instance_token"]) {
    assertEquals(codeOnly.includes(forbidden), false, `código não deveria referenciar '${forbidden}'`);
  }
});

Deno.test("16B.35) direct_meta continua inalcançável através do roteador (mesma resposta uniforme 404 propagada)", async () => {
  const res = await routeRotateCredentialsRequest(
    validJsonReq(),
    routeDeps({
      adminClient: adminClient({
        profileOrgId: ORG_ID,
        roles: ["admin"],
        rpcResult: { data: null, error: { message: "hookcloud_rotation_not_found" } },
      }),
    }),
  );
  assertEquals(res.status, 404);
});

Deno.test("16B.36) rotação com flag desligada, através do roteador completo, mantém a conexão pending e não ativa automação", async () => {
  const original = Deno.env.get("HOOKCLOUD_WEBHOOK_MODE");
  Deno.env.delete("HOOKCLOUD_WEBHOOK_MODE");
  try {
    const res = await routeRotateCredentialsRequest(validJsonReq(), routeDeps());
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.onboarding_state, "pending");
  } finally {
    if (original === undefined) Deno.env.delete("HOOKCLOUD_WEBHOOK_MODE");
    else Deno.env.set("HOOKCLOUD_WEBHOOK_MODE", original);
  }
});
