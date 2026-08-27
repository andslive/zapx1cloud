// Feature flag de rollout gradual — Parte A (conversa separada por conexão)
// + Parte B (gate atômico de funil por lead_id+funnel_id).
//
// Mesma regra e mesmo desenho de `_shared/meta-cloud-flags.ts` (já em
// produção): desligada por padrão, tanto globalmente quanto por
// organização. Ausência de qualquer linha na tabela = desligada. Uma linha
// de organização, quando existe, tem prioridade sobre a linha global.
//
// Existe para eliminar a janela de proteção reduzida entre o DROP do
// índice único antigo (webchat_conv_open_phone_unique) e o deploy do
// código novo: enquanto a flag estiver desligada para uma organização, o
// uazapi-webhook se comporta EXATAMENTE como antes desta correção (mesma
// query sem connection_id, mesmo insert não-gateado em
// lead_funnel_history) — ou seja, continua dependendo do índice antigo,
// que só pode ser removido depois que TODAS as organizações relevantes
// estiverem com a flag ligada.
//
// Depende da tabela `conversation_isolation_feature_flags` (migration
// 20260827145000, ainda não aplicada em produção) — se a tabela não
// existir ainda, o resultado é FALSE (comportamento legado), nunca uma
// exceção que poderia ser mal-interpretada como "ligado".

import type { SupabaseLike } from "./whatsapp-provider/resolve.ts";

export interface ConversationIsolationFlagRow {
  scope: "global" | "organization";
  organization_id: string | null;
  enabled: boolean;
}

async function readFlagRow(
  supabase: SupabaseLike,
  scope: "global" | "organization",
  organizationId: string | null,
): Promise<boolean | null> {
  try {
    const query = (supabase as any)
      .from("conversation_isolation_feature_flags")
      .select("enabled")
      .eq("scope", scope);

    const scoped = organizationId ? query.eq("organization_id", organizationId) : query.is("organization_id", null);
    const { data, error } = await scoped.maybeSingle();

    if (error || !data) return null;
    return data.enabled === true;
  } catch {
    // Tabela ausente, RLS bloqueando, erro de rede — sempre resolve para
    // "sem informação", nunca lança. O chamador trata "sem informação" como
    // desligado (comportamento legado, mais conservador).
    return null;
  }
}

/**
 * Resolve se a conversa-por-conexão + gate atômico de funil estão
 * habilitados para a organização informada. `organizationId === null`
 * consulta só a flag global.
 */
export async function isConversationIsolationEnabled(
  supabase: SupabaseLike,
  organizationId: string | null,
): Promise<boolean> {
  if (organizationId) {
    const orgFlag = await readFlagRow(supabase, "organization", organizationId);
    if (orgFlag !== null) return orgFlag;
  }
  const globalFlag = await readFlagRow(supabase, "global", null);
  return globalFlag === true; // null (ausente) ou false → desligado (legado)
}
