// FASE 18D — política de autorização multi-tenant fail-closed para as 4
// ações de transporte UazAPI deste proxy (connect_instance, repair_webhook,
// check_webhook, delete_instance_self).
//
// Achado da Fase 18C: nenhuma dessas ações validava `organization_id` — só
// `provider`. Um usuário autenticado de QUALQUER organização podia operar
// a conexão de QUALQUER outra organização, só sabendo o `id` (UUID). Esta
// fase fecha essa lacuna, preservando exatamente os 3 caminhos legítimos
// já identificados no inventário de chamadores (ver relatório, Fase 18D):
//   1) usuário comum/admin de uma organização (frontend, JWT de sessão) —
//      só pode operar conexões da PRÓPRIA organização, derivada
//      exclusivamente de `profiles.organization_id` — nunca do body;
//   2) super_admin (frontend, JWT de sessão, papel comprovado no banco via
//      RPC `is_super_admin` — mesma RPC já usada em
//      create-organization-admin/delete-organization/set-user-password/
//      super-admin-manage-user) — pode operar QUALQUER organização, mas a
//      organização real vem da própria conexão consultada, nunca de texto
//      do body;
//   3) service role real (`instances-api`, chamador interno já validado —
//      ver inventário) — o `organization_id` do body só é confiável aqui
//      porque a requisição já foi comprovada como service role pelo
//      próprio proxy (comparação com o secret real, nunca uma string
//      "service_role" inventada pelo cliente) — mesmo assim, o escopo por
//      organização continua OBRIGATÓRIO (nunca um bypass total
//      irrestrito): `instances-api` já resolve `profile.organization_id`
//      do usuário autenticado antes de repassar a chamada, então o body
//      carrega uma organização real, comprovada por um caminho de
//      autenticação genuíno — nunca inventada pelo cliente final.
//
// Ordem de gates obrigatória (Parte 3): autenticação → perfil/papel/
// organização (ou service role real) → busca da conexão DENTRO do escopo
// autorizado → provider → (ação específica lê instance_token e chama a
// UazAPI, fora deste módulo). Conexão de outra organização e conexão
// inexistente retornam o MESMO resultado (`not_found`) — nunca revelam
// se a linha existe em outra organização (mesmo princípio já usado em
// `_shared/whatsapp-provider/resolve.ts`, Fase 2A).

import { isUazapiInstance } from "./provider-guard.ts";

// Interface deliberadamente frouxa (mesmo padrão de `any` já usado em todo
// `whatsapp-proxy/index.ts`) — só documenta o formato mínimo que este
// módulo consome do client Supabase real, o bastante para permitir um
// mock estrutural simples nos testes.
export interface SupabaseAdminLike {
  from(table: string): any;
  // `PromiseLike`, não `Promise`: o `rpc()` real do supabase-js retorna um
  // `PostgrestFilterBuilder` (thenable, encadeável), não uma `Promise`
  // literal — `PromiseLike` é o supertipo correto que aceita ambos.
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: any; error: any }>;
}

export interface AuthorizeConnectionParams {
  supabase: SupabaseAdminLike;
  connectionId: string;
  isServiceRole: boolean;
  userId: string | null;
  /** Só é lido/confiado quando `isServiceRole === true` — nunca para chamadas de usuário. */
  bodyOrganizationId?: unknown;
  /**
   * `repair_webhook`/`check_webhook` sempre aceitaram o `id` da linha OU
   * o `instance_id` (UUID do lado da UazAPI) como chave de busca — nenhum
   * chamador real identificado no inventário da Fase 18D usa
   * `instance_id`, mas o comportamento é preservado por fidelidade ao
   * código anterior. `connect_instance`/`delete_instance_self` nunca
   * usaram isso — permanece `false` (padrão) para eles.
   */
  alsoMatchInstanceId?: boolean;
}

export type AuthorizeConnectionResult =
  | { kind: "unauthenticated" }
  | { kind: "profile_invalid" }
  | { kind: "organization_missing" }
  | { kind: "service_role_organization_required" }
  | { kind: "not_found" } // cobre também "pertence a outra organização" — nunca distinguível pelo chamador
  | { kind: "unsupported_provider" }
  | { kind: "archived" } // FASE 20H — conexão arquivada: nenhuma ação de transporte pode prosseguir
  | { kind: "authorized"; instance: Record<string, any> };

/**
 * Executa os gates 1-4 (autenticação, perfil/papel/organização ou service
 * role real, busca escopada, provider). Nunca lê `instance_token` nem
 * chama a UazAPI — isso continua responsabilidade do chamador, DEPOIS de
 * receber `{ kind: 'authorized' }`.
 */
export async function authorizeUazapiConnectionAccess(
  params: AuthorizeConnectionParams,
): Promise<AuthorizeConnectionResult> {
  const { supabase, connectionId, isServiceRole, userId, bodyOrganizationId, alsoMatchInstanceId } = params;

  if (!isServiceRole && !userId) {
    return { kind: "unauthenticated" };
  }

  let organizationScope: string | null = null; // null = sem filtro de organização (só para super_admin comprovado)

  if (isServiceRole) {
    // Bypass multi-tenant só para o escopo de organização explícito e
    // comprovado repassado por um chamador interno real — nunca um
    // bypass total. Nenhuma string enviada pelo cliente final chega
    // aqui: `isServiceRole` só é true quando a própria requisição já foi
    // autenticada com o secret real (comparação feita no handler
    // principal, nunca aqui).
    if (typeof bodyOrganizationId !== "string" || bodyOrganizationId.trim().length === 0) {
      return { kind: "service_role_organization_required" };
    }
    organizationScope = bodyOrganizationId;
  } else {
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, organization_id, is_active")
      .eq("id", userId as string)
      .maybeSingle();

    if (profileErr || !profile) {
      return { kind: "profile_invalid" };
    }
    if (profile.is_active === false) {
      return { kind: "profile_invalid" };
    }
    if (!profile.organization_id) {
      return { kind: "organization_missing" };
    }

    const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: userId });
    organizationScope = isSuper === true ? null : profile.organization_id;
  }

  let query = supabase.from("evolution_instances").select("*");
  query = alsoMatchInstanceId
    ? query.or(`id.eq.${connectionId},instance_id.eq.${connectionId}`)
    : query.eq("id", connectionId);
  if (organizationScope !== null) {
    query = query.eq("organization_id", organizationScope);
  }
  const { data: instance, error: instanceErr } = await query.maybeSingle();

  if (instanceErr || !instance) {
    return { kind: "not_found" };
  }

  if (!isUazapiInstance(instance)) {
    return { kind: "unsupported_provider" };
  }

  // FASE 20H — conexão arquivada (`archived_at IS NOT NULL`) nunca pode
  // seguir para nenhuma ação de transporte (`connect_instance`,
  // `repair_webhook`, `check_webhook`, `delete_instance_self`) — nenhum
  // novo job/reparo/reconexão/sincronização pode ser iniciado por uma
  // conexão retirada da operação. Checado DEPOIS do escopo de organização/
  // provider (mesma ordem de gates da Fase 18D), nunca antes — uma
  // conexão arquivada de outra organização continua indistinguível de uma
  // inexistente para quem não tem acesso a ela.
  if (instance.archived_at) {
    return { kind: "archived" };
  }

  return { kind: "authorized", instance };
}

/**
 * Mapeia cada desfecho não autorizado para status HTTP + corpo — nunca
 * chamado para `{ kind: 'authorized' }` (o chamador deve tratar esse caso
 * separadamente). Centralizado aqui para que os 4 pontos de chamada em
 * `index.ts` respondam de forma idêntica e testável.
 */
export function authorizationFailureResponseBody(
  result: Exclude<AuthorizeConnectionResult, { kind: "authorized" }>,
): { status: number; body: Record<string, unknown> } {
  switch (result.kind) {
    case "unauthenticated":
      return { status: 401, body: { error: "Unauthorized" } };
    case "profile_invalid":
      return { status: 403, body: { error: "forbidden" } };
    case "organization_missing":
      return { status: 400, body: { error: "no_organization" } };
    case "service_role_organization_required":
      return { status: 400, body: { error: "organization_id_required" } };
    case "not_found":
      return { status: 404, body: { error: "Not found" } };
    case "unsupported_provider":
      return { status: 409, body: { ok: false, error: "unsupported_provider" } };
    case "archived":
      return { status: 409, body: { ok: false, error: "archived" } };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// FASE 20H — autorização dedicada para `archive_instance`.
//
// Deliberadamente SEPARADA de `authorizeUazapiConnectionAccess`: aquela
// função autoriza usuário comum/admin da PRÓPRIA organização OU
// super_admin, e só aceita provider UazAPI (`isUazapiInstance`).
// `archive_instance` tem uma política mais restrita, exigida
// explicitamente pela Fase 20H:
//   1) só super_admin real, comprovado no banco via a MESMA RPC
//      `is_super_admin` já usada acima (nunca um claim do cliente, nunca
//      um usuário comum/admin de organização — mesmo que seja dono da
//      própria conexão);
//   2) qualquer provider conhecido (`uazapi`, `meta_cloud`, ou legado
//      sem `provider` tratado como `uazapi` pela mesma retrocompatibilidade
//      da Fase 18C) — arquivamento não é uma ação de transporte UazAPI,
//      então não usa `isUazapiInstance`/`isSupportedArchiveProvider`
//      aqui; a validação de provider acontece depois de resolver a
//      instância, no chamador (`index.ts`), porque só ali sabemos qual
//      linha foi encontrada.
// Nunca aceita `organization_id` do body — um super_admin comprovado
// opera qualquer organização, sempre a partir da linha real encontrada
// depois desta autorização, nunca de texto do cliente.
export type AuthorizeSuperAdminResult =
  | { kind: "unauthenticated" }
  | { kind: "profile_invalid" }
  | { kind: "not_super_admin" }
  | { kind: "authorized" };

export async function authorizeSuperAdminForArchive(params: {
  supabase: SupabaseAdminLike;
  userId: string | null;
}): Promise<AuthorizeSuperAdminResult> {
  const { supabase, userId } = params;

  if (!userId) {
    return { kind: "unauthenticated" };
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr || !profile) {
    return { kind: "profile_invalid" };
  }
  if (profile.is_active === false) {
    return { kind: "profile_invalid" };
  }

  const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: userId });
  if (isSuper !== true) {
    return { kind: "not_super_admin" };
  }

  return { kind: "authorized" };
}

export function superAdminAuthorizationFailureResponseBody(
  result: Exclude<AuthorizeSuperAdminResult, { kind: "authorized" }>,
): { status: number; body: Record<string, unknown> } {
  switch (result.kind) {
    case "unauthenticated":
      return { status: 401, body: { error: "Unauthorized" } };
    case "profile_invalid":
      return { status: 403, body: { error: "forbidden" } };
    case "not_super_admin":
      // FASE 20H — deliberadamente o MESMO status/corpo de `profile_invalid`
      // (403 `{ error: "forbidden" }`), nunca uma mensagem distinta tipo
      // "requer super_admin": nenhuma pista sobre POR QUE foi negado, nem
      // sobre a existência da conexão-alvo, deve vazar para um chamador
      // não autorizado.
      return { status: 403, body: { error: "forbidden" } };
  }
}

/**
 * FASE 20H — resolve o provider real de uma linha `evolution_instances`
 * para fins de `archive_instance`: `uazapi`, `meta_cloud`, ou `null` para
 * QUALQUER outro valor (falha fechada — nunca arquiva um provider que o
 * código não conhece explicitamente). Legado sem `provider` (null/vazio)
 * é tratado como `uazapi`, mesma retrocompatibilidade de `isUazapiInstance`
 * (Fase 18C) — conexões de produção criadas antes da coluna `provider`
 * existir dependem disso.
 */
export function resolveKnownArchiveProvider(
  instance: { provider?: string | null } | null | undefined,
): "uazapi" | "meta_cloud" | null {
  if (!instance) return null;
  const provider = instance.provider;
  if (provider === null || provider === undefined || provider === "") return "uazapi";
  if (provider === "uazapi" || provider === "meta_cloud") return provider;
  return null;
}
