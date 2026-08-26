// FASE 21K.1 — allowlist canônica das colunas REAIS de `public.profiles`
// no Cloud de produção, confirmada por consulta direta
// (`information_schema.columns` e `pg_attribute`) nesta fase. Existe
// exclusivamente para uso em testes (`hookcloud-provision-connection`/
// `hookcloud-rotate-credentials`) — impede que um mock de teste "invente"
// uma coluna que não existe no banco de verdade, exatamente a causa raiz
// do achado crítico da Fase 21K: o código pedia `profiles.disabled`
// (nunca existiu — só `is_active`), e o mock antigo aceitava esse campo
// sem nenhuma validação, então o defeito nunca apareceu em nenhum teste,
// apesar de quebrar toda chamada real autenticada em produção.
//
// Fonte de verdade: o Cloud real, não este arquivo. Se `profiles` ganhar
// ou perder colunas no futuro, re-consulte `information_schema.columns`/
// `pg_attribute` antes de editar esta lista — nunca "conserte" um teste
// que falhou aqui adicionando a coluna sem confirmar que ela existe de
// verdade no banco.
export const PROFILES_REAL_COLUMNS: ReadonlySet<string> = new Set([
  "id",
  "organization_id",
  "full_name",
  "email",
  "avatar_url",
  "phone",
  "is_active",
  "created_at",
  "updated_at",
  "booking_slug",
  "booking_bio",
  "recovery_whatsapp",
  "work_start_time",
  "work_end_time",
  "farewell_message",
  "default_theme",
  "default_menu_state",
  "default_connection_id",
  "guided_onboarding_completed_at",
  "guided_onboarding_skipped_at",
]);

/** Extrai os nomes de coluna de uma string `.select("a, b, c")` (mesmo formato usado pelo supabase-js). */
export function parseSelectColumns(selectString: string): string[] {
  return selectString.split(",").map((c) => c.trim()).filter(Boolean);
}

/**
 * Lança se QUALQUER coluna pedida não existir na allowlist real — simula,
 * no nível do mock de teste, a mesma rejeição que o PostgREST real faria
 * contra uma coluna inexistente. Usado pelo mock de `profiles` dos dois
 * endpoints HookCloud para que NENHUM teste da suíte passe silenciosamente
 * se o código voltar a pedir uma coluna que não existe de verdade.
 */
export function assertOnlyRealProfileColumns(selectString: string): void {
  const requested = parseSelectColumns(selectString);
  const unknown = requested.filter((c) => !PROFILES_REAL_COLUMNS.has(c));
  if (unknown.length > 0) {
    throw new Error(
      `Coluna(s) inexistente(s) em profiles: ${unknown.join(", ")} — profiles real não tem essas colunas (ver achado crítico da Fase 21K / correção da Fase 21K.1).`,
    );
  }
}

/** Forma canônica mínima de uma linha de `profiles` — só os campos que os endpoints HookCloud realmente usam, nunca `disabled` (não existe). */
export interface CanonicalHookCloudProfileRow {
  organization_id: string | null;
  is_active: boolean | null;
}
