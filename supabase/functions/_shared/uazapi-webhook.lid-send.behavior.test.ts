// Teste COMPORTAMENTAL do destino de envio do funil no uazapi-webhook.
//
//   deno test --allow-import --allow-read --allow-write --allow-run --allow-env \
//     --allow-net=127.0.0.1 uazapi-webhook.lid-send.behavior.test.ts
//
// O uazapi-webhook REAL roda como processo, com `@supabase/supabase-js` trocado
// por um mini-banco em memória (import map) e SUPABASE_URL apontando para um
// servidor local que captura cada POST a /functions/v1/uazapi-send — ou seja,
// exatamente o `to` que o funil entrega ao enviador. Rede limitada a 127.0.0.1.
// Os mesmos cenários rodam contra a versão publicada (BASE_REF) e a corrigida.
// Nada aqui envia mensagem real. Identificadores 100% sintéticos, nos formatos
// reais observados (chatid `<15 dígitos>@lid`, sender_pn/sender_lid nulos).

import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.208.0/assert/mod.ts";

const BASE_REF = "7c2ce81";
const HERE = new URL(".", import.meta.url);
const FN = new URL("../uazapi-webhook/", HERE);
const PATCHED = new URL("index.ts", FN).pathname;
const BASELINE = new URL(".baseline-index.ts", FN).pathname;
const IMPORT_MAP = new URL("send-routing-harness/import_map.json", HERE).pathname;
const TMP = await Deno.makeTempDir({ prefix: "webhook-lid-send-" });

const TOKEN = "tok-test";
const LID = "900000000000001@lid";
const LID_DIGITS = "900000000000001";
const PHONE = "5511999990001";

const INSTANCE = {
  id: "inst-1", organization_id: "org-1", name: "chipx", instance_token: TOKEN, provider: "uazapi",
  phone_number: "5500000000999", status: "connected", is_active: true, archived_at: null, default_funnel_id: "fun-1",
};
const FUNNEL = {
  id: "fun-1", organization_id: "org-1", start_block_id: "b1", channels: ["whatsapp"], allow_reentry: true, status: "active", name: "f",
  flow_blocks: [
    { id: "b1", type: "message", data: { content: "Hola 1", delay_ms: 0, show_typing: false }, next_block_id: "b2" },
    { id: "b2", type: "message", data: { content: "Hola 2", delay_ms: 0, show_typing: false }, next_block_id: null },
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
const inboundLid = (id: string, text = "¡Hola! Quiero más información") => ({
  ...base,
  chat: { wa_chatid: LID, wa_chatlid: LID, wa_isGroup: false },
  message: { chatid: LID, sender: LID, sender_pn: null, sender_lid: null, fromMe: false, isGroup: false, messageid: `5500000000999:3EB0LID${id}`, text, messageType: "ExtendedTextMessage", senderName: "Fulano" },
});
const inboundPhone = (id: string) => ({
  ...base,
  chat: { wa_chatid: `${PHONE}@s.whatsapp.net`, wa_chatlid: "900000000000077@lid", wa_isGroup: false },
  message: { chatid: `${PHONE}@s.whatsapp.net`, sender: `${PHONE}@s.whatsapp.net`, sender_pn: `${PHONE}@s.whatsapp.net`, fromMe: false, isGroup: false, messageid: `5500000000999:3EB0PH${id}`, text: "oi", messageType: "ExtendedTextMessage", senderName: "Fulano" },
});
// chatid @lid COM telefone fornecido pelo provedor (sender_pn): hoje o chatid tem precedência na normalização
const inboundLidWithPn = (id: string) => ({
  ...inboundLid(id),
  message: { ...inboundLid(id).message, sender_pn: `${PHONE}@s.whatsapp.net` },
});

// ---------- execução ----------
interface SendBody { type: string; to: string; organization_id: string; instance_id: string; payload: Record<string, unknown> }
interface Out { responses: { status: number; body: unknown }[]; sends: SendBody[] }

let seq = 0;
async function run(version: "base" | "patched", payloads: unknown[]): Promise<Out> {
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
  const proc = new Deno.Command(Deno.execPath(), {
    args: ["run", "--cached-only", "--no-lock", "--no-check", "--allow-net=127.0.0.1", "--allow-env", "--allow-read", `--allow-write=${TMP}`,
      `--import-map=${IMPORT_MAP}`, version === "base" ? BASELINE : PATCHED],
    env: {
      SUPABASE_URL: `http://127.0.0.1:${fport}`, SUPABASE_SERVICE_ROLE_KEY: "fake-service-key-not-real", DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${port}`,
      FAKE_CALLS_FILE: `${TMP}/calls-${id}.jsonl`,
      FAKE_TABLE_ROWS: JSON.stringify({ evolution_instances: [INSTANCE], capture_funnels: [FUNNEL] }),
    },
    clearEnv: true, stdout: "null", stderr: "null",
  }).spawn();
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) { try { await (await fetch(url, { method: "OPTIONS" })).body?.cancel(); break; } catch (_e) { await new Promise((r) => setTimeout(r, 150)); } }
  const responses: Out["responses"] = [];
  try {
    for (const p of payloads) {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
      const text = await r.text();
      let body: unknown = text;
      try { body = JSON.parse(text); } catch (_e) { /* texto */ }
      responses.push({ status: r.status, body });
    }
    await new Promise((r) => setTimeout(r, 400));
  } finally {
    try { proc.kill("SIGTERM"); } catch (_e) { /* ok */ }
    await proc.status;
    await fake.shutdown();
  }
  return { responses, sends };
}

const t = (name: string, fn: () => Promise<void>) => Deno.test({ name, ignore: !HAS_BASE, fn });
const tos = (o: Out) => o.sends.map((s) => s.to);
const withoutTo = (o: Out) => JSON.stringify(o.sends.map((s) => ({ ...s, to: "<to>" })));
const full = (o: Out) => JSON.stringify(o.sends);
const resp = (o: Out) => JSON.stringify(o.responses);

// =====================================================================
t("PUBLICADA: inbound de contato só-LID => o funil entrega ao enviador os dígitos puros do LID (sem @lid), nos 2 blocos", async () => {
  const b = await run("base", [inboundLid("1")]);
  assertEquals(b.sends.length, 2);
  assertEquals(tos(b), [LID_DIGITS, LID_DIGITS]);
});

t("CORRIGIDA: inbound de contato só-LID => o funil entrega `<lid>@lid` nos 2 blocos; todo o resto do envio idêntico", async () => {
  const b = await run("base", [inboundLid("1")]);
  const p = await run("patched", [inboundLid("1")]);
  assertEquals(tos(p), [LID, LID]);
  assertEquals(p.sends.length, b.sends.length);
  assertEquals(withoutTo(p), withoutTo(b)); // mesmos tipos, textos, organização, conexão
  assertEquals(resp(p), resp(b)); // mesma resposta HTTP ao provedor
  assertFalse(p.sends.some((s) => s.to === LID_DIGITS), "dígitos puros do LID não podem ser o destino");
});

t("contato com TELEFONE: envio e resposta idênticos à versão publicada", async () => {
  const b = await run("base", [inboundPhone("1")]);
  const p = await run("patched", [inboundPhone("1")]);
  assertEquals(b.sends.length, 2);
  assertEquals(full(p), full(b));
  assertEquals(resp(p), resp(b));
  assertEquals(tos(p), [PHONE, PHONE]);
  assertFalse(tos(p).some((x) => x.includes("@lid")));
});

t("CARACTERIZAÇÃO: chatid @lid COM sender_pn do provedor — o chatid segue com precedência (comportamento já existente); agora o destino é o @lid em vez dos dígitos do LID", async () => {
  const b = await run("base", [inboundLidWithPn("1")]);
  const p = await run("patched", [inboundLidWithPn("1")]);
  assertEquals(tos(b), [LID_DIGITS, LID_DIGITS]);
  assertEquals(tos(p), [LID, LID]);
  assertEquals(resp(p), resp(b));
});

t("mensagens CONSECUTIVAS do mesmo contato só-LID: mesma sequência de envios e respostas da publicada (só o `to` muda)", async () => {
  const seqs = [inboundLid("1"), inboundLid("2", "¿Cuánto cuesta el recetario?"), inboundLid("3", "Quiero si")];
  const b = await run("base", seqs);
  const p = await run("patched", seqs);
  assertEquals(p.sends.length, b.sends.length);
  assertEquals(withoutTo(p), withoutTo(b));
  assertEquals(resp(p), resp(b));
  assert(p.sends.every((s) => s.to === LID));
});

t("webhook REPETIDO (mesmo messageid duas vezes): mesmo número de envios e mesmas respostas da publicada (dedupe intacto)", async () => {
  const same = [inboundLid("9"), inboundLid("9")];
  const b = await run("base", same);
  const p = await run("patched", same);
  assertEquals(p.sends.length, b.sends.length);
  assertEquals(withoutTo(p), withoutTo(b));
  assertEquals(resp(p), resp(b));
});

t("ISOLAMENTO: token de outra conexão => nenhuma tentativa de envio e resposta igual à publicada (também para @lid)", async () => {
  const wrong = { ...inboundLid("5"), token: "token-de-outra-conexao" };
  const wrongOrg = { ...inboundLid("6"), organization_id: "org-2" };
  const b = await run("base", [wrong, wrongOrg]);
  const p = await run("patched", [wrong, wrongOrg]);
  assertEquals(b.sends.length, 0);
  assertEquals(p.sends.length, 0);
  assertEquals(resp(p), resp(b));
});

t("dois contatos só-LID distintos na mesma conexão: cada um recebe no SEU `@lid` (sem mistura)", async () => {
  const other = (id: string) => {
    const x = inboundLid(id);
    const lid2 = "900000000000002@lid";
    return { ...x, chat: { ...x.chat, wa_chatid: lid2, wa_chatlid: lid2 }, message: { ...x.message, chatid: lid2, sender: lid2 } };
  };
  const p = await run("patched", [inboundLid("1"), other("2")]);
  const set = new Set(tos(p));
  assertEquals(set, new Set([LID, "900000000000002@lid"]));
});

Deno.test("baseline publicado (BASE_REF) disponível para a comparação", () => {
  assert(HAS_BASE, `commit ${BASE_REF} não encontrado: os testes comparativos foram IGNORADOS`);
});
