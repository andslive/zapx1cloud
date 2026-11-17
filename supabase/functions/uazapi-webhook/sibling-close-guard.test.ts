import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

// K7: a rede de segurança que fecha conversas abertas duplicadas do mesmo telefone não pode
// fechar conversa com funil em execução (mensagens simultâneas fechariam a conversa uma da outra).
Deno.test("sibling-close safety net preserves conversations with a running funnel", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const i = src.indexOf("// Safety net: fecha qualquer outra conversa aberta");
  assert(i > 0, "safety net anchor not found");
  const block = src.slice(i, i + 1600);
  assert(block.includes('.neq("id", conversationId)'));
  assert(block.includes('.or("current_flow_id.is.null,flow_completed.eq.true")'));
});
