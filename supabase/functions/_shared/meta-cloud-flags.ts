// FASE 2A — resolução de feature flag da Meta Cloud API.
//
// Regra obrigatória: desligada por padrão, tanto globalmente quanto por
// organização. Ausência de qualquer linha na tabela = desligada. Uma linha
// de organização, quando existe, tem prioridade sobre a linha global
// (permite ligar para 1 organização piloto sem afetar as demais, e
// também permite desligar explicitamente 1 organização mesmo com a flag
// global ligada, sem precisar remover a linha global).
//
// Depende da tabela `meta_cloud_feature_flags` (ver migration desenhada
// nesta fase, ainda não aplicada) — se a tabela não existir ainda (por
// exemplo, ambiente onde a migration não foi aplicada), o resultado é
// FALSE, nunca uma exceção que poderia ser mal-interpretada como "ligado".

import type { SupabaseLike } from "./whatsapp-provider/resolve.ts";

export interface MetaCloudFeatureFlagRow {
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
      .from("meta_cloud_feature_flags")
      .select("enabled")
      .eq("scope", scope);

    const scoped = organizationId ? query.eq("organization_id", organizationId) : query.is("organization_id", null);
    const { data, error } = await scoped.maybeSingle();

    if (error || !data) return null;
    return data.enabled === true;
  } catch {
    // Tabela ausente, RLS bloqueando, erro de rede — sempre resolve para
    // "sem informação", nunca lança. O chamador trata "sem informação" como
    // desligado (ver isMetaCloudApiEnabled).
    return null;
  }
}

/**
 * Resolve se a Meta Cloud API está habilitada para a organização informada.
 * `organizationId === null` consulta só a flag global (uso administrativo).
 */
export async function isMetaCloudApiEnabled(
  supabase: SupabaseLike,
  organizationId: string | null,
): Promise<boolean> {
  if (organizationId) {
    const orgFlag = await readFlagRow(supabase, "organization", organizationId);
    if (orgFlag !== null) return orgFlag;
  }
  const globalFlag = await readFlagRow(supabase, "global", null);
  return globalFlag === true; // null (ausente) ou false → desligado
}
