// deno test --allow-read --allow-env supabase/functions/whatsapp-proxy/connection-authorization.test.ts
//
// Fase 18D: cobre a matriz multi-tenant completa das 4 ações de
// transporte UazAPI (connect_instance, repair_webhook, check_webhook,
// delete_instance_self) — organização correta/errada, provider
// legado/uazapi/meta_cloud/desconhecido, perfil ausente/desativado,
// organização ausente, super_admin legítimo, "super_admin" falso vindo
// só do body (nunca confiado), service role real com/sem organização,
// conexão inexistente. Usa um mock estrutural do client Supabase — sem
// nenhuma chamada de rede real, sem credencial real.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { authorizeUazapiConnectionAccess, type SupabaseAdminLike } from "./connection-authorization.ts";

interface FakeProfile {
  id: string;
  organization_id: string | null;
  is_active: boolean | null;
}

interface FakeInstance {
  id: string;
  instance_id?: string | null;
  organization_id: string;
  provider?: string | null;
}

function makeFakeSupabase(opts: {
  profiles?: FakeProfile[];
  instances?: FakeInstance[];
  superAdminIds?: string[];
}): SupabaseAdminLike {
  const profiles = opts.profiles ?? [];
  const instances = opts.instances ?? [];
  const superAdminIds = new Set(opts.superAdminIds ?? []);

  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select() {
            return {
              eq(_col: string, value: unknown) {
                return {
                  maybeSingle: () =>
                    Promise.resolve({ data: profiles.find((p) => p.id === value) ?? null, error: null }),
                };
              },
            };
          },
        };
      }
      if (table === "evolution_instances") {
        // Suporta a mesma cadeia usada pelo módulo real: select().eq()/or() [.eq()] .maybeSingle()
        const state: { idFilter?: string; orFilter?: string; orgFilter?: string } = {};
        const builder: any = {
          select() {
            return builder;
          },
          eq(col: string, value: unknown) {
            if (col === "id") state.idFilter = String(value);
            if (col === "organization_id") state.orgFilter = String(value);
            return builder;
          },
          or(expr: string) {
            state.orFilter = expr;
            return builder;
          },
          maybeSingle() {
            let matches = instances;
            if (state.idFilter !== undefined) {
              matches = matches.filter((i) => i.id === state.idFilter);
            } else if (state.orFilter !== undefined) {
              const m = state.orFilter.match(/id\.eq\.([^,]+),instance_id\.eq\.(.+)/);
              const id = m?.[1];
              const instanceId = m?.[2];
              matches = matches.filter((i) => i.id === id || i.instance_id === instanceId);
            }
            if (state.orgFilter !== undefined) {
              matches = matches.filter((i) => i.organization_id === state.orgFilter);
            }
            return Promise.resolve({ data: matches[0] ?? null, error: null });
          },
        };
        return builder;
      }
      throw new Error(`unexpected table in test mock: ${table}`);
    },
    rpc(fn: string, args: Record<string, unknown>) {
      if (fn === "is_super_admin") {
        return Promise.resolve({ data: superAdminIds.has(args._user_id as string), error: null });
      }
      throw new Error(`unexpected rpc in test mock: ${fn}`);
    },
  };
}

const ORG_A = "org-a";
const ORG_B = "org-b";
const USER_A = "user-a"; // membro comum de ORG_A
const USER_SUPER = "user-super"; // super_admin real (comprovado via rpc)
const CONN_UAZAPI_A = { id: "conn-uazapi-a", organization_id: ORG_A, provider: "uazapi" };
const CONN_LEGACY_A = { id: "conn-legacy-a", organization_id: ORG_A, provider: null }; // provider nunca preenchido
const CONN_HOOKCLOUD_A = { id: "conn-hookcloud-a", organization_id: ORG_A, provider: "meta_cloud" };
const CONN_UNKNOWN_A = { id: "conn-unknown-a", organization_id: ORG_A, provider: "chromium" };
const CONN_UAZAPI_B = { id: "conn-uazapi-b", organization_id: ORG_B, provider: "uazapi" };
const CONN_HOOKCLOUD_B = { id: "conn-hookcloud-b", organization_id: ORG_B, provider: "meta_cloud" };

const PROFILES: FakeProfile[] = [
  { id: USER_A, organization_id: ORG_A, is_active: true },
  { id: USER_SUPER, organization_id: ORG_A, is_active: true },
  { id: "user-inactive", organization_id: ORG_A, is_active: false },
  { id: "user-no-org", organization_id: null, is_active: true },
];

function supa() {
  return makeFakeSupabase({
    profiles: PROFILES,
    instances: [CONN_UAZAPI_A, CONN_LEGACY_A, CONN_HOOKCLOUD_A, CONN_UNKNOWN_A, CONN_UAZAPI_B, CONN_HOOKCLOUD_B],
    superAdminIds: [USER_SUPER],
  });
}

// 1) mesma organização + UazAPI válida
Deno.test("mesma organização + UazAPI válida => authorized", async () => {
  const result = await authorizeUazapiConnectionAccess({
    supabase: supa(), connectionId: CONN_UAZAPI_A.id, isServiceRole: false, userId: USER_A,
  });
  assertEquals(result.kind, "authorized");
});

// 2) mesma organização + provider nulo legado
Deno.test("mesma organização + provider nulo (legado) => authorized", async () => {
  const result = await authorizeUazapiConnectionAccess({
    supabase: supa(), connectionId: CONN_LEGACY_A.id, isServiceRole: false, userId: USER_A,
  });
  assertEquals(result.kind, "authorized");
});

// 3) mesma organização + HookCloud
Deno.test("mesma organização + HookCloud (meta_cloud) => unsupported_provider, nunca authorized", async () => {
  const result = await authorizeUazapiConnectionAccess({
    supabase: supa(), connectionId: CONN_HOOKCLOUD_A.id, isServiceRole: false, userId: USER_A,
  });
  assertEquals(result.kind, "unsupported_provider");
});

// 4) mesma organização + provider desconhecido
Deno.test("mesma organização + provider desconhecido => unsupported_provider, falha fechada", async () => {
  const result = await authorizeUazapiConnectionAccess({
    supabase: supa(), connectionId: CONN_UNKNOWN_A.id, isServiceRole: false, userId: USER_A,
  });
  assertEquals(result.kind, "unsupported_provider");
});

// 5) outra organização + UazAPI
Deno.test("usuário comum de ORG_A pedindo conexão UazAPI de ORG_B => not_found (nunca authorized, nunca revela existência)", async () => {
  const result = await authorizeUazapiConnectionAccess({
    supabase: supa(), connectionId: CONN_UAZAPI_B.id, isServiceRole: false, userId: USER_A,
  });
  assertEquals(result.kind, "not_found");
});

// 6) outra organização + HookCloud
Deno.test("usuário comum de ORG_A pedindo conexão HookCloud de ORG_B => not_found", async () => {
  const result = await authorizeUazapiConnectionAccess({
    supabase: supa(), connectionId: CONN_HOOKCLOUD_B.id, isServiceRole: false, userId: USER_A,
  });
  assertEquals(result.kind, "not_found");
});

// 7) perfil ausente
Deno.test("perfil inexistente => profile_invalid", async () => {
  const result = await authorizeUazapiConnectionAccess({
    supabase: supa(), connectionId: CONN_UAZAPI_A.id, isServiceRole: false, userId: "usuario-sem-perfil",
  });
  assertEquals(result.kind, "profile_invalid");
});

// 8) perfil desativado
Deno.test("perfil com is_active=false => profile_invalid", async () => {
  const result = await authorizeUazapiConnectionAccess({
    supabase: supa(), connectionId: CONN_UAZAPI_A.id, isServiceRole: false, userId: "user-inactive",
  });
  assertEquals(result.kind, "profile_invalid");
});

// 9) organização ausente
Deno.test("perfil sem organization_id => organization_missing", async () => {
  const result = await authorizeUazapiConnectionAccess({
    supabase: supa(), connectionId: CONN_UAZAPI_A.id, isServiceRole: false, userId: "user-no-org",
  });
  assertEquals(result.kind, "organization_missing");
});

// 10) papel insuficiente — não há restrição de papel além de pertencer à organização (self-service, decisão registrada no relatório); coberto pelos casos 5/6 (cross-org já rejeitado).

// 11) super_admin legítimo cross-org
Deno.test("super_admin comprovado via RPC pode operar conexão de QUALQUER organização", async () => {
  const resultA = await authorizeUazapiConnectionAccess({
    supabase: supa(), connectionId: CONN_UAZAPI_A.id, isServiceRole: false, userId: USER_SUPER,
  });
  const resultB = await authorizeUazapiConnectionAccess({
    supabase: supa(), connectionId: CONN_UAZAPI_B.id, isServiceRole: false, userId: USER_SUPER,
  });
  assertEquals(resultA.kind, "authorized");
  assertEquals(resultB.kind, "authorized");
});

// 12) falso super_admin no body — este módulo nem aceita um parâmetro de papel vindo do cliente; só decide por RPC real. Comprovado indiretamente: USER_A nunca vira super_admin mesmo pedindo cross-org.
Deno.test("usuário comum NUNCA vira super_admin só por pedir uma conexão de outra organização — RPC real decide, nunca o cliente", async () => {
  const result = await authorizeUazapiConnectionAccess({
    supabase: supa(), connectionId: CONN_UAZAPI_B.id, isServiceRole: false, userId: USER_A,
  });
  assertEquals(result.kind, "not_found");
});

// 13) service role real, com organização
Deno.test("service role real + organization_id no body (repassado por chamador interno já autenticado) => authorized, escopado", async () => {
  const result = await authorizeUazapiConnectionAccess({
    supabase: supa(), connectionId: CONN_UAZAPI_A.id, isServiceRole: true, userId: null, bodyOrganizationId: ORG_A,
  });
  assertEquals(result.kind, "authorized");
});

Deno.test("service role real + organization_id de OUTRA organização no body => not_found (escopo aplicado mesmo para service role)", async () => {
  const result = await authorizeUazapiConnectionAccess({
    supabase: supa(), connectionId: CONN_UAZAPI_A.id, isServiceRole: true, userId: null, bodyOrganizationId: ORG_B,
  });
  assertEquals(result.kind, "not_found");
});

// 14) string "service_role" falsa no body — este módulo só recebe `isServiceRole: boolean`, já decidido pelo handler principal a partir do secret real; não há como o corpo da requisição definir isso aqui. Comprovado: mesmo com um valor de organização válido, sem isServiceRole=true a chamada segue o caminho de usuário comum.
Deno.test("isServiceRole=false ignora qualquer bodyOrganizationId — sempre exige userId real", async () => {
  const result = await authorizeUazapiConnectionAccess({
    supabase: supa(), connectionId: CONN_UAZAPI_A.id, isServiceRole: false, userId: null, bodyOrganizationId: ORG_A,
  });
  assertEquals(result.kind, "unauthenticated");
});

Deno.test("service role real SEM organization_id no body => service_role_organization_required, nunca bypass irrestrito", async () => {
  const result = await authorizeUazapiConnectionAccess({
    supabase: supa(), connectionId: CONN_UAZAPI_A.id, isServiceRole: true, userId: null,
  });
  assertEquals(result.kind, "service_role_organization_required");
});

// 15) conexão inexistente
Deno.test("conexão inexistente (id nunca existiu) => not_found, mesma resposta de cross-org", async () => {
  const result = await authorizeUazapiConnectionAccess({
    supabase: supa(), connectionId: "id-que-nunca-existiu", isServiceRole: false, userId: USER_A,
  });
  assertEquals(result.kind, "not_found");
});

// alsoMatchInstanceId — preserva o comportamento anterior de repair_webhook/check_webhook
Deno.test("alsoMatchInstanceId: encontra pela instance_id quando o id da linha não bate, dentro do mesmo escopo de organização", async () => {
  const supabase = makeFakeSupabase({
    profiles: PROFILES,
    instances: [{ id: "row-uuid", instance_id: "uazapi-side-uuid", organization_id: ORG_A, provider: "uazapi" }],
  });
  const result = await authorizeUazapiConnectionAccess({
    supabase, connectionId: "uazapi-side-uuid", isServiceRole: false, userId: USER_A, alsoMatchInstanceId: true,
  });
  assertEquals(result.kind, "authorized");
});

Deno.test("alsoMatchInstanceId: instance_id de OUTRA organização continua not_found", async () => {
  const supabase = makeFakeSupabase({
    profiles: PROFILES,
    instances: [{ id: "row-uuid-b", instance_id: "uazapi-side-uuid-b", organization_id: ORG_B, provider: "uazapi" }],
  });
  const result = await authorizeUazapiConnectionAccess({
    supabase, connectionId: "uazapi-side-uuid-b", isServiceRole: false, userId: USER_A, alsoMatchInstanceId: true,
  });
  assertEquals(result.kind, "not_found");
});
