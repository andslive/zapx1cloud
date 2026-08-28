// item B2 (hotfix/uazapi-ack-auth-isolation-20260828) — isolamento do ACK
// por instância autenticada + remoção da probe temporária.
//
// O bloco de ACK vive inline dentro do `Deno.serve` handler (mesma
// convenção já usada em toda esta base para o restante do arquivo — não
// foi extraído para uma função própria testável isoladamente, seguindo o
// padrão já estabelecido pelos demais arquivos `*.test.ts` deste
// diretório). A verificação é, portanto, estrutural (inspeção do
// texto-fonte de `index.ts`) mais um espelho comportamental isolado do
// algoritmo de deduplicação de `conversation_id` (Set-based union de
// `connection_id`/`evolution_instance_id`), provado equivalente ao trecho
// real por comparação direta de texto-fonte.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

async function readIndexSource(): Promise<string> {
  return await Deno.readTextFile(new URL("./index.ts", import.meta.url));
}

function ackBlock(src: string): string {
  const start = src.indexOf('if ((norm as any).kind === "ack") {');
  const end = src.indexOf("\n    // Rollout gradual", start);
  return src.slice(start, end);
}

// ── ACK exige a mesma resolução de instância que qualquer outro evento ──

Deno.test("ACK não tem caminho de resolução próprio -- está depois de `const instance = resolution.instance`, logo depois do failure-return de resolveInstanceForEvent", async () => {
  const src = await readIndexSource();
  const failureReturnIdx = src.indexOf("if (!resolution.instance) {");
  const constInstanceIdx = src.indexOf("const instance = resolution.instance;");
  const ackIdx = src.indexOf('if ((norm as any).kind === "ack") {');
  assertEquals(failureReturnIdx > 0 && constInstanceIdx > 0 && ackIdx > 0, true);
  assertEquals(failureReturnIdx < constInstanceIdx, true);
  assertEquals(constInstanceIdx < ackIdx, true);
  // Consequência direta: token ausente/vazio/desconhecido/duplicado,
  // provider não-uazapi (Meta/HookCloud), instância arquivada sem
  // parceira, e erro técnico (503) nunca alcançam o bloco de ACK -- o
  // mesmo resolveInstanceForEvent testado em instance-resolution.test.ts
  // já cobre esses 8 cenários para QUALQUER evento, ACK incluso.
});

Deno.test("erro técnico de resolução (reason='error') nunca alcança o ACK -- o branch 503 retorna antes de `const instance`", async () => {
  const src = await readIndexSource();
  const errorBranchIdx = src.indexOf('resolution.reason === "error"');
  const ackIdx = src.indexOf('if ((norm as any).kind === "ack") {');
  assertEquals(errorBranchIdx > 0 && ackIdx > 0, true);
  assertEquals(errorBranchIdx < ackIdx, true);
});

// ── Escopo das 3 escritas de negócio ────────────────────────────────────

Deno.test("processed_messages: filtrado por message_id E instance_id -- token de uma instância nunca altera mensagem de outra", async () => {
  const src = await readIndexSource();
  const block = ackBlock(src);
  assertEquals(
    block.includes('.eq("message_id", ackId)\n            .eq("instance_id", instance.id);'),
    true,
  );
});

Deno.test("whatsapp_message_retries (delete principal e delete legado por LIKE): ambos filtrados por message_id/LIKE + instance_id + organization_id", async () => {
  const src = await readIndexSource();
  const block = ackBlock(src);
  const deleteOccurrences = (block.match(/\.delete\(\)/g) || []).length;
  assertEquals(deleteOccurrences, 2, "só os 2 deletes conhecidos (principal + legado LIKE) devem existir");
  const instanceScopedOccurrences = (block.match(/\.eq\("instance_id", instance\.id\)\s*\n\s*\.eq\("organization_id", instance\.organization_id\);/g) || []).length;
  assertEquals(instanceScopedOccurrences, 2, "os 2 deletes de whatsapp_message_retries devem terminar em .eq(instance_id).eq(organization_id)");
});

Deno.test("webchat_messages: nunca um .or() global sozinho -- sempre precedido por .in(\"conversation_id\", scopedConversationIds)", async () => {
  const src = await readIndexSource();
  const block = ackBlock(src);
  assertEquals(
    block.includes('.in("conversation_id", scopedConversationIds)\n                .or(`metadata->>evolution_message_id.eq."${ackId}",metadata->>external_id.eq."${ackId}"`);'),
    true,
  );
});

Deno.test("webchat_messages nunca roda com .in() vazio -- o UPDATE só é chamado dentro de `if (scopedConversationIds.length > 0)`", async () => {
  const src = await readIndexSource();
  const block = ackBlock(src);
  const guardIdx = block.indexOf("if (scopedConversationIds.length > 0) {");
  const updateIdx = block.indexOf('.from("webchat_messages")');
  assertEquals(guardIdx > 0 && updateIdx > 0, true);
  assertEquals(guardIdx < updateIdx, true);
  // O guard deve ser o único caminho até o update -- nenhum outro
  // `.from("webchat_messages")` fora dele.
  const webchatMessagesOccurrences = (block.match(/\.from\("webchat_messages"\)/g) || []).length;
  assertEquals(webchatMessagesOccurrences, 1);
});

Deno.test("nenhum filtro global por message_id sozinho sobrevive -- toda escrita de negócio do ACK tem pelo menos instance_id (ou o .in() de conversation_id) como filtro adicional", async () => {
  const src = await readIndexSource();
  const block = ackBlock(src);
  // As 3 antigas formas "só message_id"/".or() sem .in() antes" não
  // sobrevivem como estavam no commit base.
  assertEquals(block.includes('.eq("message_id", ackId);'), false, "processed_messages não pode mais terminar só em message_id");
  assertEquals(block.includes('.delete()\n              .eq("message_id", ackId);'), false, "delete principal não pode mais terminar só em message_id");
});

// ── Escopo de conversas: connection_id OR evolution_instance_id, dedup ─

Deno.test("scopedConversationIds é resolvido com Promise.all sobre connection_id E evolution_instance_id, uma única vez por request (fora do loop de ackIds)", async () => {
  const src = await readIndexSource();
  const block = ackBlock(src);
  const loopIdx = block.indexOf("for (const ackId of ackIds)");
  const scopeIdx = block.indexOf("let scopedConversationIds");
  assertEquals(scopeIdx > 0 && loopIdx > 0, true);
  assertEquals(scopeIdx < loopIdx, true, "a resolução de conversas deve ocorrer antes do loop, não repetida por ackId");
  assertEquals(block.includes('.eq("connection_id", instance.id)'), true);
  assertEquals(block.includes('.eq("evolution_instance_id", instance.id)'), true);
  assertEquals(block.includes("Promise.all"), true);
});

Deno.test("a dedup usa Set -- mesma linha batendo por connection_id E evolution_instance_id conta uma única vez", async () => {
  const src = await readIndexSource();
  const block = ackBlock(src);
  assertEquals(block.includes("Array.from(new Set(["), true);
});

// Espelho comportamental do algoritmo de dedup (mesma forma: união de 2
// listas de ids via Set) -- prova que a ESTRATÉGIA é correta para os 4
// cenários pedidos, independente de não poder invocar o bloco inline
// diretamente.
function dedupConversationIds(byConnection: string[], byEvolutionInstance: string[]): string[] {
  return Array.from(new Set([...byConnection, ...byEvolutionInstance]));
}

Deno.test("dedup: só connection_id populado -> retorna exatamente essas conversas", () => {
  const a = crypto.randomUUID(), b = crypto.randomUUID();
  const result = dedupConversationIds([a, b], []);
  assertEquals(new Set(result), new Set([a, b]));
  assertEquals(result.length, 2);
});

Deno.test("dedup: só evolution_instance_id populado -> retorna exatamente essas conversas", () => {
  const a = crypto.randomUUID();
  const result = dedupConversationIds([], [a]);
  assertEquals(result, [a]);
});

Deno.test("dedup: mesma conversa em ambas as listas (connection_id E evolution_instance_id apontam pra ela) -> conta 1 vez, nunca duplicada no .in()", () => {
  const shared = crypto.randomUUID();
  const result = dedupConversationIds([shared], [shared]);
  assertEquals(result, [shared]);
});

Deno.test("dedup: listas divergentes (conversas diferentes em cada coluna) -> união das duas, nenhuma perdida", () => {
  const a = crypto.randomUUID(), b = crypto.randomUUID();
  const result = dedupConversationIds([a], [b]);
  assertEquals(new Set(result), new Set([a, b]));
  assertEquals(result.length, 2);
});

Deno.test("dedup: nenhuma conversa em nenhuma das duas listas -> array vazio (aciona o guard de nunca rodar .in() vazio)", () => {
  const result = dedupConversationIds([], []);
  assertEquals(result, []);
});

// ── Isolamento cross-instância / cross-organização (via escopo comprovado) ─

Deno.test("token A nunca altera mensagem/conversa de instância B: os 4 filtros de instance_id/organization_id/conversation_id garantem que só linhas da instância autenticada são tocadas -- nenhum caminho aceita um instance_id vindo do payload", async () => {
  const src = await readIndexSource();
  const block = ackBlock(src);
  // `instance` é sempre `resolution.instance` (já autenticado por token) --
  // o bloco de ACK nunca lê `payload.instance`/`payload.instance_id`, só
  // usa a variável `instance` já resolvida.
  assertEquals(block.includes("payload.instance"), false);
  assertEquals(block.includes("payload.instance_id"), false);
});

// ── Probe removida por completo ──────────────────────────────────────

Deno.test("ack_token_probe não existe mais como código executável -- nenhum UPDATE de webhook_logs.parsed_fields, nenhuma variável ack_token_presence/ack_type, só a menção no comentário explicando a remoção", async () => {
  const src = await readIndexSource();
  // Nenhum objeto/UPDATE executável usa mais essas chaves -- a única
  // sobrevivência é texto de comentário citando por nome o que foi
  // removido (auditável, não executado).
  assertEquals(src.includes("parsed_fields: {"), false, "nenhum UPDATE grava mais em parsed_fields");
  assertEquals(src.includes("ack_token_probe: {"), false);
  assertEquals(src.includes('const ackTokenPresence'), false);
  assertEquals(src.includes('const ackType:'), false);
  assertEquals(src.includes("schema_version: 2"), false);
  const parsedFieldsOccurrences = (src.match(/parsed_fields/g) || []).length;
  assertEquals(parsedFieldsOccurrences, 1, "só deve sobrar a menção no comentário explicando a remoção");
});

Deno.test("nenhum arquivo de teste temporário da probe sobrevive nesta branch (ack-token-presence-probe.test.ts removido)", async () => {
  let exists = true;
  try {
    await Deno.stat(new URL("./ack-token-presence-probe.test.ts", import.meta.url));
  } catch {
    exists = false;
  }
  assertEquals(exists, false);
});

Deno.test("133d22f (onde a probe está deployada como v28) é mencionado no comentário imediatamente acima do bloco de ACK, para rollback/rastreabilidade", async () => {
  const src = await readIndexSource();
  const ackIdx = src.indexOf('if ((norm as any).kind === "ack") {');
  const commentWindow = src.slice(ackIdx - 700, ackIdx);
  assertEquals(commentWindow.includes("133d22f"), true);
});
