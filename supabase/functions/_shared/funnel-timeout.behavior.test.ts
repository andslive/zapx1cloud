// Teste COMPORTAMENTAL do timeout automático de funis (webhook + cron reais).
//
//   deno test --allow-import --allow-read --allow-write --allow-run --allow-env \
//     --allow-net=127.0.0.1 funnel-timeout.behavior.test.ts
//
// Processos REAIS: uazapi-webhook (versão corrigida e, como referência, a PUBLICADA
// no commit BASE_REF) e funnel-resume-cron, apontando para o MESMO banco simulado
// (arquivo compartilhado; o fake reproduz o trigger de updated_at) e para um
// servidor local que captura cada chamada a /functions/v1/uazapi-send. Rede
// limitada a 127.0.0.1. Nada é enviado de verdade. Dados 100% sintéticos.
//
// Serviços simulados: banco (mini-banco em memória), envio (servidor de captura).
// Relógio: as esperas são semeadas com instantes passados (vencidas) em vez de
// aguardar tempo real; a lógica de fila com relógio simulado está em funnel-resume.test.ts.

import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.208.0/assert/mod.ts";

const BASE_REF = "7c2ce81";
const HERE = new URL(".", import.meta.url);
const FN = new URL("../", HERE);
const WEBHOOK = new URL("uazapi-webhook/index.ts", FN).pathname;
const BASELINE = new URL("uazapi-webhook/.baseline-timeout.ts", FN).pathname;
const CRON = new URL("funnel-resume-cron/index.ts", FN).pathname;
const IMPORT_MAP = new URL("funnel-resume-harness/import_map.json", HERE).pathname;
const TMP = await Deno.makeTempDir({ prefix: "funnel-timeout-" });
const KEY = "fake-service-key-not-real";

async function loadBaseline(): Promise<boolean> {
  try {
    const out = await new Deno.Command("git", { args: ["show", `${BASE_REF}:supabase/functions/uazapi-webhook/index.ts`], stdout: "piped", stderr: "null" }).output();
    if (!out.success) return false;
    await Deno.writeFile(BASELINE, out.stdout);
    return true;
  } catch (_e) { return false; }
}
const HAS_BASE = await loadBaseline();
globalThis.addEventListener("unload", () => {
  try { Deno.removeSync(BASELINE); } catch (_e) { /* ok */ }
  try { Deno.removeSync(TMP, { recursive: true }); } catch (_e) { /* ok */ }
});

// ---------------- fixtures ----------------
const CHIPS = ["A", "B", "C", "D", "E"];
const instances = CHIPS.map((c) => ({
  id: `inst-${c}`, organization_id: "org-1", name: `chip${c}`, instance_token: `tok-${c}`, provider: "uazapi",
  phone_number: `55000000099${c.charCodeAt(0) % 10}`, status: "connected", is_active: true, archived_at: null, default_funnel_id: "fun-1",
}));
const FUNNEL = {
  id: "fun-1", organization_id: "org-1", start_block_id: "b1", channels: ["whatsapp"], allow_reentry: false, status: "active", name: "f",
  flow_blocks: [
    { id: "b1", type: "message", data: { content: "Hola 1", delay_ms: 0, show_typing: false }, next_block_id: "b2" },
    // espera COM saída de timeout
    { id: "b2", type: "wait_response", data: { timeout_enabled: true, timeout_unit: "hours", timeout_value: 3, wait_indefinitely: false, message_buffer_enabled: false, timeout_next_block_id: "b3" }, next_block_id: "b4" },
    { id: "b3", type: "message", data: { content: "TIMEOUT", delay_ms: 0, show_typing: false }, next_block_id: null },
    { id: "b4", type: "message", data: { content: "APOS_RESPOSTA", delay_ms: 0, show_typing: false }, next_block_id: null },
    // espera SEM saída de timeout (o bloco real que travou a fila)
    { id: "b5", type: "wait_response", data: { timeout_enabled: true, timeout_unit: "hours", timeout_value: 3, wait_indefinitely: false, message_buffer_enabled: false }, next_block_id: "b4" },
  ],
};

let n = 0;
const past = (s: number) => new Date(Date.now() - s * 1000).toISOString();
function waiting(o: { id?: string; chip?: string; block?: "b2" | "b5"; expiredMin?: number; phone?: string; meta?: Record<string, unknown> }) {
  const k = ++n;
  const id = o.id ?? `conv-${String(k).padStart(4, "0")}`;
  const phone = o.phone ?? `55119${String(10000000 + k)}`; // 13 dígitos (formato canônico)
  const block = o.block ?? "b2";
  const expired = (o.expiredMin ?? 30) * 60;
  const qsa = past(expired + 3 * 3600); // pergunta enviada 3 h antes do vencimento
  return {
    id, organization_id: "org-1", visitor_id: `v-${k}`, channel: "whatsapp", status: "bot_active", visitor_phone: phone, visitor_name: "Fulano",
    connection_id: `inst-${o.chip ?? "A"}`, evolution_instance_id: `inst-${o.chip ?? "A"}`, last_message_at: past(expired + 3600), lead_id: `lead-${k}`,
    current_flow_id: "fun-1", current_block_id: block, flow_completed: false, flow_source: "funnel", created_at: past(expired + 20000),
    metadata: o.meta ?? {}, bot_locked_until: past(expired), unread_count_agents: 0,
    flow_variables: {
      nome: "Fulano", telefone: phone, __consumed_input_message_ids: [], resposta: "waiting...", waiting_for_input: true,
      __waiting_input: {
        block_id: block, variable_name: "resposta", question_sent_at: qsa, question_text: "", timeout_at: past(expired), is_timeout: false,
        success_next_block_id: "b4", timeout_next_block_id: block === "b2" ? "b3" : null, question_sent: true, answered: false,
        answer_text: null, answered_at: null, trigger_message_id: `x:SEED${k}`,
      },
      waiting_question_sent_at: qsa,
    },
  };
}
const leadFor = (c: ReturnType<typeof waiting>) => ({ id: c.lead_id, organization_id: "org-1", name: "Fulano", phone: c.visitor_phone, connection_id: c.connection_id });
const seedOf = (convs: ReturnType<typeof waiting>[]) => ({
  evolution_instances: instances, capture_funnels: [FUNNEL], webchat_conversations: convs, leads: convs.map(leadFor),
});

// ---------------- "mundo": processos + banco compartilhado + captura ----------------
interface SendBody { type: string; to: string; payload: Record<string, unknown> }
interface World {
  sends: SendBody[];
  post: (payload: unknown, headers?: Record<string, string>) => Promise<{ status: number; body: Record<string, unknown> }>;
  resume: (conversationId: string, expected?: { flow_id: string; block_id: string; wait_key: string }) => Promise<{ status: number; body: Record<string, unknown> }>;
  cron: () => Promise<{ status: number; body: Record<string, unknown> }>;
  db: () => Record<string, Record<string, unknown>[]>;
  conv: (id: string) => Record<string, unknown>;
  close: () => Promise<void>;
}

let wseq = 0;
async function freePort() { const l = Deno.listen({ hostname: "127.0.0.1", port: 0 }); const p = (l.addr as Deno.NetAddr).port; l.close(); return p; }
async function ready(url: string) { for (let i = 0; i < 100; i++) { try { await (await fetch(url, { method: "OPTIONS" })).body?.cancel(); return; } catch (_e) { await new Promise((r) => setTimeout(r, 150)); } } }

async function world(o: { webhook: "base" | "patched"; seed: Record<string, unknown[]>; cronEnv?: Record<string, string> }): Promise<World> {
  const id = ++wseq;
  const dbFile = `${TMP}/db-${id}.json`;
  await Deno.writeTextFile(dbFile, JSON.stringify(o.seed));
  const sends: SendBody[] = [];
  const sink = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (r) => {
    const p = new URL(r.url).pathname;
    const b = r.method === "POST" ? await r.json().catch(() => ({})) : {};
    if (p.includes("/functions/v1/uazapi-send")) sends.push(b as SendBody);
    return new Response(JSON.stringify({ success: true, message: "ok", debug: {} }), { headers: { "content-type": "application/json" } });
  });
  const sinkPort = (sink.addr as Deno.NetAddr).port;
  const wPort = await freePort();
  const common = ["run", "--cached-only", "--no-lock", "--no-check", "--allow-net=127.0.0.1", "--allow-env", "--allow-read", `--allow-write=${TMP}`, `--import-map=${IMPORT_MAP}`];
  const procs: Deno.ChildProcess[] = [];
  procs.push(new Deno.Command(Deno.execPath(), {
    args: [...common, o.webhook === "base" ? BASELINE : WEBHOOK],
    env: { SUPABASE_URL: `http://127.0.0.1:${sinkPort}`, SUPABASE_SERVICE_ROLE_KEY: KEY, DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${wPort}`, FAKE_SHARED_DB_FILE: dbFile },
    clearEnv: true, stdout: "null", stderr: "null",
  }).spawn());
  let cPort = 0;
  if (o.cronEnv) {
    cPort = await freePort();
    procs.push(new Deno.Command(Deno.execPath(), {
      args: [...common, CRON],
      env: { ...o.cronEnv, SUPABASE_URL: `http://127.0.0.1:${wPort}`, SUPABASE_SERVICE_ROLE_KEY: KEY, DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${cPort}`, FAKE_SHARED_DB_FILE: dbFile },
      clearEnv: true, stdout: "null", stderr: "null",
    }).spawn());
  }
  await ready(`http://127.0.0.1:${wPort}/`);
  if (cPort) await ready(`http://127.0.0.1:${cPort}/`);

  const call = async (url: string, body: unknown, headers: Record<string, string> = {}) => {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    const text = await r.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(text); } catch (_e) { parsed = { raw: text }; }
    return { status: r.status, body: parsed };
  };
  const db = () => JSON.parse(Deno.readTextFileSync(dbFile));
  return {
    sends,
    post: (p, h) => call(`http://127.0.0.1:${wPort}/`, p, h),
    resume: (cid, expected) => call(`http://127.0.0.1:${wPort}/`, { action: "resume_funnel", conversationId: cid, ...(expected ? { expected_wait: expected } : {}) }, { authorization: `Bearer ${KEY}` }),
    cron: () => call(`http://127.0.0.1:${cPort}/`, {}),
    db,
    conv: (cid) => (db().webchat_conversations as Record<string, unknown>[]).find((c) => c.id === cid)!,
    close: async () => {
      for (const p of procs) { try { p.kill("SIGTERM"); } catch (_e) { /* ok */ } await p.status; }
      await sink.shutdown();
    },
  };
}

const t = (name: string, fn: () => Promise<void>) => Deno.test({ name, ignore: !HAS_BASE, fn });
const texts = (w: World) => w.sends.map((s) => String(s.payload?.text ?? s.type));
// campos de ESTADO da conversa (ignora colunas que o fake completa ao regravar o arquivo: updated_at etc.)
const core = (c: Record<string, unknown>) => JSON.stringify({
  status: c.status, current_block_id: c.current_block_id, current_flow_id: c.current_flow_id, bot_locked_until: c.bot_locked_until,
  last_message_at: c.last_message_at, flow_completed: c.flow_completed, flow_variables: c.flow_variables, metadata: c.metadata,
});
const settle = (ms = 700) => new Promise((r) => setTimeout(r, ms));
const keyOf = (c: Record<string, unknown>) => {
  const wi = (c.flow_variables as { __waiting_input?: { question_sent_at?: string } }).__waiting_input;
  return { flow_id: c.current_flow_id as string, block_id: c.current_block_id as string, wait_key: `${c.current_flow_id}|${c.current_block_id}|${wi?.question_sent_at ?? ""}` };
};
const reply = (phone: string, id: string, chip = "A") => ({
  instance: `chip${chip}`, token: `tok-${chip}`, event: "messages",
  chat: { wa_chatid: `${phone}@s.whatsapp.net`, wa_isGroup: false },
  message: { chatid: `${phone}@s.whatsapp.net`, sender: `${phone}@s.whatsapp.net`, sender_pn: `${phone}@s.whatsapp.net`, fromMe: false, isGroup: false, messageid: `5500000099${chip.charCodeAt(0) % 10}:3EB0R${id}`, text: "Quiero si", messageType: "ExtendedTextMessage", senderName: "Fulano" },
});

// =====================================================================
// 1) O defeito: espera com timeout e SEM saída de timeout
// =====================================================================
t("PUBLICADO: timeout sem saída => 200 timeout_no_path, nada enviado, lock e espera INTACTOS e last_message_at é tocado (o defeito)", async () => {
  const c = waiting({ id: "conv-nopath", block: "b5" });
  const w = await world({ webhook: "base", seed: seedOf([c]) });
  try {
    const before = w.conv("conv-nopath");
    const r1 = await w.resume("conv-nopath");
    const r2 = await w.resume("conv-nopath");
    assertEquals(r1.body, { ok: true, error: "timeout_no_path" });
    assertEquals(r2.body, { ok: true, error: "timeout_no_path" });
    await settle();
    const after = w.conv("conv-nopath");
    assertEquals(w.sends.length, 0);
    assertEquals(after.bot_locked_until, before.bot_locked_until); // continua VENCIDO => reescolhido a cada ciclo
    assert(after.last_message_at !== before.last_message_at, "a retomada sem efeito atualiza last_message_at");
  } finally { await w.close(); }
});

t("CORRIGIDO: timeout sem saída => libera o timer SEM enviar, SEM avançar bloco e SEM tocar em last_message_at; a espera segue aberta", async () => {
  const c = waiting({ id: "conv-nopath", block: "b5" });
  const w = await world({ webhook: "patched", seed: seedOf([c]) });
  try {
    const before = w.conv("conv-nopath");
    const r = await w.resume("conv-nopath", keyOf(before));
    assertEquals(r.body, { ok: true, skipped: "timeout_no_path_released" });
    await settle();
    const after = w.conv("conv-nopath") as { bot_locked_until: string | null; current_block_id: string; last_message_at: string; status: string; flow_variables: { __waiting_input: Record<string, unknown>; waiting_for_input: boolean } };
    assertEquals(w.sends.length, 0);
    assertEquals(after.bot_locked_until, null); // sai da fila de retomada
    assertEquals(after.current_block_id, "b5");
    assertEquals(after.last_message_at, (before as { last_message_at: string }).last_message_at);
    assertEquals(after.status, "bot_active");
    assertEquals(after.flow_variables.__waiting_input.timeout_handled_reason, "no_timeout_path");
    assertEquals(after.flow_variables.waiting_for_input, true);
    assertFalse("claimed_by" in after.flow_variables.__waiting_input);
  } finally { await w.close(); }
});

t("CORRIGIDO: depois de liberada a espera sem saída, a RESPOSTA do lead ainda avança o funil pelo caminho de sucesso", async () => {
  const c = waiting({ id: "conv-nopath", block: "b5", phone: "5511999900001" });
  const w = await world({ webhook: "patched", seed: seedOf([c]) });
  try {
    await w.resume("conv-nopath", keyOf(w.conv("conv-nopath")));
    const r = await w.post(reply("5511999900001", "1"));
    await settle(900);
    assertEquals(r.status, 200);
    assertEquals(texts(w), ["APOS_RESPOSTA"]);
  } finally { await w.close(); }
});

// =====================================================================
// 2) Timeout COM saída: comportamento igual ao publicado
// =====================================================================
t("timeout COM saída: mesma mensagem de timeout, uma única vez, mesmo bloco final que a versão publicada; sem marcador residual", async () => {
  const mk = () => waiting({ id: "conv-ok", block: "b2" });
  const b = await world({ webhook: "base", seed: seedOf([mk()]) });
  const p = await world({ webhook: "patched", seed: seedOf([mk()]) });
  try {
    await b.resume("conv-ok");
    await p.resume("conv-ok", keyOf(p.conv("conv-ok")));
    await settle(900);
    assertEquals(texts(p), ["TIMEOUT"]);
    assertEquals(texts(p), texts(b));
    const cb = b.conv("conv-ok") as { current_block_id: string; flow_variables: Record<string, unknown>; last_message_at: string };
    const cp = p.conv("conv-ok") as { current_block_id: string; flow_variables: Record<string, unknown>; last_message_at: string };
    assertEquals(cp.current_block_id, cb.current_block_id);
    // quando o timeout ENVIA, a conversa sobe na caixa de entrada como antes (last_message_at avança)
    const seeded = waiting({ id: "conv-ok" }).last_message_at;
    assert(Date.parse(cb.last_message_at) > Date.parse(seeded), "publicado: last_message_at avança quando o timeout envia");
    assert(Date.parse(cp.last_message_at) > Date.parse(seeded), `corrigido: last_message_at deve avançar quando o timeout envia (veio ${cp.last_message_at})`);
    assertEquals(JSON.stringify(cp.flow_variables).includes("claimed_by"), false);
  } finally { await b.close(); await p.close(); }
});

// =====================================================================
// 3) Timeout ANTIGO não age sobre outra espera / outra execução
// =====================================================================
t("timeout antigo: a espera mudou de bloco => stale_resume, NADA enviado e NADA alterado", async () => {
  const c = waiting({ id: "conv-moved", block: "b2" });
  const w = await world({ webhook: "patched", seed: seedOf([c]) });
  try {
    const old = keyOf(w.conv("conv-moved")); // timeout agendado para a espera em b2
    // a conversa seguiu: agora espera em OUTRO bloco (b5), com lock vencido
    const db = w.db();
    const row = (db.webchat_conversations as Record<string, any>[])[0];
    row.current_block_id = "b5";
    row.flow_variables.__waiting_input = { ...row.flow_variables.__waiting_input, block_id: "b5", timeout_next_block_id: null };
    await Deno.writeTextFile(`${TMP}/db-${wseq}.json`, JSON.stringify(db));
    const before = core(w.conv("conv-moved"));
    const r = await w.resume("conv-moved", old);
    await settle();
    assertEquals(r.body, { ok: true, skipped: "stale_resume" });
    assertEquals(w.sends.length, 0);
    assertEquals(core(w.conv("conv-moved")), before);
  } finally { await w.close(); }
});

t("timeout antigo: MESMO bloco mas OUTRA execução/pergunta (question_sent_at diferente) => stale_resume, nada muda", async () => {
  const c = waiting({ id: "conv-rerun", block: "b2" });
  const w = await world({ webhook: "patched", seed: seedOf([c]) });
  try {
    const old = keyOf(w.conv("conv-rerun"));
    const db = w.db();
    const row = (db.webchat_conversations as Record<string, any>[])[0];
    row.flow_variables.__waiting_input.question_sent_at = past(60); // nova pergunta no mesmo bloco
    await Deno.writeTextFile(`${TMP}/db-${wseq}.json`, JSON.stringify(db));
    const before = core(w.conv("conv-rerun"));
    const r = await w.resume("conv-rerun", old);
    await settle();
    assertEquals(r.body, { ok: true, skipped: "stale_resume" });
    assertEquals(w.sends.length, 0);
    assertEquals(core(w.conv("conv-rerun")), before);
  } finally { await w.close(); }
});

t("retomada manual SEM expected_wait (legada) segue funcionando como antes", async () => {
  const c = waiting({ id: "conv-legacy", block: "b2" });
  const w = await world({ webhook: "patched", seed: seedOf([c]) });
  try {
    const r = await w.resume("conv-legacy");
    await settle(900);
    assertEquals(r.body.ok, true);
    assertEquals(texts(w), ["TIMEOUT"]);
  } finally { await w.close(); }
});

// =====================================================================
// 4) Resposta do lead e timeout CONCORRENTES não avançam a mesma espera duas vezes
// =====================================================================
for (let round = 1; round <= 4; round++) {
  t(`concorrência (rodada ${round}): resposta do lead + timeout ao mesmo tempo => exatamente UM caminho (nunca os dois)`, async () => {
    const phone = `55119999${String(10000 + round)}`;
    const c = waiting({ id: "conv-race", block: "b2", phone });
    const w = await world({ webhook: "patched", seed: seedOf([c]) });
    try {
      const exp = keyOf(w.conv("conv-race"));
      const [a, b] = await Promise.all([w.post(reply(phone, `race${round}`)), w.resume("conv-race", round % 2 ? exp : undefined)]);
      await settle(1200);
      const t_ = texts(w);
      const both = t_.includes("TIMEOUT") && t_.includes("APOS_RESPOSTA");
      assertFalse(both, `AVANÇO DUPLO: ${JSON.stringify(t_)} (${JSON.stringify([a.body, b.body])})`);
      assertEquals(t_.length, 1, `esperado 1 caminho, veio ${JSON.stringify(t_)} :: resposta=${JSON.stringify(a.body)} timeout=${JSON.stringify(b.body)}`);
      assertEquals(JSON.stringify(w.conv("conv-race")).includes("claimed_by"), false);
    } finally { await w.close(); }
  });
}

t("CARACTERIZAÇÃO: na versão PUBLICADA, resposta do lead e timeout simultâneos podem DESCARTAR a resposta (a guarda limpa a espera enquanto a resposta ainda é processada)", async () => {
  let lost = 0;
  const rounds = 4;
  for (let round = 1; round <= rounds; round++) {
    const phone = `55119999${String(20000 + round)}`;
    const w = await world({ webhook: "base", seed: seedOf([waiting({ id: "conv-race", block: "b2", phone })]) });
    try {
      const [a, b] = await Promise.all([w.post(reply(phone, `racebase${round}`)), w.resume("conv-race")]);
      await settle(1200);
      void a; void b;
      if (texts(w).length === 0) lost++;
    } finally { await w.close(); }
  }
  assert(lost >= 1, `a versão publicada perdeu a resposta em ${lost}/${rounds} rodadas`);
});

t("LIGAÇÃO da reivindicação (1/2): espera já reivindicada pela RESPOSTA do lead => o timeout recua sem enviar nem alterar nada", async () => {
  const c = waiting({ id: "conv-claimed-a", block: "b2" });
  (c.flow_variables.__waiting_input as Record<string, unknown>).claimed_by = "answer";
  (c.flow_variables.__waiting_input as Record<string, unknown>).claimed_at = new Date().toISOString();
  const w = await world({ webhook: "patched", seed: seedOf([c]) });
  try {
    const before = core(w.conv("conv-claimed-a"));
    const r = await w.resume("conv-claimed-a", keyOf(w.conv("conv-claimed-a")));
    await settle();
    assertEquals(r.body, { ok: true, skipped: "wait_already_claimed" });
    assertEquals(w.sends.length, 0);
    assertEquals(core(w.conv("conv-claimed-a")), before);
  } finally { await w.close(); }
});

t("LIGAÇÃO da reivindicação (2/2): espera já reivindicada pelo TIMEOUT => a resposta do lead não avança a mesma espera de novo", async () => {
  const phone = "5511999900077";
  const c = waiting({ id: "conv-claimed-t", block: "b2", phone });
  (c.flow_variables.__waiting_input as Record<string, unknown>).claimed_by = "timeout";
  (c.flow_variables.__waiting_input as Record<string, unknown>).claimed_at = new Date().toISOString();
  const w = await world({ webhook: "patched", seed: seedOf([c]) });
  try {
    const r = await w.post(reply(phone, "claimed"));
    await settle(900);
    assertEquals(r.body.skipped, "wait_already_claimed");
    assertEquals(w.sends.length, 0);
  } finally { await w.close(); }
});

t("reivindicação ÓRFÃ (expirada) não trava a espera: a resposta do lead avança normalmente", async () => {
  const phone = "5511999900078";
  const c = waiting({ id: "conv-claimed-old", block: "b2", phone });
  (c.flow_variables.__waiting_input as Record<string, unknown>).claimed_by = "timeout";
  (c.flow_variables.__waiting_input as Record<string, unknown>).claimed_at = past(3600);
  const w = await world({ webhook: "patched", seed: seedOf([c]) });
  try {
    await w.post(reply(phone, "orfa"));
    await settle(900);
    assertEquals(texts(w), ["APOS_RESPOSTA"]);
  } finally { await w.close(); }
});

// =====================================================================
// 5) Timeout automático COMPLETO: cron real + webhook real
// =====================================================================
const CRON_ALL = { FUNNEL_RESUME_MODE: "all", FUNNEL_RESUME_PER_CHIP: "2", FUNNEL_RESUME_HARD_CAP: "20" };

function incidentSeed() {
  // conexões A e B: conversas problemáticas (sem saída) à frente da fila; C, D, E: conversas normais mais novas
  const poison = [0, 1, 2, 3, 4, 5].map((i) => waiting({ id: `poison-${i}`, chip: i % 2 ? "B" : "A", block: "b5", expiredMin: 2000 - i }));
  const normal = [0, 1, 2, 3, 4, 5].map((i) => waiting({ id: `normal-${i}`, chip: ["C", "D", "E"][i % 3], block: "b2", expiredMin: 600 - i }));
  return { poison, normal };
}

t("TIMEOUT AUTOMÁTICO COMPLETO: problemáticas na frente da fila NÃO impedem as demais; cada espera avança uma única vez", async () => {
  const { poison, normal } = incidentSeed();
  const w = await world({ webhook: "patched", seed: seedOf([...poison, ...normal]), cronEnv: CRON_ALL });
  try {
    const r1 = await w.cron();
    await settle(1500);
    assertEquals(r1.status, 200);
    // já no 1º ciclo as conexões C, D, E foram atendidas (antes: nenhuma)
    const done1 = normal.filter((c) => w.conv(c.id).bot_locked_until === null || (w.conv(c.id) as { current_block_id: string }).current_block_id !== "b2");
    assert(done1.length >= 3, `normais atendidas no 1º ciclo: ${done1.length}`);
    for (let i = 0; i < 4; i++) { await w.cron(); await settle(900); }
    // todas as normais receberam EXATAMENTE uma mensagem de timeout
    assertEquals(texts(w).filter((x) => x === "TIMEOUT").length, normal.length);
    // as problemáticas foram liberadas sem mensagem alguma
    for (const p of poison) assertEquals(w.conv(p.id).bot_locked_until, null);
    assertEquals(texts(w).length, normal.length);
    // ciclos extras não repetem nada (idempotente)
    const sent = w.sends.length;
    await w.cron(); await settle(900);
    assertEquals(w.sends.length, sent);
  } finally { await w.close(); }
});

t("TIMEOUT AUTOMÁTICO com o webhook PUBLICADO: a falha repetida de uma conversa é limitada, diagnosticada e NÃO trava as demais", async () => {
  const { poison, normal } = incidentSeed();
  const w = await world({ webhook: "base", seed: seedOf([...poison, ...normal]), cronEnv: { ...CRON_ALL, FUNNEL_RESUME_MAX_ATTEMPTS: "1" } });
  try {
    const r1 = await w.cron();
    await settle(1500);
    assert((r1.body.outcomes as Record<string, number>).failed >= 1);
    for (let i = 0; i < 4; i++) { await w.cron(); await settle(900); }
    assertEquals(texts(w).filter((x) => x === "TIMEOUT").length, normal.length); // as boas avançaram
    const failures = poison.map((p) => w.conv(p.id).metadata as { resume?: { attempts: number; quarantined: boolean; last_error: string } });
    const quarantined = failures.filter((m) => m.resume?.quarantined);
    assert(quarantined.length >= 2, "problemáticas tentadas foram para a quarentena com diagnóstico");
    for (const m of quarantined) { assertEquals(m.resume!.last_error, "error:timeout_no_path"); assertEquals(m.resume!.attempts, 1); }
    // quarentena: não são mais escolhidas
    const calls = w.sends.length;
    await w.cron(); await settle(600);
    assertEquals(w.sends.length, calls);
  } finally { await w.close(); }
});

// =====================================================================
// 6) Ativação controlada / passivo preservado
// =====================================================================
t("PADRÃO SEGURO: cron sem configuração não processa NADA — banco byte a byte inalterado", async () => {
  const { poison, normal } = incidentSeed();
  const w = await world({ webhook: "patched", seed: seedOf([...poison, ...normal]), cronEnv: {} });
  try {
    const before = JSON.stringify(w.db());
    const r = await w.cron();
    await settle(600);
    assertEquals(r.status, 200);
    assertEquals(r.body.processed, 0);
    assertEquals(r.body.mode, "allowlist");
    assertEquals(JSON.stringify(w.db()), before);
    assertEquals(w.sends.length, 0);
  } finally { await w.close(); }
});

t("ATIVAÇÃO CONTROLADA: com UMA conversa na allowlist só ela avança; as demais seguem intocadas", async () => {
  const { poison, normal } = incidentSeed();
  const target = normal[2];
  const w = await world({ webhook: "patched", seed: seedOf([...poison, ...normal]), cronEnv: { FUNNEL_RESUME_MODE: "allowlist", FUNNEL_RESUME_ALLOWLIST: target.id } });
  try {
    const before = Object.fromEntries([...poison, ...normal].filter((c) => c.id !== target.id).map((c) => [c.id, core(w.conv(c.id))]));
    for (let i = 0; i < 3; i++) { await w.cron(); await settle(900); }
    assertEquals(texts(w), ["TIMEOUT"], `sends=${JSON.stringify(texts(w))}`);
    assertEquals(w.sends[0].to, target.visitor_phone);
    for (const [id, snap] of Object.entries(before)) assertEquals(core(w.conv(id)), snap, `${id} foi alterada`);
  } finally { await w.close(); }
});

t("modo fresh: o passivo antigo (vencido há horas) nunca é lido nem processado; só timeouts recentes", async () => {
  const old = incidentSeed();
  const recent = [waiting({ id: "recent-1", chip: "C", block: "b2", expiredMin: 5 }), waiting({ id: "recent-2", chip: "D", block: "b2", expiredMin: 20 }), waiting({ id: "stale-31", chip: "E", block: "b2", expiredMin: 31 })];
  const w = await world({ webhook: "patched", seed: seedOf([...old.poison, ...old.normal, ...recent]), cronEnv: { FUNNEL_RESUME_MODE: "fresh", FUNNEL_RESUME_MAX_STALE_MINUTES: "30" } });
  try {
    const untouched = Object.fromEntries([...old.poison, ...old.normal, recent[2]].map((c) => [c.id, core(w.conv(c.id))]));
    for (let i = 0; i < 3; i++) { await w.cron(); await settle(900); }
    assertEquals(texts(w).filter((x) => x === "TIMEOUT").length, 2);
    for (const [id, snap] of Object.entries(untouched)) assertEquals(core(w.conv(id)), snap, `${id} (passivo) foi alterada`);
  } finally { await w.close(); }
});

t("dry_run: só reporta a seleção; webhook não é chamado e o banco não muda", async () => {
  const { poison, normal } = incidentSeed();
  const w = await world({ webhook: "patched", seed: seedOf([...poison, ...normal]), cronEnv: { ...CRON_ALL, FUNNEL_RESUME_DRY_RUN: "true" } });
  try {
    const before = JSON.stringify(w.db());
    const r = await w.cron();
    await settle(500);
    assertEquals(r.body.dry_run, true);
    assert((r.body.selected as number) > 0);
    assertEquals(JSON.stringify(w.db()), before);
    assertEquals(w.sends.length, 0);
  } finally { await w.close(); }
});

Deno.test("baseline publicado (BASE_REF) disponível para a comparação", () => {
  assert(HAS_BASE, `commit ${BASE_REF} não encontrado: os testes comparativos foram IGNORADOS`);
});
