/**
 * EpisodeStore sobre supabase-js. Exclusividade por compare-and-swap em `version` (UPDATE ... WHERE version = N):
 * em um único statement, só um worker vence; jobs antigos/duplicados recebem 0 linhas e descartam.
 *
 * ERRO ≠ PERDA DE CAS: uma operação que falha (tabela ausente, permissão, rede) LANÇA `EpisodeStoreError` com um
 * código identificável; só "0 linhas atualizadas" significa que outro worker venceu. Falha nunca é engolida.
 */
import type { Episode, EpisodeStore } from "./episode.ts";
import { LEASE_MS, openSuspicion, SUSPICION_WAIT_MS } from "./episode.ts";

const TABLE = "connection_disconnect_episodes";

export class EpisodeStoreError extends Error {
  constructor(public code: "episodes_table_missing" | "episodes_permission_denied" | "episodes_store_error", public op: string, detail: string) {
    super(`${code}:${op}:${detail}`);
    this.name = "EpisodeStoreError";
  }
}

/** Traduz o erro do PostgREST/Postgres em um código operacional estável (para alarme/grep). */
export function classifyStoreError(op: string, error: { code?: string; message?: string } | null | undefined): EpisodeStoreError {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? "");
  if (code === "PGRST205" || code === "42P01" || (/connection_disconnect_episodes/.test(msg) && /(does not exist|schema cache|Could not find)/i.test(msg))) {
    return new EpisodeStoreError("episodes_table_missing", op, "migration 20261124120000 não aplicada?");
  }
  if (code === "42501" || /permission denied/i.test(msg)) return new EpisodeStoreError("episodes_permission_denied", op, "sem permissão na tabela");
  return new EpisodeStoreError("episodes_store_error", op, `${code || "?"}`);
}

export function createSupabaseEpisodeStore(supabase: any): EpisodeStore {
  return {
    async open({ organization_id, connection_id, now, source }) {
      const { data, error } = await supabase.from(TABLE).insert({
        organization_id, connection_id, source,
        state: "pending",
        suspected_at: now.toISOString(),
        next_check_at: new Date(now.getTime() + SUSPICION_WAIT_MS).toISOString(),
      }).select("*").single();
      if (!error && data) return { created: true, episode: data as Episode };
      if (error?.code === "23505") { // já existe episódio ativo para a conexão
        const { data: cur, error: e2 } = await supabase.from(TABLE).select("*").eq("connection_id", connection_id).neq("state", "closed").maybeSingle();
        if (e2) throw classifyStoreError("open_lookup", e2);
        if (!cur) throw new EpisodeStoreError("episodes_store_error", "open_lookup", "episódio ativo sumiu entre o insert e a leitura");
        return { created: false, episode: cur as Episode };
      }
      throw classifyStoreError("open", error);
    },
    async get(id) {
      const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw classifyStoreError("get", error);
      return (data as Episode) ?? null;
    },
    async listDue(now, limit) {
      const { data, error } = await supabase.from(TABLE).select("*").neq("state", "closed")
        .lte("next_check_at", now.toISOString()).order("next_check_at", { ascending: true }).limit(limit);
      if (error) throw classifyStoreError("list_due", error);
      return (data ?? []) as Episode[];
    },
    async claim(ep, now) {
      const { data, error } = await supabase.from(TABLE).update({
        version: ep.version + 1,
        next_check_at: new Date(now.getTime() + LEASE_MS).toISOString(),
        updated_at: now.toISOString(),
      }).eq("id", ep.id).eq("version", ep.version).neq("state", "closed").select("*");
      if (error) throw classifyStoreError("claim", error);
      return data && data.length === 1 ? (data[0] as Episode) : null; // 0 linhas = outro worker venceu
    },
    async update(ep, patch) {
      const { data, error } = await supabase.from(TABLE).update({
        ...patch, version: ep.version + 1, updated_at: new Date().toISOString(),
      }).eq("id", ep.id).eq("version", ep.version).select("*");
      if (error) throw classifyStoreError("update", error);
      return data && data.length === 1 ? (data[0] as Episode) : null;
    },
  };
}

/** Log estruturado, sem tokens: conexão, episódio, etapa e resultado. */
export function alertLog(event: string, f: Record<string, unknown>) {
  const line = `[DISCONNECT_ALERT] ${JSON.stringify({ event, ...f })}`;
  if (event === "operational_error") console.error(line); else console.log(line);
}

/**
 * Ponto de entrada para quem só DETECTA uma possível queda (heartbeat, webhook). Não alerta: registra a suspeita
 * (idempotente, uma ativa por conexão) e o prazo de 5 min começa a contar. Nunca lança — mas uma falha de
 * armazenamento (ex.: migration ausente) vira `operational_error` com código identificável, nunca silêncio.
 */
export async function reportSuspectedDisconnect(
  supabase: any,
  input: { organization_id: string; connection_id: string; connection_name?: string; source: string },
) {
  const store = createSupabaseEpisodeStore(supabase);
  return await openSuspicion(
    { store, now: () => new Date(), log: alertLog } as any,
    input,
  );
}
