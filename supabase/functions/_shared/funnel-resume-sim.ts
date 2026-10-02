// Simulador de relógio VIRTUAL para a retomada de timeouts (SÓ para testes; nenhuma
// função de produção importa este arquivo).
//
// Modela: banco em memória (com lock otimista por updated_at), o webhook de retomada
// (duração por chamada; a execução no servidor CONTINUA mesmo que o cron desista por
// prazo; reivindicação/lease contra repetição), e o agendador do pg_cron (um ciclo por
// minuto, ciclos podendo se sobrepor). Tempo é virtual: horas simuladas rodam em ms.
//
// Os números produzidos são de SIMULAÇÃO com premissas explícitas; não são garantia de
// desempenho em produção.

import {
  type CycleDeps,
  type CycleSummary,
  type PageArgs,
  type ResumeCandidate,
  type ResumeConfig,
  runResumeCycle,
  waitKeyOf,
} from "./funnel-resume.ts";

export type Kind = "normal" | "poison" | "slow" | "hung";

export interface SimConv extends ResumeCandidate {
  kind: Kind;
  chip: string;
  /** duração da execução no webhook (ms); Infinity = nunca termina */
  durMs: number;
  done?: boolean;
  doneAt?: number;
  startedAt?: number; // 1ª vez que o cron iniciou a chamada
  invocations: number;
  /** execução em andamento no servidor (reivindicação/lease) até este instante */
  busyUntil?: number;
  version: number;
  dueAt: number;
}

interface Timer { at: number; seq: number; fn: () => void }

export class VirtualClock {
  now: number;
  private timers: Timer[] = [];
  private seq = 0;
  constructor(start: number) { this.now = start; }
  after(ms: number, fn: () => void) { this.timers.push({ at: this.now + Math.max(0, ms), seq: this.seq++, fn }); }
  sleep(ms: number): Promise<void> { return new Promise((r) => this.after(ms, r)); }
  private next(): Timer | undefined {
    if (!this.timers.length) return undefined;
    let bi = 0;
    for (let i = 1; i < this.timers.length; i++) {
      const a = this.timers[i], b = this.timers[bi];
      if (a.at < b.at || (a.at === b.at && a.seq < b.seq)) bi = i;
    }
    return this.timers.splice(bi, 1)[0];
  }
  /** cede UMA macrotarefa (todas as microtarefas pendentes rodam antes); MessageChannel é bem mais barato que setTimeout(0) */
  private async drain() {
    await new Promise<void>((resolve) => {
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = () => { port1.close(); port2.close(); resolve(); };
      port2.postMessage(0);
    });
  }
  /** avança o relógio executando os temporizadores até `end` (ou até `until()` ficar verdadeiro) */
  async runUntil(end: number, until?: () => boolean) {
    await this.drain();
    for (;;) {
      if (until?.()) break;
      const t = this.next();
      if (!t) break;
      if (t.at > end) { this.timers.push(t); this.now = end; break; }
      this.now = Math.max(this.now, t.at);
      t.fn();
      await this.drain();
    }
    await this.drain();
  }
  pending() { return this.timers.length; }
}

export interface WorldOpts {
  start: number;
  /** como o webhook trata espera sem saída de timeout: 'old' = devolve timeout_no_path e não libera; 'new' = libera */
  webhookPoison: "old" | "new";
  /** latência fixa de respostas imediatas (stale/busy) */
  quickMs?: number;
}

export class World {
  clock: VirtualClock;
  store = new Map<string, SimConv>();
  cycles: CycleSummary[] = [];
  inFlight = 0;
  inFlightPeak = 0;
  chipInFlight = new Map<string, number>();
  chipInFlightPeak = new Map<string, number>();
  webhookCalls = 0;
  /** chamadas ao webhook enquanto já havia uma execução em andamento para a MESMA conversa */
  duplicateWhileBusy = 0;
  readonly quickMs: number;

  constructor(public cfg: ResumeConfig, public opts: WorldOpts) {
    this.clock = new VirtualClock(opts.start);
    this.quickMs = opts.quickMs ?? 200;
  }

  add(c: Omit<SimConv, "version" | "invocations" | "bot_locked_until" | "updated_at" | "dueAt"> & { dueAt: number }): SimConv {
    const full: SimConv = {
      ...c,
      connection_id: c.chip,
      evolution_instance_id: c.chip,
      bot_locked_until: new Date(c.dueAt).toISOString(),
      current_flow_id: "flow-1",
      current_block_id: c.current_block_id ?? "block-1",
      flow_variables: { __waiting_input: { question_sent_at: new Date(c.dueAt - 120_000).toISOString() } },
      metadata: {},
      invocations: 0,
      version: 1,
      updated_at: "v1",
    };
    this.store.set(full.id, full);
    return full;
  }

  deps = (): CycleDeps => ({
    now: () => this.clock.now,
    fetchPage: ({ after, limit, minLock, ids }: PageArgs) => {
      const now = this.clock.now;
      let rows = [...this.store.values()].filter((c) => !c.done && Date.parse(c.bot_locked_until) <= now);
      if (ids) rows = rows.filter((c) => ids.includes(c.id));
      if (minLock) rows = rows.filter((c) => c.bot_locked_until >= minLock);
      rows.sort((a, b) => a.bot_locked_until.localeCompare(b.bot_locked_until) || a.id.localeCompare(b.id));
      if (after) rows = rows.filter((c) => c.bot_locked_until > after.lock || (c.bot_locked_until === after.lock && c.id > after.id));
      return Promise.resolve(rows.slice(0, limit).map((c) => structuredClone({ ...c })));
    },
    readLatest: (id) => {
      const c = this.store.get(id);
      return Promise.resolve(c ? { metadata: structuredClone(c.metadata ?? {}), updated_at: c.updated_at ?? null } : null);
    },
    writeState: (id, md, expected) => {
      const c = this.store.get(id);
      if (!c || c.updated_at !== expected) return Promise.resolve(false); // lock otimista
      c.metadata = md;
      c.version++;
      c.updated_at = `v${c.version}`;
      return Promise.resolve(true);
    },
    countBacklog: (beforeIso) =>
      Promise.resolve([...this.store.values()].filter((c) => !c.done && c.bot_locked_until < beforeIso).length),
    after: (ms, fn) => this.clock.after(ms, fn),
    log: () => {},
    callResume: async (c, expected) => {
      const real = this.store.get(c.id)!;
      const chip = real.chip;
      this.webhookCalls++;
      real.invocations++;
      real.startedAt ??= this.clock.now;
      this.inFlight++;
      this.inFlightPeak = Math.max(this.inFlightPeak, this.inFlight);
      const ci = (this.chipInFlight.get(chip) ?? 0) + 1;
      this.chipInFlight.set(chip, ci);
      this.chipInFlightPeak.set(chip, Math.max(this.chipInFlightPeak.get(chip) ?? 0, ci));
      const finish = () => {
        this.inFlight--;
        this.chipInFlight.set(chip, (this.chipInFlight.get(chip) ?? 1) - 1);
      };
      try {
        // espera já mudou (timeout antigo) => descarta sem tocar em nada
        if (expected.wait_key !== waitKeyOf(real) || real.done) {
          await this.clock.sleep(this.quickMs);
          return { status: 200, body: { ok: true, skipped: "stale_resume" } };
        }
        // outra execução já em andamento para esta espera (reivindicação/lease) => recua
        if (real.busyUntil && real.busyUntil > this.clock.now) {
          this.duplicateWhileBusy++;
          await this.clock.sleep(this.quickMs);
          return { status: 200, body: { ok: true, skipped: "wait_already_claimed" } };
        }
        if (real.kind === "poison") {
          await this.clock.sleep(this.quickMs);
          if (this.opts.webhookPoison === "new") {
            real.done = true; real.doneAt = this.clock.now; // timer liberado, nada enviado
            return { status: 200, body: { ok: true, skipped: "timeout_no_path_released" } };
          }
          return { status: 200, body: { ok: true, error: "timeout_no_path" } }; // publicado: não libera
        }
        // execução "real": ocupa a espera no servidor até terminar (ou até a reivindicação órfã expirar em 5 min)
        const dur = real.durMs;
        real.busyUntil = Number.isFinite(dur) ? this.clock.now + dur : this.clock.now + 5 * 60_000;
        if (Number.isFinite(dur)) {
          this.clock.after(dur, () => { real.done = true; real.doneAt = this.clock.now; real.busyUntil = undefined; });
        } else {
          this.clock.after(5 * 60_000, () => { real.busyUntil = undefined; }); // reivindicação órfã expira
        }
        if (dur > this.cfg.callTimeoutMs) {
          await this.clock.sleep(this.cfg.callTimeoutMs);
          return { status: null, body: null, timedOut: true }; // o cron desistiu; o servidor continua
        }
        await this.clock.sleep(dur);
        return { status: 200, body: { ok: true, funnel: true } };
      } finally {
        finish();
      }
    },
  });

  /** inicia um ciclo do cron AGORA, sem aguardar (como o pg_cron + net.http_post) */
  startCycle(): Promise<CycleSummary> {
    const p = runResumeCycle(this.deps(), this.cfg).then((s) => { this.cycles.push(s); return s; });
    return p;
  }

  /** agenda um ciclo por minuto entre [from, to) como o pg_cron `* * * * *` */
  scheduleEveryMinute(from: number, to: number, periodMs = 60_000) {
    for (let t = from; t < to; t += periodMs) this.clock.after(t - this.clock.now, () => { void this.startCycle(); });
  }
}

export function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const p = (q: number) => (s.length ? s[Math.min(s.length - 1, Math.max(0, Math.ceil((q / 100) * s.length) - 1))] : 0);
  return { n: s.length, p50: p(50), p95: p(95), p99: p(99), max: s.length ? s[s.length - 1] : 0, mean: s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0 };
}

/** gerador pseudo-aleatório determinístico (para os testes de carga serem reproduzíveis) */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
