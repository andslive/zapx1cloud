// FASE 21G — decisão de papel canônica do frontend para o piloto
// HookCloud, espelhando byte a byte a mesma allowlist do backend
// (`supabase/functions/_shared/hookcloud-authorization.ts`). As duas
// listas precisam permanecer idênticas — mudar uma sem mudar a outra é
// exatamente o tipo de divergência que a Fase 21A pegou (achado
// original: UI aceitava `admin`, backend só `super_admin` até a
// Fase 21B invertê-lo). Esconder o card aqui NUNCA é a proteção real —
// o backend revalida tudo de forma independente; isto só evita oferecer
// um botão que o backend recusaria.

/** Mesma allowlist canônica do backend — nunca diverge dela. */
const HOOKCLOUD_AUTHORIZED_ROLES: ReadonlySet<string> = new Set(['admin', 'super_admin']);

/**
 * `true` somente se algum dos papéis do usuário estiver na allowlist.
 * Comparação exata de string — nunca normaliza capitalização (os papéis
 * reais em `user_roles.role` são sempre minúsculos; uma grafia diferente
 * nunca deveria autorizar).
 */
export function canManageHookCloud(roles: readonly string[]): boolean {
  return roles.some((role) => HOOKCLOUD_AUTHORIZED_ROLES.has(role));
}
