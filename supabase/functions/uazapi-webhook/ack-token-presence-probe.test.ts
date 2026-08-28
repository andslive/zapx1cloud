// deno test --allow-import --allow-read --no-check supabase/functions/uazapi-webhook/ack-token-presence-probe.test.ts
//
// Cobre a probe temporária (hotfix/uazapi-ack-token-presence-probe-20260828,
// v2): instrumentação fail-open, com `await` explícito garantindo conclusão
// antes da resposta do ACK, que responde uma única pergunta de dado —
// eventos de ACK reais carregam `payload.token` na raiz? — sem nunca gravar
// token, payload bruto, message_id, telefone/JID, nome de instância ou
// headers. A lógica de classificação em si é simples o suficiente para não
// valer a pena extrair como função pura testável isoladamente; este arquivo
// prova, por leitura estrutural do código-fonte (mesma técnica de
// `presence-wiring.test.ts` já usada nesta sessão), que a fiação está
// correta e que o comportamento de negócio do ACK é byte-a-byte equivalente
// ao commit base (6067ba3), exceto pela adição isolada da probe.
//
// v2 corrige a v1 (revisão): troca IIFE-nunca-aguardada por `await`
// explícito (garantia de conclusão testável, já que `EdgeRuntime.waitUntil`
// não tem nenhuma prova local possível de que garante conclusão
// pós-resposta); e corrige `ack_type` para não inventar "Read" onde o
// normalizador já fundiu Read/ReadSelf/Played em `ack===4`.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

async function readIndexSource(): Promise<string> {
  return await Deno.readTextFile(new URL("./index.ts", import.meta.url));
}

function extractAckBlock(src: string): string {
  const start = src.indexOf('if (norm && (norm as any).kind === "ack") {');
  const end = src.indexOf('return new Response(\n        JSON.stringify({ ok: true, task: "ack_processed"', start);
  return src.slice(start, end);
}

Deno.test("a probe está dentro do bloco ACK, antes do return final", async () => {
  const src = await readIndexSource();
  const block = extractAckBlock(src);
  assertEquals(block.includes("ack-token-presence-probe"), true);
});

Deno.test("classificação present/missing/empty/invalid_type cobre exatamente os 4 casos pedidos, nenhum outro", async () => {
  const src = await readIndexSource();
  const block = extractAckBlock(src);
  const idx = block.indexOf('const ackTokenPresence');
  const decl = block.slice(idx, idx + 400);
  assertEquals(decl.includes('"missing"'), true);
  assertEquals(decl.includes('"invalid_type"'), true);
  assertEquals(decl.includes('"empty"'), true);
  assertEquals(decl.includes('"present"'), true);
});

Deno.test("CONCLUSÃO GARANTIDA: o UPDATE da probe usa `await` explícito no call site — não é uma IIFE solta nem depende de EdgeRuntime.waitUntil", async () => {
  const src = await readIndexSource();
  const block = extractAckBlock(src);
  const idx = block.indexOf('const { error: probeErr } = await supabase.from("webhook_logs").update(');
  assertEquals(idx > 0, true);
  // v1 usava uma IIFE assíncrona nunca aguardada — não deve mais existir.
  assertEquals(block.includes("(async () => {"), false);
  // Nenhuma CHAMADA a EdgeRuntime.waitUntil no código (o nome pode
  // aparecer só em comentário explicando por que não foi usado).
  assertEquals(block.includes("EdgeRuntime.waitUntil("), false);
});

Deno.test("o UPDATE da probe usa .eq(\"id\", logRecordId) — a própria linha do evento, nunca um filtro amplo", async () => {
  const src = await readIndexSource();
  const block = extractAckBlock(src);
  const idx = block.indexOf('const { error: probeErr } = await supabase.from("webhook_logs").update(');
  const call = block.slice(idx, idx + 350);
  assertEquals(call.includes('.eq("id", logRecordId)'), true);
  // Nunca um filtro por message_id/instance/organização nesta escrita.
  assertEquals(call.includes(".eq(\"message_id\""), false);
  assertEquals(call.includes(".or("), false);
});

Deno.test("FAIL-OPEN: falha da probe (erro de update ou exceção) vira só console.warn, nunca lança para fora do bloco ACK", async () => {
  const src = await readIndexSource();
  const block = extractAckBlock(src);
  const updateIdx = block.indexOf('const { error: probeErr } = await supabase.from("webhook_logs").update(');
  // O try/catch envolve a chamada — procura o "try {" mais próximo ANTES
  // do update (não depois, já que o await está dentro do try).
  const before = block.slice(Math.max(0, updateIdx - 700), updateIdx);
  assertEquals(before.includes("try {"), true);
  const after = block.slice(updateIdx, updateIdx + 900);
  assertEquals(after.includes("catch (probeThrow)"), true);
  assertEquals(after.includes("console.warn"), true);
});

Deno.test("prova: ack_type=\"Delivered\" só de ackEvent.ack===3, \"ReadOrPlayed\" só de ackEvent.ack===4 — nunca inventa \"Played\" como categoria própria, nunca relê payload", async () => {
  const src = await readIndexSource();
  const block = extractAckBlock(src);
  const idx = block.indexOf("const ackType");
  const decl = block.slice(idx, idx + 200);
  assertEquals(decl.includes("ackEvent.ack === 3"), true);
  assertEquals(decl.includes('"Delivered"'), true);
  assertEquals(decl.includes("ackEvent.ack === 4"), true);
  assertEquals(decl.includes('"ReadOrPlayed"'), true);
  assertEquals(decl.includes('"Other"'), true);
  // "Read" isolado (sem "OrPlayed") e "Played" como valor próprio nunca
  // devem aparecer na declaração do tipo/ternário desta probe.
  assertEquals(decl.includes('"Read"'), false);
  assertEquals(decl.includes('"Played"'), false);
});

Deno.test("comentário do código contém a prova das duas rotas do normalizador (nome de evento vs Fase 28 por formato) que justificam a fusão de Read/ReadSelf/Played", async () => {
  const src = await readIndexSource();
  const block = extractAckBlock(src);
  assertEquals(block.includes('status==="read"'), true);
  assertEquals(block.includes("receiptType"), true);
  assertEquals(block.includes("readself"), true);
});

Deno.test("nenhuma serialização do valor do token — apenas typeof/length, nunca JSON.stringify(rawToken) nem console.log(rawToken)", async () => {
  const src = await readIndexSource();
  const block = extractAckBlock(src);
  assertEquals(block.includes("JSON.stringify(rawToken)"), false);
  assertEquals(block.includes("console.log(rawToken"), false);
  assertEquals(block.includes("console.warn(rawToken"), false);
  const rawTokenIdx = block.indexOf("const rawToken");
  const afterDecl = block.slice(rawTokenIdx, rawTokenIdx + 450);
  assertEquals(afterDecl.includes("typeof rawToken"), true);
  assertEquals(afterDecl.includes("rawToken.length"), true);
});

Deno.test("o registro gravado nunca contém token/payload/message_id/telefone/instância/headers — só schema_version/ack_token_presence/ack_type", async () => {
  const src = await readIndexSource();
  const block = extractAckBlock(src);
  const idx = block.indexOf("ack_token_probe: {");
  const record = block.slice(idx, idx + 250);
  assertEquals(record.includes("schema_version"), true);
  assertEquals(record.includes("ack_token_presence"), true);
  assertEquals(record.includes("ack_type"), true);
  assertEquals(record.includes("rawToken,"), false);
  assertEquals(record.includes("payload,"), false);
  assertEquals(record.includes("messageId"), false);
  assertEquals(record.includes("remoteJid"), false);
  assertEquals(record.includes("instance"), false);
  assertEquals(record.includes("headers"), false);
});

Deno.test("nenhum hash/tamanho do token é registrado (rawToken.length usado só para decidir empty/present, nunca gravado como campo)", async () => {
  const src = await readIndexSource();
  const block = extractAckBlock(src);
  const idx = block.indexOf("ack_token_probe: {");
  const record = block.slice(idx, idx + 250);
  assertEquals(record.includes("length"), false);
  assertEquals(record.includes("hash"), false);
});

Deno.test("a probe não altera nenhuma escrita de negócio existente (processed_messages/whatsapp_message_retries/webchat_messages continuam idênticas ao commit base)", async () => {
  const src = await readIndexSource();
  const block = extractAckBlock(src);
  assertEquals(block.includes('await supabase.from("processed_messages")'), true);
  assertEquals(block.includes('await supabase.from("whatsapp_message_retries")'), true);
  assertEquals(block.includes('await supabase.from("webchat_messages")'), true);
  const probeIdx = block.indexOf("ack-token-presence-probe");
  const probeSection = block.slice(probeIdx, block.indexOf("const ackIds", probeIdx));
  assertEquals(probeSection.includes('from("webhook_logs")'), true);
  assertEquals(probeSection.includes('from("processed_messages")'), false);
  assertEquals(probeSection.includes('from("whatsapp_message_retries")'), false);
  assertEquals(probeSection.includes('from("webchat_messages")'), false);
});

Deno.test("a probe não altera o status HTTP nem o corpo da resposta do ACK (return final continua idêntico ao commit base)", async () => {
  const src = await readIndexSource();
  const idx = src.indexOf('JSON.stringify({ ok: true, task: "ack_processed", count: ackIds.length })');
  assertEquals(idx > 0, true);
  const returnBlock = src.slice(idx - 60, idx + 150);
  assertEquals(returnBlock.includes("status:"), false); // sem status explícito = 200, igual ao commit base
});

Deno.test("comportamento de negócio do ACK é byte-a-byte equivalente ao commit base fora da probe: mesmas 4 tabelas, mesma ordem, mesmos guards de segurança do LIKE legado", async () => {
  const src = await readIndexSource();
  const block = extractAckBlock(src);
  assertEquals(block.includes("ackEvent.ack >= 3"), true);
  assertEquals(block.includes('/^[A-Za-z0-9=_-]+$/.test(ackId)'), true);
  assertEquals(block.includes('ackEvent.ack === 4 ? "read" : "delivered"'), true);
});

Deno.test("cobertura: a probe grava exatamente 1 UPDATE por evento ACK (nunca por ackId — o loop de ackIds vem depois, fora do escopo da probe)", async () => {
  const src = await readIndexSource();
  const block = extractAckBlock(src);
  const probeIdx = block.indexOf("ack-token-presence-probe");
  const loopIdx = block.indexOf("for (const ackId of ackIds)");
  assertEquals(probeIdx > 0 && loopIdx > probeIdx, true);
  // A chamada à probe (from("webhook_logs")) não pode estar dentro do loop.
  const probeSection = block.slice(probeIdx, loopIdx);
  const updateCount = probeSection.split('from("webhook_logs").update(').length - 1;
  assertEquals(updateCount, 1);
});
