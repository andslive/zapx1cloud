// Teste COMPORTAMENTAL do roteamento de destino no uazapi-send.
//
//   deno test --allow-import --allow-read --allow-write --allow-run --allow-env \
//     --allow-net=127.0.0.1 uazapi-send.recipient.behavior.test.ts
//
// O uazapi-send REAL roda como processo, com `@supabase/supabase-js` trocado por
// um fake em memória (import map) e a rede limitada a 127.0.0.1, onde um
// servidor UazAPI FALSO registra exatamente o que o CRM envia. Os mesmos
// cenários rodam contra a versão publicada (BASE_REF) e a corrigida.
//
// O servidor falso modela o contrato DOCUMENTADO da UazAPI (POST /send/*:
// `number` e `text` obrigatórios; `number` = telefone internacional ou ID com
// sufixo @s.whatsapp.net/@lid/@g.us). É um MODELO, não captura de produção; as
// asserções principais são sobre o que o CRM ENVIA, que é o que controlamos.
// Nada aqui envia mensagem real. Identificadores 100% sintéticos.

import { assert, assertEquals, assertFalse, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

// O uazapi-send PUBLICADO é o do commit de sincronização C1 (bundle baixado da produção), não o do 7c2ce81.
const BASE_REF = "08604e1";
const HERE = new URL(".", import.meta.url);
const FN = new URL("../uazapi-send/", HERE);
const PATCHED = new URL("index.ts", FN).pathname;
const BASELINE = new URL(".baseline-index.ts", FN).pathname;
const IMPORT_MAP = new URL("send-routing-harness/import_map.json", HERE).pathname;
const TMP = await Deno.makeTempDir({ prefix: "send-routing-" });

const ORG = "org-1";
const INSTANCE = { id: "inst-1", organization_id: ORG, name: "chipx", instance_token: "tok-test", provider: "uazapi", phone_number: "5500000000999", status: "connected" };
const LID = "900000000000001@lid"; // 15 dígitos, formato observado em produção

async function loadBaseline(): Promise<boolean> {
  try {
    const out = await new Deno.Command("git", { args: ["show", `${BASE_REF}:supabase/functions/uazapi-send/index.ts`], stdout: "piped", stderr: "null" }).output();
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

// ---------- UazAPI falsa (modelo do contrato documentado) ----------
interface Req { method: string; path: string; body: Record<string, unknown> }
const VALID_NUMBER = /^(\d{8,13}|\d{5,}@(s\.whatsapp\.net|lid|g\.us))$/i;

function startFakeUazapi() {
  const reqs: Req[] = [];
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (r) => {
    const path = new URL(r.url).pathname;
    const body = r.method === "POST" ? await r.json().catch(() => ({})) : {};
    reqs.push({ method: r.method, path, body });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
    if (path === "/instance/status") return json({ status: "connected" });
    if (path === "/message/text") return json({ error: "Not found" }, 404); // só /send/* existe neste servidor
    if (path.startsWith("/send/")) {
      if (!body.number || !(body.text || body.file || path !== "/send/text")) return json({ error: "Missing required fields" }, 400);
      if (!VALID_NUMBER.test(String(body.number))) return json({ error: "invalid number" }, 400);
      return json({ id: `MSG${reqs.length}`, status: "sent" });
    }
    return json({ ok: true }); // presence, chat/read etc.
  });
  return { reqs, port: (server.addr as Deno.NetAddr).port, stop: () => server.shutdown() };
}

// ---------- execução do uazapi-send ----------
interface Out { status: number; body: Record<string, unknown>; reqs: Req[]; ms: number }

let seq = 0;
async function send(version: "base" | "patched", payload: Record<string, unknown>, org = ORG, instance: Record<string, unknown> = INSTANCE): Promise<Out> {
  const fake = startFakeUazapi();
  const id = ++seq;
  const sPort = await (async () => { const l = Deno.listen({ hostname: "127.0.0.1", port: 0 }); const p = (l.addr as Deno.NetAddr).port; l.close(); return p; })();
  const rows = {
    evolution_instances: [instance],
    platform_settings: [{ uazapi_url: `http://127.0.0.1:${fake.port}`, uazapi_admin_token: "admin-not-real" }],
  };
  const proc = new Deno.Command(Deno.execPath(), {
    args: ["run", "--cached-only", "--no-lock", "--no-check", "--allow-net=127.0.0.1", "--allow-env", "--allow-read", `--allow-write=${TMP}`,
      `--import-map=${IMPORT_MAP}`, version === "base" ? BASELINE : PATCHED],
    env: {
      SUPABASE_URL: "http://127.0.0.1:9", SUPABASE_SERVICE_ROLE_KEY: "fake-service-key-not-real", DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${sPort}`,
      FAKE_TABLE_ROWS: JSON.stringify(rows), FAKE_CALLS_FILE: `${TMP}/calls-${id}.jsonl`,
    },
    clearEnv: true, stdout: "null", stderr: "null",
  }).spawn();
  const url = `http://127.0.0.1:${sPort}/`;
  for (let i = 0; i < 100; i++) { try { await (await fetch(url, { method: "OPTIONS" })).body?.cancel(); break; } catch (_e) { await new Promise((r) => setTimeout(r, 150)); } }
  const t0 = performance.now();
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organization_id: org, instance_id: "inst-1", ...payload }) });
    const text = await r.text();
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(text); } catch (_e) { body = { raw: text }; }
    await new Promise((r) => setTimeout(r, 150));
    return { status: r.status, body, reqs: [...fake.reqs], ms: performance.now() - t0 };
  } finally {
    try { proc.kill("SIGTERM"); } catch (_e) { /* ok */ }
    await proc.status;
    await fake.stop();
  }
}

const t = (name: string, fn: () => Promise<void>) => Deno.test({ name, ignore: !HAS_BASE, fn });
const sends = (o: Out) => o.reqs.filter((r) => r.path.startsWith("/send/"));
const numbersSent = (o: Out) => o.reqs.map((r) => r.body.number).filter((n) => n !== undefined) as string[];
// sequência comparável (caminho + corpo) sem campos voláteis
// (o pipeline de aquecimento sorteia o `delay` de /message/presence entre 2 e 4 s: campo ignorado)
const seqOf = (o: Out) => JSON.stringify(o.reqs.map((r) => {
  const b = { ...r.body };
  if (r.path === "/message/presence") delete b.delay;
  return { m: r.method, p: r.path, b };
}));
const text = (to: string, extra: Record<string, unknown> = {}) => ({ type: "text", to, payload: { text: "Hola", delay: 0, skip_warmup: true, ...extra } });

// =====================================================================
// 1) O defeito na versão publicada (caracterização) e a correção
// =====================================================================
t("PUBLICADA: texto para <lid>@lid chega à UazAPI com `number` em dígitos puros (sem @lid) e falha", async () => {
  const b = await send("base", text(LID));
  assertEquals(b.status, 400);
  assertEquals(b.body.success, false);
  const ns = numbersSent(b);
  assert(ns.length >= 1);
  assert(ns.every((n) => n === "900000000000001"), `esperava dígitos puros, veio ${JSON.stringify(ns)}`);
});

t("PUBLICADA: o `to` já sem sufixo (só dígitos do LID) é indistinguível de telefone — por isso o webhook precisa passar o @lid", async () => {
  const b = await send("base", text("900000000000001"));
  const c = await send("patched", text("900000000000001"));
  assertEquals(seqOf(c), seqOf(b)); // sem sufixo não há como saber: comportamento igual (e falho)
});

t("CORRIGIDA: texto para <lid>@lid chega com `number` = <lid>@lid em todas as tentativas e é enviado", async () => {
  const p = await send("patched", text(LID));
  assertEquals(p.status, 200);
  assertEquals(p.body.success, true);
  const ns = numbersSent(p);
  assert(ns.length >= 1);
  assert(ns.every((n) => n === LID), `number deveria ser o @lid: ${JSON.stringify(ns)}`);
  assertEquals(sends(p).length, 1);
  assertFalse(p.reqs.some((r) => JSON.stringify(r.body).includes('"900000000000001"')), "dígitos puros do LID não podem ir à UazAPI");
  assertFalse(JSON.stringify(p.reqs).includes("s.whatsapp.net"), "LID nunca vira JID de telefone");
});

t("CORRIGIDA: mídia (imagem), presença e pipeline com aquecimento também usam <lid>@lid", async () => {
  const img = await send("patched", { type: "image", to: LID, payload: { url: "https://example.invalid/a.png", caption: "x", skip_warmup: true } });
  const pres = await send("patched", { type: "presence", to: LID, payload: { presence: "composing", delay: 1000, skip_warmup: true } });
  const warm = await send("patched", { type: "text", to: LID, payload: { text: "Hola", delay: 0 } }); // sem skip_warmup => pipeline
  for (const [label, o] of [["imagem", img], ["presença", pres], ["pipeline", warm]] as const) {
    const ns = numbersSent(o);
    assert(ns.length >= 1, `${label}: nenhuma chamada com number`);
    assert(ns.every((n) => n === LID), `${label}: number inesperado ${JSON.stringify(ns)}`);
  }
});

// =====================================================================
// 2) Telefones: comportamento IDÊNTICO ao publicado
// =====================================================================
for (const to of ["5511999999999", "11999999999", "1199999999", "5511999999999@s.whatsapp.net", "+55 (11) 99999-9999", "573001234567"]) {
  t(`telefone ${JSON.stringify(to)}: requisições e resposta idênticas à versão publicada`, async () => {
    const b = await send("base", text(to));
    const p = await send("patched", text(to));
    assertEquals(p.status, b.status);
    assertEquals(seqOf(p), seqOf(b));
    assertEquals(p.body.success, b.body.success);
    assertFalse(numbersSent(p).some((n) => n.includes("@lid")));
  });
}

t("telefone com pipeline de aquecimento e ':device' no JID: requisições idênticas às da versão publicada (jid preservado)", async () => {
  for (const to of ["5511999999999:12@s.whatsapp.net", "5511999999999@s.whatsapp.net", "5511999999999"]) {
    const b = await send("base", { type: "text", to, payload: { text: "Hola", delay: 0 } }); // sem skip_warmup => /chat/read usa o jid
    const p = await send("patched", { type: "text", to, payload: { text: "Hola", delay: 0 } });
    assertEquals(seqOf(p), seqOf(b), `divergiu para ${to}`);
  }
});

t("telefone com mídia e presença: idêntico ao publicado", async () => {
  for (const payload of [
    { type: "image", to: "5511999999999", payload: { url: "https://example.invalid/a.png", caption: "x", skip_warmup: true } },
    { type: "presence", to: "5511999999999@s.whatsapp.net", payload: { presence: "composing", delay: 1000, skip_warmup: true } },
  ]) {
    const b = await send("base", payload);
    const p = await send("patched", payload);
    assertEquals(seqOf(p), seqOf(b));
    assertEquals(p.status, b.status);
  }
});

// =====================================================================
// 3) Isolamento por organização/conexão
// =====================================================================
t("organização divergente: INSTANCE_NOT_FOUND idêntico ao publicado, nenhuma chamada à UazAPI (também para @lid)", async () => {
  for (const to of [LID, "5511999999999"]) {
    const b = await send("base", text(to), "org-2");
    const p = await send("patched", text(to), "org-2");
    assertEquals(p.status, b.status);
    assertEquals((p.body as { step_failed?: string }).step_failed, "INSTANCE_NOT_FOUND");
    assertEquals(p.reqs.length, 0);
    assertEquals(b.reqs.length, 0);
  }
});

t("Fase 20H (código publicado) PRESERVADA: conexão ARQUIVADA continua sem envio — para telefone e para @lid, igual à publicada", async () => {
  const archived = { ...INSTANCE, archived_at: "2026-09-01T00:00:00Z" };
  for (const to of [LID, "5511999999999"]) {
    const b = await send("base", text(to), ORG, archived);
    const p = await send("patched", text(to), ORG, archived);
    assertEquals((b.body as { step_failed?: string }).step_failed, "INSTANCE_NOT_FOUND");
    assertEquals(p.status, b.status);
    assertEquals((p.body as { step_failed?: string }).step_failed, "INSTANCE_NOT_FOUND");
    assertEquals(p.reqs.length, 0);
  }
});

t("o @lid de um contato nunca é reescrito para outro destino (cada LID vai para o seu próprio number)", async () => {
  const a = await send("patched", text("900000000000001@lid"));
  const b = await send("patched", text("900000000000002@lid"));
  assertEquals(numbersSent(a)[0], "900000000000001@lid");
  assertEquals(numbersSent(b)[0], "900000000000002@lid");
  assertNotEquals(numbersSent(a)[0], numbersSent(b)[0]);
});

Deno.test("baseline publicado (BASE_REF) disponível para a comparação", () => {
  assert(HAS_BASE, `commit ${BASE_REF} não encontrado: os testes comparativos foram IGNORADOS`);
});
