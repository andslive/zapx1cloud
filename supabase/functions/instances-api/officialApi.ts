// FASE 20D — lógica PURA (sem I/O) de autorização e projeção do DTO
// administrativo de API Oficial (`evolution_instances_meta_cloud`),
// extraída de `index.ts` para ser testável sem iniciar o servidor Deno
// (sem precisar de um request HTTP real nem de credenciais de banco).
//
// Replica EXATAMENTE a regra de autorização já usada pela policy RLS da
// tabela (confirmada por consulta direta ao banco linkado nesta fase):
//   is_super_admin(auth.uid())
//   OR (user_belongs_to_organization(auth.uid(), organization_id)
//       AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
//
// Como `organization_id` usado pela query SEMPRE vem do perfil autenticado
// resolvido no servidor (nunca do cliente — ver `index.ts`), a parte
// `user_belongs_to_organization` é garantida estruturalmente: não existe
// como pedir dados de outra organização por esta ação. Por isso a checagem
// aqui simplifica para: super_admin (qualquer org) OU admin/manager (only
// dentro do próprio org, que é o único org que a query usa).

export type AppRole = "super_admin" | "admin" | "manager" | string;

/**
 * Retrocompatibilidade explícita: `profiles.is_active` pode ser `null` em
 * linhas legadas (nunca preenchido explicitamente) — tratado como ativo,
 * MESMA regra já usada em `whatsapp-proxy/connection-authorization.ts`
 * (`profile.is_active === false`). Só `false` explícito bloqueia — nunca
 * `null`/`undefined` por adivinhação.
 */
export function isProfileActiveForAdminAccess(profile: { is_active?: boolean | null } | null | undefined): boolean {
  return profile?.is_active !== false;
}

/** Ação org-scoped (`officialApi`): super_admin, admin ou manager. */
export function isAuthorizedForOfficialApiOrgScoped(roles: ReadonlySet<AppRole>): boolean {
  return roles.has("super_admin") || roles.has("admin") || roles.has("manager");
}

/** Ação platform-wide (`officialApiAll`): SOMENTE super_admin — nunca admin/manager de um org específico. */
export function isAuthorizedForOfficialApiPlatformWide(roles: ReadonlySet<AppRole>): boolean {
  return roles.has("super_admin");
}

/**
 * Colunas permitidas na resposta administrativa — ALLOWLIST explícita,
 * nunca `select('*')`. Qualquer coluna fora desta lista (em especial
 * `access_token_secret_ref`, `hookcloud_webhook_secret_hash`,
 * `hookcloud_verify_token_hash`, `token_expires_at`, `display_phone_number`,
 * `meta_business_id`, `waba_id`) NUNCA deve ser adicionada aqui sem uma
 * decisão de segurança explícita revisada.
 */
export const OFFICIAL_API_ALLOWED_COLUMNS = [
  "evolution_instance_id",
  "organization_id",
  "onboarding_state",
  "onboarding_source",
  "phone_number_id",
] as const;

export const OFFICIAL_API_SELECT_CLAUSE = OFFICIAL_API_ALLOWED_COLUMNS.join(", ");

export interface OfficialApiDbRow {
  evolution_instance_id: string;
  organization_id: string;
  onboarding_state: string | null;
  onboarding_source: string | null;
  phone_number_id: string | null;
  // Qualquer campo extra que o driver devolva é ignorado pela projeção
  // abaixo — nunca repassado adiante "por acidente".
  [key: string]: unknown;
}

export interface OfficialApiDto {
  evolution_instance_id: string;
  organization_id: string;
  onboarding_state: string | null;
  onboarding_source: string | null;
  phone_number_id: string | null;
}

/**
 * Projeta uma linha crua do banco para o DTO público — reconstrói o objeto
 * campo a campo (nunca faz spread `{...row}`) para que seja estruturalmente
 * impossível uma coluna sensível vazar mesmo que o SELECT no chamador seja
 * alterado no futuro para incluir mais colunas por engano.
 */
export function projectOfficialApiRow(row: OfficialApiDbRow): OfficialApiDto {
  return {
    evolution_instance_id: row.evolution_instance_id,
    organization_id: row.organization_id,
    onboarding_state: row.onboarding_state ?? null,
    onboarding_source: row.onboarding_source ?? null,
    phone_number_id: row.phone_number_id ?? null,
  };
}

export function projectOfficialApiRows(rows: readonly OfficialApiDbRow[]): OfficialApiDto[] {
  return rows.map(projectOfficialApiRow);
}
