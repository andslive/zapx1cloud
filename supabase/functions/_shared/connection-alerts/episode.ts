/**
 * Alerta de desconexão de conexão (instância UazAPI) — máquina de estados PERSISTENTE por episódio.
 *
 * Regra de negócio (pedido do dono, 24/11/2026):
 *  1. Mudança de status NÃO alerta. Só registra uma ocorrência pendente por conexão e espera 5 min.
 *  2. Passado o prazo, consulta a UazAPI diretamente (não confia no status salvo nem no webhook).
 *  3. Alerta só com DUAS consultas válidas indicando desconexão, com ≥1 min entre elas. Se qualquer consulta
 *     disser "conectada", a ocorrência é cancelada.
 *  4. Timeout/erro HTTP/indisponibilidade/resposta inconclusiva NÃO comprovam queda: a verificação segue pendente
 *     com retentativa com backoff, sem alerta.
 *  5. Um alerta por episódio por conexão. Enquanto a queda continuar, não repete.
 *  6. Novo episódio só depois de recuperação ESTÁVEL de 5 min confirmada na UazAPI. Oscilação curta não libera.
 *  7. Antes de enviar, revalida; protege contra webhook duplicado, workers concorrentes, jobs antigos e reinício.
 *
 * Tudo vive no banco (tabela connection_disconnect_episodes): nenhuma requisição fica aberta esperando. O heartbeat
 * (pg_cron, 1/min) apenas "empurra" os episódios vencidos. Exclusividade por compare-and-swap em `version`.
 * Este módulo é puro: banco, UazAPI e envio entram por `Deps` (testável com relógio e UazAPI simulados).
 */
import type { StatusProbe } from "./status.ts";

export const SUSPICION_WAIT_MS = 5 * 60_000;
export const CONFIRM_INTERVAL_MS = 60_000;
export const STABLE_RECOVERY_MS = 5 * 60_000;
export const LEASE_MS = 2 * 60_000;
export const STALE_CONFIRM_MS = 10 * 60_000;
export const CLAIMING_TIMEOUT_MS = 5 * 60_000;
export const MAX_SEND_ATTEMPTS = 3;
export const INCONCLUSIVE_BACKOFF_MS = [60_000, 120_000, 240_000, 300_000];
const CLOCK_TOLERANCE_MS = 1_000;
const CONNECTED_GAP_MS = 150_000;

export type EpisodeState = "pending" | "alerted" | "closed";
export type AlertStatus = null | "claiming" | "sent" | "unknown" | "skipped" | "failed";

export interface Episode {
  id: string;
  organization_id: string;
  connection_id: string;
  state: EpisodeState;
  source: string;
  suspected_at: string;
  next_check_at: string;
  confirm_count: number;
  last_valid_disconnect_at: string | null;
  inconclusive_streak: number;
  check_count: number;
  last_check_at: string | null;
  last_check_result: string | null;
  alert_status: AlertStatus;
  alert_claimed_at: string | null;
  alert_sent_at: string | null;
  alert_attempts: number;
  recovered_since: string | null;
  last_connected_at: string | null;
  close_reason: string | null;
  closed_at: string | null;
  version: number;
}

export interface ConnectionInfo {
  id: string;
  name: string;
  organization_id: string;
  phone_number: string | null;
  archived_at: string | null;
  status: string | null;
  last_real_whatsapp_state: string | null;
  last_health_at: string | null;
  last_connected_at: string | null;
}

export interface EpisodeStore {
  /** Cria o episódio ativo da conexão, ou devolve o existente (índice único parcial). Nunca reinicia o prazo. */
  open(i: { organization_id: string; connection_id: string; now: Date; source: string }): Promise<{ created: boolean; episode: Episode }>;
  get(id: string): Promise<Episode | null>;
  listDue(now: Date, limit: number): Promise<Episode[]>;
  /** CAS: só um worker leva o episódio; empurra next_check_at (lease) e incrementa version. */
  claim(ep: Episode, now: Date): Promise<Episode | null>;
  /** CAS em `version`: um job antigo/duplicado não grava. Devolve o episódio novo (version+1) ou null. */
  update(ep: Episode, patch: Partial<Episode>): Promise<Episode | null>;
}

export type SendOutcome =
  | { outcome: "sent"; detail?: string }
  | { outcome: "rejected"; detail?: string } // o provedor recusou de forma definitiva: pode tentar de novo
  | { outcome: "no_sender"; detail?: string } // sem instância saudável para enviar
  | { outcome: "unknown"; detail?: string }; // timeout/exceção: pode ter sido entregue → NUNCA reenviar

export interface Deps {
  store: EpisodeStore;
  now: () => Date;
  loadConnection: (id: string) => Promise<ConnectionInfo | null>;
  /** Consulta DIRETA à UazAPI (probeInstance com a URL/token reais da conexão). */
  probe: (conn: ConnectionInfo) => Promise<StatusProbe>;
  getRecipient: (orgId: string) => Promise<{ phone: string | null; enabled: boolean }>;
  sendAlert: (ctx: { episode: Episode; connection: ConnectionInfo; phone: string }) => Promise<SendOutcome>;
  log: (event: string, fields: Record<string, unknown>) => void;
}

const t = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);
const iso = (ms: number) => new Date(ms).toISOString();

export function inconclusiveBackoff(streak: number): number {
  return INCONCLUSIVE_BACKOFF_MS[Math.min(Math.max(streak, 1) - 1, INCONCLUSIVE_BACKOFF_MS.length - 1)];
}

export type Step =
  | { action: "cancel" | "close_recovered" | "wait" | "confirm_wait" | "retry"; patch: Partial<Episode> }
  | { action: "alert"; patch: Partial<Episode> };

/** Função PURA: dado o episódio, o resultado da consulta e a hora, decide o próximo passo. */
export function nextStep(ep: Episode, probe: StatusProbe, nowDate: Date): Step {
  const now = nowDate.getTime();
  const base: Partial<Episode> = {
    last_check_at: iso(now),
    last_check_result: probe.kind === "inconclusive" ? `inconclusive:${probe.reason}` : probe.kind,
    check_count: ep.check_count + 1,
  };

  if (ep.state === "pending") {
    if (probe.kind === "connected") {
      return { action: "cancel", patch: { ...base, state: "closed", close_reason: "cancelled_recovered", closed_at: iso(now) } };
    }
    // contagem velha demais não vale como "primeira consulta" (o intervalo seria de muito mais que 1 min)
    const lastValid = t(ep.last_valid_disconnect_at);
    const stale = ep.confirm_count > 0 && !(now - lastValid <= STALE_CONFIRM_MS);
    const count = stale ? 0 : ep.confirm_count;

    if (probe.kind === "inconclusive") {
      const streak = ep.inconclusive_streak + 1;
      return {
        action: "retry",
        patch: { ...base, inconclusive_streak: streak, confirm_count: count, next_check_at: iso(now + inconclusiveBackoff(streak)) },
      };
    }
    // disconnected (consulta válida)
    if (count >= 1 && now - lastValid >= CONFIRM_INTERVAL_MS - CLOCK_TOLERANCE_MS) {
      return { action: "alert", patch: { ...base, inconclusive_streak: 0, confirm_count: count + 1, last_valid_disconnect_at: iso(now) } };
    }
    if (count >= 1) {
      // chegou cedo demais (job duplicado/relógio): não conta como a 2ª consulta
      return { action: "confirm_wait", patch: { ...base, confirm_count: count, next_check_at: iso(lastValid + CONFIRM_INTERVAL_MS) } };
    }
    return {
      action: "confirm_wait",
      patch: { ...base, inconclusive_streak: 0, confirm_count: 1, last_valid_disconnect_at: iso(now), next_check_at: iso(now + CONFIRM_INTERVAL_MS) },
    };
  }

  // state === "alerted": monitora só a recuperação ESTÁVEL; nunca alerta de novo neste episódio
  if (probe.kind === "connected") {
    const lastConn = t(ep.last_connected_at);
    const continuous = ep.recovered_since && now - lastConn <= CONNECTED_GAP_MS;
    const since = continuous ? t(ep.recovered_since) : now;
    if (continuous && now - since >= STABLE_RECOVERY_MS) {
      return { action: "close_recovered", patch: { ...base, state: "closed", close_reason: "recovered_stable", closed_at: iso(now), last_connected_at: iso(now) } };
    }
    return { action: "wait", patch: { ...base, recovered_since: iso(since), last_connected_at: iso(now), next_check_at: iso(now + CONFIRM_INTERVAL_MS) } };
  }
  if (probe.kind === "disconnected") {
    return { action: "wait", patch: { ...base, recovered_since: null, next_check_at: iso(now + CONFIRM_INTERVAL_MS) } };
  }
  return { action: "wait", patch: { ...base, next_check_at: iso(now + CONFIRM_INTERVAL_MS) } };
}

const fields = (ep: Episode, c?: ConnectionInfo | null, extra: Record<string, unknown> = {}) => ({
  connection_id: ep.connection_id,
  connection: c?.name,
  episode: ep.id,
  suspected_at: ep.suspected_at,
  ...extra,
});

/** Registra a suspeita (idempotente: evento repetido não cria outra ocorrência nem reinicia o prazo). */
export async function openSuspicion(
  deps: Deps,
  input: { organization_id: string; connection_id: string; connection_name?: string; source: string },
): Promise<{ created: boolean; episode: Episode | null }> {
  try {
    const r = await deps.store.open({ organization_id: input.organization_id, connection_id: input.connection_id, now: deps.now(), source: input.source });
    deps.log(r.created ? "suspicion_opened" : "duplicate_suppressed", {
      connection_id: input.connection_id, connection: input.connection_name, episode: r.episode.id, suspected_at: r.episode.suspected_at, source: input.source,
    });
    return r;
  } catch (e) {
    // Falha de armazenamento NÃO é comportamento seguro silencioso: erro operacional com código identificável.
    deps.log("operational_error", {
      op: "open_suspicion", code: (e as { code?: string }).code ?? "episodes_store_error", connection_id: input.connection_id,
      source: input.source, error: (e as Error).message,
    });
    return { created: false, episode: null };
  }
}

function recoveredAfter(conn: ConnectionInfo, ep: Episode): boolean {
  const since = t(ep.last_valid_disconnect_at ?? ep.suspected_at);
  const healthOk = conn.last_real_whatsapp_state === "CONNECTED" && t(conn.last_health_at) > since;
  const webhookOk = conn.status === "connected" && t(conn.last_connected_at) > since;
  return healthOk || webhookOk;
}

async function processClaimed(deps: Deps, claimed: Episode): Promise<void> {
  const now = deps.now();
  const conn = await deps.loadConnection(claimed.connection_id);

  if (!conn || conn.archived_at) {
    await deps.store.update(claimed, { state: "closed", close_reason: "archived_or_missing", closed_at: now.toISOString() });
    deps.log("closed", fields(claimed, conn, { reason: "archived_or_missing" }));
    return;
  }

  // envio que ficou "claiming" sem concluir (processo caiu): resultado desconhecido → nunca reenviar
  if (claimed.alert_status === "claiming") {
    if (now.getTime() - t(claimed.alert_claimed_at) > CLAIMING_TIMEOUT_MS) {
      await deps.store.update(claimed, { alert_status: "unknown", next_check_at: iso(now.getTime() + CONFIRM_INTERVAL_MS) });
      deps.log("alert_outcome_unknown", fields(claimed, conn, { reason: "claim_timeout" }));
    } else {
      await deps.store.update(claimed, { next_check_at: iso(now.getTime() + CONFIRM_INTERVAL_MS) });
    }
    return;
  }

  const probe = await deps.probe(conn);
  const step = nextStep(claimed, probe, deps.now());

  if (step.action !== "alert") {
    const saved = await deps.store.update(claimed, step.patch);
    if (!saved) { deps.log("stale_job_dropped", fields(claimed, conn)); return; }
    const ev = step.action === "cancel" ? "cancelled_recovered"
      : step.action === "close_recovered" ? "closed_stable_recovery"
      : step.action === "retry" ? "check_inconclusive_retry"
      : step.action === "confirm_wait" ? "check_disconnected"
      : "check";
    deps.log(ev, fields(claimed, conn, { result: step.patch.last_check_result, confirm_count: saved.confirm_count, next_check_at: saved.next_check_at }));
    return;
  }

  // ---- 2ª consulta válida de desconexão: tenta o envio único ----
  const claimedAlert = await deps.store.update(claimed, {
    ...step.patch,
    state: "alerted",
    alert_status: "claiming",
    alert_claimed_at: deps.now().toISOString(),
    alert_attempts: claimed.alert_attempts + 1,
  });
  if (!claimedAlert) { deps.log("duplicate_suppressed", fields(claimed, conn, { where: "alert_claim" })); return; }
  deps.log("disconnect_confirmed", fields(claimedAlert, conn, { confirm_count: claimedAlert.confirm_count }));

  // revalidação imediatamente antes do envio
  const fresh = await deps.store.get(claimedAlert.id);
  const connNow = await deps.loadConnection(claimedAlert.connection_id);
  const stillActive = !!fresh && fresh.version === claimedAlert.version && fresh.state === "alerted" && fresh.alert_status === "claiming";
  if (!stillActive || !connNow || connNow.archived_at || recoveredAfter(connNow, claimedAlert)) {
    await deps.store.update(claimedAlert, { state: "closed", alert_status: null, close_reason: "cancelled_before_send", closed_at: deps.now().toISOString() });
    deps.log("cancelled_before_send", fields(claimedAlert, connNow, { still_active: stillActive }));
    return;
  }

  const rcpt = await deps.getRecipient(claimedAlert.organization_id);
  if (!rcpt.phone || !rcpt.enabled) {
    await deps.store.update(claimedAlert, { alert_status: "skipped", next_check_at: iso(deps.now().getTime() + CONFIRM_INTERVAL_MS) });
    deps.log("alert_skipped", fields(claimedAlert, connNow, { reason: rcpt.enabled ? "no_recipient" : "alerts_disabled" }));
    return;
  }

  let res: SendOutcome;
  try { res = await deps.sendAlert({ episode: claimedAlert, connection: connNow, phone: rcpt.phone }); }
  catch (e) { res = { outcome: "unknown", detail: (e as Error).message }; }

  const nextMs = deps.now().getTime() + CONFIRM_INTERVAL_MS;
  if (res.outcome === "sent") {
    await deps.store.update(claimedAlert, { alert_status: "sent", alert_sent_at: deps.now().toISOString(), recovered_since: null, next_check_at: iso(nextMs) });
    deps.log("alert_sent", fields(claimedAlert, connNow, { attempts: claimedAlert.alert_attempts }));
  } else if (res.outcome === "unknown") {
    await deps.store.update(claimedAlert, { alert_status: "unknown", next_check_at: iso(nextMs) });
    deps.log("alert_outcome_unknown", fields(claimedAlert, connNow, { detail: res.detail }));
  } else if (claimedAlert.alert_attempts >= MAX_SEND_ATTEMPTS) {
    await deps.store.update(claimedAlert, { alert_status: "failed", next_check_at: iso(nextMs) });
    deps.log("alert_failed_final", fields(claimedAlert, connNow, { reason: res.outcome, attempts: claimedAlert.alert_attempts }));
  } else {
    // recusa definitiva / sem remetente: volta a pendente; a próxima consulta válida tenta de novo (≤ MAX tentativas)
    await deps.store.update(claimedAlert, { state: "pending", alert_status: null, next_check_at: iso(nextMs) });
    deps.log("alert_retry_scheduled", fields(claimedAlert, connNow, { reason: res.outcome, attempts: claimedAlert.alert_attempts }));
  }
}

/** Um tick do processador: pega os episódios vencidos, cada um por claim exclusivo. Seguro para rodar em paralelo. */
export async function processDueEpisodes(
  deps: Deps,
  limit = 50,
): Promise<{ ok: boolean; due: number; processed: number; errors: number; error_code?: string }> {
  let due: Episode[];
  try { due = await deps.store.listDue(deps.now(), limit); }
  catch (e) {
    // tabela ausente / sem permissão / banco fora: erro operacional identificável (o heartbeat devolve no JSON)
    const code = (e as { code?: string }).code ?? "episodes_store_error";
    deps.log("operational_error", { op: "list_due", code, error: (e as Error).message });
    return { ok: false, due: 0, processed: 0, errors: 1, error_code: code };
  }
  let processed = 0, errors = 0;
  for (const ep of due) {
    try {
      const claimed = await deps.store.claim(ep, deps.now());
      if (!claimed) { deps.log("claim_lost", { connection_id: ep.connection_id, episode: ep.id }); continue; }
      await processClaimed(deps, claimed);
      processed++;
    } catch (e) {
      errors++;
      deps.log("operational_error", { op: "process_episode", code: (e as { code?: string }).code ?? "episode_error", connection_id: ep.connection_id, episode: ep.id, error: (e as Error).message });
    }
  }
  return { ok: errors === 0, due: due.length, processed, errors };
}
