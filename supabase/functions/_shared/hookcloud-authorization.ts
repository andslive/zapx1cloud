// FASE 21G — política canônica ÚNICA de autorização dos endpoints
// administrativos HookCloud (`hookcloud-provision-connection`,
// `hookcloud-rotate-credentials`) e do frontend (`useHookCloudPilotAccess`,
// via `canManageHookCloud`, ver `src/lib/hookcloud/hookcloudProvisioning.ts`).
//
// Histórico: até a Fase 21A, os dois endpoints aceitavam
// `{"admin", "super_admin"}`. A Fase 21B restringiu para exclusivamente
// `{"super_admin"}` (achado da Fase 21A: o contrato do piloto pedia
// "Super Admin exclusivo"). A Fase 21G reverte essa restrição por
// decisão explícita do usuário — `admin` volta a ser permitido, mas
// SOMENTE dentro da própria organização do seu perfil autenticado
// (nunca por seleção do cliente) — enquanto `manager`/`seller`/qualquer
// outro papel permanecem, como sempre, fora de cogitação.
//
// Este arquivo existe para que a decisão de papel NUNCA divirja entre
// os dois endpoints (ou entre backend e frontend) — um único array
// canônico, importado em todos os pontos, nunca duplicado como um
// `new Set([...])` literal e independente em cada arquivo.

/** Único array canônico de papéis autorizados a operar o piloto HookCloud — nunca duplicado em nenhum outro arquivo. */
export const HOOKCLOUD_AUTHORIZED_ROLES: ReadonlySet<string> = new Set(["admin", "super_admin"]);

/**
 * `true` somente se ALGUM dos papéis do usuário (um usuário pode ter mais
 * de um papel em `user_roles`) estiver na allowlist canônica. Comparação
 * exata de string — `"Admin"`/`"ADMIN"`/qualquer grafia diferente de
 * `"admin"` nunca autoriza (os papéis reais em `user_roles.role`, do
 * enum `app_role`, são sempre minúsculos — uma grafia diferente só pode
 * vir de um dado corrompido ou de uma tentativa de adulteração, e deve
 * falhar fechado como qualquer outro papel desconhecido).
 */
export function isHookCloudAuthorizedRole(roles: readonly string[]): boolean {
  return roles.some((role) => HOOKCLOUD_AUTHORIZED_ROLES.has(role));
}
