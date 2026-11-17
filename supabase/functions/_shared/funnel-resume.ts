// Lógica pura da retomada de funis por timeout (funnel-resume-cron).
//
// Problemas de produção que isto resolve (diagnosticados em 2026-10-01):
//  A) uma conversa cuja retomada "não faz nada" (ex.: espera com timeout e SEM
//     saída de timeout => resposta 200 `timeout_no_path`, lock nunca liberado)
//     continuava vencida e era escolhida de novo a cada ciclo;
//  B) a seleção pegava as 60 mais antigas GLOBALMENTE e só depois limitava 2 por
//     conexão: 60 conversas presas de duas conexões enchiam a janela inteira e as
//     outras conexões nunca eram vistas (head-of-line blocking);
//  C) o processamento era sequencial e sem prazo por chamada: uma retomada lenta
//     atrasava todas as seguintes do ciclo (inclusive do mesmo chip).
//
// Garantias desta camada:
//  - cada conversa tem estado e prazo PRÓPRIOS (a espera está na conversa); o serviço
//    só lê os vencimentos e despacha;
//  - elegibilidade ANTES do limite por conexão; round-robin entre conexões;
//  - processamento CONCORRENTE com limite global e por conexão, e PRAZO por chamada;
//  - uma conversa por vez é despachada (lease de despacho com lock otimista), então
//    ciclos sobrepostos / várias instâncias não duplicam a chamada;
//  - tentativas limitadas com backoff e quarentena, com diagnóstico em metadata.resume;
//  - o PASSIVO anterior à ativação (modo `since`) é separado de atrasos e falhas novos:
//    um timeout novo NUNCA some da fila por atraso — fica visível em `late_*`.
//  - MODO SEGURO por padrão: sem configuração, não processa nada.
//
// Tudo aqui é puro (sem rede/banco/relógio próprios) — testável com relógio controlado.

export type ResumeMode = "allowlist" | "since" | "all";

export interface ResumeConfig {
  /**
   * allowlist (PADRÃO): só as conversas listadas em FUNNEL_RESUME_ALLOWLIST.
   *   Lista vazia => nada é processado.
   * since: SÓ timeouts que venceram em ou depois de FUNNEL_RESUME_NOT_BEFORE (o
   *   instante da ativação). O passivo anterior fica de fora POR DEFINIÇÃO e é
   *   contado à parte (legacy_backlog). Um timeout novo nunca é descartado por idade.
   * all: sem corte (drenagem explícita do passivo).
   */
  mode: ResumeMode;
  allowlist: Set<string>;
  /** instante da ativação (modo since); vencimentos anteriores = passivo */
  notBeforeMs: number | null;
  /** aviso (log/contagem) quando o atraso do timeout novo passa disto; NÃO descarta */
  lateAlertMs: number;
  /** 0 = sem corte. >0: timeout novo atrasado além disto é pulado, de forma EXPLÍCITA (too_late) */
  maxLateMs: number;
  /** máx. de conversas selecionadas por conexão em um ciclo */
  perChip: number;
  /** máx. de conversas selecionadas por ciclo */
  hardCap: number;
  /** retomadas simultâneas por ciclo */
  concurrency: number;
  /** retomadas RÁPIDAS simultâneas por conexão: uma chamada que passa de slowAfterMs deixa de contar aqui */
  perChipInFlight: number;
  /** teto TOTAL de chamadas simultâneas por conexão (rápidas + lentas) */
  perChipHard: number;
  /** a partir daqui a chamada é tratada como lenta e libera a cota de rapidez da conexão */
  slowAfterMs: number;
  /** prazo de cada chamada ao webhook */
  callTimeoutMs: number;
  /** quanto tempo uma conversa despachada fica "reservada" para outros ciclos/instâncias */
  dispatchLeaseMs: number;
  maxAttempts: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  pageSize: number;
  maxPages: number;
  /** só reporta a seleção; não chama o webhook nem grava nada */
  dryRun: boolean;
  /** não INICIA novas retomadas depois deste tempo (menor que o intervalo do cron, para limitar a sobreposição de ciclos) */
  timeBudgetMs: number;
  /** configuração inválida/legada que forçou o modo seguro */
  warning?: string;
}

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

function intEnv(v: string | undefined, def: number, min: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== "" ? Math.min(max, Math.max(min, Math.floor(n))) : def;
}

/** Lê a configuração do ambiente. Qualquer valor inválido cai no modo SEGURO. */
export function parseResumeConfig(get: (k: string) => string | undefined): ResumeConfig {
  const rawMode = (get("FUNNEL_RESUME_MODE") ?? "").trim().toLowerCase();
  let mode: ResumeMode = rawMode === "since" || rawMode === "all" ? rawMode : "allowlist";
  let warning: string | undefined;
  if (rawMode === "fresh") warning = "mode_fresh_removed: use 'since' com FUNNEL_RESUME_NOT_BEFORE";

  const nb = (get("FUNNEL_RESUME_NOT_BEFORE") ?? "").trim();
  const nbMs = nb ? Date.parse(nb) : NaN;
  const notBeforeMs = Number.isFinite(nbMs) ? nbMs : null;
  if (mode === "since" && notBeforeMs === null) {
    mode = "allowlist"; // sem um instante de ativação válido, não há como separar o passivo => modo seguro
    warning = "since_requires_valid_FUNNEL_RESUME_NOT_BEFORE";
  }

  const allowlist = new Set(
    (get("FUNNEL_RESUME_ALLOWLIST") ?? "").split(/[\s,;]+/).map((s) => s.trim()).filter((s) => ID_RE.test(s)),
  );
  return {
    mode,
    allowlist,
    notBeforeMs,
    lateAlertMs: intEnv(get("FUNNEL_RESUME_LATE_ALERT_MINUTES"), 10, 1, 24 * 60) * 60_000,
    maxLateMs: intEnv(get("FUNNEL_RESUME_MAX_LATE_MINUTES"), 0, 0, 7 * 24 * 60) * 60_000,
    perChip: intEnv(get("FUNNEL_RESUME_PER_CHIP"), 8, 1, 50),
    hardCap: intEnv(get("FUNNEL_RESUME_HARD_CAP"), 30, 1, 200),
    concurrency: intEnv(get("FUNNEL_RESUME_CONCURRENCY"), 6, 1, 20),
    perChipInFlight: intEnv(get("FUNNEL_RESUME_PER_CHIP_IN_FLIGHT"), 3, 1, 10),
    perChipHard: intEnv(get("FUNNEL_RESUME_PER_CHIP_HARD"), 8, 1, 20),
    slowAfterMs: intEnv(get("FUNNEL_RESUME_SLOW_AFTER_SECONDS"), 10, 1, 120) * 1000,
    callTimeoutMs: intEnv(get("FUNNEL_RESUME_CALL_TIMEOUT_SECONDS"), 45, 5, 140) * 1000,
    dispatchLeaseMs: intEnv(get("FUNNEL_RESUME_DISPATCH_LEASE_SECONDS"), 120, 30, 900) * 1000,
    maxAttempts: intEnv(get("FUNNEL_RESUME_MAX_ATTEMPTS"), 5, 1, 20),
    backoffBaseMs: intEnv(get("FUNNEL_RESUME_BACKOFF_BASE_MINUTES"), 2, 1, 120) * 60_000,
    backoffMaxMs: intEnv(get("FUNNEL_RESUME_BACKOFF_MAX_MINUTES"), 60, 1, 24 * 60) * 60_000,
    pageSize: intEnv(get("FUNNEL_RESUME_PAGE_SIZE"), 200, 10, 1000),
    maxPages: intEnv(get("FUNNEL_RESUME_MAX_PAGES"), 5, 1, 20),
    dryRun: (get("FUNNEL_RESUME_DRY_RUN") ?? "").trim().toLowerCase() === "true",
    timeBudgetMs: intEnv(get("FUNNEL_RESUME_TIME_BUDGET_SECONDS"), 50, 5, 600) * 1000,
    warning,
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
  /** reserva de despacho: outro ciclo/instância não deve chamar o webhook para esta espera até aqui */
  dispatch_until?: string | null;
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

export type SkipReason =
  | "not_allowlisted" | "legacy_backlog" | "too_late" | "quarantined" | "backoff" | "dispatched" | "not_expired" | "no_block";

export function isEligible(c: ResumeCandidate, cfg: ResumeConfig, nowMs: number): { ok: true } | { ok: false; reason: SkipReason } {
  const lockMs = Date.parse(c.bot_locked_until);
  if (!Number.isFinite(lockMs) || lockMs > nowMs) return { ok: false, reason: "not_expired" };
  if (!c.current_block_id) return { ok: false, reason: "no_block" };
  if (cfg.mode === "allowlist" && !cfg.allowlist.has(c.id)) return { ok: false, reason: "not_allowlisted" };
  // PASSIVO: vencido ANTES da ativação. Separado de atraso novo; nunca depende da idade.
  if (cfg.mode === "since" && cfg.notBeforeMs !== null && lockMs < cfg.notBeforeMs) return { ok: false, reason: "legacy_backlog" };
  // atraso NOVO: por padrão nunca descarta; só com corte explícito (e contado como too_late)
  if (cfg.maxLateMs > 0 && nowMs - lockMs > cfg.maxLateMs) return { ok: false, reason: "too_late" };
  const st = readResumeState(c.metadata, waitKeyOf(c));
  if (st?.quarantined) return { ok: false, reason: "quarantined" };
  if (st?.next_attempt_at && Date.parse(st.next_attempt_at) > nowMs) return { ok: false, reason: "backoff" };
  if (st?.dispatch_until && Date.parse(st.dispatch_until) > nowMs) return { ok: false, reason: "dispatched" };
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
export function classifyResponse(status: number | null, body: unknown, timedOut = false): { outcome: Outcome; reason: string } {
  if (timedOut) return { outcome: "failed", reason: "call_timeout" };
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

/** Próximo estado de tentativas (SEM reserva de despacho). `null` = apagar o estado. */
export function nextState(
  prev: ResumeState | null,
  outcome: Outcome,
  reason: string,
  nowMs: number,
  cfg: ResumeConfig,
  waitKey: string,
): ResumeState | null {
  if (outcome === "advanced" || outcome === "released") return null;
  if (outcome === "busy") return prev ? { ...prev, dispatch_until: null } : null; // não conta tentativa
  const attempts = (prev?.attempts ?? 0) + 1;
  const quarantined = attempts >= cfg.maxAttempts;
  const delay = Math.min(cfg.backoffMaxMs, cfg.backoffBaseMs * 2 ** (attempts - 1));
  return {
    attempts,
    last_error: reason.slice(0, 80),
    last_attempt_at: new Date(nowMs).toISOString(),
    next_attempt_at: quarantined ? null : new Date(nowMs + delay).toISOString(),
    quarantined,
    dispatch_until: null,
    wait_key: waitKey,
  };
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

// ---------------------------------------------------------------------------
// Um ciclo completo, com dependências injetadas (relógio, banco, webhook).
// ---------------------------------------------------------------------------

export interface PageArgs {
  after: { lock: string; id: string } | null;
  limit: number;
  /** só candidatos com lock >= minLock (modo since: o passivo anterior à ativação nem é lido) */
  minLock?: string;
  /** só estes ids (modo allowlist) */
  ids?: string[];
}

export interface CycleDeps {
  now: () => number;
  fetchPage: (a: PageArgs) => Promise<ResumeCandidate[]>;
  callResume: (
    c: ResumeCandidate,
    expected: { flow_id: string; block_id: string; wait_key: string },
  ) => Promise<{ status: number | null; body: unknown; timedOut?: boolean }>;
  /** releitura imediatamente antes de gravar o estado (lock otimista por updated_at) */
  readLatest: (id: string) => Promise<{ metadata: Record<string, unknown> | null; updated_at: string | null } | null>;
  writeState: (id: string, metadata: Record<string, unknown>, expectedUpdatedAt: string | null) => Promise<boolean>;
  /** contagem do passivo (vencido antes da ativação), só para diagnóstico; opcional */
  countBacklog?: (beforeIso: string) => Promise<number>;
  /** agenda `fn` daqui a `ms` (setTimeout em produção; relógio virtual nos testes) */
  after: (ms: number, fn: () => void) => void;
  log: (msg: string, extra?: Record<string, unknown>) => void;
}

export interface CycleSummary {
  mode: ResumeMode;
  dry_run: boolean;
  scanned: number;
  eligible: number;
  selected: number;
  started: number;
  skipped: Batch["skipped"];
  outcomes: Record<Outcome, number>;
  failures: { id: string; reason: string; attempts: number; quarantined: boolean }[];
  selected_ids?: string[];
  /** passivo vencido antes da ativação (modo since): fora da fila por definição, contado à parte */
  legacy_backlog?: number;
  /** atraso entre o vencimento e o INÍCIO efetivo da retomada */
  late_ms: { n: number; p50: number; p95: number; max: number };
  /** timeouts NOVOS atrasados além do alerta (continuam sendo processados) */
  late_alerts: number;
  /** chamadas em que o CRON desistiu por prazo (o servidor segue e normalmente conclui): não são falhas reais */
  call_timeouts: number;
  in_flight_peak: number;
  duration_ms: number;
  /** a varredura atingiu o teto de páginas com a última página cheia: pode haver conversas além do que foi lido */
  scan_truncated: boolean;
  note?: string;
}

export async function runResumeCycle(deps: CycleDeps, cfg: ResumeConfig): Promise<CycleSummary> {
  const nowMs = deps.now();
  const summary: CycleSummary = {
    mode: cfg.mode, dry_run: cfg.dryRun, scanned: 0, eligible: 0, selected: 0, started: 0, skipped: {},
    outcomes: { advanced: 0, released: 0, busy: 0, failed: 0 }, failures: [], scan_truncated: false,
    late_ms: { n: 0, p50: 0, p95: 0, max: 0 }, late_alerts: 0, call_timeouts: 0, in_flight_peak: 0, duration_ms: 0,
  };
  const notes: string[] = [];
  if (cfg.warning) notes.push(`config: ${cfg.warning}`);

  // Modo seguro: allowlist vazia => nada a fazer (nem consulta o banco).
  if (cfg.mode === "allowlist" && cfg.allowlist.size === 0) {
    notes.push("allowlist_empty: nenhuma conversa foi processada (modo seguro)");
    summary.note = notes.join(" | ");
    return summary;
  }

  // Leitura paginada por chave (lock, id).
  const all: ResumeCandidate[] = [];
  if (cfg.mode === "allowlist") {
    all.push(...await deps.fetchPage({ after: null, limit: cfg.allowlist.size, ids: [...cfg.allowlist] }));
  } else {
    let after: PageArgs["after"] = null;
    const minLock = cfg.mode === "since" && cfg.notBeforeMs !== null ? new Date(cfg.notBeforeMs).toISOString() : undefined;
    for (let p = 0; p < cfg.maxPages; p++) {
      const page = await deps.fetchPage({ after, limit: cfg.pageSize, minLock });
      all.push(...page);
      if (page.length < cfg.pageSize) break;
      if (p === cfg.maxPages - 1) { summary.scan_truncated = true; deps.log("scan_truncated", { scanned: all.length }); }
      const last = page[page.length - 1];
      after = { lock: last.bot_locked_until, id: last.id };
    }
    if (cfg.mode === "since" && cfg.notBeforeMs !== null && deps.countBacklog) {
      try { summary.legacy_backlog = await deps.countBacklog(new Date(cfg.notBeforeMs).toISOString()); } catch (_e) { /* diagnóstico opcional */ }
    }
  }
  summary.scanned = all.length;

  const { batch, eligible, skipped } = pickBatch(all, cfg, nowMs);
  summary.eligible = eligible;
  summary.selected = batch.length;
  summary.skipped = skipped;

  if (cfg.dryRun) {
    summary.selected_ids = batch.slice(0, 20).map((c) => c.id);
    notes.push("dry_run: nenhum webhook foi chamado e nada foi gravado");
    summary.note = notes.join(" | ");
    return summary;
  }

  const lates: number[] = [];
  const pending = [...batch];
  let active = 0;
  const fast = new Map<string, number>(); // chamadas ainda "rápidas" por conexão
  const total = new Map<string, number>(); // todas as chamadas em andamento por conexão
  let budgetHit = false;

  const processOne = async (c: ResumeCandidate): Promise<void> => {
    const waitKey = waitKeyOf(c);
    const expected = { flow_id: c.current_flow_id ?? "", block_id: c.current_block_id ?? "", wait_key: waitKey };

    // 1) RESERVA de despacho (lock otimista): ciclos sobrepostos/outras instâncias não repetem a chamada.
    let prior: ResumeState | null = null;
    try {
      const latest = await deps.readLatest(c.id);
      if (!latest) return;
      prior = readResumeState(latest.metadata, waitKey);
      if (prior?.dispatch_until && Date.parse(prior.dispatch_until) > deps.now()) {
        summary.skipped.dispatched = (summary.skipped.dispatched ?? 0) + 1;
        return;
      }
      const md = { ...(latest.metadata ?? {}) } as Record<string, unknown>;
      md.resume = { ...(prior ?? { attempts: 0 }), wait_key: waitKey, dispatch_until: new Date(deps.now() + cfg.dispatchLeaseMs).toISOString() };
      const ok = await deps.writeState(c.id, md, latest.updated_at);
      if (!ok) { summary.skipped.dispatched = (summary.skipped.dispatched ?? 0) + 1; return; }
    } catch (_e) {
      deps.log("resume_dispatch_error", { conversation_id: c.id });
      return;
    }

    // 2) atraso entre o vencimento e o INÍCIO efetivo da retomada
    const startMs = deps.now();
    const late = Math.max(0, startMs - Date.parse(c.bot_locked_until));
    lates.push(late);
    summary.started++;
    if (late > cfg.lateAlertMs) {
      summary.late_alerts++;
      deps.log("resume_late", { conversation_id: c.id, late_minutes: Math.round(late / 60000) });
    }

    // 3) chamada (com prazo; o webhook devolve estado final: claim/lease protegem contra repetição)
    let res: { status: number | null; body: unknown; timedOut?: boolean };
    try {
      res = await deps.callResume(c, expected);
    } catch (_e) {
      res = { status: null, body: null };
    }
    const { outcome, reason } = classifyResponse(res.status, res.body, res.timedOut === true);
    summary.outcomes[outcome]++;
    if (reason === "call_timeout") summary.call_timeouts++;
    const next = nextState(prior, outcome, reason, deps.now(), cfg, waitKey);
    if (outcome === "failed") {
      summary.failures.push({ id: c.id, reason, attempts: next?.attempts ?? 0, quarantined: !!next?.quarantined });
      deps.log("resume_failed", { conversation_id: c.id, reason, attempts: next?.attempts, quarantined: !!next?.quarantined });
    }

    // 4) grava o resultado (e libera a reserva); conflito de gravação só deixa a reserva expirar sozinha
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
  };

  await new Promise<void>((resolve) => {
    const pump = () => {
      while (active < cfg.concurrency) {
        if (!budgetHit && deps.now() - nowMs > cfg.timeBudgetMs) {
          budgetHit = true;
          notes.push("time_budget_exhausted: o restante fica para o próximo ciclo");
          pending.length = 0;
        }
        const idx = pending.findIndex((c) => (fast.get(chipOf(c)) ?? 0) < cfg.perChipInFlight && (total.get(chipOf(c)) ?? 0) < cfg.perChipHard);
        if (idx < 0) break;
        const [c] = pending.splice(idx, 1);
        const k = chipOf(c);
        active++;
        summary.in_flight_peak = Math.max(summary.in_flight_peak, active);
        fast.set(k, (fast.get(k) ?? 0) + 1);
        total.set(k, (total.get(k) ?? 0) + 1);
        let slow = false;
        let finished = false;
        // uma chamada que passa de slowAfterMs deixa de segurar a cota de rapidez da conexão
        deps.after(cfg.slowAfterMs, () => {
          if (finished || slow) return;
          slow = true;
          fast.set(k, (fast.get(k) ?? 1) - 1);
          pump();
        });
        processOne(c).catch(() => {}).finally(() => {
          finished = true;
          active--;
          total.set(k, (total.get(k) ?? 1) - 1);
          if (!slow) fast.set(k, (fast.get(k) ?? 1) - 1);
          pump();
        });
      }
      if (active === 0 && pending.length === 0) resolve();
    };
    pump();
  });

  lates.sort((a, b) => a - b);
  summary.late_ms = { n: lates.length, p50: percentile(lates, 50), p95: percentile(lates, 95), max: lates.length ? lates[lates.length - 1] : 0 };
  summary.duration_ms = deps.now() - nowMs;
  if (notes.length) summary.note = notes.join(" | ");
  return summary;
}
