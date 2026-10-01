// Teste COMPORTAMENTAL do fluxo automático COMPLETO para contato identificado só
// por LID: entrada -> "Aguarda resposta" -> retomada por timeout (o que o cron
// aciona) -> resposta do lead. Compara a versão publicada com a corrigida.
//
//   deno test --allow-import --allow-read --allow-write --allow-run --allow-env \
//     --allow-net=127.0.0.1 uazapi-webhook.lid-flow.behavior.test.ts
//
// O uazapi-webhook REAL roda como processo com mini-banco em memória (que reproduz
// a coluna gerada visitor_phone_normalized e o DEFAULT created_at do schema real)
// e SUPABASE_URL apontando para um servidor local que captura cada chamada a
// /functions/v1/uazapi-send. Rede limitada a 127.0.0.1. Nada é enviado de verdade.
//
// LIMITE: o teste exercita a ação `resume_funnel` do webhook (a mesma que o
// funnel-resume-cron chama). Ele NÃO prova que o cron seleciona a conversa: em
// produção a fila do cron está bloqueada para a organização inteira (ver relatório).

import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.208.0/assert/mod.ts";

const BASE_REF = "7c2ce81"; // uazapi-webhook publicado
const HERE = new URL(".", import.meta.url);
const FN = new URL("../uazapi-webhook/", HERE);
const PATCHED = new URL("index.ts", FN).pathname;
const BASELINE = new URL(".baseline-flow-index.ts", FN).pathname;
const IMPORT_MAP = new URL("send-routing-harness/import_map.json", HERE).pathname;
const TMP = await Deno.makeTempDir({ prefix: "webhook-lid-flow-" });

const SERVICE_KEY = "fake-service-key-not-real";
const TOKEN = "tok-test";
const LID_DIGITS = "900000000000001";
const LID = `${LID_DIGITS}@lid`;
const PHONE = "5511999990001";

const INSTANCE = {
  id: "inst-1", organization_id: "org-1", name: "chipx", instance_token: TOKEN, provider: "uazapi",
  phone_number: "5500000000999", status: "connected", is_active: true, archived_at: null, default_funnel_id: "fun-1",
};
// Estrutura do funil real: mensagem -> "Aguarda resposta" (timeout) -> mensagem de timeout / mensagem após resposta
const FUNNEL = {
  id: "fun-1", organization_id: "org-1", start_block_id: "b1", channels: ["whatsapp"], allow_reentry: true, status: "active", name: "f",
  flow_blocks: [
    { id: "b1", type: "message", data: { content: "Hola 1", delay_ms: 0, show_typing: false }, next_block_id: "b2" },
    { id: "b2", type: "wait_response", data: { timeout_enabled: true, timeout_unit: "seconds", timeout_value: 5, wait_indefinitely: false, message_buffer_enabled: false, timeout_next_block_id: "b3" }, next_block_id: "b4" },
    { id: "b3", type: "message", data: { content: "TIMEOUT", delay_ms: 0, show_typing: false }, next_block_id: null },
    { id: "b4", type: "message", data: { content: "APOS_RESPOSTA", delay_ms: 0, show_typing: false }, next_block_id: null },
  ],
};

async function loadBaseline(): Promise<boolean> {
  try {
    const out = await new Deno.Command("git", { args: ["show", `${BASE_REF}:supabase/functions/uazapi-webhook/index.ts`], stdout: "piped", stderr: "null" }).output();
    if (!out.success) return false;
    await Deno.writeFile(BASELINE, out.stdout);
    return true;
  } catch (_e) {
    return false;
  }
}
const HAS_BASE = await loadBaseline();
globalThis.addEventListener("unload", () => {
  try { Deno.removeSync(BASELINE); } catch (_e) { /* ok */ }
  try { Deno.removeSync(TMP, { recursive: true }); } catch (_e) { /* ok */ }
});

// ---------- payloads ----------
const base = { instance: "chipx", token: TOKEN, event: "messages" };
const inbound = (chatid: string, id: string, text: string, pn: string | null = null) => ({
  ...base,
  chat: { wa_chatid: chatid, wa_chatlid: chatid.endsWith("@lid") ? chatid : "900000000000077@lid", wa_isGroup: false },
  message: { chatid, sender: chatid, sender_pn: pn, sender_lid: null, fromMe: false, isGroup: false, messageid: `5500000000999:3EB0F${id}`, text, messageType: "ExtendedTextMessage", senderName: "Fulano" },
});
const inboundLid = (id: string, text = "¡Hola! Quiero más información") => inbound(LID, id, text);

// conversa JÁ EXISTENTE, esperando resposta com o timeout vencido (formato gerado pelo próprio handler)
function seededConv(identifier: string, metadata: Record<string, unknown>) {
  const past = (s: number) => new Date(Date.now() - s * 1000).toISOString();
  return {
    id: "conv-seed", organization_id: "org-1", visitor_id: "visitor-seed", channel: "whatsapp", status: "bot_active",
    visitor_phone: identifier, visitor_name: "Fulano", connection_id: "inst-1", evolution_instance_id: "inst-1",
    last_message_at: past(3600), lead_id: "lead-seed", current_flow_id: "fun-1", current_block_id: "b2", flow_completed: false,
    flow_source: "funnel", created_at: past(7200), metadata, bot_locked_until: past(1800), unread_count_agents: 0,
    flow_variables: {
      nome: "Fulano", telefone: identifier, "__consumed_input_message_ids": [], resposta: "waiting...", waiting_for_input: true,
      "__waiting_input": {
        block_id: "b2", variable_name: "resposta", question_sent_at: past(3500), question_text: "", timeout_at: past(1800), is_timeout: false,
        success_next_block_id: "b4", timeout_next_block_id: "b3", question_sent: true, answered: false, answer_text: null, answered_at: null,
        trigger_message_id: "5500000000999:3EB0SEED",
      },
      waiting_question_sent_at: past(3500),
    },
  };
}
const seededLead = (identifier: string) => ({ id: "lead-seed", organization_id: "org-1", name: "Fulano", phone: identifier, connection_id: "inst-1" });

// ---------- execução ----------
interface SendBody { type: string; to: string; organization_id: string; instance_id: string; payload: Record<string, unknown> }
type Step =
  | { post: unknown }
  | { sleep: number }
  | { resume: true; times?: number };
interface Out { sends: SendBody[]; responses: { status: number; body: unknown }[]; state: Record<string, Record<string, unknown>[]> }

let seq = 0;
async function run(version: "base" | "patched", steps: Step[], seed: Record<string, unknown[]> = {}): Promise<Out> {
  const sends: SendBody[] = [];
  const fake = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (r) => {
    const path = new URL(r.url).pathname;
    const b = r.method === "POST" ? await r.json().catch(() => ({})) : {};
    if (path.includes("/functions/v1/uazapi-send")) sends.push(b as SendBody);
    return new Response(JSON.stringify({ success: true, message: "ok", debug: {} }), { headers: { "content-type": "application/json" } });
  });
  const fport = (fake.addr as Deno.NetAddr).port;
  const l = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const port = (l.addr as Deno.NetAddr).port;
  l.close();
  const id = ++seq;
  const stateFile = `${TMP}/state-${id}.json`;
  const proc = new Deno.Command(Deno.execPath(), {
    args: ["run", "--cached-only", "--no-lock", "--no-check", "--allow-net=127.0.0.1", "--allow-env", "--allow-read", `--allow-write=${TMP}`,
      `--import-map=${IMPORT_MAP}`, version === "base" ? BASELINE : PATCHED],
    env: {
      SUPABASE_URL: `http://127.0.0.1:${fport}`, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${port}`,
      FAKE_STATE_FILE: stateFile,
      FAKE_TABLE_ROWS: JSON.stringify({ evolution_instances: [INSTANCE], capture_funnels: [FUNNEL], ...seed }),
    },
    clearEnv: true, stdout: "null", stderr: "null",
  }).spawn();
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) { try { await (await fetch(url, { method: "OPTIONS" })).body?.cancel(); break; } catch (_e) { await new Promise((r) => setTimeout(r, 150)); } }
  const readState = async () => { try { return JSON.parse(await Deno.readTextFile(stateFile)); } catch (_e) { return {}; } };
  const responses: Out["responses"] = [];
  try {
    for (const st of steps) {
      if ("sleep" in st) { await new Promise((r) => setTimeout(r, st.sleep)); continue; }
      if ("resume" in st) {
        const state = await readState();
        const conv = (state.webchat_conversations ?? [])[0] ?? (seed.webchat_conversations as { id: string }[] | undefined)?.[0];
        for (let i = 0; i < (st.times ?? 1); i++) {
          const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${SERVICE_KEY}` }, body: JSON.stringify({ action: "resume_funnel", conversationId: conv!.id }) });
          responses.push({ status: r.status, body: await r.json().catch(() => null) });
        }
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(st.post) });
      const text = await r.text();
      let body: unknown = text;
      try { body = JSON.parse(text); } catch (_e) { /* texto */ }
      responses.push({ status: r.status, body });
      await new Promise((r) => setTimeout(r, 500));
    }
    return { sends: [...sends], responses, state: await readState() };
  } finally {
    try { proc.kill("SIGTERM"); } catch (_e) { /* ok */ }
    await proc.status;
    await fake.shutdown();
  }
}

const t = (name: string, fn: () => Promise<void>) => Deno.test({ name, ignore: !HAS_BASE, fn });
const texts = (o: Out) => o.sends.map((s) => String(s.payload?.text ?? s.type));
const tos = (o: Out) => o.sends.map((s) => s.to);
const conv = (o: Out) => (o.state.webchat_conversations ?? [])[0];
const resp = (o: Out) => JSON.stringify(o.responses);
const noEvidence = { sleepFlow: [{ post: inboundLid("1") }, { sleep: 5400 }, { resume: true }] as Step[] };

// =====================================================================
// 1) Fluxo completo de contato NOVO só-LID
// =====================================================================
t("PUBLICADA: fluxo completo (entrada -> aguarda -> timeout) entrega SEMPRE os dígitos do LID e não guarda evidência", async () => {
  const b = await run("base", noEvidence.sleepFlow);
  assertEquals(texts(b), ["Hola 1", "TIMEOUT"]);
  assertEquals(tos(b), [LID_DIGITS, LID_DIGITS]);
  assertEquals(((conv(b).metadata ?? {}) as Record<string, unknown>).wa_lid, undefined);
});

t("CORRIGIDA: fluxo completo (entrada -> aguarda -> timeout por retomada) entrega `<lid>@lid` em TODOS os envios", async () => {
  const b = await run("base", noEvidence.sleepFlow);
  const p = await run("patched", noEvidence.sleepFlow);
  assertEquals(texts(p), ["Hola 1", "TIMEOUT"]); // mesmas etapas, na mesma ordem
  assertEquals(tos(p), [LID, LID]);
  assertEquals((conv(p).metadata as Record<string, unknown>).wa_lid, LID_DIGITS); // evidência gravada do chatid do provedor
  assertEquals(texts(p), texts(b));
  assertEquals(resp(p), resp(b));
});

t("CORRIGIDA: resposta do lead ao 'Aguarda resposta' continua o funil no `<lid>@lid` (retomada por mensagem)", async () => {
  const steps: Step[] = [{ post: inboundLid("1") }, { sleep: 2000 }, { post: inboundLid("2", "Quiero si") }];
  const b = await run("base", steps);
  const p = await run("patched", steps);
  assertEquals(texts(p), ["Hola 1", "APOS_RESPOSTA"]);
  assertEquals(texts(p), texts(b));
  assertEquals(tos(p), [LID, LID]);
  assertEquals(tos(b), [LID_DIGITS, LID_DIGITS]);
});

t("REGRA PRESERVADA: resposta antes de 800 ms da pergunta NÃO libera o 'Aguarda resposta' (nem na publicada nem na corrigida)", async () => {
  const steps: Step[] = [{ post: inboundLid("1") }, { post: inboundLid("2", "Quiero si") }]; // 2ª msg quase imediata
  const b = await run("base", steps);
  const p = await run("patched", steps);
  assertEquals(texts(p), ["Hola 1"]);
  assertEquals(texts(b), ["Hola 1"]);
  assertEquals(conv(p).current_block_id, "b2");
  assertEquals(conv(b).current_block_id, "b2");
  assertEquals(resp(p), resp(b));
});

t("mensagens consecutivas ANTES do timeout não pulam etapas: 'Aguarda resposta' não é liberado por mensagem anterior (igual à publicada)", async () => {
  // a 1ª mensagem do lead é a que ENTRA no funil; não pode liberar o wait que ainda nem foi enviado
  const steps: Step[] = [{ post: inboundLid("1") }];
  const b = await run("base", steps);
  const p = await run("patched", steps);
  assertEquals(texts(p), ["Hola 1"]);
  assertEquals(texts(p), texts(b));
  assert(!texts(p).includes("APOS_RESPOSTA"));
  assertEquals(conv(p).current_block_id, conv(b).current_block_id);
  assertEquals(conv(p).current_block_id, "b2");
});

t("retomada REPETIDA (cron + manual): mesma contagem de envios que a publicada; a mensagem de timeout sai uma única vez", async () => {
  const steps: Step[] = [{ post: inboundLid("1") }, { sleep: 5400 }, { resume: true, times: 2 }];
  const b = await run("base", steps);
  const p = await run("patched", steps);
  assertEquals(texts(p), texts(b));
  assertEquals(texts(p).filter((x) => x === "TIMEOUT").length, 1);
  assertEquals(tos(p).every((x) => x === LID), true);
});

// =====================================================================
// 2) Registros JÁ EXISTENTES (só dígitos): sem evidência não há inferência
// =====================================================================
const resume: Step[] = [{ resume: true }];

t("EXISTENTE só-dígitos SEM evidência: a retomada NÃO inventa @lid (nem por comprimento) — idêntico à publicada", async () => {
  const seed = { webchat_conversations: [seededConv(LID_DIGITS, {})], leads: [seededLead(LID_DIGITS)] };
  const b = await run("base", resume, seed);
  const p = await run("patched", resume, seed);
  assertEquals(texts(b), ["TIMEOUT"]);
  assertEquals(tos(p), [LID_DIGITS]); // 15 dígitos, mas sem prova => continua como estava
  assertEquals(JSON.stringify(p.sends), JSON.stringify(b.sends));
});

t("EXISTENTE com EVIDÊNCIA (metadata.wa_lid == identificador guardado): a retomada entrega `<lid>@lid`", async () => {
  const seed = { webchat_conversations: [seededConv(LID_DIGITS, { wa_lid: LID_DIGITS })], leads: [seededLead(LID_DIGITS)] };
  const b = await run("base", resume, seed);
  const p = await run("patched", resume, seed);
  assertEquals(tos(b), [LID_DIGITS]);
  assertEquals(tos(p), [LID]);
  assertEquals(texts(p), texts(b));
});

t("EXISTENTE só-dígitos: a PRÓXIMA mensagem do contato (chatid @lid do provedor) grava a evidência — cura sem reparo manual", async () => {
  const seed = { webchat_conversations: [seededConv(LID_DIGITS, {})], leads: [seededLead(LID_DIGITS)] };
  const p = await run("patched", [{ post: inboundLid("9", "Quiero si") }], seed);
  assertEquals(((conv(p).metadata ?? {}) as Record<string, unknown>).wa_lid, LID_DIGITS);
  const b = await run("base", [{ post: inboundLid("9", "Quiero si") }], seed);
  assertEquals(((conv(b).metadata ?? {}) as Record<string, unknown>).wa_lid, undefined);
});

t("EXISTENTE de TELEFONE: a próxima mensagem NÃO grava wa_lid (evento de telefone)", async () => {
  const seed = { webchat_conversations: [seededConv(PHONE, {})], leads: [seededLead(PHONE)] };
  const p = await run("patched", [{ post: inbound(`${PHONE}@s.whatsapp.net`, "8", "oi", `${PHONE}@s.whatsapp.net`) }], seed);
  assertEquals(((conv(p).metadata ?? {}) as Record<string, unknown>).wa_lid, undefined);
});

t("EXISTENTE de TELEFONE: retomada idêntica à publicada (nenhum @lid)", async () => {
  const seed = { webchat_conversations: [seededConv(PHONE, {})], leads: [seededLead(PHONE)] };
  const b = await run("base", resume, seed);
  const p = await run("patched", resume, seed);
  assertEquals(JSON.stringify(p.sends), JSON.stringify(b.sends));
  assertEquals(tos(p), [PHONE]);
});

t("EXISTENTE de TELEFONE que também tem um LID como alias (wa_lid != telefone guardado): continua no telefone", async () => {
  const seed = { webchat_conversations: [seededConv(PHONE, { wa_lid: LID_DIGITS })], leads: [seededLead(PHONE)] };
  const b = await run("base", resume, seed);
  const p = await run("patched", resume, seed);
  assertEquals(JSON.stringify(p.sends), JSON.stringify(b.sends));
  assertFalse(tos(p).some((x) => x.includes("@lid")));
});

t("EXISTENTE com wa_lid DIFERENTE dos dígitos guardados (evidência de outro contato): não usa o @lid", async () => {
  const seed = { webchat_conversations: [seededConv(LID_DIGITS, { wa_lid: "900000000000002" })], leads: [seededLead(LID_DIGITS)] };
  const p = await run("patched", resume, seed);
  assertEquals(tos(p), [LID_DIGITS]);
});

// =====================================================================
// 3) Autorização e isolamento da retomada
// =====================================================================
t("retomada SEM credencial interna é recusada (401) e não envia nada — igual à publicada", async () => {
  // o runner sempre manda a credencial; aqui testamos direto um POST sem ela
  const seed = { webchat_conversations: [seededConv(LID_DIGITS, { wa_lid: LID_DIGITS })], leads: [seededLead(LID_DIGITS)] };
  for (const version of ["base", "patched"] as const) {
    const sends: unknown[] = [];
    const fake = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (r) => { if (new URL(r.url).pathname.includes("uazapi-send")) sends.push(await r.json().catch(() => ({}))); return new Response("{}"); });
    const l = Deno.listen({ hostname: "127.0.0.1", port: 0 }); const port = (l.addr as Deno.NetAddr).port; l.close();
    const proc = new Deno.Command(Deno.execPath(), {
      args: ["run", "--cached-only", "--no-lock", "--no-check", "--allow-net=127.0.0.1", "--allow-env", "--allow-read", `--allow-write=${TMP}`, `--import-map=${IMPORT_MAP}`, version === "base" ? BASELINE : PATCHED],
      env: { SUPABASE_URL: `http://127.0.0.1:${(fake.addr as Deno.NetAddr).port}`, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${port}`, FAKE_TABLE_ROWS: JSON.stringify({ evolution_instances: [INSTANCE], capture_funnels: [FUNNEL], ...seed }) },
      clearEnv: true, stdout: "null", stderr: "null",
    }).spawn();
    const url = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await (await fetch(url, { method: "OPTIONS" })).body?.cancel(); break; } catch (_e) { await new Promise((r) => setTimeout(r, 150)); } }
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer credencial-errada" }, body: JSON.stringify({ action: "resume_funnel", conversationId: "conv-seed" }) });
      assertEquals(r.status, 401);
      await r.body?.cancel();
      await new Promise((r) => setTimeout(r, 300));
      assertEquals(sends.length, 0);
    } finally {
      try { proc.kill("SIGTERM"); } catch (_e) { /* ok */ }
      await proc.status;
      await fake.shutdown();
    }
  }
});

Deno.test("baseline publicado (BASE_REF) disponível para a comparação", () => {
  assert(HAS_BASE, `commit ${BASE_REF} não encontrado: os testes comparativos foram IGNORADOS`);
});
