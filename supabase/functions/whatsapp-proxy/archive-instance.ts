// FASE 20H — núcleo testável da action `archive_instance` (extraído de
// `index.ts` pelo mesmo motivo de `connection-authorization.ts`/
// `provider-guard.ts`: `index.ts` chama `Deno.serve` incondicionalmente no
// topo do arquivo, então importá-lo num teste tentaria abrir uma porta de
// verdade). `index.ts` só resolve autenticação (JWT/service role), chama
// `authorizeSuperAdminForArchive` (papel), depois este módulo (id + provider
// + escrita condicional + reconciliação), e traduz o resultado para HTTP.
//
// Este módulo NUNCA decide autorização (isso é `authorizeSuperAdminForArchive`,
// em `connection-authorization.ts`) — só id/provider/escrita. Nunca apaga
// linha, nunca chama UazAPI/Meta, nunca toca Chromium, nunca lê/retorna
// `instance_token`.

import { resolveKnownArchiveProvider } from "./connection-authorization.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ArchivedInstanceDto {
  id: string;
  organization_id: string;
  name: string;
  provider: string;
  status: string;
  archived_at: string;
  archived_by: string | null;
  archive_reason: string | null;
}

// Interface deliberadamente frouxa (mesmo padrão de `connection-authorization.ts`)
// — só documenta o formato mínimo consumido do client Supabase real, o
// bastante para um mock estrutural simples nos testes.
export interface ArchiveQueryClient {
  from(table: string): any;
}

export type ArchiveInstanceOutcome =
  | { kind: "invalid_id" }
  | { kind: "not_found" }
  | { kind: "unsupported_provider" }
  | { kind: "internal_error" }
  | { kind: "success"; alreadyArchived: boolean; instance: ArchivedInstanceDto };

function sanitizeArchivedInstanceDto(row: Record<string, any>): ArchivedInstanceDto {
  return {
    id: row.id,
    organization_id: row.organization_id,
    name: row.custom_name || row.name,
    provider: row.provider ?? "uazapi",
    status: row.status,
    archived_at: row.archived_at,
    archived_by: row.archived_by ?? null,
    archive_reason: row.archive_reason ?? null,
  };
}

const SELECT_COLS = "id, organization_id, name, custom_name, provider, status, archived_at, archived_by, archive_reason";

/**
 * Núcleo de `archive_instance`, SEM autorização (já feita pelo chamador).
 * Gates, nesta ordem: id válido → conexão existe → provider conhecido →
 * já arquivada (idempotência) → UPDATE condicional
 * (`WHERE id=... AND archived_at IS NULL`) → reconciliação se 0 linhas
 * afetadas (condição de corrida real).
 *
 * `organization_id` nunca é aceito como parâmetro aqui — vem SEMPRE da
 * própria linha encontrada, nunca de fora.
 */
export async function performArchiveInstance(params: {
  supabase: ArchiveQueryClient;
  id: string;
  actingUserId: string;
  reason?: string | null;
  nowIso?: string;
}): Promise<ArchiveInstanceOutcome> {
  const { supabase, id, actingUserId, reason, nowIso } = params;

  if (!id || typeof id !== "string" || !UUID_RE.test(id)) {
    return { kind: "invalid_id" };
  }

  const { data: instance, error: findErr } = await supabase
    .from("evolution_instances")
    .select(SELECT_COLS)
    .eq("id", id)
    .maybeSingle();

  if (findErr) {
    return { kind: "internal_error" };
  }
  if (!instance) {
    return { kind: "not_found" };
  }

  const knownProvider = resolveKnownArchiveProvider(instance);
  if (!knownProvider) {
    return { kind: "unsupported_provider" };
  }

  if (instance.archived_at) {
    return { kind: "success", alreadyArchived: true, instance: sanitizeArchivedInstanceDto(instance) };
  }

  const effectiveNowIso = nowIso ?? new Date().toISOString();
  const effectiveReason = typeof reason === "string" && reason.trim().length > 0
    ? reason.trim().slice(0, 500)
    : null;

  const { data: updated, error: updateErr } = await supabase
    .from("evolution_instances")
    .update({ archived_at: effectiveNowIso, archived_by: actingUserId, archive_reason: effectiveReason })
    .eq("id", id)
    .is("archived_at", null)
    .select(SELECT_COLS)
    .maybeSingle();

  if (updateErr) {
    return { kind: "internal_error" };
  }

  if (!updated) {
    // 0 linhas afetadas: condição de corrida real (outra chamada venceu
    // entre o SELECT e este UPDATE). Reconcilia com uma segunda leitura —
    // nunca reporta erro para um resultado que já é o desejado.
    const { data: recheck } = await supabase
      .from("evolution_instances")
      .select(SELECT_COLS)
      .eq("id", id)
      .maybeSingle();
    if (recheck?.archived_at) {
      return { kind: "success", alreadyArchived: true, instance: sanitizeArchivedInstanceDto(recheck) };
    }
    return { kind: "not_found" };
  }

  return { kind: "success", alreadyArchived: false, instance: sanitizeArchivedInstanceDto(updated) };
}
