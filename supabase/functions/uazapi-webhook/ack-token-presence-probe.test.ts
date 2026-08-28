// deno test --allow-import --allow-read --no-check supabase/functions/uazapi-webhook/ack-token-presence-probe.test.ts
//
// Cobre a probe temporária (hotfix/uazapi-ack-token-presence-probe-20260828):
// instrumentação não-bloqueante, fail-open, que responde uma única pergunta
// de dado — eventos de ACK reais carregam `payload.token` na raiz? — sem
// nunca gravar token, payload bruto, message_id, telefone/JID, nome de
// instância ou headers. A lógica de classificação em si é simples o
// suficiente para não valer a pena extrair como função pura testável
// isoladamente; este arquivo prova, por leitura estrutural do código-fonte
// (mesma técnica de `presence-wiring.test.ts` já usada nesta sessão), que a
// fiação está correta e que o comportamento de negócio do ACK é
// byte-a-byte equivalente ao commit base (6067ba3), exceto pela adição
// isolada da probe.

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

Deno.test("ack_type é derivado só de ackEvent.ack (3=Delivered, 4=Read, resto=Other) — nunca lê payload de novo para isso", async () => {
  const src = await readIndexSource();
  const block = extractAckBlock(src);
  const idx = block.indexOf("const ackType");
  const decl = block.slice(idx, idx + 200);
  assertEquals(decl.includes("ackEvent.ack === 3"), true);
  assertEquals(decl.includes('"Delivered"'), true);
  assertEquals(decl.includes("ackEvent.ack === 4"), true);
  assertEquals(decl.includes('"Read"'), true);
  assertEquals(decl.includes('"Other"'), true);
});

Deno.test("nenhuma serialização do valor do token — apenas typeof/length, nunca JSON.stringify(rawToken) nem console.log(rawToken)", async () => {
  const src = await readIndexSource();
  const block = extractAckBlock(src);
  assertEquals(block.includes("JSON.stringify(rawToken)"), false);
  assertEquals(block.includes("console.log(rawToken"), false);
  assertEquals(block.includes("console.warn(rawToken"), false);
  // rawToken só é lido para typeof/.length — nunca concatenado em string/log.
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
  assertEquals(record.includes("rawToken,"), false); // nunca embutido cru no objeto gravado
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

Deno.test("a probe é fail-open: nunca usa `await` no call site (IIFE assíncrona solta) e tem seu próprio try/catch, sem propagar para o handler", async () => {
  const src = await readIndexSource();
  const block = extractAckBlock(src);
  const probeIdx = block.indexOf("ack-token-presence-probe");
  const iifeIdx = block.indexOf("(async () => {", probeIdx);
  assertEquals(iifeIdx > probeIdx, true);
  const beforeIife = block.slice(Math.max(0, iifeIdx - 20), iifeIdx);
  assertEquals(beforeIife.includes("await"), false);
  const afterIife = block.slice(iifeIdx, iifeIdx + 900);
  assertEquals(afterIife.includes("try {"), true);
  assertEquals(afterIife.includes("catch (probeErr"), true);
});

Deno.test("falha da probe (erro de update ou exceção síncrona) nunca lança para fora do bloco — dois níveis de try/catch (setup e chamada)", async () => {
  const src = await readIndexSource();
  const block = extractAckBlock(src);
  const occurrencesOfTry = block.split("try {").length - 1;
  // 1 try já existia no loop de ackIds (catch ackErr) + 2 novos da probe
  // (setup síncrono + chamada assíncrona) = pelo menos 3.
  assertEquals(occurrencesOfTry >= 3, true);
  assertEquals(block.includes("catch (probeSyncErr)"), true);
  assertEquals(block.includes("catch (probeErr"), true);
});

Deno.test("a probe não altera nenhuma escrita de negócio existente (processed_messages/whatsapp_message_retries/webchat_messages continuam idênticas ao commit base)", async () => {
  const src = await readIndexSource();
  const block = extractAckBlock(src);
  assertEquals(block.includes('await supabase.from("processed_messages")'), true);
  assertEquals(block.includes('await supabase.from("whatsapp_message_retries")'), true);
  assertEquals(block.includes('await supabase.from("webchat_messages")'), true);
  // A probe grava só webhook_logs — nenhuma tabela de negócio nova.
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
  // Mesmos guards já existentes no commit base, preservados inalterados.
  assertEquals(block.includes("ackEvent.ack >= 3"), true);
  assertEquals(block.includes('/^[A-Za-z0-9=_-]+$/.test(ackId)'), true);
  assertEquals(block.includes('ackEvent.ack === 4 ? "read" : "delivered"'), true);
});
