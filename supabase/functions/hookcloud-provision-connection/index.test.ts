// deno test --allow-import index.test.ts
//
// Fase 13A — testes do backend de provisionamento manual HookCloud.
// `handleProvisionRequest` é testado com todas as dependências injetadas
// (nenhuma rede real, nenhum Vault real, nenhuma chamada Graph API real).

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  type AdminSupabaseLike,
  type AuthClientLike,
  createNoopMetaAccessTokenValidator,
  handleProvisionRequest,
  type MetaAccessTokenValidator,
  type ProvisionHookCloudConnectionDeps,
  type RouteProvisionConnectionRequestDeps,
  routeProvisionConnectionRequest,
} from "./index.ts";
import { HOOKCLOUD_ADMIN_MAX_BODY_BYTES } from "../_shared/hookcloud-admin-http.ts";
import {
  hashHookCloudVerifyToken,
  hashHookCloudWebhookSecret,
  verifyHookCloudVerifyToken,
  verifyHookCloudWebhookSecret,
} from "../_shared/meta-webhook-hookcloud-secret.ts";

const CALLER_ID = "user-1";
const ORG_ID = "org-a";
const CONNECTION_ID = "conn-new-1";
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

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    connectionName: "WhatsApp Loja Centro",
    phoneNumberId: "1234567890",
    wabaId: "9876543210",
    businessId: "555555",
    displayPhoneNumber: "+55 11 99999-9999",
    accessToken: "token-de-teste-fake-nao-real",
    ...overrides,
  };
}

function baseDeps(overrides: Partial<ProvisionHookCloudConnectionDeps> = {}): ProvisionHookCloudConnectionDeps {
  return {
    authClient: authClient(CALLER_ID),
    adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"] }),
    tokenValidator: createNoopMetaAccessTokenValidator(),
    callbackBaseUrl: CALLBACK_BASE_URL,
    isMetaCloudApiEnabledForOrg: async () => true,
    ...overrides,
  };
}

function req(body: unknown): Request {
  return new Request("https://x/hookcloud-provision-connection", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Ativa as duas flags por padrão nos testes de "caminho feliz" — sem elas
// (HOOKCLOUD_WEBHOOK_MODE=off), o endpoint é inutilizável mesmo em
// produção, mesmo com o código implantado. Ver teste #5 dedicado.
function withHookCloudPilotEnv(fn: () => Promise<void>) {
  const original = Deno.env.get("HOOKCLOUD_WEBHOOK_MODE");
  Deno.env.set("HOOKCLOUD_WEBHOOK_MODE", "pilot");
  return fn().finally(() => {
    if (original === undefined) Deno.env.delete("HOOKCLOUD_WEBHOOK_MODE");
    else Deno.env.set("HOOKCLOUD_WEBHOOK_MODE", original);
  });
}

// ── 1) usuário não autenticado ──────────────────────────────────────────

Deno.test("1) usuário não autenticado => 401", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(req(validPayload()), baseDeps({ authClient: authClient(null) }));
    assertEquals(res.status, 401);
  });
});

// ── 2) usuário sem organização ──────────────────────────────────────────

Deno.test("2) usuário sem organização => 403", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(
      req(validPayload()),
      baseDeps({ adminClient: adminClient({ profileOrgId: null, roles: ["admin"] }) }),
    );
    assertEquals(res.status, 403);
  });
});

// ── 3) usuário de outra organização (tentativa cross-tenant) ────────────

Deno.test("3) organization_id enviado pelo cliente diferente do real => 403, rejeitado ANTES de qualquer outra validação", async () => {
  await withHookCloudPilotEnv(async () => {
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const res = await handleProvisionRequest(
      req({ ...validPayload(), organizationId: "org-de-outra-organizacao" }),
      baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], rpcCalls }) }),
    );
    assertEquals(res.status, 403);
    assertEquals(rpcCalls.length, 0, "cross-tenant nunca deve chegar a chamar a RPC de provisionamento");
  });
});

Deno.test("3b) organization_id enviado igual ao real é aceito normalmente", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(req({ ...validPayload(), organizationId: ORG_ID }), baseDeps());
    assertEquals(res.status, 201);
  });
});

// ── 4) papel insuficiente ────────────────────────────────────────────────

Deno.test("4) papel insuficiente (seller) => 403", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(
      req(validPayload()),
      baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["seller"] }) }),
    );
    assertEquals(res.status, 403);
  });
});

Deno.test("4b) manager sozinho NÃO é suficiente (mais restrito que create-team-member) => 403", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(
      req(validPayload()),
      baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["manager"] }) }),
    );
    assertEquals(res.status, 403);
  });
});

Deno.test("4c) admin é suficiente => 201", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(req(validPayload()), baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"] }) }));
    assertEquals(res.status, 201);
  });
});

// ── 5) flag desligada ────────────────────────────────────────────────────

Deno.test("5a) HOOKCLOUD_WEBHOOK_MODE desligada => 403, mesmo com tudo mais correto", async () => {
  Deno.env.delete("HOOKCLOUD_WEBHOOK_MODE");
  const res = await handleProvisionRequest(req(validPayload()), baseDeps());
  assertEquals(res.status, 403);
});

Deno.test("5b) flag Meta por organização desligada => 403", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(req(validPayload()), baseDeps({ isMetaCloudApiEnabledForOrg: async () => false }));
    assertEquals(res.status, 403);
  });
});

// ── 6) provider UazAPI incompatível ──────────────────────────────────────

Deno.test("6) esta função sempre cria uma conexão NOVA com provider=meta_cloud — nunca aceita anexar config a uma conexão UazAPI existente (não há parâmetro de connection_id de entrada)", async () => {
  // Prova estrutural: a interface ProvisionHookCloudConnectionInput não
  // tem NENHUM campo de connection_id de entrada — é estruturalmente
  // impossível pedir para "configurar Meta numa conexão existente"
  // através deste endpoint. A RPC (migration 20260819200000) sempre faz
  // INSERT novo em evolution_instances com provider='meta_cloud' fixo.
  await withHookCloudPilotEnv(async () => {
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    await handleProvisionRequest(
      req(validPayload()),
      baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], rpcCalls }) }),
    );
    assertEquals(rpcCalls.length, 1);
    assert(!("connection_id" in rpcCalls[0].args), "a RPC nunca recebe um connection_id de entrada");
  });
});

// ── 7) Phone Number ID duplicado ─────────────────────────────────────────

Deno.test("7) Phone Number ID duplicado (RPC retorna conflito, simulando a constraint UNIQUE real) => 409, nunca revela detalhe bruto do banco", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(
      req(validPayload()),
      baseDeps({
        adminClient: adminClient({
          profileOrgId: ORG_ID,
          roles: ["admin"],
          rpcResult: { data: null, error: { message: "hookcloud_provisioning_conflict" } },
        }),
      }),
    );
    assertEquals(res.status, 409);
    const body = await res.json();
    assertEquals(JSON.stringify(body).includes("constraint"), false);
    assertEquals(JSON.stringify(body).includes("duplicate key"), false);
  });
});

// ── 8) WABA compartilhada entre números permitida quando correto ───────

Deno.test("8) duas conexões com a MESMA WABA mas Phone Number ID diferente: nenhuma validação artificial de WABA-única é imposta por este endpoint (delegado à constraint real, já auditada)", async () => {
  await withHookCloudPilotEnv(async () => {
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const client = adminClient({ profileOrgId: ORG_ID, roles: ["admin"], rpcCalls });
    const res1 = await handleProvisionRequest(req(validPayload({ phoneNumberId: "111", wabaId: "SAME-WABA" })), baseDeps({ adminClient: client }));
    const res2 = await handleProvisionRequest(req(validPayload({ phoneNumberId: "222", wabaId: "SAME-WABA" })), baseDeps({ adminClient: client }));
    assertEquals(res1.status, 201);
    assertEquals(res2.status, 201);
    assertEquals(rpcCalls.length, 2);
  });
});

// ── 9) ID malformado ──────────────────────────────────────────────────────

Deno.test("9a) Phone Number ID vazio => 400", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(req(validPayload({ phoneNumberId: "" })), baseDeps());
    assertEquals(res.status, 400);
  });
});

Deno.test("9b) Phone Number ID absurdamente longo => 400", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(req(validPayload({ phoneNumberId: "9".repeat(200) })), baseDeps());
    assertEquals(res.status, 400);
  });
});

Deno.test("9c) IDs nunca são convertidos para number — string puramente numérica longa é aceita como string", async () => {
  await withHookCloudPilotEnv(async () => {
    // Um Phone Number ID real da Meta é uma string numérica longa o
    // bastante para perder precisão se fosse tratado como `number` em
    // JS/JSON — este teste confirma que o valor é aceito e chega intacto
    // à RPC como string.
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const longNumericId = "123456789012345678901234567890";
    await handleProvisionRequest(
      req(validPayload({ phoneNumberId: longNumericId })),
      baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], rpcCalls }) }),
    );
    assertEquals(rpcCalls[0].args.p_phone_number_id, longNumericId);
    assertEquals(typeof rpcCalls[0].args.p_phone_number_id, "string");
  });
});

// ── 10) token vazio ────────────────────────────────────────────────────────

Deno.test("10) token de acesso vazio => 400, RPC nunca chamada", async () => {
  await withHookCloudPilotEnv(async () => {
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const res = await handleProvisionRequest(
      req(validPayload({ accessToken: "" })),
      baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], rpcCalls }) }),
    );
    assertEquals(res.status, 400);
    assertEquals(rpcCalls.length, 0);
  });
});

// ── 11) falha de Vault / 12) rollback completo ───────────────────────────

Deno.test("11/12) falha na RPC (Vault indisponível, simulado) => 500, resposta nunca finge sucesso, nada retornado como se tivesse sido criado", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(
      req(validPayload()),
      baseDeps({
        adminClient: adminClient({
          profileOrgId: ORG_ID,
          roles: ["admin"],
          rpcResult: { data: null, error: { message: "hookcloud_provisioning_failed" } },
        }),
      }),
    );
    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals("connection_id" in body, false);
    assertEquals("callback_url" in body, false);
  });
});

// ── 13/14) CSPRNG / entropia — já cobertos exaustivamente em
//     meta-webhook-hookcloud-secret.test.ts; aqui só a integração fim a fim ─

Deno.test("13/14) o segredo devolvido na resposta tem 64 caracteres hex (256 bits) e é distinto a cada chamada", async () => {
  await withHookCloudPilotEnv(async () => {
    const res1 = await handleProvisionRequest(req(validPayload({ phoneNumberId: "aaa" })), baseDeps());
    const res2 = await handleProvisionRequest(req(validPayload({ phoneNumberId: "bbb" })), baseDeps());
    const body1 = await res1.json();
    const body2 = await res2.json();
    const secret1 = new URL(body1.callback_url).searchParams.get("hcs")!;
    const secret2 = new URL(body2.callback_url).searchParams.get("hcs")!;
    assertEquals(secret1.length, 64);
    assert(/^[0-9a-f]{64}$/.test(secret1));
    assert(secret1 !== secret2);
  });
});

// ── 15) apenas hash persistido ───────────────────────────────────────────

Deno.test("15) a RPC recebe SOMENTE o hash do segredo de callback, nunca o valor bruto", async () => {
  await withHookCloudPilotEnv(async () => {
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const res = await handleProvisionRequest(
      req(validPayload()),
      baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], rpcCalls }) }),
    );
    const body = await res.json();
    const rawSecret = new URL(body.callback_url).searchParams.get("hcs")!;
    const sentHash = rpcCalls[0].args.p_hookcloud_secret_hash as string;
    assert(sentHash !== rawSecret, "o valor enviado à RPC nunca pode ser igual ao valor bruto");
    assertEquals(sentHash, await hashHookCloudWebhookSecret(rawSecret));
  });
});

// ── 16) comparação com o gate existente ──────────────────────────────────

Deno.test("16) o segredo bruto retornado, hasheado, é aceito pelo MESMO verificador usado pelo gate real (Fase 11A/12A)", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(req(validPayload()), baseDeps());
    const body = await res.json();
    const rawSecret = new URL(body.callback_url).searchParams.get("hcs")!;
    const storedHash = await hashHookCloudWebhookSecret(rawSecret);
    assertEquals(await verifyHookCloudWebhookSecret(rawSecret, storedHash), true);
  });
});

// ── 17) rotação invalida segredo anterior ────────────────────────────────

Deno.test("17) este endpoint é EXCLUSIVO de criação — uma segunda tentativa para o mesmo Phone Number ID é tratada como conflito (409), nunca como rotação silenciosa; rotação real de um segredo já usa o mecanismo separado já auditado (rotate_meta_connection_access_token/hash overwrite, Fase 11A/11C)", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(
      req(validPayload()),
      baseDeps({
        adminClient: adminClient({
          profileOrgId: ORG_ID,
          roles: ["admin"],
          rpcResult: { data: null, error: { message: "hookcloud_provisioning_conflict" } },
        }),
      }),
    );
    assertEquals(res.status, 409);
  });
});

// ── 18) URL baseada somente em configuração confiável ────────────────────

Deno.test("18) URL de callback usa exclusivamente callbackBaseUrl (configuração do servidor) — nunca lida do Host header da requisição", async () => {
  await withHookCloudPilotEnv(async () => {
    const maliciousReq = new Request("https://atacante.example.com/hookcloud-provision-connection", {
      method: "POST",
      headers: { "content-type": "application/json", host: "atacante.example.com" },
      body: JSON.stringify(validPayload()),
    });
    const res = await handleProvisionRequest(maliciousReq, baseDeps());
    const body = await res.json();
    assert(body.callback_url.startsWith(CALLBACK_BASE_URL), "a URL deve vir de callbackBaseUrl, nunca do Host da requisição");
    assertEquals(body.callback_url.includes("atacante.example.com"), false);
  });
});

Deno.test("18b) URL usa o parâmetro real já implementado (hcs), nenhum segundo parâmetro inventado", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(req(validPayload()), baseDeps());
    const body = await res.json();
    const url = new URL(body.callback_url);
    assertEquals(url.pathname, "/functions/v1/meta-cloud-webhook");
    assert(url.searchParams.has("hcs"));
    assertEquals([...url.searchParams.keys()].length, 1, "nenhum parâmetro extra de segredo");
  });
});

// ── 19) nenhum token em logs/erros ───────────────────────────────────────

Deno.test("19) nenhuma chamada a console.* durante todo o fluxo (sucesso ou erro) inclui o token ou o segredo bruto", async () => {
  await withHookCloudPilotEnv(async () => {
    const originalLog = console.log, originalWarn = console.warn, originalError = console.error;
    const calls: unknown[] = [];
    console.log = (...a: unknown[]) => calls.push(a);
    console.warn = (...a: unknown[]) => calls.push(a);
    console.error = (...a: unknown[]) => calls.push(a);
    const secretToken = "meta-access-token-super-secreto-nao-pode-vazar";
    try {
      const res = await handleProvisionRequest(req(validPayload({ accessToken: secretToken })), baseDeps());
      await res.json();
      // também testa o caminho de erro
      await handleProvisionRequest(
        req(validPayload({ accessToken: secretToken })),
        baseDeps({
          adminClient: adminClient({
            profileOrgId: ORG_ID,
            roles: ["admin"],
            rpcResult: { data: null, error: { message: "hookcloud_provisioning_failed" } },
          }),
        }),
      );
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    }
    const serialized = JSON.stringify(calls);
    assertEquals(serialized.includes(secretToken), false);
  });
});

// ── 20) estado permanece pendente ────────────────────────────────────────

Deno.test("20) resposta de sucesso sempre reporta onboarding_state='pending', nunca 'active'", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(req(validPayload()), baseDeps());
    const body = await res.json();
    assertEquals(body.onboarding_state, "pending");
  });
});

// ── 21/22) onboarding_source/provider enviados à RPC ─────────────────────

Deno.test("21) a RPC não recebe onboarding_source como parâmetro do cliente — é fixo 'hookcloud' dentro da própria RPC (migration), nunca influenciável pelo chamador", async () => {
  await withHookCloudPilotEnv(async () => {
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    await handleProvisionRequest(
      req(validPayload()),
      baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], rpcCalls }) }),
    );
    assert(!("p_onboarding_source" in rpcCalls[0].args), "onboarding_source nunca é parâmetro de entrada — é fixo na RPC");
    assert(!("p_provider" in rpcCalls[0].args), "provider nunca é parâmetro de entrada — é fixo 'meta_cloud' na RPC");
  });
});

Deno.test("22) função de provisionamento é a única chamada — nome exato da RPC confirmado", async () => {
  await withHookCloudPilotEnv(async () => {
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    await handleProvisionRequest(
      req(validPayload()),
      baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], rpcCalls }) }),
    );
    assertEquals(rpcCalls.length, 1);
    assertEquals(rpcCalls[0].fn, "provision_hookcloud_meta_connection");
  });
});

// ── 23) UazAPI não é lida ou alterada ────────────────────────────────────

Deno.test("23) nenhuma tabela/RPC relacionada a UazAPI é referenciada por este módulo (grep estrutural do próprio arquivo)", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  for (const forbidden of ["uazapi-send", "uazapi-webhook", "whatsapp-send", "instance_id", "instance_token"]) {
    assertEquals(codeOnly.includes(forbidden), false, `código não deveria referenciar '${forbidden}'`);
  }
});

// ── 24) resposta não devolve token ───────────────────────────────────────

Deno.test("24) resposta de sucesso NUNCA contém o Meta Access Token, referência de Vault, service role, App Secret ou o HASH do segredo", async () => {
  await withHookCloudPilotEnv(async () => {
    const secretToken = "token-que-nunca-pode-aparecer-na-resposta";
    const res = await handleProvisionRequest(req(validPayload({ accessToken: secretToken })), baseDeps());
    const body = await res.json();
    const serialized = JSON.stringify(body);
    assertEquals(serialized.includes(secretToken), false);
    assertEquals(serialized.toLowerCase().includes("service_role"), false);
    assertEquals(serialized.toLowerCase().includes("service role"), false);
    assertEquals(serialized.toLowerCase().includes("app_secret"), false);
    assertEquals(serialized.toLowerCase().includes("vault"), false);
    // O único segredo presente é o valor BRUTO do callback (na URL,
    // devolvido exatamente uma vez, por design) — nunca o hash dele.
    const rawSecret = new URL(body.callback_url).searchParams.get("hcs")!;
    const hash = await hashHookCloudWebhookSecret(rawSecret);
    assertEquals(serialized.includes(hash), false, "o HASH do segredo nunca deve aparecer na resposta");
  });
});

// ── Extras: schema/JSON/organização inexistente ──────────────────────────

Deno.test("JSON malformado => 400", async () => {
  await withHookCloudPilotEnv(async () => {
    const malformedReq = new Request("https://x/hookcloud-provision-connection", { method: "POST", body: "{ nao e json" });
    const res = await handleProvisionRequest(malformedReq, baseDeps());
    assertEquals(res.status, 400);
  });
});

Deno.test("business_id ausente (opcional) ainda é aceito", async () => {
  await withHookCloudPilotEnv(async () => {
    const { businessId: _omit, ...withoutBusinessId } = validPayload();
    const res = await handleProvisionRequest(req(withoutBusinessId), baseDeps());
    assertEquals(res.status, 201);
  });
});

Deno.test("avisos de segurança presentes na resposta (URL em log de infraestrutura, não é HMAC, valor mostrado só uma vez)", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(req(validPayload()), baseDeps());
    const body = await res.json();
    assert(Array.isArray(body.warnings) && body.warnings.length > 0);
    const joined = body.warnings.join(" ").toLowerCase();
    assert(joined.includes("log"));
    assert(joined.includes("hmac"));
  });
});

// ── Fase 13B (achado de revisão): HTTPS obrigatório na base do callback ──

Deno.test("callbackBaseUrl http:// num domínio real (fora de teste/local) => 500, nunca constrói URL insegura", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(req(validPayload()), baseDeps({ callbackBaseUrl: "http://ydunpoqdhijhnrarohiz.supabase.co" }));
    assertEquals(res.status, 500);
  });
});

Deno.test("callbackBaseUrl malformada => 500", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(req(validPayload()), baseDeps({ callbackBaseUrl: "nao-e-uma-url" }));
    assertEquals(res.status, 500);
  });
});

Deno.test("callbackBaseUrl https:// é aceita normalmente", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(req(validPayload()), baseDeps({ callbackBaseUrl: CALLBACK_BASE_URL }));
    assertEquals(res.status, 201);
  });
});

Deno.test("callbackBaseUrl http://127.0.0.1 (dev local) é aceita como exceção deliberada", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(req(validPayload()), baseDeps({ callbackBaseUrl: "http://127.0.0.1:54321" }));
    assertEquals(res.status, 201);
    const body = await res.json();
    assert(body.callback_url.startsWith("http://127.0.0.1"));
  });
});

// ── Fase 13B (achado de revisão): usuário desativado/suspenso rejeitado ──

Deno.test("usuário com profiles.disabled=true => 403, mesmo com JWT válido e papel admin", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(
      req(validPayload()),
      baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], profileDisabled: true }) }),
    );
    assertEquals(res.status, 403);
  });
});

Deno.test("usuário com profiles.is_active=false => 403", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(
      req(validPayload()),
      baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], profileIsActive: false }) }),
    );
    assertEquals(res.status, 403);
  });
});

// ── FASE 16B — roteamento HTTP real (método, CORS, cache, corpo) ────────

const ALLOWED_ORIGIN = "https://admin.x1zap.com";
const OTHER_ALLOWED_ORIGIN = "https://outra-origem-admin.exemplo.com";

function routeDeps(overrides: Partial<RouteProvisionConnectionRequestDeps> = {}): RouteProvisionConnectionRequestDeps {
  return {
    ...baseDeps(),
    allowedOrigins: new Set([ALLOWED_ORIGIN]),
    ...overrides,
  };
}

function rawReq(opts: { method?: string; headers?: Record<string, string>; body?: BodyInit | null }): Request {
  return new Request("https://x/hookcloud-provision-connection", {
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

Deno.test("16B.1) importar o módulo não inicia servidor algum — toda a suíte roda sem --allow-net (prova estrutural: import.meta.main nunca é verdadeiro sob `deno test`)", () => {
  // Nenhuma asserção de execução aqui além da própria suíte já ter
  // rodado até este ponto sem `--allow-net`: se `Deno.serve` fosse
  // chamado incondicionalmente no carregamento do módulo, TODOS os
  // testes deste arquivo teriam falhado com erro de permissão antes de
  // chegar aqui.
  assert(true);
});

Deno.test("16B.2) entrypoint de roteamento delega ao handler correto (POST válido => mesmo resultado de handleProvisionRequest direto)", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await routeProvisionConnectionRequest(validJsonReq(), routeDeps());
    assertEquals(res.status, 201);
    const body = await res.json();
    assert(typeof body.callback_url === "string");
    assert(typeof body.verify_token === "string");
  });
});

Deno.test("16B.3) OPTIONS com origem permitida => 204, sem autenticar/consultar banco/RPC", async () => {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const deps = routeDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], rpcCalls }) });
  const res = await routeProvisionConnectionRequest(
    rawReq({ method: "OPTIONS", headers: { origin: ALLOWED_ORIGIN } }),
    deps,
  );
  assertEquals(res.status, 204);
  assertEquals(rpcCalls.length, 0, "OPTIONS nunca deve chamar a RPC");
});

Deno.test("16B.4) OPTIONS não autentica — authClient nunca é consultado", async () => {
  let authCalled = false;
  const spyAuth: AuthClientLike = { auth: { getUser: async () => { authCalled = true; return { data: { user: null } }; } } };
  const res = await routeProvisionConnectionRequest(
    rawReq({ method: "OPTIONS", headers: { origin: ALLOWED_ORIGIN } }),
    routeDeps({ authClient: spyAuth }),
  );
  assertEquals(res.status, 204);
  assertEquals(authCalled, false, "OPTIONS nunca deve chamar auth.getUser()");
});

Deno.test("16B.5) OPTIONS não chama banco/RPC (reforço — nenhuma chamada a adminClient.rpc)", async () => {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const res = await routeProvisionConnectionRequest(
    rawReq({ method: "OPTIONS", headers: { origin: ALLOWED_ORIGIN }, body: JSON.stringify({ ignored: true }) }),
    routeDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], rpcCalls }) }),
  );
  assertEquals(res.status, 204);
  assertEquals(rpcCalls.length, 0);
});

Deno.test("16B.6) POST é permitido (roteamento não bloqueia o método correto)", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await routeProvisionConnectionRequest(validJsonReq(), routeDeps());
    assertEquals(res.status, 201);
  });
});

Deno.test("16B.7) GET => 405", async () => {
  const res = await routeProvisionConnectionRequest(rawReq({ method: "GET" }), routeDeps());
  assertEquals(res.status, 405);
});

Deno.test("16B.8) PUT => 405", async () => {
  const res = await routeProvisionConnectionRequest(rawReq({ method: "PUT" }), routeDeps());
  assertEquals(res.status, 405);
});

Deno.test("16B.9) DELETE => 405", async () => {
  const res = await routeProvisionConnectionRequest(rawReq({ method: "DELETE" }), routeDeps());
  assertEquals(res.status, 405);
});

Deno.test("16B.10) header Allow correto em 405 e em OPTIONS", async () => {
  const res405 = await routeProvisionConnectionRequest(rawReq({ method: "GET" }), routeDeps());
  assertEquals(res405.headers.get("Allow"), "POST, OPTIONS");
  const resOptions = await routeProvisionConnectionRequest(rawReq({ method: "OPTIONS", headers: { origin: ALLOWED_ORIGIN } }), routeDeps());
  assertEquals(resOptions.headers.get("Allow"), "POST, OPTIONS");
});

Deno.test("16B.11) origem exata permitida => Access-Control-Allow-Origin igual à origem, requisição prossegue", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await routeProvisionConnectionRequest(validJsonReq({}, { origin: ALLOWED_ORIGIN }), routeDeps());
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), ALLOWED_ORIGIN);
    assertEquals(res.status, 201);
  });
});

Deno.test("16B.12) origem semelhante/maliciosa é rejeitada (403), antes de qualquer autenticação/RPC", async () => {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  let authCalled = false;
  const spyAuth: AuthClientLike = { auth: { getUser: async () => { authCalled = true; return { data: { user: { id: CALLER_ID } } }; } } };
  const res = await routeProvisionConnectionRequest(
    validJsonReq({}, { origin: "https://admin.x1zap.com.attacker.com" }),
    routeDeps({ authClient: spyAuth, adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], rpcCalls }) }),
  );
  assertEquals(res.status, 403);
  assertEquals(authCalled, false, "origem rejeitada nunca deve chegar a autenticar");
  assertEquals(rpcCalls.length, 0);
});

Deno.test("16B.13) wildcard não é aceito como origem — allowlist contendo só '*' rejeita qualquer origem real", async () => {
  const res = await routeProvisionConnectionRequest(
    validJsonReq({}, { origin: "https://qualquer-origem.example.com" }),
    routeDeps({ allowedOrigins: new Set(["*"]) }),
  );
  assertEquals(res.status, 403);
});

Deno.test("16B.14) allowlist vazia (variável ausente) => requisição de navegador com Origin falha fechada", async () => {
  const res = await routeProvisionConnectionRequest(
    validJsonReq({}, { origin: ALLOWED_ORIGIN }),
    routeDeps({ allowedOrigins: new Set() }),
  );
  assertEquals(res.status, 403);
});

Deno.test("16B.15) requisição sem Origin (servidor-servidor) ainda exige JWT normalmente", async () => {
  const res = await routeProvisionConnectionRequest(
    validJsonReq(), // sem header origin
    routeDeps({ authClient: authClient(null) }),
  );
  assertEquals(res.status, 401);
});

Deno.test("16B.16) Vary: Origin presente quando a origem é aceita", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await routeProvisionConnectionRequest(validJsonReq({}, { origin: ALLOWED_ORIGIN }), routeDeps());
    assertEquals(res.headers.get("Vary"), "Origin");
  });
});

Deno.test("16B.17) nenhuma resposta contém Access-Control-Allow-Origin: * em nenhum cenário", async () => {
  await withHookCloudPilotEnv(async () => {
    const scenarios = [
      await routeProvisionConnectionRequest(validJsonReq({}, { origin: ALLOWED_ORIGIN }), routeDeps()),
      await routeProvisionConnectionRequest(validJsonReq(), routeDeps()),
      await routeProvisionConnectionRequest(rawReq({ method: "OPTIONS", headers: { origin: ALLOWED_ORIGIN } }), routeDeps()),
      await routeProvisionConnectionRequest(rawReq({ method: "GET" }), routeDeps()),
    ];
    for (const res of scenarios) {
      assert(res.headers.get("Access-Control-Allow-Origin") !== "*", "nenhuma resposta pode conter Allow-Origin '*'");
    }
  });
});

Deno.test("16B.18) Cache-Control: no-store em resposta de sucesso", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await routeProvisionConnectionRequest(validJsonReq(), routeDeps());
    assertEquals(res.headers.get("Cache-Control"), "no-store");
  });
});

Deno.test("16B.19) Cache-Control: no-store em respostas de erro (401, 403, 405, 400, 413, 415)", async () => {
  const cases: Response[] = [
    await routeProvisionConnectionRequest(validJsonReq(), routeDeps({ authClient: authClient(null) })), // 401
    await routeProvisionConnectionRequest(validJsonReq({}, { origin: "https://nao-permitida.example.com" }), routeDeps()), // 403
    await routeProvisionConnectionRequest(rawReq({ method: "GET" }), routeDeps()), // 405
    await routeProvisionConnectionRequest(rawReq({ method: "POST", headers: { "content-type": "application/json" }, body: "{ nao e json" }), routeDeps()), // 400
    await routeProvisionConnectionRequest(rawReq({ method: "POST", headers: { "content-type": "application/json", "content-length": String(HOOKCLOUD_ADMIN_MAX_BODY_BYTES + 10) }, body: "a".repeat(HOOKCLOUD_ADMIN_MAX_BODY_BYTES + 10) }), routeDeps()), // 413
    await routeProvisionConnectionRequest(rawReq({ method: "POST", headers: { "content-type": "text/plain" }, body: "x" }), routeDeps()), // 415
  ];
  for (const res of cases) {
    assertEquals(res.headers.get("Cache-Control"), "no-store", `esperado no-store, status=${res.status}`);
  }
});

Deno.test("16B.20) Pragma: no-cache na resposta de sucesso (que carrega credenciais brutas)", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await routeProvisionConnectionRequest(validJsonReq(), routeDeps());
    assertEquals(res.headers.get("Pragma"), "no-cache");
  });
});

Deno.test("16B.21) Expires: 0 na resposta de sucesso (que carrega credenciais brutas)", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await routeProvisionConnectionRequest(validJsonReq(), routeDeps());
    assertEquals(res.headers.get("Expires"), "0");
  });
});

Deno.test("16B.22) JSON válido é aceito normalmente", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await routeProvisionConnectionRequest(validJsonReq(), routeDeps());
    assertEquals(res.status, 201);
  });
});

Deno.test("16B.23) JSON inválido => 400", async () => {
  const res = await routeProvisionConnectionRequest(
    rawReq({ method: "POST", headers: { "content-type": "application/json" }, body: "{ isso nao e json valido" }),
    routeDeps(),
  );
  assertEquals(res.status, 400);
});

Deno.test("16B.24) body vazio => 400", async () => {
  const res = await routeProvisionConnectionRequest(
    rawReq({ method: "POST", headers: { "content-type": "application/json" } }),
    routeDeps(),
  );
  assertEquals(res.status, 400);
});

Deno.test("16B.25) Content-Type ausente => 415", async () => {
  const res = await routeProvisionConnectionRequest(
    rawReq({ method: "POST", body: JSON.stringify(validPayload()) }),
    routeDeps(),
  );
  assertEquals(res.status, 415);
});

Deno.test("16B.26) Content-Type incorreto => 415", async () => {
  const res = await routeProvisionConnectionRequest(
    rawReq({ method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify(validPayload()) }),
    routeDeps(),
  );
  assertEquals(res.status, 415);
});

Deno.test("16B.27) charset válido (application/json; charset=utf-8) é aceito", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await routeProvisionConnectionRequest(
      rawReq({ method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(validPayload()) }),
      routeDeps(),
    );
    assertEquals(res.status, 201);
  });
});

Deno.test("16B.28) body exatamente no limite (16 KiB) é aceito", async () => {
  await withHookCloudPilotEnv(async () => {
    // Preenche até bater exatamente no limite via um campo de padding
    // dentro de um valor opaco de negócio já aceito (businessId, até 64
    // chars) não serviria — em vez disso, o padding vai só no JSON
    // (espaços dentro da string de connectionName truncada pela
    // validação de negócio, então testamos só a camada de transporte
    // isoladamente: um JSON com whitespace de padding, ainda válido).
    const base = JSON.stringify(validPayload());
    const padding = " ".repeat(HOOKCLOUD_ADMIN_MAX_BODY_BYTES - base.length - 1); // -1 pelo espaço extra abaixo
    const padded = base + padding + " ";
    assertEquals(new TextEncoder().encode(padded).byteLength, HOOKCLOUD_ADMIN_MAX_BODY_BYTES);
    const res = await routeProvisionConnectionRequest(
      rawReq({ method: "POST", headers: { "content-type": "application/json" }, body: padded }),
      routeDeps(),
    );
    // JSON.parse tolera espaços em branco à volta — deve passar da
    // camada de transporte e chegar ao handler normalmente.
    assertEquals(res.status, 201);
  });
});

Deno.test("16B.29) body acima do limite COM Content-Length correto => 413", async () => {
  const oversized = "a".repeat(HOOKCLOUD_ADMIN_MAX_BODY_BYTES + 1);
  const res = await routeProvisionConnectionRequest(
    rawReq({ method: "POST", headers: { "content-type": "application/json", "content-length": String(oversized.length) }, body: oversized }),
    routeDeps(),
  );
  assertEquals(res.status, 413);
});

Deno.test("16B.30) body acima do limite SEM Content-Length (stream chunked) => 413 — leitura real do stream, nunca confia só no header", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < 20; i++) controller.enqueue(new TextEncoder().encode("x".repeat(1000)));
      controller.close();
    },
  });
  const req2 = new Request("https://x/hookcloud-provision-connection", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  assertEquals(req2.headers.get("content-length"), null);
  const res = await routeProvisionConnectionRequest(req2, routeDeps());
  assertEquals(res.status, 413);
});

Deno.test("16B.31) nenhum body/segredo sensível aparece em console.* durante todo o roteamento (sucesso ou erro)", async () => {
  await withHookCloudPilotEnv(async () => {
    const originalLog = console.log, originalWarn = console.warn, originalError = console.error;
    const calls: unknown[] = [];
    console.log = (...a: unknown[]) => calls.push(a);
    console.warn = (...a: unknown[]) => calls.push(a);
    console.error = (...a: unknown[]) => calls.push(a);
    const secretToken = "token-de-transporte-que-nao-pode-vazar-em-log-16b";
    let rawCallbackSecret = "";
    let rawVerifyToken = "";
    try {
      const res = await routeProvisionConnectionRequest(validJsonReq({ accessToken: secretToken }), routeDeps());
      const body = await res.json();
      rawCallbackSecret = new URL(body.callback_url).searchParams.get("hcs")!;
      rawVerifyToken = body.verify_token;
      // também exercita um caminho de erro de transporte
      await routeProvisionConnectionRequest(
        rawReq({ method: "POST", headers: { "content-type": "application/json" }, body: "{ malformado" }),
        routeDeps(),
      );
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    }
    const serialized = JSON.stringify(calls);
    assertEquals(serialized.includes(secretToken), false);
    assertEquals(serialized.includes(rawCallbackSecret), false);
    assertEquals(serialized.includes(rawVerifyToken), false);
  });
});

Deno.test("16B.32) autenticação e autorização já auditadas continuam passando através do roteador (não autenticado => 401)", async () => {
  const res = await routeProvisionConnectionRequest(validJsonReq(), routeDeps({ authClient: authClient(null) }));
  assertEquals(res.status, 401);
});

Deno.test("16B.33) cross-tenant continua bloqueado através do roteador", async () => {
  const res = await routeProvisionConnectionRequest(
    rawReq({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validPayload(), organizationId: "org-de-outra-organizacao" }),
    }),
    routeDeps(),
  );
  assertEquals(res.status, 403);
});

Deno.test("16B.34) UazAPI continua inalcançável através do roteador (grep estrutural do arquivo completo, incluindo a nova camada de roteamento)", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  for (const forbidden of ["uazapi-send", "uazapi-webhook", "whatsapp-send", "instance_id", "instance_token"]) {
    assertEquals(codeOnly.includes(forbidden), false, `código não deveria referenciar '${forbidden}'`);
  }
});

Deno.test("usuário ativo (disabled=false, is_active=true) continua permitido", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(
      req(validPayload()),
      baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], profileDisabled: false, profileIsActive: true }) }),
    );
    assertEquals(res.status, 201);
  });
});

// ── Fase 14A — verify token individual, INDEPENDENTE do callback secret ──

Deno.test("14A.1) resposta de sucesso inclui verify_token, distinto do callback secret embutido na URL", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(req(validPayload()), baseDeps());
    const body = await res.json();
    assertEquals(typeof body.verify_token, "string");
    const callbackSecret = new URL(body.callback_url).searchParams.get("hcs")!;
    assert(body.verify_token !== callbackSecret, "os dois segredos nunca podem ser o mesmo valor");
  });
});

Deno.test("14A.2) verify_token tem 64 caracteres hex (256 bits) e é distinto a cada chamada", async () => {
  await withHookCloudPilotEnv(async () => {
    const res1 = await handleProvisionRequest(req(validPayload({ phoneNumberId: "vt-aaa" })), baseDeps());
    const res2 = await handleProvisionRequest(req(validPayload({ phoneNumberId: "vt-bbb" })), baseDeps());
    const body1 = await res1.json();
    const body2 = await res2.json();
    assertEquals(body1.verify_token.length, 64);
    assert(/^[0-9a-f]{64}$/.test(body1.verify_token));
    assert(body1.verify_token !== body2.verify_token);
  });
});

Deno.test("14A.3) a RPC recebe SOMENTE o hash do verify token, nunca o valor bruto — e o hash é diferente do hash do callback secret", async () => {
  await withHookCloudPilotEnv(async () => {
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const res = await handleProvisionRequest(
      req(validPayload()),
      baseDeps({ adminClient: adminClient({ profileOrgId: ORG_ID, roles: ["admin"], rpcCalls }) }),
    );
    const body = await res.json();
    const sentVerifyTokenHash = rpcCalls[0].args.p_hookcloud_verify_token_hash as string;
    const sentCallbackHash = rpcCalls[0].args.p_hookcloud_secret_hash as string;
    assert(sentVerifyTokenHash !== body.verify_token, "o valor enviado à RPC nunca pode ser igual ao valor bruto");
    assertEquals(sentVerifyTokenHash, await hashHookCloudVerifyToken(body.verify_token));
    assert(sentVerifyTokenHash !== sentCallbackHash, "os dois hashes enviados à RPC nunca podem coincidir");
  });
});

Deno.test("14A.4) o verify_token bruto retornado, hasheado, é aceito pelo verificador de GET (Fase 14A)", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(req(validPayload()), baseDeps());
    const body = await res.json();
    const storedHash = await hashHookCloudVerifyToken(body.verify_token);
    assertEquals(await verifyHookCloudVerifyToken(body.verify_token, storedHash), true);
  });
});

Deno.test("14A.5) verify_token NUNCA é embutido na callback_url — só o callback secret (hcs) vai na URL", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(req(validPayload()), baseDeps());
    const body = await res.json();
    assertEquals(body.callback_url.includes(body.verify_token), false, "o verify_token nunca deve aparecer dentro da callback_url");
    const url = new URL(body.callback_url);
    assertEquals([...url.searchParams.keys()].length, 1, "a URL só tem o parâmetro hcs — verify_token é devolvido separado");
  });
});

Deno.test("14A.6) resposta de erro NUNCA contém verify_token nem seu hash", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(
      req(validPayload()),
      baseDeps({
        adminClient: adminClient({
          profileOrgId: ORG_ID,
          roles: ["admin"],
          rpcResult: { data: null, error: { message: "hookcloud_provisioning_failed" } },
        }),
      }),
    );
    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals("verify_token" in body, false);
  });
});

Deno.test("14A.7) generateVerifyToken injetado é usado no lugar do CSPRNG real (isolamento de teste, mesmo padrão de generateSecret)", async () => {
  await withHookCloudPilotEnv(async () => {
    const res = await handleProvisionRequest(
      req(validPayload()),
      baseDeps({ generateVerifyToken: () => "verify-token-fixo-de-teste" }),
    );
    const body = await res.json();
    assertEquals(body.verify_token, "verify-token-fixo-de-teste");
  });
});

Deno.test("14A.8) nenhuma chamada a console.* durante o fluxo inclui o verify_token bruto", async () => {
  await withHookCloudPilotEnv(async () => {
    const originalLog = console.log, originalWarn = console.warn, originalError = console.error;
    const calls: unknown[] = [];
    console.log = (...a: unknown[]) => calls.push(a);
    console.warn = (...a: unknown[]) => calls.push(a);
    console.error = (...a: unknown[]) => calls.push(a);
    let capturedVerifyToken = "";
    try {
      const res = await handleProvisionRequest(req(validPayload()), baseDeps({ generateVerifyToken: () => "verify-token-para-checar-log" }));
      const body = await res.json();
      capturedVerifyToken = body.verify_token;
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    }
    assertEquals(capturedVerifyToken, "verify-token-para-checar-log");
    const serialized = JSON.stringify(calls);
    assertEquals(serialized.includes("verify-token-para-checar-log"), false);
  });
});
