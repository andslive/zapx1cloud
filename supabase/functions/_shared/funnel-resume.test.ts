// deno test --allow-import funnel-resume.test.ts
//
// Lógica pura da fila de retomada, com RELÓGIO VIRTUAL e serviços simulados
// (banco em memória + webhook simulado com duração por chamada). Sem rede, sem tempo real.

import {
  chipOf,
  classifyResponse,
  isEligible,
  nextState,
  parseResumeConfig,
  pickBatch,
  readResumeState,
  type ResumeCandidate,
  type ResumeConfig,
  runResumeCycle,
  waitKeyOf,
} from "./funnel-resume.ts";
import { type Kind, type SimConv, World } from "./funnel-resume-sim.ts";
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.208.0/assert/mod.ts";

const T0 = Date.parse("2026-10-01T12:00:00Z");
const MIN = 60_000;
const SEC = 1000;
const env = (o: Record<string, string>) => (k: string) => o[k];
const cfgOf = (o: Record<string, string> = {}): ResumeConfig => parseResumeConfig(env(o));

let seq = 0;
function cand(over: Partial<ResumeCandidate> & { chip?: string; expiredMinAgo?: number; waitAt?: string }): ResumeCandidate {
  const id = over.id ?? `conv-${String(++seq).padStart(5, "0")}`;
  const lock = new Date(T0 - (over.expiredMinAgo ?? 10) * MIN).toISOString();
  return {
    id,
    connection_id: over.chip ?? "chip-A",
    evolution_instance_id: over.chip ?? "chip-A",
    bot_locked_until: over.bot_locked_until ?? lock,
    current_flow_id: "flow-1",
    current_block_id: over.current_block_id ?? "block-1",
    flow_variables: { __waiting_input: { question_sent_at: over.waitAt ?? new Date(T0 - 60 * MIN).toISOString() } },
    metadata: over.metadata ?? {},
    updated_at: new Date(T0).toISOString(),
  };
}

// ---------------- configuração ----------------

Deno.test("config: PADRÃO é o modo seguro (allowlist vazia); valores inválidos/legados caem no modo seguro", () => {
  const d = cfgOf();
  assertEquals(d.mode, "allowlist");
  assertEquals(d.allowlist.size, 0);
  assertEquals(d.dryRun, false);
  assertEquals(cfgOf({ FUNNEL_RESUME_MODE: "garbage" }).mode, "allowlist");
  assertEquals(cfgOf({ FUNNEL_RESUME_MODE: "all" }).mode, "all");
  // 'fresh' (corte por idade) foi REMOVIDO: abandonava para sempre qualquer timeout novo atrasado
  const f = cfgOf({ FUNNEL_RESUME_MODE: "fresh" });
  assertEquals(f.mode, "allowlist");
  assert(f.warning?.includes("fresh_removed"));
});

Deno.test("config: 'since' exige um instante de ativação válido; sem ele cai no modo seguro COM aviso", () => {
  const ok = cfgOf({ FUNNEL_RESUME_MODE: "since", FUNNEL_RESUME_NOT_BEFORE: "2026-10-02T15:00:00Z" });
  assertEquals(ok.mode, "since");
  assertEquals(ok.notBeforeMs, Date.parse("2026-10-02T15:00:00Z"));
  for (const bad of [undefined, "", "ontem", "2026-13-99"]) {
    const c = cfgOf({ FUNNEL_RESUME_MODE: "since", ...(bad === undefined ? {} : { FUNNEL_RESUME_NOT_BEFORE: bad }) });
    assertEquals(c.mode, "allowlist");
    assert(c.warning?.includes("since_requires_valid"));
  }
});

Deno.test("config: valores reais da implementação (padrões) e limites saturados", () => {
  const c = cfgOf();
  assertEquals([c.perChip, c.hardCap, c.concurrency, c.perChipInFlight, c.perChipHard], [8, 30, 6, 3, 8]);
  assertEquals([c.callTimeoutMs, c.dispatchLeaseMs, c.timeBudgetMs, c.slowAfterMs], [45_000, 120_000, 50_000, 10_000]);
  assertEquals([c.maxAttempts, c.backoffBaseMs, c.backoffMaxMs, c.lateAlertMs, c.maxLateMs], [5, 2 * MIN, 60 * MIN, 10 * MIN, 0]);
  const s = cfgOf({ FUNNEL_RESUME_ALLOWLIST: "abc-123456, ../etc; x , conv_00001\n\tok-654321", FUNNEL_RESUME_HARD_CAP: "99999", FUNNEL_RESUME_PER_CHIP: "-5", FUNNEL_RESUME_MAX_ATTEMPTS: "abc", FUNNEL_RESUME_CONCURRENCY: "500" });
  assertEquals([...s.allowlist].sort(), ["abc-123456", "conv_00001", "ok-654321"]);
  assertEquals([s.hardCap, s.perChip, s.maxAttempts, s.concurrency], [200, 1, 5, 20]);
});

// ---------------- espera específica / estado ----------------

Deno.test("waitKeyOf: muda com o bloco, o fluxo e o momento da pergunta (timeout antigo não vale para outra espera)", () => {
  const base = cand({ id: "c1" });
  const k = waitKeyOf(base);
  assert(k !== waitKeyOf({ ...base, current_block_id: "block-2" }));
  assert(k !== waitKeyOf({ ...base, current_flow_id: "flow-2" }));
  assert(k !== waitKeyOf(cand({ id: "c1", waitAt: new Date(T0).toISOString() })));
  assertEquals(k, waitKeyOf(structuredClone(base)));
});

Deno.test("estado de tentativas só vale para a MESMA espera; espera nova zera", () => {
  const c = cand({});
  const st = nextState(null, "failed", "x", T0, cfgOf(), waitKeyOf(c))!;
  assertEquals(readResumeState({ resume: st }, waitKeyOf(c))?.attempts, 1);
  assertEquals(readResumeState({ resume: st }, waitKeyOf({ ...c, current_block_id: "outro" })), null);
});

Deno.test("classifyResponse: respostas reais do webhook; timeout de chamada e o desconhecido são FALHA", () => {
  const cases: [number | null, unknown, string][] = [
    [200, { ok: true, funnel: true }, "advanced"],
    [200, { ok: true, skipped: "conversation_lease_held_by_other_owner" }, "busy"],
    [200, { ok: true, skipped: "wait_already_claimed" }, "busy"],
    [200, { ok: true, skipped: "inbound_in_flight" }, "busy"],
    [200, { ok: true, skipped: "ghost_cleanup_invalid_resume_state" }, "released"],
    [200, { ok: true, skipped: "recent_message_detected" }, "released"],
    [200, { ok: true, skipped: "stale_resume" }, "released"],
    [200, { ok: true, skipped: "timeout_no_path_released" }, "released"],
    [200, { ok: true, error: "timeout_no_path" }, "failed"],
    [200, { ok: true, skipped: "algo_novo" }, "failed"],
    [200, { ok: true }, "failed"],
    [401, { ok: false }, "failed"],
    [500, {}, "failed"],
    [null, null, "failed"],
  ];
  for (const [s, b, want] of cases) assertEquals(classifyResponse(s, b).outcome, want, `${s} ${JSON.stringify(b)}`);
  assertEquals(classifyResponse(null, null, true), { outcome: "failed", reason: "call_timeout" });
});

Deno.test("nextState: backoff exponencial limitado, quarentena na última tentativa; busy não conta e libera a reserva", () => {
  const cfg = cfgOf();
  const k = "k";
  let st = nextState(null, "failed", "e", T0, cfg, k)!;
  assertEquals(st.attempts, 1);
  assertEquals(Date.parse(st.next_attempt_at!) - T0, 2 * MIN);
  st = nextState(st, "failed", "e", T0, cfg, k)!;
  assertEquals(Date.parse(st.next_attempt_at!) - T0, 4 * MIN);
  const busy = nextState({ ...st, dispatch_until: new Date(T0 + MIN).toISOString() }, "busy", "b", T0, cfg, k)!;
  assertEquals(busy.attempts, 2);
  assertEquals(busy.dispatch_until, null);
  for (let i = 0; i < 3; i++) st = nextState(st, "failed", "e", T0, cfg, k)!;
  assert(st.quarantined && st.next_attempt_at === null && st.attempts === 5);
  assertEquals(nextState(st, "released", "r", T0, cfg, k), null);
  assertEquals(nextState(st, "advanced", "a", T0, cfg, k), null);
});

// ---------------- elegibilidade: passivo × atraso novo ----------------

Deno.test("isEligible: allowlist, quarentena, backoff e reserva de despacho", () => {
  const c = cand({ id: "c-allowed", expiredMinAgo: 120 });
  assertEquals(isEligible(c, cfgOf(), T0), { ok: false, reason: "not_allowlisted" });
  assertEquals(isEligible(c, cfgOf({ FUNNEL_RESUME_ALLOWLIST: "c-allowed" }), T0), { ok: true });
  const all = cfgOf({ FUNNEL_RESUME_MODE: "all" });
  assertEquals(isEligible(cand({ bot_locked_until: new Date(T0 + MIN).toISOString() }), all, T0), { ok: false, reason: "not_expired" });
  const q = cand({}); q.metadata = { resume: { attempts: 5, quarantined: true, next_attempt_at: null, wait_key: waitKeyOf(q) } };
  assertEquals(isEligible(q, all, T0), { ok: false, reason: "quarantined" });
  const b = cand({}); b.metadata = { resume: { attempts: 1, next_attempt_at: new Date(T0 + MIN).toISOString(), wait_key: waitKeyOf(b) } };
  assertEquals(isEligible(b, all, T0), { ok: false, reason: "backoff" });
  assertEquals(isEligible(b, all, T0 + 2 * MIN), { ok: true });
  const d = cand({}); d.metadata = { resume: { attempts: 0, dispatch_until: new Date(T0 + MIN).toISOString(), wait_key: waitKeyOf(d) } };
  assertEquals(isEligible(d, all, T0), { ok: false, reason: "dispatched" });
  assertEquals(isEligible(d, all, T0 + 2 * MIN), { ok: true });
});

Deno.test("PASSIVO × ATRASO NOVO: since separa pelo instante da ativação, NUNCA pela idade do atraso", () => {
  const act = T0; // ativação
  const cfg = cfgOf({ FUNNEL_RESUME_MODE: "since", FUNNEL_RESUME_NOT_BEFORE: new Date(act).toISOString() });
  // vencida ANTES da ativação (passivo), por mais recente que seja
  assertEquals(isEligible(cand({ bot_locked_until: new Date(act - 1 * SEC).toISOString() }), cfg, act + 5 * MIN), { ok: false, reason: "legacy_backlog" });
  assertEquals(isEligible(cand({ bot_locked_until: new Date(act - 40 * 60 * MIN).toISOString() }), cfg, act + 5 * MIN), { ok: false, reason: "legacy_backlog" });
  // vencida DEPOIS da ativação: elegível mesmo com atraso enorme (10 min, 3 h, 2 dias): nunca "some" da fila
  for (const lateMin of [0, 9, 11, 180, 2880]) {
    const c = cand({ bot_locked_until: new Date(act + 1 * MIN).toISOString() });
    assertEquals(isEligible(c, cfg, act + 1 * MIN + lateMin * MIN), { ok: true }, `atraso de ${lateMin} min não pode excluir`);
  }
});

Deno.test("esperas LONGAS não são afetadas pelo modo since (o corte é no VENCIMENTO, não na duração da espera)", () => {
  const act = T0;
  const cfg = cfgOf({ FUNNEL_RESUME_MODE: "since", FUNNEL_RESUME_NOT_BEFORE: new Date(act).toISOString() });
  // espera de 3 horas iniciada ANTES da ativação, que vence DEPOIS dela: é timeout novo, não passivo
  const longWait = cand({ bot_locked_until: new Date(act + 90 * MIN).toISOString(), waitAt: new Date(act - 90 * MIN).toISOString() });
  assertEquals(isEligible(longWait, cfg, act + 90 * MIN + 1), { ok: true });
});

Deno.test("corte de atraso é OPT-IN e explícito: sem FUNNEL_RESUME_MAX_LATE_MINUTES nada é descartado; com ele vira too_late contado", () => {
  const act = T0;
  const base = { FUNNEL_RESUME_MODE: "since", FUNNEL_RESUME_NOT_BEFORE: new Date(act).toISOString() };
  const c = cand({ bot_locked_until: new Date(act + MIN).toISOString() });
  assertEquals(isEligible(c, cfgOf(base), act + 24 * 60 * MIN), { ok: true });
  assertEquals(isEligible(c, cfgOf({ ...base, FUNNEL_RESUME_MAX_LATE_MINUTES: "60" }), act + 24 * 60 * MIN), { ok: false, reason: "too_late" });
  const { skipped } = pickBatch([c], cfgOf({ ...base, FUNNEL_RESUME_MAX_LATE_MINUTES: "60" }), act + 24 * 60 * MIN);
  assertEquals(skipped.too_late, 1);
});

Deno.test("pickBatch: round-robin entre conexões, cota por conexão, teto global; elegibilidade ANTES do limite", () => {
  const cfg = cfgOf({ FUNNEL_RESUME_MODE: "all", FUNNEL_RESUME_HARD_CAP: "7", FUNNEL_RESUME_PER_CHIP: "2" });
  const cands: ResumeCandidate[] = [];
  for (const chip of ["A", "B", "C", "D"]) for (let i = 0; i < 5; i++) cands.push(cand({ chip, expiredMinAgo: 500 - i }));
  const { batch } = pickBatch(cands, cfg, T0);
  assertEquals(batch.length, 7);
  const perChip = new Map<string, number>();
  for (const b of batch) perChip.set(chipOf(b), (perChip.get(chipOf(b)) ?? 0) + 1);
  assert([...perChip.values()].every((n) => n <= 2));
  assertEquals(perChip.size, 4);
});

// Réplica da seleção ANTIGA (publicada): janela global das 60 mais antigas e SÓ DEPOIS 2 por conexão.
function legacySelect(convs: ResumeCandidate[], nowMs: number): ResumeCandidate[] {
  const window = convs.filter((c) => Date.parse(c.bot_locked_until) <= nowMs)
    .sort((a, b) => a.bot_locked_until.localeCompare(b.bot_locked_until)).slice(0, 60);
  const perChip: Record<string, ResumeCandidate[]> = {};
  for (const c of window) { const k = chipOf(c); (perChip[k] ??= []); if (perChip[k].length < 2) perChip[k].push(c); }
  return Object.values(perChip).flat().slice(0, 20);
}

function incident(world?: World, kindPoison: Kind = "poison"): ResumeCandidate[] {
  const out: ResumeCandidate[] = [];
  const mk = (id: string, chip: string, minAgo: number, kind: Kind) => {
    if (world) world.add({ id, chip, kind, durMs: 8 * SEC, dueAt: T0 - minAgo * MIN } as never);
    const c = cand({ id, chip, expiredMinAgo: minAgo });
    (c as ResumeCandidate & { kind?: Kind }).kind = kind;
    out.push(c);
  };
  for (let i = 0; i < 24; i++) mk(`poison-${String(i).padStart(3, "0")}`, i % 2 ? "CHIP663" : "chip67", 1700 - i, kindPoison);
  for (let i = 0; i < 36; i++) mk(`stuck-${String(i).padStart(3, "0")}`, i % 2 ? "CHIP663" : "chip67", 1000 - i, "normal");
  const chips = ["canall32", "chip19", "chip50", "canal21", "chip16", "chip52", "chip12", "canal46", "chip17new", "chipZ"];
  for (let i = 0; i < 901; i++) mk(`other-${String(i).padStart(4, "0")}`, chips[i % chips.length], 800 - (i % 700), "normal");
  return out;
}

Deno.test("CARACTERIZAÇÃO do defeito: a seleção ANTIGA, nos mesmos dados do incidente, atende só 2 conexões e 4 conversas (todas problemáticas)", () => {
  const data = incident();
  const picked = legacySelect(data, T0);
  assertEquals(picked.length, 4);
  assertEquals(new Set(picked.map((c) => chipOf(c))).size, 2);
  assert(picked.every((c) => (c as ResumeCandidate & { kind?: Kind }).kind === "poison"));
  const novo = pickBatch(data, cfgOf({ FUNNEL_RESUME_MODE: "all" }), T0).batch;
  assert(new Set(novo.map((c) => chipOf(c))).size >= 10);
});

// ---------------- ciclo: modo seguro, passivo, allowlist ----------------

function world(cfgEnv: Record<string, string>, webhookPoison: "old" | "new" = "new") {
  const cfg = cfgOf(cfgEnv);
  return new World(cfg, { start: T0, webhookPoison });
}

Deno.test("PASSIVO PRESERVADO: modo padrão (allowlist vazia) não faz NENHUMA chamada nem leitura — 961 conversas intactas", async () => {
  const w = world({});
  incident(w);
  let fetched = 0;
  const d = w.deps();
  const orig = d.fetchPage;
  d.fetchPage = (a) => { fetched++; return orig(a); };
  const s = await runResumeCycle(d, w.cfg);
  assertEquals(w.webhookCalls, 0);
  assertEquals(fetched, 0);
  assertEquals(s.selected, 0);
  assert(s.note?.includes("allowlist_empty"));
  assert([...w.store.values()].every((c) => !c.done && !(c.metadata as Record<string, unknown>).resume));
});

Deno.test("ATIVAÇÃO CONTROLADA: allowlist com UMA conversa processa só ela; as 960 restantes ficam intocadas", async () => {
  const probe = world({});
  incident(probe);
  const target = "other-0003";
  const w = world({ FUNNEL_RESUME_MODE: "allowlist", FUNNEL_RESUME_ALLOWLIST: target });
  incident(w);
  const run = w.clock.runUntil(T0 + 10 * MIN, () => w.cycles.length === 1);
  void w.startCycle();
  await run;
  assertEquals([...w.store.values()].filter((c) => c.invocations > 0).map((c) => c.id), [target]);
});

Deno.test("modo since: o PASSIVO nem é lido (e é contado à parte); timeouts NOVOS são processados mesmo muito atrasados", async () => {
  const act = T0;
  const w = world({ FUNNEL_RESUME_MODE: "since", FUNNEL_RESUME_NOT_BEFORE: new Date(act).toISOString() });
  incident(w); // 961 vencidas ANTES de T0
  // três timeouts NOVOS: um normal, um com 3 h de atraso e um com 2 dias de atraso (a fila ficou parada)
  w.clock.now = act + 3 * 24 * 60 * MIN;
  w.add({ id: "new-ontime", chip: "chip19", kind: "normal", durMs: 8 * SEC, dueAt: act + 3 * 24 * 60 * MIN - 1 * MIN } as never);
  w.add({ id: "new-late-3h", chip: "chip16", kind: "normal", durMs: 8 * SEC, dueAt: act + 3 * 24 * 60 * MIN - 180 * MIN } as never);
  w.add({ id: "new-late-2d", chip: "chip52", kind: "normal", durMs: 8 * SEC, dueAt: act + 1 * 60 * MIN } as never);
  const run = w.clock.runUntil(w.clock.now + 30 * MIN, () => w.cycles.length === 1);
  void w.startCycle();
  await run;
  const s = w.cycles[0];
  assertEquals([...w.store.values()].filter((c) => c.invocations > 0).map((c) => c.id).sort(), ["new-late-2d", "new-late-3h", "new-ontime"]);
  assertEquals(s.legacy_backlog, 961); // contado à parte, fora da fila por definição
  assertEquals(s.late_alerts, 2); // os dois atrasados foram sinalizados, não descartados
  assert(s.late_ms.max >= 2 * 24 * 60 * MIN - 1 * 60 * MIN);
  assert([...w.store.values()].filter((c) => c.id.startsWith("poison") || c.id.startsWith("stuck") || c.id.startsWith("other")).every((c) => c.invocations === 0));
});

Deno.test("dry_run: lista a seleção, não chama o webhook e não grava nada", async () => {
  const w = world({ FUNNEL_RESUME_MODE: "all", FUNNEL_RESUME_DRY_RUN: "true" });
  incident(w);
  const run = w.clock.runUntil(T0 + 5 * MIN, () => w.cycles.length === 1);
  void w.startCycle();
  await run;
  assertEquals(w.webhookCalls, 0);
  assertEquals(w.cycles[0].selected, 30);
  assertEquals(w.cycles[0].selected_ids?.length, 20);
  assert([...w.store.values()].every((c) => !c.done && !(c.metadata as Record<string, unknown>).resume));
});

// ---------------- independência (relógio virtual) ----------------

async function runCycles(w: World, minutes: number, every = 60_000) {
  w.scheduleEveryMinute(w.clock.now, w.clock.now + minutes * MIN, every);
  await w.clock.runUntil(w.clock.now + minutes * MIN + 10 * MIN);
}

Deno.test("INDEPENDÊNCIA: chamada LENTA e chamada TRAVADA no mesmo chip não bloqueiam as demais", async () => {
  const w = world({ FUNNEL_RESUME_MODE: "all" });
  w.add({ id: "hung-001", chip: "A", kind: "hung", durMs: Infinity, dueAt: T0 - 30 * MIN } as never);
  w.add({ id: "slow-001", chip: "A", kind: "slow", durMs: 300 * SEC, dueAt: T0 - 29 * MIN } as never);
  for (let i = 0; i < 8; i++) w.add({ id: `ok-${i}`, chip: "A", kind: "normal", durMs: 8 * SEC, dueAt: T0 - (20 - i) * MIN } as never);
  await runCycles(w, 6);
  const ok = [...w.store.values()].filter((c) => c.id.startsWith("ok-"));
  assert(ok.every((c) => c.done), "as normais do MESMO chip terminaram");
  // nenhuma normal esperou pela travada/lenta: as primeiras começam logo que a lenta libera a cota de rapidez
  // (slowAfter = 10 s; antes da correção só começavam quando o prazo da chamada travada vencia, aos 45 s)
  const starts = ok.map((c) => (c.startedAt! - T0) / 1000).sort((a, b) => a - b);
  assert(starts[0] <= 12 && starts[3] <= 20, `primeiras normais começaram em: ${starts}`);
  // a cota por conexão por ciclo (6) já foi gasta (travada + lenta + 4 normais): o restante entra no PRÓXIMO ciclo (≤ 70 s), sem esperar nenhuma travada
  assert(starts[starts.length - 1] <= 70, `últimas normais começaram em: ${starts}`);
  assert(w.cycles.some((s) => s.failures.some((f) => f.reason === "call_timeout")), "o prazo por chamada foi acionado e diagnosticado");
});

Deno.test("INDEPENDÊNCIA: nunca excede a concorrência global nem a por conexão", async () => {
  const w = world({ FUNNEL_RESUME_MODE: "all", FUNNEL_RESUME_CONCURRENCY: "6", FUNNEL_RESUME_PER_CHIP_IN_FLIGHT: "2", FUNNEL_RESUME_PER_CHIP: "20", FUNNEL_RESUME_HARD_CAP: "100" });
  for (let i = 0; i < 80; i++) w.add({ id: `c-${i}`, chip: ["A", "B", "C"][i % 3], kind: "normal", durMs: 20 * SEC, dueAt: T0 - (100 - i) * MIN } as never);
  await runCycles(w, 10);
  // o limite de 6 vale POR CICLO; o orçamento de início (50 s) < intervalo do cron (60 s) limita a sobreposição a 2 ciclos
  assert(w.inFlightPeak <= 12, `pico simultâneo global ${w.inFlightPeak}`);
  for (const [chip, p] of w.chipInFlightPeak) assert(p <= 12, `pico simultâneo no chip ${chip}: ${p}`);
  assert([...w.store.values()].every((c) => c.done));
});

Deno.test("UM ciclo isolado respeita exatamente os limites: global (6) e por conexão (rápidas 3, total 8)", async () => {
  const w = world({ FUNNEL_RESUME_MODE: "all" });
  for (let i = 0; i < 60; i++) w.add({ id: `c-${i}`, chip: ["A", "B", "C"][i % 3], kind: "normal", durMs: 6 * SEC, dueAt: T0 - (100 - i) * MIN } as never);
  const run = runResumeCycle(w.deps(), w.cfg);
  await w.clock.runUntil(T0 + 5 * MIN);
  const s = await run;
  assertEquals(s.in_flight_peak, 6);
  for (const [chip, p] of w.chipInFlightPeak) assert(p <= 3, `chip ${chip}: ${p} rápidas simultâneas`); // 6 s < slowAfter (10 s): todas "rápidas"
  assertEquals(s.started, 24); // 8 por conexão (perChip) x 3 conexões, dentro do orçamento de 50 s
});

Deno.test("CICLOS SOBREPOSTOS e várias instâncias: cada espera é despachada UMA vez (reserva de despacho)", async () => {
  const w = world({ FUNNEL_RESUME_MODE: "all" });
  for (let i = 0; i < 12; i++) w.add({ id: `c-${i}`, chip: ["A", "B", "C", "D"][i % 4], kind: "normal", durMs: 40 * SEC, dueAt: T0 - (30 - i) * MIN } as never);
  // 3 "instâncias" começando no MESMO instante e mais ciclos sobrepostos a cada 10 s
  for (let k = 0; k < 3; k++) void w.startCycle();
  for (let t = 10; t <= 50; t += 10) w.clock.after(t * SEC, () => { void w.startCycle(); void w.startCycle(); });
  await w.clock.runUntil(T0 + 10 * MIN);
  assert([...w.store.values()].every((c) => c.done), "todas avançaram");
  assertEquals([...w.store.values()].map((c) => c.invocations), Array(12).fill(1)); // exatamente 1 chamada por espera
  assertEquals(w.duplicateWhileBusy, 0);
});

Deno.test("sem a reserva, o servidor ainda protege (reivindicação): prova de que a reserva só evita chamadas redundantes", async () => {
  const w = world({ FUNNEL_RESUME_MODE: "all" });
  w.add({ id: "c-0", chip: "A", kind: "normal", durMs: 40 * SEC, dueAt: T0 - 5 * MIN } as never);
  const d = w.deps();
  d.writeState = () => Promise.resolve(true); // desliga a reserva (não grava nada)
  d.readLatest = () => Promise.resolve({ metadata: {}, updated_at: "x" });
  const r1 = runResumeCycle(d, w.cfg), r2 = runResumeCycle(d, w.cfg);
  await w.clock.runUntil(T0 + 5 * MIN);
  await Promise.all([r1, r2]);
  assertEquals(w.store.get("c-0")!.invocations, 2); // as duas chamaram...
  assertEquals(w.duplicateWhileBusy, 1); // ...mas a 2ª foi recusada pelo servidor (wait_already_claimed)
  assert(w.store.get("c-0")!.done);
});

Deno.test("falha repetida (webhook publicado) é limitada, diagnosticada e NÃO trava as demais do mesmo chip", async () => {
  const w = world({ FUNNEL_RESUME_MODE: "all", FUNNEL_RESUME_MAX_ATTEMPTS: "3", FUNNEL_RESUME_BACKOFF_BASE_MINUTES: "1" }, "old");
  w.add({ id: "bad-001", chip: "A", kind: "poison", durMs: 1, dueAt: T0 - 900 * MIN } as never);
  for (let i = 0; i < 6; i++) w.add({ id: `good-${i}`, chip: "A", kind: "normal", durMs: 8 * SEC, dueAt: T0 - (800 - i) * MIN } as never);
  await runCycles(w, 20);
  assert([...w.store.values()].filter((c) => c.id.startsWith("good")).every((c) => c.done));
  const bad = w.store.get("bad-001")!;
  assertFalse(bad.done);
  assertEquals(bad.invocations, 3); // limitada: exatamente maxAttempts
  const st = readResumeState(bad.metadata, waitKeyOf(bad))!;
  assert(st.quarantined && st.attempts === 3 && st.last_error === "error:timeout_no_path");
});

Deno.test("INCIDENTE (modo all, webhook publicado): quarentena limita as problemáticas e TODAS as normais acabam atendidas", async () => {
  const w = world({ FUNNEL_RESUME_MODE: "all", FUNNEL_RESUME_BACKOFF_BASE_MINUTES: "1" }, "old");
  incident(w);
  await runCycles(w, 120);
  const poison = [...w.store.values()].filter((c) => c.kind === "poison");
  assert(poison.every((p) => p.invocations <= 5 && readResumeState(p.metadata, waitKeyOf(p))?.quarantined));
  const normal = [...w.store.values()].filter((c) => c.kind === "normal");
  assertEquals(normal.filter((c) => c.done).length, normal.length);
});

Deno.test("INCIDENTE com o webhook CORRIGIDO: a problemática é liberada na 1ª tentativa, sem quarentena", async () => {
  const w = world({ FUNNEL_RESUME_MODE: "all" }, "new");
  incident(w);
  await runCycles(w, 90);
  const poison = [...w.store.values()].filter((c) => c.kind === "poison");
  assert(poison.every((p) => p.done && p.invocations === 1 && !(p.metadata as Record<string, unknown>).resume));
});

Deno.test("timeout ANTIGO não age sobre OUTRA espera: a chave esperada não bate => stale_resume, nada é marcado", async () => {
  const w = world({ FUNNEL_RESUME_MODE: "all" });
  w.add({ id: "conv-stale-1", chip: "A", kind: "normal", durMs: 8 * SEC, dueAt: T0 - 60 * MIN } as never);
  const d = w.deps();
  const orig = d.callResume;
  d.callResume = (c, e) => { w.store.get(c.id)!.current_block_id = "block-DEPOIS"; return orig(c, e); }; // a conversa seguiu
  const run = runResumeCycle(d, w.cfg);
  await w.clock.runUntil(T0 + 5 * MIN);
  const s = await run;
  assertEquals(s.outcomes.released, 1);
  assertFalse(w.store.get("conv-stale-1")!.done);
});

Deno.test("orçamento de tempo: não inicia novas retomadas depois do limite; o restante fica para o próximo ciclo", async () => {
  const w = world({ FUNNEL_RESUME_MODE: "all", FUNNEL_RESUME_TIME_BUDGET_SECONDS: "5", FUNNEL_RESUME_CONCURRENCY: "1", FUNNEL_RESUME_PER_CHIP_IN_FLIGHT: "1", FUNNEL_RESUME_PER_CHIP: "20" });
  for (let i = 0; i < 10; i++) w.add({ id: `c-${i}`, chip: "A", kind: "normal", durMs: 2 * SEC, dueAt: T0 - (900 - i) * MIN } as never);
  const run = runResumeCycle(w.deps(), w.cfg);
  await w.clock.runUntil(T0 + 5 * MIN);
  const s = await run;
  assert(s.started < 10 && s.started >= 2, `iniciadas: ${s.started}`);
  assert(s.note?.includes("time_budget_exhausted"));
  const r2 = runResumeCycle(w.deps(), w.cfg);
  await w.clock.runUntil(T0 + 10 * MIN);
  await r2;
  assert([...w.store.values()].filter((c) => c.done).length > s.started);
});

Deno.test("paginação: varre mais de uma página e respeita o teto de páginas (avisando scan_truncated)", async () => {
  const w = world({ FUNNEL_RESUME_MODE: "all", FUNNEL_RESUME_PAGE_SIZE: "10", FUNNEL_RESUME_MAX_PAGES: "3", FUNNEL_RESUME_DRY_RUN: "true" });
  for (let i = 0; i < 100; i++) w.add({ id: `conv-pg-${String(i).padStart(3, "0")}`, chip: `chip${i % 25}`, kind: "normal", durMs: 5 * SEC, dueAt: T0 - (900 - i) * MIN } as never);
  const run = runResumeCycle(w.deps(), w.cfg);
  await w.clock.runUntil(T0 + MIN);
  const s = await run;
  assertEquals(s.scanned, 30);
  assertEquals(s.scan_truncated, true);
});
