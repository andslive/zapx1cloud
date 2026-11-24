import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  type ConnectionInfo, type Deps, type Episode, type EpisodeStore, type SendOutcome,
  CLAIMING_TIMEOUT_MS, MAX_SEND_ATTEMPTS, STABLE_RECOVERY_MS, SUSPICION_WAIT_MS,
  inconclusiveBackoff, nextStep, openSuspicion, processDueEpisodes,
} from "./episode.ts";
import { classifyStatus, probeInstance, type StatusProbe } from "./status.ts";

const MIN = 60_000;
const ORG = "org-1";
const CONN = "conn-1";

// ---------- simulação: relógio virtual, "banco" em memória com a mesma semântica de CAS/índice único ----------
class MemStore implements EpisodeStore {
  rows = new Map<string, Episode>();
  seq = 0;
  private tick = () => Promise.resolve(); // devolve o controle: permite intercalar workers "concorrentes"
  async open(i: { organization_id: string; connection_id: string; now: Date; source: string }) {
    await this.tick();
    const active = [...this.rows.values()].find((e) => e.connection_id === i.connection_id && e.state !== "closed");
    if (active) return { created: false, episode: { ...active } };
    const ep: Episode = {
      id: `ep-${++this.seq}`, organization_id: i.organization_id, connection_id: i.connection_id, state: "pending", source: i.source,
      suspected_at: i.now.toISOString(), next_check_at: new Date(i.now.getTime() + SUSPICION_WAIT_MS).toISOString(),
      confirm_count: 0, last_valid_disconnect_at: null, inconclusive_streak: 0, check_count: 0, last_check_at: null, last_check_result: null,
      alert_status: null, alert_claimed_at: null, alert_sent_at: null, alert_attempts: 0, recovered_since: null, last_connected_at: null,
      close_reason: null, closed_at: null, version: 0,
    };
    this.rows.set(ep.id, ep);
    return { created: true, episode: { ...ep } };
  }
  async get(id: string) { await this.tick(); const e = this.rows.get(id); return e ? { ...e } : null; }
  async listDue(now: Date, limit: number) {
    await this.tick();
    return [...this.rows.values()].filter((e) => e.state !== "closed" && Date.parse(e.next_check_at) <= now.getTime()).slice(0, limit).map((e) => ({ ...e }));
  }
  async claim(ep: Episode, now: Date) {
    await this.tick();
    const cur = this.rows.get(ep.id);
    if (!cur || cur.version !== ep.version || cur.state === "closed") return null;
    cur.version++; cur.next_check_at = new Date(now.getTime() + 2 * MIN).toISOString();
    return { ...cur };
  }
  async update(ep: Episode, patch: Partial<Episode>) {
    await this.tick();
    const cur = this.rows.get(ep.id);
    if (!cur || cur.version !== ep.version) return null; // job antigo/duplicado
    Object.assign(cur, patch); cur.version++;
    return { ...cur };
  }
  active() { return [...this.rows.values()].filter((e) => e.state !== "closed"); }
  all() { return [...this.rows.values()]; }
}

function sim(opts: { probes?: (c: ConnectionInfo, n: number) => StatusProbe; send?: () => Promise<SendOutcome>; recipient?: { phone: string | null; enabled: boolean } } = {}) {
  let nowMs = Date.parse("2026-11-24T12:00:00Z");
  const store = new MemStore();
  const conn: ConnectionInfo = {
    id: CONN, name: "chip-teste", organization_id: ORG, phone_number: "5511999990000", archived_at: null,
    status: "connected", last_real_whatsapp_state: "CONNECTED", last_health_at: new Date(nowMs).toISOString(), last_connected_at: new Date(nowMs).toISOString(),
  };
  const state = { probe: { kind: "disconnected", state: "DISCONNECTED" } as StatusProbe, probeCalls: 0, sends: [] as string[], logs: [] as string[] };
  const deps: Deps = {
    store, now: () => new Date(nowMs),
    loadConnection: async () => ({ ...conn }),
    probe: async (c) => { state.probeCalls++; return opts.probes ? opts.probes(c, state.probeCalls) : state.probe; },
    getRecipient: async () => opts.recipient ?? { phone: "5511900000000", enabled: true },
    sendAlert: async ({ episode }) => { state.sends.push(episode.id); return opts.send ? await opts.send() : { outcome: "sent" }; },
    log: (ev) => state.logs.push(ev),
  };
  return {
    store, deps, state, conn,
    advance: (ms: number) => { nowMs += ms; },
    now: () => nowMs,
    /** avança 1 min por vez e roda o processador a cada tick, como o pg_cron faria */
    async run(minutes: number) { for (let i = 0; i < minutes; i++) { nowMs += MIN; await processDueEpisodes(deps); } },
    open: (source = "heartbeat") => openSuspicion(deps, { organization_id: ORG, connection_id: CONN, connection_name: "chip-teste", source }),
  };
}
const DOWN: StatusProbe = { kind: "disconnected", state: "DISCONNECTED" };
const UP: StatusProbe = { kind: "connected", state: "CONNECTED" };

// ---------- classificação ----------
Deno.test("classifyStatus: só estado explícito de desconexão comprova queda", () => {
  assertEquals(classifyStatus(true, 200, { status: { connected: true, loggedIn: true } }).kind, "connected");
  assertEquals(classifyStatus(true, 200, { instance: { status: "connected" } }).kind, "connected");
  assertEquals(classifyStatus(true, 200, { status: { connected: false }, instance: { status: "disconnected" } }).kind, "disconnected");
  assertEquals(classifyStatus(true, 200, { state: "close" }).kind, "disconnected");
  assertEquals(classifyStatus(true, 200, { state: "logged_out" }).kind, "disconnected");
  // NÃO provam queda:
  assertEquals(classifyStatus(false, 503, { state: "close" }).kind, "inconclusive");
  assertEquals(classifyStatus(true, 200, {}).kind, "inconclusive");
  assertEquals(classifyStatus(true, 200, null).kind, "inconclusive");
  assertEquals(classifyStatus(true, 200, { foo: 1 }).kind, "inconclusive");
  assertEquals(classifyStatus(true, 200, { status: { connected: false }, instance: { status: "connecting" } }).kind, "inconclusive");
  assertEquals(classifyStatus(true, 200, { state: "connecting" }).kind, "inconclusive");
});

Deno.test("probeInstance: timeout, erro de rede, HTTP 5xx e URL/token ausentes são inconclusivos", async () => {
  const mk = (f: typeof fetch) => probeInstance("https://uaz.example", "tok", { fetchImpl: f, timeoutMs: 20 });
  assertEquals((await mk(() => Promise.reject(Object.assign(new Error("x"), { name: "TimeoutError" })))).kind, "inconclusive");
  assertEquals((await mk(() => Promise.reject(new Error("boom")))).kind, "inconclusive");
  assertEquals((await mk(() => Promise.resolve(new Response("{}", { status: 502 })))).kind, "inconclusive");
  assertEquals((await mk(() => Promise.resolve(new Response("não é json", { status: 200 })))).kind, "inconclusive");
  assertEquals((await mk(() => Promise.resolve(new Response(JSON.stringify({ state: "close" }), { status: 200 })))).kind, "disconnected");
  assertEquals((await probeInstance("", "tok")).kind, "inconclusive");
  assertEquals((await probeInstance("https://uaz.example", "")).kind, "inconclusive");
});

Deno.test("backoff de inconclusivos é crescente e limitado", () => {
  assertEquals([1, 2, 3, 4, 9].map(inconclusiveBackoff), [60_000, 120_000, 240_000, 300_000, 300_000]);
});

// ---------- cenários pedidos ----------
Deno.test("1. oscilação que se recupera antes do prazo: nenhum alerta", async () => {
  const s = sim({ probes: () => UP });
  await s.open();
  await s.run(4);                                   // 4 min: nem consulta ainda (prazo é 5)
  assertEquals(s.state.probeCalls, 0);
  await s.run(2);                                   // passou de 5 min → consulta direta → conectada → cancela
  assertEquals(s.state.probeCalls, 1);
  assertEquals(s.state.sends.length, 0);
  assertEquals(s.store.active().length, 0);
  assertEquals(s.store.all()[0].close_reason, "cancelled_recovered");
});

Deno.test("2. desconexão confirmada nas duas consultas: exatamente um alerta (≥1 min entre as consultas)", async () => {
  const s = sim({ probes: () => DOWN });
  await s.open();
  await s.run(5);
  assertEquals(s.state.sends.length, 0);            // 1ª consulta válida em T+5, ainda sem alerta
  assertEquals(s.store.active()[0].confirm_count, 1);
  s.advance(30_000); await processDueEpisodes(s.deps); // 30 s depois: não é a 2ª consulta
  assertEquals(s.state.sends.length, 0);
  await s.run(1);
  assertEquals(s.state.sends.length, 1);
  assertEquals(s.store.active()[0].alert_status, "sent");
  assert(s.state.logs.includes("disconnect_confirmed") && s.state.logs.includes("alert_sent"));
});

Deno.test("2b. a segunda consulta conectada cancela (nada enviado)", async () => {
  const s = sim({ probes: (_c, n) => (n === 1 ? DOWN : UP) });
  await s.open(); await s.run(8);
  assertEquals(s.state.sends.length, 0);
  assertEquals(s.store.all()[0].close_reason, "cancelled_recovered");
});

Deno.test("3. UazAPI indisponível / timeout / inconclusivo: nenhum falso alerta, retentativa controlada", async () => {
  for (const reason of ["http_503", "timeout", "empty_body", "state_CONNECTING"]) {
    const s = sim({ probes: () => ({ kind: "inconclusive", reason }) });
    await s.open(); await s.run(60);                // 1 hora de UazAPI fora
    assertEquals(s.state.sends.length, 0, reason);
    assertEquals(s.store.active().length, 1, reason); // segue pendente
    assert(s.state.probeCalls <= 14, `${reason}: retentativa deve ter backoff (calls=${s.state.probeCalls})`);
    assertEquals(s.store.active()[0].confirm_count, 0);
  }
});

Deno.test("3b. inconclusivo entre as duas consultas não vira alerta; a 2ª só vale dentro da janela", async () => {
  const seq: StatusProbe[] = [DOWN, { kind: "inconclusive", reason: "timeout" }, DOWN];
  const s = sim({ probes: (_c, n) => seq[n - 1] ?? DOWN });
  await s.open(); await s.run(5);                   // 1ª válida
  await s.run(1);                                   // inconclusiva
  assertEquals(s.state.sends.length, 0);
  await s.run(3);                                   // 2ª válida (≥1 min depois da 1ª)
  assertEquals(s.state.sends.length, 1);
  // contagem velha demais (>10 min) não vale como 1ª consulta
  const t = sim({ probes: (_c, n) => (n === 1 ? DOWN : n <= 12 ? { kind: "inconclusive", reason: "http_500" } : DOWN) });
  await t.open(); await t.run(5);
  await t.run(20);
  assertEquals(t.state.sends.length, 0);
});

Deno.test("4. eventos duplicados não criam outra ocorrência nem reiniciam o prazo", async () => {
  const s = sim({ probes: () => DOWN });
  const first = await s.open("heartbeat");
  s.advance(3 * MIN);
  const results = await Promise.all([s.open("webhook"), s.open("webhook"), s.open("heartbeat"), s.open("webhook")]);
  assertEquals(results.every((r) => !r.created), true);
  assertEquals(s.store.all().length, 1);
  assertEquals(s.store.all()[0].next_check_at, first.episode!.next_check_at); // prazo original
  assertEquals(s.state.logs.filter((l) => l === "duplicate_suppressed").length, 4);
});

Deno.test("4b. workers concorrentes e job antigo: um único alerta", async () => {
  const s = sim({ probes: () => DOWN });
  await s.open(); await s.run(5);
  s.advance(MIN);
  await Promise.all([processDueEpisodes(s.deps), processDueEpisodes(s.deps), processDueEpisodes(s.deps), processDueEpisodes(s.deps)]);
  assertEquals(s.state.sends.length, 1);
  assert(s.state.logs.includes("claim_lost") || s.state.logs.includes("duplicate_suppressed"));
  // job antigo: tem a versão velha em mãos e tenta gravar → descartado
  const stale = s.store.all()[0];
  const oldCopy = { ...stale, version: stale.version - 1 };
  assertEquals(await s.store.update(oldCopy, { state: "closed" }), null);
  assertEquals(s.store.active().length, 1);
});

Deno.test("4c. queda prolongada (6 h) e reinício do processo: sem repetição", async () => {
  const s = sim({ probes: () => DOWN });
  await s.open();
  await s.run(60);
  // "reinício": novos Deps sobre o MESMO banco (estado é todo persistente)
  const restarted: Deps = { ...s.deps };
  for (let i = 0; i < 300; i++) { s.advance(MIN); await processDueEpisodes(restarted); await s.open("heartbeat"); }
  assertEquals(s.state.sends.length, 1);
  assertEquals(s.store.all().length, 1);
});

Deno.test("5. recuperação breve seguida de queda: sem novo alerta", async () => {
  let mode: "down" | "up" = "down";
  const s = sim({ probes: () => (mode === "down" ? DOWN : UP) });
  await s.open(); await s.run(6);
  assertEquals(s.state.sends.length, 1);
  mode = "up"; await s.run(3);                      // 3 min conectada (< 5)
  assertEquals(s.store.active().length, 1);
  mode = "down";
  await s.open("webhook");                          // a queda gera novo evento: suprimido
  await s.run(15);
  assertEquals(s.state.sends.length, 1);
  assertEquals(s.store.all().length, 1);
  assertEquals(s.store.active()[0].recovered_since, null); // a oscilação zerou a contagem de estabilidade
});

Deno.test("6. recuperação estável (5 min) libera novo episódio e novo alerta", async () => {
  let mode: "down" | "up" = "down";
  const s = sim({ probes: () => (mode === "down" ? DOWN : UP) });
  await s.open(); await s.run(6);
  assertEquals(s.state.sends.length, 1);
  mode = "up"; await s.run(STABLE_RECOVERY_MS / MIN + 2);
  assertEquals(s.store.active().length, 0);
  assertEquals(s.store.all()[0].close_reason, "recovered_stable");
  mode = "down";
  const again = await s.open("heartbeat");
  assertEquals(again.created, true);
  await s.run(7);
  assertEquals(s.state.sends.length, 2);
  assertEquals(s.store.all().length, 2);
});

Deno.test("não envia mensagem de reconexão nem de mudança de status (o sender só é chamado para queda confirmada)", async () => {
  let mode: "down" | "up" = "down";
  const s = sim({ probes: () => (mode === "down" ? DOWN : UP) });
  await s.open(); await s.run(6);
  mode = "up"; await s.run(10);
  assertEquals(s.state.sends.length, 1);            // nada na recuperação
});

// ---------- revalidação e falhas de envio ----------
Deno.test("revalida antes do envio: recuperada entre a confirmação e o envio → cancela", async () => {
  const s = sim({ probes: () => DOWN });
  await s.open(); await s.run(5);
  // o webhook marca a conexão como conectada logo após a 2ª consulta, antes do envio
  const origGet = s.deps.loadConnection;
  let calls = 0;
  s.deps.loadConnection = async (id) => {
    const c = await origGet(id); calls++;
    if (calls >= 2) { c!.status = "connected"; c!.last_connected_at = new Date(s.now() + 1000).toISOString(); }
    return c;
  };
  await s.run(1);
  assertEquals(s.state.sends.length, 0);
  assertEquals(s.store.all()[0].close_reason, "cancelled_before_send");
});

Deno.test("conexão arquivada fecha o episódio sem alertar", async () => {
  const s = sim({ probes: () => DOWN });
  await s.open(); s.conn.archived_at = new Date().toISOString();
  await s.run(7);
  assertEquals(s.state.sends.length, 0);
  assertEquals(s.store.all()[0].close_reason, "archived_or_missing");
});

Deno.test("sem destinatário ou alertas desligados: não envia e não fica tentando", async () => {
  for (const recipient of [{ phone: null, enabled: true }, { phone: "5511900000000", enabled: false }]) {
    const s = sim({ probes: () => DOWN, recipient });
    await s.open(); await s.run(30);
    assertEquals(s.state.sends.length, 0);
    assertEquals(s.store.active()[0].alert_status, "skipped");
  }
});

Deno.test("recusa definitiva: tenta de novo até o limite e depois desiste (nunca em loop)", async () => {
  const s = sim({ probes: () => DOWN, send: () => Promise.resolve({ outcome: "rejected" }) });
  await s.open(); await s.run(60);
  assertEquals(s.state.sends.length, MAX_SEND_ATTEMPTS);
  assertEquals(s.store.active()[0].alert_status, "failed");
});

Deno.test("sem instância saudável para enviar: reagenda; ao aparecer, envia uma vez", async () => {
  let ok = false;
  const s = sim({ probes: () => DOWN, send: () => Promise.resolve(ok ? { outcome: "sent" } : { outcome: "no_sender" }) });
  await s.open(); await s.run(7);
  assertEquals(s.store.active()[0].alert_status, null);
  ok = true; await s.run(5);
  assertEquals(s.state.sends.length >= 2, true);
  assertEquals(s.store.active()[0].alert_status, "sent");
  const sent = s.state.sends.length; await s.run(30);
  assertEquals(s.state.sends.length, sent);
});

Deno.test("envio com resultado desconhecido (timeout): nunca reenvia", async () => {
  const s = sim({ probes: () => DOWN, send: () => Promise.resolve({ outcome: "unknown" }) });
  await s.open(); await s.run(90);
  assertEquals(s.state.sends.length, 1);
  assertEquals(s.store.active()[0].alert_status, "unknown");
});

Deno.test("processo que caiu com envio 'claiming': depois do prazo vira desconhecido e não reenvia", async () => {
  const s = sim({ probes: () => DOWN, send: () => new Promise<SendOutcome>(() => {}) }); // nunca resolve = processo "caiu"
  await s.open(); await s.run(5); s.advance(MIN);
  void processDueEpisodes(s.deps);                  // fica pendurado no envio
  await new Promise((r) => setTimeout(r, 20));    // deixa o worker chegar ao envio pendurado
  assertEquals(s.store.active()[0].alert_status, "claiming");
  s.advance(3 * MIN); await processDueEpisodes(s.deps); // lease vencida, ainda dentro do prazo de claim
  s.advance(CLAIMING_TIMEOUT_MS); await processDueEpisodes(s.deps);
  assertEquals(s.store.active()[0].alert_status, "unknown");
  assertEquals(s.state.sends.length, 1);
});

Deno.test("nextStep é puro: não altera o episódio recebido", () => {
  const ep: Episode = {
    id: "e", organization_id: ORG, connection_id: CONN, state: "pending", source: "x", suspected_at: new Date(0).toISOString(), next_check_at: new Date(0).toISOString(),
    confirm_count: 0, last_valid_disconnect_at: null, inconclusive_streak: 0, check_count: 0, last_check_at: null, last_check_result: null, alert_status: null,
    alert_claimed_at: null, alert_sent_at: null, alert_attempts: 0, recovered_since: null, last_connected_at: null, close_reason: null, closed_at: null, version: 3,
  };
  const before = JSON.stringify(ep);
  nextStep(ep, DOWN, new Date(10 * MIN));
  assertEquals(JSON.stringify(ep), before);
});
