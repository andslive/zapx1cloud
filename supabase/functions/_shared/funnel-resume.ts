// Lógica pura da retomada de funis por timeout (funnel-resume-cron).
//
// Problema que isto resolve (diagnosticado em produção em 2026-10-01):
//  A) uma conversa cuja retomada "não faz nada" (ex.: espera com timeout e SEM
//     saída de timeout conectada => resposta 200 `timeout_no_path`, lock nunca
//     liberado) continuava vencida e era escolhida de novo a cada ciclo;
//  B) a seleção pegava as 60 mais antigas GLOBALMENTE e só depois limitava 2 por
//     conexão: 60 conversas presas de duas conexões enchiam a janela inteira e as
//     outras conexões nunca eram vistas (head-of-line blocking).
//
// Esta camada: elegibilidade ANTES do limite por conexão, round-robin entre
// conexões, tentativas limitadas com backoff/quarentena e diagnóstico, e modo
// de ativação seguro por padrão (não processa nada até ser configurado).
//
// Tudo aqui é puro (sem rede/banco) — testável com relógio controlado.

export type ResumeMode = "allowlist" | "fresh" | "all";

export interface ResumeConfig {
  /**
   * allowlist (PADRÃO): só as conversas listadas em FUNNEL_RESUME_ALLOWLIST.
   *   Lista vazia => nada é processado.
   * fresh: qualquer conversa cujo timeout venceu há NO MÁXIMO maxStaleMs
   *   (o passivo antigo fica de fora por construção).
   * all: sem limite de idade (drenagem do passivo — exige decisão explícita).
   */
  mode: ResumeMode;
  allowlist: Set<string>;
  maxStaleMs: number;
  perChip: number;
  hardCap: number;
  maxAttempts: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  pageSize: number;
  maxPages: number;
  /** só reporta a seleção; não chama o webhook nem grava nada */
  dryRun: boolean;
  /** não inicia novas retomadas depois deste tempo (cada retomada pode levar dezenas de segundos) */
  timeBudgetMs: number;
}

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

function intEnv(v: string | undefined, def: number, min: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== "" ? Math.min(max, Math.max(min, Math.floor(n))) : def;
}

/** Lê a configuração do ambiente. Qualquer valor inválido cai no modo SEGURO. */
export function parseResumeConfig(get: (k: string) => string | undefined): ResumeConfig {
  const rawMode = (get("FUNNEL_RESUME_MODE") ?? "").trim().toLowerCase();
  const mode: ResumeMode = rawMode === "fresh" || rawMode === "all" ? rawMode : "allowlist";
  const allowlist = new Set(
    (get("FUNNEL_RESUME_ALLOWLIST") ?? "").split(/[\s,;]+/).map((s) => s.trim()).filter((s) => ID_RE.test(s)),
  );
  return {
    mode,
    allowlist,
    maxStaleMs: intEnv(get("FUNNEL_RESUME_MAX_STALE_MINUTES"), 30, 1, 24 * 60) * 60_000,
    perChip: intEnv(get("FUNNEL_RESUME_PER_CHIP"), 2, 1, 20),
    hardCap: intEnv(get("FUNNEL_RESUME_HARD_CAP"), 20, 1, 100),
    maxAttempts: intEnv(get("FUNNEL_RESUME_MAX_ATTEMPTS"), 5, 1, 20),
    backoffBaseMs: intEnv(get("FUNNEL_RESUME_BACKOFF_BASE_MINUTES"), 2, 1, 120) * 60_000,
    backoffMaxMs: intEnv(get("FUNNEL_RESUME_BACKOFF_MAX_MINUTES"), 60, 1, 24 * 60) * 60_000,
    pageSize: intEnv(get("FUNNEL_RESUME_PAGE_SIZE"), 200, 10, 1000),
    maxPages: intEnv(get("FUNNEL_RESUME_MAX_PAGES"), 5, 1, 20),
    dryRun: (get("FUNNEL_RESUME_DRY_RUN") ?? "").trim().toLowerCase() === "true",
    timeBudgetMs: intEnv(get("FUNNEL_RESUME_TIME_BUDGET_SECONDS"), 100, 5, 600) * 1000,
  };
}

export interface ResumeCandidate {
  id: string;
  organization_id?: string | null;
  connection_id?: string | null;
  evolution_instance_id?: string | null;
  bot_locked_until: string;
  current_flow_id?: string | null;
  current_block_id?: string | null;
  flow_variables?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  updated_at?: string | null;
}

/**
 * Identifica UMA espera específica (fluxo + bloco + momento em que a pergunta
 * foi enviada). Um timeout só pode agir sobre a espera para a qual foi agendado:
 * se o lead respondeu e a conversa seguiu para outro bloco, ou se começou outra
 * execução, a chave muda e o timeout antigo é descartado.
 */
export function waitKeyOf(c: {
  current_flow_id?: string | null;
  current_block_id?: string | null;
  flow_variables?: Record<string, unknown> | null;
}): string {
  const wi = (c.flow_variables as { __waiting_input?: { question_sent_at?: string } } | null | undefined)?.__waiting_input;
  return `${c.current_flow_id ?? ""}|${c.current_block_id ?? ""}|${wi?.question_sent_at ?? ""}`;
}

export interface ResumeState {
  attempts: number;
  last_error?: string;
  last_attempt_at?: string;
  next_attempt_at?: string | null;
  quarantined?: boolean;
  wait_key: string;
}

/** Estado de tentativas guardado em metadata.resume — só vale para a MESMA espera. */
export function readResumeState(metadata: unknown, waitKey: string): ResumeState | null {
  const r = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).resume : undefined;
  if (!r || typeof r !== "object") return null;
  const s = r as Partial<ResumeState>;
  if (s.wait_key !== waitKey || typeof s.attempts !== "number") return null; // espera nova => estado zerado
  return s as ResumeState;
}

export type SkipReason = "not_allowlisted" | "too_stale" | "quarantined" | "backoff" | "not_expired" | "no_block";

export function isEligible(c: ResumeCandidate, cfg: ResumeConfig, nowMs: number): { ok: true } | { ok: false; reason: SkipReason } {
  const lockMs = Date.parse(c.bot_locked_until);
  if (!Number.isFinite(lockMs) || lockMs > nowMs) return { ok: false, reason: "not_expired" };
  if (!c.current_block_id) return { ok: false, reason: "no_block" };
  if (cfg.mode === "allowlist" && !cfg.allowlist.has(c.id)) return { ok: false, reason: "not_allowlisted" };
  if (cfg.mode === "fresh" && nowMs - lockMs > cfg.maxStaleMs) return { ok: false, reason: "too_stale" };
  const st = readResumeState(c.metadata, waitKeyOf(c));
  if (st?.quarantined) return { ok: false, reason: "quarantined" };
  if (st?.next_attempt_at && Date.parse(st.next_attempt_at) > nowMs) return { ok: false, reason: "backoff" };
  return { ok: true };
}

export function chipOf(c: ResumeCandidate): string {
  return c.connection_id || c.evolution_instance_id || "__none__";
}

export interface Batch {
  batch: ResumeCandidate[];
  eligible: number;
  skipped: Partial<Record<SkipReason, number>>;
}

/**
 * Seleção justa: primeiro descarta o que não é elegível (JÁ antes de limitar),
 * depois até `perChip` por conexão (as mais antigas de cada uma), intercalando
 * as conexões em round-robin pela conversa mais antiga, até `hardCap`.
 * Uma conversa presa só consome a SUA cota da SUA conexão — e, tendo falhado,
 * sai por backoff/quarentena — nunca a janela das demais.
 */
export function pickBatch(candidates: ResumeCandidate[], cfg: ResumeConfig, nowMs: number): Batch {
  const skipped: Batch["skipped"] = {};
  const byChip = new Map<string, ResumeCandidate[]>();
  let eligible = 0;
  const sorted = [...candidates].sort((a, b) => Date.parse(a.bot_locked_until) - Date.parse(b.bot_locked_until) || a.id.localeCompare(b.id));
  for (const c of sorted) {
    const e = isEligible(c, cfg, nowMs);
    if (!e.ok) { skipped[e.reason] = (skipped[e.reason] ?? 0) + 1; continue; }
    eligible++;
    const k = chipOf(c);
    const list = byChip.get(k) ?? [];
    if (list.length < cfg.perChip) list.push(c);
    byChip.set(k, list);
  }
  const queues = [...byChip.values()].sort((a, b) => Date.parse(a[0].bot_locked_until) - Date.parse(b[0].bot_locked_until));
  const batch: ResumeCandidate[] = [];
  for (let round = 0; round < cfg.perChip && batch.length < cfg.hardCap; round++) {
    for (const q of queues) {
      if (batch.length >= cfg.hardCap) break;
      if (q[round]) batch.push(q[round]);
    }
  }
  return { batch, eligible, skipped };
}

export type Outcome = "advanced" | "released" | "busy" | "failed";

/**
 * Traduz a resposta do webhook (`resume_funnel`) no que aconteceu com a espera.
 * Conservador: qualquer coisa não reconhecida conta como FALHA (tentativa
 * limitada), nunca como sucesso.
 */
export function classifyResponse(status: number | null, body: unknown): { outcome: Outcome; reason: string } {
  if (status === null) return { outcome: "failed", reason: "network_error" };
  if (status < 200 || status >= 300) return { outcome: "failed", reason: `http_${status}` };
  const b = (body && typeof body === "object" ? body : {}) as { ok?: boolean; funnel?: boolean; skipped?: string; error?: string };
  if (b.funnel === true) return { outcome: "advanced", reason: "funnel_ran" };
  switch (b.skipped) {
    case "conversation_lease_held_by_other_owner":
    case "conversation_locked":
    case "wait_already_claimed":
    case "inbound_in_flight":
      return { outcome: "busy", reason: b.skipped };
    case "ghost_cleanup_invalid_resume_state":
    case "recent_message_detected":
    case "already_handled_by_inbound":
    case "stale_resume":
    case "timeout_no_path_released":
      return { outcome: "released", reason: b.skipped };
  }
  if (b.skipped) return { outcome: "failed", reason: `skipped:${String(b.skipped).slice(0, 40)}` };
  if (b.error) return { outcome: "failed", reason: `error:${String(b.error).slice(0, 40)}` };
  return { outcome: "failed", reason: "unrecognized_response" };
}

/** Próximo estado de tentativas. `null` = apagar o estado (a espera terminou). */
export function nextState(
  prev: ResumeState | null,
  outcome: Outcome,
  reason: string,
  nowMs: number,
  cfg: ResumeConfig,
  waitKey: string,
): ResumeState | null {
  if (outcome === "advanced" || outcome === "released") return null;
  if (outcome === "busy") return prev; // não conta tentativa
  const attempts = (prev?.attempts ?? 0) + 1;
  const quarantined = attempts >= cfg.maxAttempts;
  const delay = Math.min(cfg.backoffMaxMs, cfg.backoffBaseMs * 2 ** (attempts - 1));
  return {
    attempts,
    last_error: reason.slice(0, 80),
    last_attempt_at: new Date(nowMs).toISOString(),
    next_attempt_at: quarantined ? null : new Date(nowMs + delay).toISOString(),
    quarantined,
    wait_key: waitKey,
  };
}

// ---------------------------------------------------------------------------
// Um ciclo completo, com dependências injetadas (relógio, banco, webhook).
// ---------------------------------------------------------------------------

export interface PageArgs {
  after: { lock: string; id: string } | null;
  limit: number;
  /** só candidatos com lock >= minLock (modo fresh: o passivo antigo nem é lido) */
  minLock?: string;
  /** só estes ids (modo allowlist) */
  ids?: string[];
}

export interface CycleDeps {
  now: () => number;
  fetchPage: (a: PageArgs) => Promise<ResumeCandidate[]>;
  callResume: (c: ResumeCandidate, expected: { flow_id: string; block_id: string; wait_key: string }) => Promise<{ status: number | null; body: unknown }>;
  /** releitura imediatamente antes de gravar o estado (CAS por updated_at) */
  readLatest: (id: string) => Promise<{ metadata: Record<string, unknown> | null; updated_at: string | null } | null>;
  writeState: (id: string, metadata: Record<string, unknown>, expectedUpdatedAt: string | null) => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  log: (msg: string, extra?: Record<string, unknown>) => void;
}

export interface CycleSummary {
  mode: ResumeMode;
  dry_run: boolean;
  scanned: number;
  eligible: number;
  selected: number;
  skipped: Batch["skipped"];
  outcomes: Record<Outcome, number>;
  failures: { id: string; reason: string; attempts: number; quarantined: boolean }[];
  selected_ids?: string[];
  /** a varredura atingiu o teto de páginas com a última página cheia: pode haver conversas além do que foi lido */
  scan_truncated: boolean;
  note?: string;
}

export async function runResumeCycle(deps: CycleDeps, cfg: ResumeConfig, requestDelayMs = 120): Promise<CycleSummary> {
  const nowMs = deps.now();
  const summary: CycleSummary = {
    mode: cfg.mode, dry_run: cfg.dryRun, scanned: 0, eligible: 0, selected: 0, skipped: {},
    outcomes: { advanced: 0, released: 0, busy: 0, failed: 0 }, failures: [], scan_truncated: false,
  };

  // Modo seguro: allowlist vazia => nada a fazer (nem consulta o banco).
  if (cfg.mode === "allowlist" && cfg.allowlist.size === 0) {
    summary.note = "allowlist_empty: nenhuma conversa foi processada (modo seguro)";
    return summary;
  }

  // Leitura paginada por chave (lock, id). Em `allowlist` só os ids; em `fresh` o
  // passivo antigo nem é lido (filtro de lock mínimo no banco).
  const all: ResumeCandidate[] = [];
  if (cfg.mode === "allowlist") {
    all.push(...await deps.fetchPage({ after: null, limit: cfg.allowlist.size, ids: [...cfg.allowlist] }));
  } else {
    let after: PageArgs["after"] = null;
    const minLock = cfg.mode === "fresh" ? new Date(nowMs - cfg.maxStaleMs).toISOString() : undefined;
    for (let p = 0; p < cfg.maxPages; p++) {
      const page = await deps.fetchPage({ after, limit: cfg.pageSize, minLock });
      all.push(...page);
      if (page.length < cfg.pageSize) break;
      if (p === cfg.maxPages - 1) { summary.scan_truncated = true; deps.log("scan_truncated", { scanned: all.length }); }
      const last = page[page.length - 1];
      after = { lock: last.bot_locked_until, id: last.id };
    }
  }
  summary.scanned = all.length;

  const { batch, eligible, skipped } = pickBatch(all, cfg, nowMs);
  summary.eligible = eligible;
  summary.selected = batch.length;
  summary.skipped = skipped;

  if (cfg.dryRun) {
    summary.selected_ids = batch.slice(0, 20).map((c) => c.id);
    summary.note = "dry_run: nenhum webhook foi chamado e nada foi gravado";
    return summary;
  }

  for (const c of batch) {
    if (deps.now() - nowMs > cfg.timeBudgetMs) { summary.note = "time_budget_exhausted: o restante fica para o próximo ciclo"; break; }
    const waitKey = waitKeyOf(c);
    const expected = { flow_id: c.current_flow_id ?? "", block_id: c.current_block_id ?? "", wait_key: waitKey };
    let res: { status: number | null; body: unknown };
    try {
      res = await deps.callResume(c, expected);
    } catch (_e) {
      res = { status: null, body: null };
    }
    const { outcome, reason } = classifyResponse(res.status, res.body);
    summary.outcomes[outcome]++;
    const prev = readResumeState(c.metadata, waitKey);
    const next = nextState(prev, outcome, reason, deps.now(), cfg, waitKey);

    if (outcome === "failed") {
      summary.failures.push({ id: c.id, reason, attempts: next?.attempts ?? 0, quarantined: !!next?.quarantined });
      deps.log("resume_failed", { conversation_id: c.id, reason, attempts: next?.attempts, quarantined: !!next?.quarantined });
    }

    // Grava o estado (apenas metadata.resume), com checagem otimista por updated_at.
    if ((prev !== null || next !== null) && (next !== prev)) {
      try {
        const latest = await deps.readLatest(c.id);
        if (latest) {
          const md = { ...(latest.metadata ?? {}) } as Record<string, unknown>;
          if (next === null) delete md.resume; else md.resume = next;
          const ok = await deps.writeState(c.id, md, latest.updated_at);
          if (!ok) deps.log("resume_state_write_conflict", { conversation_id: c.id });
        }
      } catch (_e) {
        deps.log("resume_state_write_error", { conversation_id: c.id });
      }
    }
    await deps.sleep(requestDelayMs);
  }
  return summary;
}
