// deno test --allow-import funnel-resume.load.test.ts
//
// TESTE DE CARGA LOCAL, com RELÓGIO VIRTUAL e serviços simulados.
//
// IMPORTANTE: isto é SIMULAÇÃO. Os resultados dependem das premissas abaixo e NÃO
// são garantia de desempenho em produção. As premissas foram calibradas com dados
// reais medidos em 2026-10-02 (consultas de leitura):
//
//  Demanda servida (retomadas efetivas, 25/09 a 30/09 13:00 UTC, período saudável):
//    média 94/h (1,6/min) · pico horário 245/h (4,1/min) · pico por minuto 9 ·
//    pico em 5 min 34 · nunca ≥ 10 por minuto.
//  Duração de uma retomada (proxy: rajadas de bot sem mensagem recente do lead, 4.568):
//    span médio 9,9 s · 49% das rajadas têm 2+ mensagens · 4,9% > 60 s · 1,7% > 120 s ·
//    0,07% > 300 s · máximo 380 s. Premissa de base (1ª mensagem espera o delay de 5 s do
//    bloco + envio): 7 s ANTES do span.
//  Vencimentos naturais não suavizados (passivo desde 30/09 22:41): pico 5/min, no máx.
//    2/min na mesma conexão.
//
// As cargas abaixo usam o volume observado e margens de crescimento (x3), concentração em
// uma conexão, conversas problemáticas, chamadas lentas e uma parada do serviço.

import { type ResumeConfig, parseResumeConfig } from "./funnel-resume.ts";
import { rng, stats, World } from "./funnel-resume-sim.ts";
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

const T0 = Date.parse("2026-10-02T12:00:00Z");
const MIN = 60_000;
const SEC = 1000;
const HOUR = 60 * MIN;

const cfgOf = (o: Record<string, string> = {}): ResumeConfig => parseResumeConfig((k) => ({ FUNNEL_RESUME_MODE: "all", ...o })[k]);

/** duração de uma retomada (ms): base 7 s + span calibrado nos dados reais */
function callDuration(r: () => number): number {
  const u = r();
  const span = u < 0.601 ? 0
    : u < 0.911 ? 2 + r() * 8
    : u < 0.951 ? 10 + r() * 50
    : u < 0.983 ? 60 + r() * 60
    : u < 0.9993 ? 120 + r() * 180
    : 300 + r() * 100;
  return 7 * SEC + span * SEC;
}

function poisson(lambda: number, r: () => number): number {
  const L = Math.exp(-lambda); let k = 0, p = 1;
  do { k++; p *= r(); } while (p > L);
  return k - 1;
}

// 12 conexões com distribuição desigual (a maior concentra ~28% da demanda)
const CHIPS = ["c01", "c02", "c03", "c04", "c05", "c06", "c07", "c08", "c09", "c10", "c11", "c12"];
const CHIP_W = [28, 18, 12, 9, 8, 6, 5, 4, 3, 3, 2, 2];
function pickChip(r: () => number): string {
  let u = r() * CHIP_W.reduce((a, b) => a + b, 0);
  for (let i = 0; i < CHIPS.length; i++) { u -= CHIP_W[i]; if (u <= 0) return CHIPS[i]; }
  return CHIPS[0];
}

interface Scenario {
  name: string;
  seed: number;
  hours: number;
  /** retomadas por minuto, por hora simulada */
  rate: number[];
  /** [minuto, quantidade] injetados no mesmo minuto (rajadas) */
  bursts?: { atMin: number; n: number; chip?: string }[];
  poison?: number;
  hung?: number;
  slowExtra?: number;
  webhookPoison?: "old" | "new";
  /** serviço parado: [de, até) em minutos */
  outage?: [number, number];
  legacy?: number;
  env?: Record<string, string>;
  durationScale?: number;
}

interface Report {
  name: string; total: number; done: number; neverStarted: number; poisonOpen: number;
  startDelay: ReturnType<typeof stats>; e2e: ReturnType<typeof stats>; maxQueue: number; drainMin: number;
  cycles: number; cycleDurMax: number; overlapMax: number; inFlightPeak: number; chipPeak: number; callTimeouts: number; realFailures: number;
  worstChip: { chip: string; maxDelayS: number }; legacyTouched: number;
}

async function simulate(sc: Scenario): Promise<Report> {
  const cfg = cfgOf(sc.env);
  const w = new World(cfg, { start: T0, webhookPoison: sc.webhookPoison ?? "new" });
  const r = rng(sc.seed);
  let n = 0;
  const mk = (chip: string, dueAt: number, kind: "normal" | "poison" | "hung" | "slow" = "normal") => {
    let dur = callDuration(r) * (sc.durationScale ?? 1);
    if (kind === "slow") dur = 70 * SEC + r() * 200 * SEC;
    if (kind === "hung") dur = Infinity;
    w.add({ id: `n-${String(++n).padStart(6, "0")}`, chip, kind, durMs: dur, dueAt } as never);
  };
  const classify = (): "normal" | "poison" | "hung" | "slow" => {
    const u = r();
    if (u < (sc.poison ?? 0)) return "poison";
    if (u < (sc.poison ?? 0) + (sc.hung ?? 0)) return "hung";
    if (u < (sc.poison ?? 0) + (sc.hung ?? 0) + (sc.slowExtra ?? 0)) return "slow";
    return "normal";
  };
  for (let m = 0; m < sc.hours * 60; m++) {
    const lambda = sc.rate[Math.min(sc.rate.length - 1, Math.floor(m / 60))];
    const k = poisson(lambda, r);
    for (let i = 0; i < k; i++) mk(pickChip(r), T0 + m * MIN + r() * MIN, classify());
  }
  for (const b of sc.bursts ?? []) for (let i = 0; i < b.n; i++) mk(b.chip ?? pickChip(r), T0 + b.atMin * MIN + r() * MIN, classify());
  const total = n;
  // passivo legado (vencido ANTES da ativação, em modo since)
  const act = T0;
  for (let i = 0; i < (sc.legacy ?? 0); i++) w.add({ id: `legacy-${i}`, chip: pickChip(r), kind: "normal", durMs: 8 * SEC, dueAt: act - (60 + i) * MIN } as never);

  const end = T0 + sc.hours * HOUR;
  // pg_cron: um ciclo por minuto; "parada do serviço" suprime os ciclos do intervalo
  const outage = sc.outage;
  for (let t = T0; t < end + 90 * MIN; t += MIN) { // o pg_cron não para ao fim da janela de demanda
    const m = (t - T0) / MIN;
    if (outage && m >= outage[0] && m < outage[1]) continue;
    w.clock.after(t - w.clock.now, () => { void w.startCycle(); });
  }
  // amostra da fila (vencidas e ainda não iniciadas) a cada minuto
  let maxQueue = 0;
  for (let t = T0; t <= end + 60 * MIN; t += MIN) {
    w.clock.after(t - w.clock.now, () => {
      let q = 0;
      for (const c of w.store.values()) if (c.id.startsWith("n-") && !c.done && c.startedAt === undefined && c.dueAt <= w.clock.now) q++;
      maxQueue = Math.max(maxQueue, q);
    });
  }
  await w.clock.runUntil(end + 120 * MIN);

  const convs = [...w.store.values()].filter((c) => c.id.startsWith("n-"));
  const normals = convs.filter((c) => c.kind === "normal" || c.kind === "slow");
  const starts = convs.filter((c) => c.startedAt !== undefined && c.kind !== "poison").map((c) => c.startedAt! - c.dueAt);
  const e2e = convs.filter((c) => c.done && c.kind !== "poison").map((c) => c.doneAt! - c.dueAt);
  const perChip = new Map<string, number>();
  for (const c of convs) if (c.startedAt !== undefined) perChip.set(c.chip, Math.max(perChip.get(c.chip) ?? 0, c.startedAt - c.dueAt));
  const worst = [...perChip.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["-", 0];
  // quando a fila voltou a esvaziar depois do último vencimento
  const lastDone = Math.max(0, ...convs.filter((c) => c.done).map((c) => c.doneAt!));
  const lastDue = Math.max(0, ...convs.map((c) => c.dueAt));
  const durs = w.cycles.map((c) => c.duration_ms);
  // sobreposição máxima de ciclos: ciclos ainda ativos no instante de início de outro (aproximação por duração)
  const starts_t = w.cycles.map((_, i) => i);
  void starts_t;
  const overlapMax = Math.max(1, Math.ceil(Math.max(0, ...durs) / MIN));
  return {
    name: sc.name,
    total,
    done: normals.filter((c) => c.done).length,
    neverStarted: normals.filter((c) => c.startedAt === undefined).length,
    poisonOpen: convs.filter((c) => c.kind === "poison" && !c.done).length,
    startDelay: stats(starts),
    e2e: stats(e2e),
    maxQueue,
    drainMin: Math.max(0, (lastDone - lastDue) / MIN),
    cycles: w.cycles.length,
    cycleDurMax: Math.max(0, ...durs),
    overlapMax,
    inFlightPeak: w.inFlightPeak,
    chipPeak: Math.max(0, ...w.chipInFlightPeak.values()),
    callTimeouts: w.cycles.reduce((a, s) => a + s.call_timeouts, 0),
    realFailures: w.cycles.reduce((a, s) => a + s.failures.filter((f) => f.reason !== "call_timeout").length, 0),
    worstChip: { chip: worst[0] as string, maxDelayS: Math.round((worst[1] as number) / 1000) },
    legacyTouched: [...w.store.values()].filter((c) => c.id.startsWith("legacy-") && c.invocations > 0).length,
  };
}

const s_ = (ms: number) => `${(ms / 1000).toFixed(0)}s`;
function line(r: Report) {
  console.log(
    `[CARGA] ${r.name.padEnd(46)} n=${String(r.total).padStart(5)} feitas=${String(r.done).padStart(5)} sem-início=${r.neverStarted} | atraso até INÍCIO p50=${s_(r.startDelay.p50)} p95=${s_(r.startDelay.p95)} p99=${s_(r.startDelay.p99)} máx=${s_(r.startDelay.max)} | até CONCLUSÃO p50=${s_(r.e2e.p50)} p95=${s_(r.e2e.p95)} máx=${s_(r.e2e.max)} | fila máx=${r.maxQueue} esvazia em ${r.drainMin.toFixed(1)} min | ciclo máx=${s_(r.cycleDurMax)} simult. pico=${r.inFlightPeak} (conexão ${r.chipPeak}) | call_timeouts=${r.callTimeouts} falhas reais=${r.realFailures} pior conexão=${r.worstChip.chip}:${r.worstChip.maxDelayS}s`,
  );
}

// perfil horário observado: noite baixa, tarde alta (pico 4,1/min), média ≈ 1,9/min em 8 h
const OBSERVED = [0.4, 0.8, 1.6, 2.4, 3.2, 4.1, 2.8, 1.4];
const x = (k: number, a = OBSERVED) => a.map((v) => v * k);

Deno.test("CARGA 1 — volume OBSERVADO (média 1,9/min, pico horário 4,1/min, pico de 9 no mesmo minuto e 34 em 5 min)", async () => {
  const r = await simulate({
    name: "observado", seed: 1, hours: 8, rate: OBSERVED,
    bursts: [{ atMin: 5 * 60 + 10, n: 9 }, { atMin: 5 * 60 + 30, n: 34 / 5 + 0 }, { atMin: 5 * 60 + 31, n: 7 }, { atMin: 5 * 60 + 32, n: 7 }, { atMin: 5 * 60 + 33, n: 7 }, { atMin: 5 * 60 + 34, n: 7 }],
    poison: 0.03, hung: 0.005, slowExtra: 0.02, webhookPoison: "new",
  });
  line(r);
  assertEquals(r.neverStarted, 0);
  assertEquals(r.done + 0 >= r.total * 0.96, true); // as normais/lentas (as travadas e problemáticas ficam fora)
  assert(r.maxQueue < 40);
  assert(r.inFlightPeak <= 12);
});

Deno.test("CARGA 2 — margem de crescimento x3 (média 5,7/min, pico horário 12,3/min, pico de 27 no minuto e ~100 em 5 min)", async () => {
  const r = await simulate({
    name: "crescimento x3", seed: 2, hours: 8, rate: x(3),
    bursts: [{ atMin: 5 * 60 + 10, n: 27 }, { atMin: 5 * 60 + 30, n: 20 }, { atMin: 5 * 60 + 31, n: 20 }, { atMin: 5 * 60 + 32, n: 20 }, { atMin: 5 * 60 + 33, n: 20 }, { atMin: 5 * 60 + 34, n: 20 }],
    poison: 0.03, hung: 0.005, slowExtra: 0.02, webhookPoison: "new",
  });
  line(r);
  assertEquals(r.neverStarted, 0);
  assert(r.drainMin < 30, `a fila precisa drenar: ${r.drainMin} min`);
});

Deno.test("CARGA 3 — CONCENTRAÇÃO: 60 vencimentos na MESMA conexão em 2 minutos, sobre a carga observada", async () => {
  const r = await simulate({
    name: "60 vencimentos em 1 conexão / 2 min", seed: 3, hours: 6, rate: OBSERVED.slice(0, 6),
    bursts: [{ atMin: 4 * 60, n: 30, chip: "c07" }, { atMin: 4 * 60 + 1, n: 30, chip: "c07" }],
    poison: 0.03, webhookPoison: "new",
  });
  line(r);
  assertEquals(r.neverStarted, 0);
  assert(r.chipPeak <= 8);
});

Deno.test("CARGA 4 — PROBLEMÁTICAS e LENTAS: 5% sem saída (webhook publicado), 3% travadas, 8% muito lentas", async () => {
  const r = await simulate({
    name: "problemáticas + travadas + lentas (old)", seed: 4, hours: 8, rate: OBSERVED,
    poison: 0.05, hung: 0.03, slowExtra: 0.08, webhookPoison: "old",
  });
  line(r);
  assertEquals(r.neverStarted, 0);
  assert(r.startDelay.p95 < 5 * MIN, "as problemáticas não podem degradar o atendimento das demais");
});

Deno.test("CARGA 5 — PARADA do serviço de 20 min em pleno pico e recuperação (nada se perde, sem corte por idade)", async () => {
  const r = await simulate({
    name: "cron parado 20 min no pico", seed: 5, hours: 8, rate: OBSERVED,
    outage: [5 * 60 + 5, 5 * 60 + 25], poison: 0.03, webhookPoison: "new",
    env: { FUNNEL_RESUME_MODE: "since", FUNNEL_RESUME_NOT_BEFORE: new Date(T0).toISOString() },
  });
  line(r);
  assertEquals(r.neverStarted, 0);
  assert(r.drainMin < 25, `recuperação: ${r.drainMin} min`);
});

Deno.test("CARGA 6 — PASSIVO de 961 presente (since): não é lido nem tocado e não degrada a operação", async () => {
  const r = await simulate({
    name: "operação + passivo 961 (since)", seed: 6, hours: 8, rate: OBSERVED, legacy: 961,
    poison: 0.03, webhookPoison: "new",
    env: { FUNNEL_RESUME_MODE: "since", FUNNEL_RESUME_NOT_BEFORE: new Date(T0).toISOString() },
  });
  line(r);
  assertEquals(r.legacyTouched, 0);
  assertEquals(r.neverStarted, 0);
});

Deno.test("CARGA 7 — SENSIBILIDADE: chamadas 2x mais lentas (premissa de duração dobrada) com o volume observado e com x3", async () => {
  const a = await simulate({ name: "observado, chamadas 2x mais lentas", seed: 7, hours: 8, rate: OBSERVED, durationScale: 2, poison: 0.03, webhookPoison: "new" });
  const b = await simulate({ name: "x3, chamadas 2x mais lentas", seed: 8, hours: 8, rate: x(3), durationScale: 2, poison: 0.03, webhookPoison: "new" });
  line(a); line(b);
  assertEquals(a.neverStarted, 0);
  assertEquals(b.neverStarted, 0);
});

Deno.test("CARGA 8 — COMPARAÇÃO com a seleção ANTIGA em carga normal (sem problemáticas): a nova não é pior", async () => {
  const novo = await simulate({ name: "nova, observado, sem problemáticas", seed: 9, hours: 8, rate: OBSERVED, webhookPoison: "new" });
  // antiga: sequencial, 2 por conexão, 20 por ciclo, 120 ms entre chamadas, sem concorrência
  const antigo = await simulate({
    name: "ANTIGA (aprox.), observado, sem problemáticas", seed: 9, hours: 8, rate: OBSERVED, webhookPoison: "new",
    env: { FUNNEL_RESUME_CONCURRENCY: "1", FUNNEL_RESUME_PER_CHIP: "2", FUNNEL_RESUME_PER_CHIP_IN_FLIGHT: "1", FUNNEL_RESUME_PER_CHIP_HARD: "1", FUNNEL_RESUME_HARD_CAP: "20", FUNNEL_RESUME_TIME_BUDGET_SECONDS: "100" },
  });
  line(novo); line(antigo);
  assert(novo.startDelay.p95 <= antigo.startDelay.p95 + 1000);
});

Deno.test("CARGA 9 — VARREDURA da cota por conexão (concentração de 60 em 2 min e crescimento x3): custo x benefício dos limites", async () => {
  const grid: [string, Record<string, string>][] = [
    ["perChip=6  inFlight=2", { FUNNEL_RESUME_PER_CHIP: "6", FUNNEL_RESUME_PER_CHIP_IN_FLIGHT: "2", FUNNEL_RESUME_PER_CHIP_HARD: "6" }],
    ["perChip=8  inFlight=3 (padrão)", {}],
    ["perChip=12 inFlight=4", { FUNNEL_RESUME_PER_CHIP: "12", FUNNEL_RESUME_PER_CHIP_IN_FLIGHT: "4", FUNNEL_RESUME_PER_CHIP_HARD: "10", FUNNEL_RESUME_HARD_CAP: "40" }],
  ];
  for (const [label, env] of grid) {
    const a = await simulate({ name: `concentração 60/2min  ${label}`, seed: 3, hours: 6, rate: OBSERVED.slice(0, 6), bursts: [{ atMin: 4 * 60, n: 30, chip: "c07" }, { atMin: 4 * 60 + 1, n: 30, chip: "c07" }], poison: 0.03, webhookPoison: "new", env });
    line(a);
    const b = await simulate({ name: `crescimento x3        ${label}`, seed: 2, hours: 8, rate: x(3), bursts: [{ atMin: 5 * 60 + 10, n: 27 }, { atMin: 5 * 60 + 30, n: 20 }, { atMin: 5 * 60 + 31, n: 20 }, { atMin: 5 * 60 + 32, n: 20 }, { atMin: 5 * 60 + 33, n: 20 }, { atMin: 5 * 60 + 34, n: 20 }], poison: 0.03, hung: 0.005, slowExtra: 0.02, webhookPoison: "new", env });
    line(b);
    assertEquals(a.neverStarted, 0);
    assertEquals(b.neverStarted, 0);
  }
});
