// deno test --allow-import funnel-resume.test.ts
//
// Lógica pura da fila de retomada, com RELÓGIO CONTROLADO e serviços simulados
// (banco em memória + webhook simulado). Nada de rede, nada de tempo real.

import {
  chipOf,
  classifyResponse,
  type CycleDeps,
  isEligible,
  nextState,
  parseResumeConfig,
  type PageArgs,
  pickBatch,
  readResumeState,
  type ResumeCandidate,
  type ResumeConfig,
  runResumeCycle,
  waitKeyOf,
} from "./funnel-resume.ts";
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.208.0/assert/mod.ts";

const T0 = Date.parse("2026-10-01T12:00:00Z");
const MIN = 60_000;
const env = (o: Record<string, string>) => (k: string) => o[k];
const cfgOf = (o: Record<string, string> = {}): ResumeConfig => parseResumeConfig(env(o));

let seq = 0;
function conv(over: Partial<ResumeCandidate> & { chip?: string; expiredMinAgo?: number; waitAt?: string }): ResumeCandidate {
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

Deno.test("config: PADRÃO é o modo seguro (allowlist vazia) e valores inválidos caem no modo seguro", () => {
  const d = cfgOf();
  assertEquals(d.mode, "allowlist");
  assertEquals(d.allowlist.size, 0);
  assertEquals(d.dryRun, false);
  for (const bad of ["", "ALL ", "everything", "fresh2", "0"]) {
    const c = cfgOf({ FUNNEL_RESUME_MODE: bad });
    assert(c.mode === "allowlist" || (bad.trim().toLowerCase() === "all" && c.mode === "all"), `modo inesperado para ${JSON.stringify(bad)}: ${c.mode}`);
  }
  assertEquals(cfgOf({ FUNNEL_RESUME_MODE: "fresh" }).mode, "fresh");
  assertEquals(cfgOf({ FUNNEL_RESUME_MODE: "all" }).mode, "all");
  assertEquals(cfgOf({ FUNNEL_RESUME_MODE: "garbage" }).mode, "allowlist");
});

Deno.test("config: allowlist só aceita ids bem formados; limites numéricos são saturados", () => {
  const c = cfgOf({ FUNNEL_RESUME_ALLOWLIST: "abc-123456, ../etc; x , conv_00001\n\tok-654321", FUNNEL_RESUME_HARD_CAP: "99999", FUNNEL_RESUME_PER_CHIP: "-5", FUNNEL_RESUME_MAX_ATTEMPTS: "abc" });
  assertEquals([...c.allowlist].sort(), ["abc-123456", "conv_00001", "ok-654321"]);
  assertEquals(c.hardCap, 100);
  assertEquals(c.perChip, 1);
  assertEquals(c.maxAttempts, 5);
});

// ---------------- espera específica ----------------

Deno.test("waitKeyOf: muda com o bloco, com o fluxo e com o momento da pergunta (timeout antigo não vale para outra espera)", () => {
  const base = conv({ id: "c1" });
  const k = waitKeyOf(base);
  assert(k !== waitKeyOf({ ...base, current_block_id: "block-2" }));
  assert(k !== waitKeyOf({ ...base, current_flow_id: "flow-2" }));
  assert(k !== waitKeyOf(conv({ id: "c1", waitAt: new Date(T0).toISOString() })));
  assertEquals(k, waitKeyOf(structuredClone(base)));
});

Deno.test("estado de tentativas só vale para a MESMA espera; espera nova zera", () => {
  const c = conv({});
  const st = nextState(null, "failed", "x", T0, cfgOf(), waitKeyOf(c))!;
  assertEquals(readResumeState({ resume: st }, waitKeyOf(c))?.attempts, 1);
  assertEquals(readResumeState({ resume: st }, waitKeyOf({ ...c, current_block_id: "outro" })), null);
});

// ---------------- classificação ----------------

Deno.test("classifyResponse: mapeia as respostas reais do webhook; o desconhecido é FALHA (nunca sucesso)", () => {
  const cases: [number | null, unknown, string][] = [
    [200, { ok: true, funnel: true }, "advanced"],
    [200, { ok: true, skipped: "conversation_lease_held_by_other_owner" }, "busy"],
    [200, { ok: true, skipped: "wait_already_claimed" }, "busy"],
    [200, { ok: true, skipped: "inbound_in_flight" }, "busy"],
    [200, { ok: true, skipped: "ghost_cleanup_invalid_resume_state", reason: "x" }, "released"],
    [200, { ok: true, skipped: "recent_message_detected", ghost_cleaned: true }, "released"],
    [200, { ok: true, skipped: "already_handled_by_inbound" }, "released"],
    [200, { ok: true, skipped: "stale_resume" }, "released"],
    [200, { ok: true, skipped: "timeout_no_path_released" }, "released"],
    [200, { ok: true, error: "timeout_no_path" }, "failed"], // webhook ANTIGO: a mesma falha que travava a fila
    [200, { ok: true, skipped: "algo_novo" }, "failed"],
    [200, { ok: true }, "failed"],
    [200, null, "failed"],
    [401, { ok: false, error: "unauthorized" }, "failed"],
    [500, {}, "failed"],
    [null, null, "failed"],
  ];
  for (const [s, b, want] of cases) assertEquals(classifyResponse(s, b).outcome, want, `${s} ${JSON.stringify(b)}`);
});

Deno.test("nextState: backoff exponencial limitado, quarentena na última tentativa, busy não conta", () => {
  const cfg = cfgOf();
  const k = "k";
  let st = nextState(null, "failed", "e", T0, cfg, k)!;
  assertEquals(st.attempts, 1);
  assertEquals(Date.parse(st.next_attempt_at!) - T0, 2 * MIN);
  st = nextState(st, "failed", "e", T0, cfg, k)!;
  assertEquals(Date.parse(st.next_attempt_at!) - T0, 4 * MIN);
  const busy = nextState(st, "busy", "b", T0, cfg, k);
  assertEquals(busy, st); // inalterado
  st = nextState(st, "failed", "e", T0, cfg, k)!;
  st = nextState(st, "failed", "e", T0, cfg, k)!;
  assertFalse(st.quarantined);
  st = nextState(st, "failed", "e", T0, cfg, k)!; // 5ª
  assert(st.quarantined && st.next_attempt_at === null && st.attempts === 5);
  assertEquals(nextState(st, "released", "r", T0, cfg, k), null);
  assertEquals(nextState(st, "advanced", "a", T0, cfg, k), null);
  const capped = nextState({ ...st, attempts: 9, quarantined: false }, "failed", "e", T0, cfgOf({ FUNNEL_RESUME_MAX_ATTEMPTS: "20" }), k)!;
  assert(Date.parse(capped.next_attempt_at!) - T0 <= 60 * MIN);
});

// ---------------- elegibilidade e seleção ----------------

Deno.test("isEligible: allowlist, idade (fresh), quarentena e backoff", () => {
  const c = conv({ id: "c-allowed", expiredMinAgo: 120 });
  assertEquals(isEligible(c, cfgOf({ FUNNEL_RESUME_MODE: "allowlist" }), T0), { ok: false, reason: "not_allowlisted" });
  assertEquals(isEligible(c, cfgOf({ FUNNEL_RESUME_MODE: "allowlist", FUNNEL_RESUME_ALLOWLIST: "c-allowed" }), T0), { ok: true });
  assertEquals(isEligible(c, cfgOf({ FUNNEL_RESUME_MODE: "fresh" }), T0), { ok: false, reason: "too_stale" });
  assertEquals(isEligible(conv({ expiredMinAgo: 5 }), cfgOf({ FUNNEL_RESUME_MODE: "fresh" }), T0), { ok: true });
  assertEquals(isEligible(c, cfgOf({ FUNNEL_RESUME_MODE: "all" }), T0), { ok: true });
  const fut = conv({ bot_locked_until: new Date(T0 + MIN).toISOString() });
  assertEquals(isEligible(fut, cfgOf({ FUNNEL_RESUME_MODE: "all" }), T0), { ok: false, reason: "not_expired" });
  const quar = conv({});
  quar.metadata = { resume: { attempts: 5, quarantined: true, next_attempt_at: null, wait_key: waitKeyOf(quar) } };
  assertEquals(isEligible(quar, cfgOf({ FUNNEL_RESUME_MODE: "all" }), T0), { ok: false, reason: "quarantined" });
  const bo = conv({});
  bo.metadata = { resume: { attempts: 1, quarantined: false, next_attempt_at: new Date(T0 + MIN).toISOString(), wait_key: waitKeyOf(bo) } };
  assertEquals(isEligible(bo, cfgOf({ FUNNEL_RESUME_MODE: "all" }), T0), { ok: false, reason: "backoff" });
  assertEquals(isEligible(bo, cfgOf({ FUNNEL_RESUME_MODE: "all" }), T0 + 2 * MIN), { ok: true });
});

Deno.test("pickBatch: round-robin entre conexões, cota por conexão, teto global; elegibilidade ANTES do limite", () => {
  const cfg = cfgOf({ FUNNEL_RESUME_MODE: "all", FUNNEL_RESUME_HARD_CAP: "7", FUNNEL_RESUME_PER_CHIP: "2" });
  const cands: ResumeCandidate[] = [];
  for (const chip of ["A", "B", "C", "D"]) for (let i = 0; i < 5; i++) cands.push(conv({ chip, expiredMinAgo: 500 - i }));
  const { batch } = pickBatch(cands, cfg, T0);
  assertEquals(batch.length, 7);
  const perChip = new Map<string, number>();
  for (const b of batch) perChip.set(b.connection_id!, (perChip.get(b.connection_id!) ?? 0) + 1);
  assert([...perChip.values()].every((n) => n <= 2));
  assertEquals(perChip.size, 4); // todas as conexões atendidas
});

// ---------------- simulação do incidente real ----------------

interface SimConv extends ResumeCandidate { kind: "poison" | "normal" | "stale_target"; done?: boolean }

function makeSim(convs: SimConv[], cfg: ResumeConfig, opts: { webhookPoison?: "old" | "new" } = {}) {
  let now = T0;
  const store = new Map(convs.map((c) => [c.id, c]));
  const calls: { id: string; expected: { wait_key: string } }[] = [];
  const deps: CycleDeps = {
    now: () => now,
    fetchPage: ({ after, limit, minLock, ids }: PageArgs) => {
      let rows = [...store.values()].filter((c) => !c.done && Date.parse(c.bot_locked_until) <= now);
      if (ids) rows = rows.filter((c) => ids.includes(c.id));
      if (minLock) rows = rows.filter((c) => c.bot_locked_until >= minLock);
      rows.sort((a, b) => a.bot_locked_until.localeCompare(b.bot_locked_until) || a.id.localeCompare(b.id));
      if (after) rows = rows.filter((c) => c.bot_locked_until > after.lock || (c.bot_locked_until === after.lock && c.id > after.id));
      return Promise.resolve(rows.slice(0, limit).map((c) => structuredClone(c)));
    },
    callResume: (c, expected) => {
      calls.push({ id: c.id, expected });
      const real = store.get(c.id)!;
      if (expected.wait_key !== waitKeyOf(real)) return Promise.resolve({ status: 200, body: { ok: true, skipped: "stale_resume" } });
      if (real.kind === "poison") {
        if (opts.webhookPoison === "new") { real.done = true; return Promise.resolve({ status: 200, body: { ok: true, skipped: "timeout_no_path_released" } }); }
        return Promise.resolve({ status: 200, body: { ok: true, error: "timeout_no_path" } }); // webhook publicado: não libera
      }
      real.done = true; // avançou: lock liberado
      return Promise.resolve({ status: 200, body: { ok: true, funnel: true } });
    },
    readLatest: (id) => Promise.resolve({ metadata: structuredClone(store.get(id)!.metadata ?? {}), updated_at: store.get(id)!.updated_at ?? null }),
    writeState: (id, md) => { store.get(id)!.metadata = md; return Promise.resolve(true); },
    sleep: () => Promise.resolve(),
    log: () => {},
  };
  return { deps, store, calls, tick: (ms: number) => { now += ms; }, now: () => now };
}

/** Reproduz o incidente: 24 problemáticas (2 conexões) na frente + 937 normais de 10 conexões. */
function incident(): SimConv[] {
  const out: SimConv[] = [];
  for (let i = 0; i < 24; i++) out.push({ ...conv({ chip: i % 2 ? "CHIP663" : "chip67", expiredMinAgo: 1700 - i }), kind: "poison" });
  for (let i = 0; i < 36; i++) out.push({ ...conv({ chip: i % 2 ? "CHIP663" : "chip67", expiredMinAgo: 1000 - i }), kind: "normal" });
  const chips = ["canall32", "chip19", "chip50", "canal21", "chip16", "chip52", "chip12", "canal46", "chip17new", "chipZ"];
  for (let i = 0; i < 901; i++) out.push({ ...conv({ chip: chips[i % chips.length], expiredMinAgo: 800 - (i % 700) }), kind: "normal" });
  return out;
}

// Réplica da seleção ANTIGA do funnel-resume-cron (publicada): janela global das 60 mais antigas e SÓ DEPOIS 2 por conexão.
function legacySelect(convs: ResumeCandidate[], nowMs: number): ResumeCandidate[] {
  const window = convs.filter((c) => Date.parse(c.bot_locked_until) <= nowMs)
    .sort((a, b) => a.bot_locked_until.localeCompare(b.bot_locked_until)).slice(0, 60);
  const perChip: Record<string, ResumeCandidate[]> = {};
  for (const c of window) { const k = chipOf(c); (perChip[k] ??= []); if (perChip[k].length < 2) perChip[k].push(c); }
  return Object.values(perChip).flat().slice(0, 20);
}

Deno.test("CARACTERIZAÇÃO do defeito: a seleção ANTIGA, nos mesmos dados do incidente, atende só 2 conexões e 4 conversas (todas problemáticas)", () => {
  const data = incident();
  const picked = legacySelect(data, T0);
  assertEquals(picked.length, 4);
  assertEquals(new Set(picked.map((c) => chipOf(c))).size, 2);
  assert(picked.every((c) => (c as SimConv).kind === "poison"));
  // e a nova, nos MESMOS dados e com a MESMA falha por conversa, atende dez conexões
  const novo = pickBatch(data, cfgOf({ FUNNEL_RESUME_MODE: "all" }), T0).batch;
  assert(new Set(novo.map((c) => chipOf(c))).size >= 10);
});

Deno.test("INCIDENTE REPRODUZIDO (modo all, webhook publicado): com a seleção NOVA as outras conexões são atendidas já no 1º ciclo", async () => {
  const cfg = cfgOf({ FUNNEL_RESUME_MODE: "all" });
  const sim = makeSim(incident(), cfg);
  const s = await runResumeCycle(sim.deps, cfg, 0);
  const touchedChips = new Set(sim.calls.map((c) => sim.store.get(c.id)!.connection_id));
  assert(touchedChips.size >= 10, `conexões atendidas: ${touchedChips.size}`); // antes: 2
  assert(s.outcomes.advanced > 0);
  assertEquals(s.selected, 20); // teto global por ciclo
});

Deno.test("INCIDENTE: conversa problemática não monopoliza — após no máx. 5 tentativas vai à quarentena e para de ser escolhida", async () => {
  const cfg = cfgOf({ FUNNEL_RESUME_MODE: "all" });
  const sim = makeSim(incident(), cfg); // webhook publicado: timeout_no_path NÃO libera
  const attemptsOf = new Map<string, number>();
  for (let cycle = 0; cycle < 120; cycle++) { // 120 ciclos de 2 min = 4 h simuladas
    const before = sim.calls.length;
    await runResumeCycle(sim.deps, cfg, 0);
    for (const c of sim.calls.slice(before)) if (sim.store.get(c.id)!.kind === "poison") attemptsOf.set(c.id, (attemptsOf.get(c.id) ?? 0) + 1);
    sim.tick(2 * MIN);
  }
  const poison = [...sim.store.values()].filter((c) => c.kind === "poison");
  for (const p of poison) {
    assert((attemptsOf.get(p.id) ?? 0) <= 5, `${p.id} tentada ${attemptsOf.get(p.id)}x`);
    const st = readResumeState(p.metadata, waitKeyOf(p));
    assert(st?.quarantined && st.last_error === "error:timeout_no_path" && st.attempts === 5, `${p.id} sem diagnóstico completo`);
  }
  const normal = [...sim.store.values()].filter((c) => c.kind === "normal");
  assertEquals(normal.filter((c) => c.done).length, normal.length); // TODAS as normais acabaram atendidas
});

Deno.test("INCIDENTE com o webhook CORRIGIDO: a problemática é liberada na 1ª tentativa e sai da fila sem quarentena", async () => {
  const cfg = cfgOf({ FUNNEL_RESUME_MODE: "all" });
  const sim = makeSim(incident(), cfg, { webhookPoison: "new" });
  for (let i = 0; i < 80; i++) { await runResumeCycle(sim.deps, cfg, 0); sim.tick(2 * MIN); }
  const poison = [...sim.store.values()].filter((c) => c.kind === "poison");
  assert(poison.every((p) => p.done && !p.metadata?.resume));
});

Deno.test("PASSIVO PRESERVADO: modo padrão (allowlist vazia) não faz NENHUMA chamada nem leitura — 961 conversas intactas", async () => {
  const cfg = cfgOf();
  const sim = makeSim(incident(), cfg);
  let fetched = 0;
  const orig = sim.deps.fetchPage;
  sim.deps.fetchPage = (a) => { fetched++; return orig(a); };
  const s = await runResumeCycle(sim.deps, cfg, 0);
  assertEquals(sim.calls.length, 0);
  assertEquals(fetched, 0);
  assertEquals(s.selected, 0);
  assert(s.note?.includes("allowlist_empty"));
  assert([...sim.store.values()].every((c) => !c.done && !c.metadata?.resume));
});

Deno.test("ATIVAÇÃO CONTROLADA: allowlist com UMA conversa processa só ela; as 960 restantes ficam intocadas", async () => {
  const all = incident();
  const target = all.find((c) => c.kind === "normal" && c.connection_id === "chip19")!;
  const cfg = cfgOf({ FUNNEL_RESUME_MODE: "allowlist", FUNNEL_RESUME_ALLOWLIST: target.id });
  const sim = makeSim(all, cfg);
  const s = await runResumeCycle(sim.deps, cfg, 0);
  assertEquals(sim.calls.map((c) => c.id), [target.id]);
  assertEquals(s.outcomes.advanced, 1);
  assertEquals([...sim.store.values()].filter((c) => c.done).map((c) => c.id), [target.id]);
  // ciclos seguintes: nada mais é tocado
  for (let i = 0; i < 10; i++) { await runResumeCycle(sim.deps, cfg, 0); sim.tick(2 * MIN); }
  assertEquals(sim.calls.length, 1);
});

Deno.test("allowlist com id inexistente/ocioso não amplia o escopo", async () => {
  const cfg = cfgOf({ FUNNEL_RESUME_MODE: "allowlist", FUNNEL_RESUME_ALLOWLIST: "nao-existe-123456" });
  const sim = makeSim(incident(), cfg);
  const s = await runResumeCycle(sim.deps, cfg, 0);
  assertEquals(sim.calls.length, 0);
  assertEquals(s.scanned, 0);
});

Deno.test("modo fresh: o passivo antigo nunca é lido nem processado; só timeouts recentes", async () => {
  const cfg = cfgOf({ FUNNEL_RESUME_MODE: "fresh", FUNNEL_RESUME_MAX_STALE_MINUTES: "30" });
  const old = incident();
  const recent: SimConv[] = [
    { ...conv({ chip: "chip19", expiredMinAgo: 5 }), kind: "normal" },
    { ...conv({ chip: "chip16", expiredMinAgo: 29 }), kind: "normal" },
    { ...conv({ chip: "chip52", expiredMinAgo: 31 }), kind: "normal" }, // já passou da janela
  ];
  const sim = makeSim([...old, ...recent], cfg);
  const s = await runResumeCycle(sim.deps, cfg, 0);
  assertEquals(sim.calls.map((c) => c.id).sort(), [recent[0].id, recent[1].id].sort());
  assertEquals(s.scanned, 2); // o filtro de idade é aplicado na LEITURA
  assert(old.every((c) => !sim.store.get(c.id)!.done));
});

Deno.test("dry_run: lista a seleção, não chama o webhook e não grava nada", async () => {
  const cfg = cfgOf({ FUNNEL_RESUME_MODE: "all", FUNNEL_RESUME_DRY_RUN: "true" });
  const sim = makeSim(incident(), cfg);
  const s = await runResumeCycle(sim.deps, cfg, 0);
  assertEquals(sim.calls.length, 0);
  assertEquals(s.selected, 20);
  assertEquals(s.selected_ids?.length, 20);
  assert([...sim.store.values()].every((c) => !c.done && !c.metadata?.resume));
});

Deno.test("timeout ANTIGO não age sobre OUTRA espera: a chave esperada não bate => stale_resume, nada é liberado", async () => {
  const cfg = cfgOf({ FUNNEL_RESUME_MODE: "all" });
  const c: SimConv = { ...conv({ id: "conv-stale-1", chip: "chip19", expiredMinAgo: 60 }), kind: "normal" };
  const sim = makeSim([c], cfg);
  // a conversa segue para OUTRO bloco/espera entre a seleção e a chamada
  const orig = sim.deps.callResume;
  sim.deps.callResume = (cand, expected) => {
    const real = sim.store.get(cand.id)!;
    real.current_block_id = "block-DEPOIS";
    return orig(cand, expected);
  };
  const s = await runResumeCycle(sim.deps, cfg, 0);
  assertEquals(s.outcomes.released, 1);
  assertFalse(sim.store.get("conv-stale-1")!.done); // não foi marcada como avançada
});

Deno.test("falha repetida de UMA conversa não impede as demais, ciclo a ciclo", async () => {
  const cfg = cfgOf({ FUNNEL_RESUME_MODE: "all", FUNNEL_RESUME_PER_CHIP: "1" });
  const bad: SimConv = { ...conv({ id: "conv-bad-001", chip: "chip19", expiredMinAgo: 900 }), kind: "poison" };
  const good: SimConv[] = Array.from({ length: 6 }, (_, i) => ({ ...conv({ id: `conv-good-00${i}`, chip: "chip19", expiredMinAgo: 800 - i }), kind: "normal" as const }));
  const sim = makeSim([bad, ...good], cfg);
  for (let i = 0; i < 12; i++) { await runResumeCycle(sim.deps, cfg, 0); sim.tick(2 * MIN); }
  assert(good.every((g) => sim.store.get(g.id)!.done), "as boas foram atendidas mesmo na MESMA conexão da ruim");
});

Deno.test("erro de rede/exceção do webhook conta como falha limitada; conflito de gravação do estado não derruba o ciclo", async () => {
  const cfg = cfgOf({ FUNNEL_RESUME_MODE: "all" });
  const c: SimConv = { ...conv({ id: "conv-net-001", chip: "chip19", expiredMinAgo: 60 }), kind: "normal" };
  const sim = makeSim([c], cfg);
  sim.deps.callResume = () => Promise.reject(new Error("boom"));
  sim.deps.writeState = () => Promise.resolve(false);
  const s = await runResumeCycle(sim.deps, cfg, 0);
  assertEquals(s.outcomes.failed, 1);
  assertEquals(s.failures[0].reason, "network_error");
  sim.deps.writeState = () => { throw new Error("db"); };
  await runResumeCycle(sim.deps, cfg, 0); // não lança
});

Deno.test("paginação: varre mais de uma página e respeita o teto de páginas", async () => {
  const cfg = cfgOf({ FUNNEL_RESUME_MODE: "all", FUNNEL_RESUME_PAGE_SIZE: "10", FUNNEL_RESUME_MAX_PAGES: "3" });
  const many: SimConv[] = Array.from({ length: 100 }, (_, i) => ({ ...conv({ id: `conv-pg-${String(i).padStart(3, "0")}`, chip: `chip${i % 25}`, expiredMinAgo: 900 - i }), kind: "normal" as const }));
  const sim = makeSim(many, cfg);
  const s = await runResumeCycle(sim.deps, cfg, 0);
  assertEquals(s.scanned, 30); // 3 páginas x 10
  assertEquals(s.scan_truncated, true); // e avisa que havia mais além do teto
  const few = makeSim(many.slice(0, 5), cfg);
  assertEquals((await runResumeCycle(few.deps, cfg, 0)).scan_truncated, false);
});

Deno.test("orçamento de tempo: não inicia novas retomadas depois do limite; o restante fica para o próximo ciclo", async () => {
  const cfg = cfgOf({ FUNNEL_RESUME_MODE: "all", FUNNEL_RESUME_TIME_BUDGET_SECONDS: "5", FUNNEL_RESUME_PER_CHIP: "10" });
  const cs: SimConv[] = Array.from({ length: 10 }, (_, i) => ({ ...conv({ id: `conv-tb-00${i}`, chip: "chip19", expiredMinAgo: 900 - i }), kind: "normal" as const }));
  const sim = makeSim(cs, cfg);
  sim.deps.sleep = (ms) => { sim.tick(ms); return Promise.resolve(); }; // cada chamada "consome" 2 s simulados
  const orig = sim.deps.callResume;
  sim.deps.callResume = async (c, e) => { sim.tick(2000); return await orig(c, e); };
  const s = await runResumeCycle(sim.deps, cfg, 0);
  assert(s.selected === 10 && sim.calls.length <= 4, `chamadas: ${sim.calls.length}`);
  assert(s.note?.includes("time_budget_exhausted"));
  await runResumeCycle(sim.deps, cfg, 0); // o próximo ciclo continua de onde parou
  assert(sim.calls.length > 4);
});
