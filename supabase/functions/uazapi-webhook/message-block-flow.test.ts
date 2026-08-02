// Testa o fluxo completo de case "message" (render → decisão → enqueue →
// avanço do bloco) usando a função REAL importada de ./message-render.ts
// (não uma cópia). A parte de "empilhar em chunksToSend / avançar
// nextBlockId" é reproduzida aqui porque ainda está inline dentro do switch
// gigante de uazapi-webhook/index.ts (que chama Deno.serve no topo do
// módulo e por isso não pode ser importado diretamente por um teste) — mas
// a decisão central (a correção em si) vem do arquivo real.
import { assert, assertEquals } from "https://deno.land/std@0.207.0/assert/mod.ts";
import { renderMessageTextOrSkip } from "./message-render.ts";

// Réplica fiel do corpo de `case "message"` em index.ts após a correção,
// usando a função real importada para a decisão de enviar/pular.
function processMessageBlock(
  b: { id: string; data: { content?: string }; next_block_id?: string | null },
  replaceVars: (txt: any) => any,
  state: {
    chunksToSend: any[];
    logs: { tag: string; block_id: string; reason: string }[];
    pendingDelayMs: number;
    nextBlockId: string | null;
  },
) {
  if (b.data?.content) {
    const rendered = renderMessageTextOrSkip(b.data.content, replaceVars);
    if (!rendered) {
      state.logs.push({ tag: "[EMPTY_MESSAGE_SKIPPED]", block_id: b.id, reason: "rendered_text_empty_after_substitution" });
    } else {
      state.chunksToSend.push({
        type: "text",
        payload: { text: rendered.text },
        source_block_id: b.id,
      });
    }
  }
  state.pendingDelayMs = 0;
  state.nextBlockId = b.next_block_id || null;
}

Deno.test("texto vazio: nenhum chunk é criado, nenhum envio é possível, sem STEP_FAILED/retry", () => {
  const replaceVars = (txt: any) => (typeof txt === "string" ? txt.replace("{{ai.response}}", "") : txt);
  const state = { chunksToSend: [] as any[], logs: [] as any[], pendingDelayMs: 9, nextBlockId: null as string | null };

  processMessageBlock({ id: "b1", data: { content: "{{ai.response}}" }, next_block_id: "b2" }, replaceVars, state);

  assertEquals(state.chunksToSend.length, 0, "nenhum chunk criado");
  // Estrutural: STEP_FAILED e o retry loop em index.ts só executam sobre um
  // item de chunksToSend — com o array vazio, esse caminho é inatingível.
  assert(state.chunksToSend.every((c) => c.payload?.text !== ""), "garantia adicional: nenhum chunk com texto vazio existe no array");
});

Deno.test("texto vazio: fluxo avança para o próximo bloco, sem travar no mesmo bloco", () => {
  const replaceVars = () => "";
  const state = { chunksToSend: [] as any[], logs: [] as any[], pendingDelayMs: 0, nextBlockId: null as string | null };

  processMessageBlock({ id: "b1", data: { content: "{{x}}" }, next_block_id: "b2-next" }, replaceVars, state);

  assertEquals(state.nextBlockId, "b2-next", "avança normalmente, não fica preso em b1");
});

Deno.test("texto vazio: emite exatamente um [EMPTY_MESSAGE_SKIPPED], sem PII (só block_id e motivo)", () => {
  const replaceVars = () => "";
  const state = { chunksToSend: [] as any[], logs: [] as any[], pendingDelayMs: 0, nextBlockId: null as string | null };

  processMessageBlock({ id: "block-abc", data: { content: "{{telefone}}" }, next_block_id: "b3" }, replaceVars, state);

  assertEquals(state.logs.length, 1, "exatamente um log");
  const [log] = state.logs;
  assertEquals(log.tag, "[EMPTY_MESSAGE_SKIPPED]");
  assertEquals(log.block_id, "block-abc");
  assertEquals(Object.keys(log).sort(), ["block_id", "reason", "tag"], "log contém só block_id e motivo — sem telefone, conteúdo ou variáveis");
});

Deno.test("texto não vazio: enviado exatamente como renderizado, inclusive espaços externos", () => {
  const replaceVars = (txt: any) => (typeof txt === "string" ? txt.replace("{{nome}}", "Anderson") : txt);
  const state = { chunksToSend: [] as any[], logs: [] as any[], pendingDelayMs: 0, nextBlockId: null as string | null };

  processMessageBlock({ id: "b1", data: { content: "  Olá, {{nome}}!  " }, next_block_id: "b2" }, replaceVars, state);

  assertEquals(state.chunksToSend.length, 1, "chunk criado normalmente");
  assertEquals(state.chunksToSend[0].payload.text, "  Olá, Anderson!  ", "espaços externos preservados, sem trim no envio");
  assertEquals(state.logs.length, 0, "nenhum log de skip para texto válido");
});

Deno.test("sequência de 3 blocos alternando vazio/não-vazio: cada um processado uma única vez, sem repetição/loop", () => {
  const replaceVars = (txt: any) => (typeof txt === "string" ? txt.replace("{{v}}", "") : txt);
  const state = { chunksToSend: [] as any[], logs: [] as any[], pendingDelayMs: 0, nextBlockId: null as string | null };

  processMessageBlock({ id: "b1", data: { content: "texto normal" }, next_block_id: "b2" }, replaceVars, state);
  processMessageBlock({ id: "b2", data: { content: "{{v}}" }, next_block_id: "b3" }, replaceVars, state);
  processMessageBlock({ id: "b3", data: { content: "outro normal" }, next_block_id: null }, replaceVars, state);

  assertEquals(state.chunksToSend.length, 2, "2 chunks (b1 e b3), b2 pulado");
  assertEquals(state.logs.length, 1, "exatamente 1 skip (b2), sem duplicação");
  assertEquals(state.nextBlockId, null, "fluxo chega ao fim normalmente, sem loop");
});
