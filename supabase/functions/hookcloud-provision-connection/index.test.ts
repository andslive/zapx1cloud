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
} from "./index.ts";
import { hashHookCloudWebhookSecret, verifyHookCloudWebhookSecret } from "../_shared/meta-webhook-hookcloud-secret.ts";

const CALLER_ID = "user-1";
const ORG_ID = "org-a";
const CONNECTION_ID = "conn-new-1";
const CALLBACK_BASE_URL = "https://ydunpoqdhijhnrarohiz.supabase.co";

function authClient(userId: string | null): AuthClientLike {
  return { auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) } };
}

interface AdminMockConfig {
  profileOrgId?: string | null;
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
                        ? { organization_id: config.profileOrgId }
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
