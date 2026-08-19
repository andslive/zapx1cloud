// deno test --allow-import clone-funnel-core.test.ts
//
// Cobre as garantias exigidas da reimplementação determinística de
// "Clonar Funil": clone profundo do funil-modelo (IDs novos, sem
// vazamento, sem referência quebrada, sem reorganização) e extração de
// mídia (nunca usa `content` de mensagens com mídia, já que nos dados
// reais esse campo é texto gerado por IA de OCR/transcrição).

import {
  cloneTemplateBlocks,
  computeTopologicalRoot,
  extractMedia,
  normalizeKind,
  genBlockId,
  sha256Hex,
  selectEligibleLeadMessages,
  type FlowBlockLike,
  type RawMessageLike,
} from "./clone-funnel-core.ts";
import { assert, assertEquals, assertNotEquals, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";

// ── Fixture: subgrafo real do "Funil (Modelo)" (ae1bf78d-e469-4657-a2d7-37abd056f148) ──
// Estrutura real: message -> message -> image -> ... -> ai_receipt, mais o
// nó condicional que hoje é o start_block_id configurado no banco.
function realModelFixture(): { blocks: FlowBlockLike[]; start: string } {
  const blocks: FlowBlockLike[] = [
    {
      id: 'block_1786199644868_7gaopyebk',
      type: 'message',
      position: { x: 3800, y: -200 },
      data: { content: 'Oi! Vi que você já recebeu o material 🙂', channels: ['chat'] },
      next_block_id: 'block_1786199622759_r1rr5mqcm',
    },
    {
      id: 'block_1786199622759_r1rr5mqcm',
      type: 'wait_response',
      position: { x: 4000, y: -200 },
      data: { variable_name: 'resposta', timeout_next_block_id: 'block_1785719090853_7qq3pdx0i', channels: ['chat'] },
      next_block_id: 'block_1785710566978_2t53w03le',
    },
    {
      id: 'block_1785710566978_2t53w03le',
      type: 'condition',
      position: { x: 4155.99, y: 0 },
      data: {
        condition_logic: 'any',
        conditions: [
          { id: 'fea99013-9b5c-4ea1-aaaf-d53c14caa671', operator: 'contains', value: 'nao', variable: 'resposta' },
          { id: 'b1be037a-45bc-4073-b4ef-8cefadbe2491', operator: 'contains', value: 'não', variable: 'resposta' },
        ],
        false_next_block_id: 'block_1785719090853_7qq3pdx0i',
        nao_next_block_id: 'block_1785719090853_7qq3pdx0i',
        sim_next_block_id: 'block_1785718940121_iyhpuz3us',
        true_next_block_id: 'block_1785718940121_iyhpuz3us',
        success_next_block_id: null,
        channels: ['chat'],
      },
      next_block_id: null,
    },
    {
      id: 'block_1785718940121_iyhpuz3us',
      type: 'message',
      position: { x: 4300, y: 100 },
      data: { content: 'Legal que respondeu!', channels: ['chat'] },
      next_block_id: 'block_1785719090853_7qq3pdx0i',
    },
    {
      id: 'block_1785719090853_7qq3pdx0i',
      type: 'message',
      position: { x: 4500, y: 0 },
      data: { content: 'Vamos seguir com o pagamento.', channels: ['chat'] },
      next_block_id: 'block_1785721166311_wyahcxk2t',
    },
    {
      id: 'block_1785721166311_wyahcxk2t',
      type: 'image',
      position: { x: 4700, y: 0 },
      data: { image_url: 'https://x1zap.example/pix-qrcode.png', channels: ['chat'] },
      next_block_id: 'block_1785730914875_718jc1h2u',
    },
    {
      id: 'block_1785730914875_718jc1h2u',
      type: 'ai_receipt',
      position: { x: 4900, y: 0 },
      data: {
        receipt_prompt: 'Confira o comprovante recebido.',
        receipt_variable_name: 'resposta',
        true_next_block_id: null,
        false_next_block_id: null,
        timeout_next_block_id: null,
        channels: ['chat'],
      },
      next_block_id: null,
    },
  ];
  return { blocks, start: 'block_1785710566978_2t53w03le' };
}

// ── computeTopologicalRoot ───────────────────────────────────────────────
// Regressão do achado de auditoria (2026-08-08): o `start_block_id`
// GRAVADO no "Funil (Modelo)" apontava para o bloco `condition`, pulando a
// pergunta ("Consegue abrir os rótulos? 🥰") e o `wait_response` que
// preenche a variável testada pela condição. A raiz topológica real é a
// mensagem — é ela que deve ser usada como entrada do clone, não o
// start_block_id gravado.

Deno.test('computeTopologicalRoot: encontra a mensagem inicial, não o condition gravado como start_block_id', () => {
  const { blocks } = realModelFixture();
  const root = computeTopologicalRoot(blocks);
  assertEquals(root, 'block_1786199644868_7gaopyebk');
  assertNotEquals(root, 'block_1785710566978_2t53w03le', 'a raiz não pode ser o condition — esse é o bug que estamos corrigindo');
});

Deno.test('computeTopologicalRoot: falha fechada quando não há raiz única (ciclo cobrindo tudo)', () => {
  const cyclic: FlowBlockLike[] = [
    { id: 'a', type: 'message', data: {}, next_block_id: 'b' },
    { id: 'b', type: 'message', data: {}, next_block_id: 'a' },
  ];
  assertThrows(() => computeTopologicalRoot(cyclic), Error, 'não tem raiz topológica');
});

Deno.test('computeTopologicalRoot: falha fechada quando há mais de uma raiz (ambíguo)', () => {
  const twoRoots: FlowBlockLike[] = [
    { id: 'a', type: 'message', data: {}, next_block_id: 'c' },
    { id: 'b', type: 'message', data: {}, next_block_id: 'c' },
    { id: 'c', type: 'message', data: {}, next_block_id: null },
  ];
  assertThrows(() => computeTopologicalRoot(twoRoots), Error, 'raiz ambígua');
});

// ── cloneTemplateBlocks ───────────────────────────────────────────────────

Deno.test('cloneTemplateBlocks: gera um funil independente e fechado', () => {
  const { blocks, start } = realModelFixture();
  const originalIds = new Set(blocks.map((b) => b.id));

  const { blocks: cloned, start_block_id } = cloneTemplateBlocks(blocks, start);

  assertEquals(cloned.length, blocks.length, 'não perde nem ganha blocos');

  const newIds = new Set(cloned.map((b) => b.id));
  assertEquals(newIds.size, cloned.length, 'todos os novos IDs são únicos');

  for (const id of newIds) {
    assert(!originalIds.has(id), `ID original vazou para o clone: ${id}`);
  }

  assert(newIds.has(start_block_id), 'start_block_id calculado existe no clone');
  assertNotEquals(start_block_id, start, 'start_block_id do clone é um ID novo, não o original');

  // Nenhuma referência (next_block_id nem *_next_block_id) aponta para fora
  // do conjunto de IDs novos, e nenhuma aponta para um ID original.
  const REF_FIELDS = ['true_next_block_id', 'false_next_block_id', 'sim_next_block_id', 'nao_next_block_id', 'timeout_next_block_id', 'success_next_block_id'];
  for (const b of cloned) {
    // deno-lint-ignore no-explicit-any
    const data: any = b.data || {};
    const refs = [b.next_block_id, ...REF_FIELDS.map((f) => data[f])].filter(Boolean) as string[];
    for (const r of refs) {
      assert(newIds.has(r), `referência ${r} do bloco ${b.id} não existe no clone`);
      assert(!originalIds.has(r), `referência ${r} do bloco ${b.id} ainda é um ID original`);
    }
  }
});

Deno.test('cloneTemplateBlocks: preserva conteúdo/config integralmente (clone profundo, não resumo)', () => {
  const { blocks, start } = realModelFixture();
  const { blocks: cloned } = cloneTemplateBlocks(blocks, start);

  const originalAiReceipt = blocks.find((b) => b.type === 'ai_receipt')!;
  const clonedAiReceipt = cloned.find((b) => b.type === 'ai_receipt')!;
  assertEquals(clonedAiReceipt.data?.receipt_prompt, originalAiReceipt.data?.receipt_prompt);
  assertEquals(clonedAiReceipt.data?.receipt_variable_name, originalAiReceipt.data?.receipt_variable_name);

  const originalCondition = blocks.find((b) => b.type === 'condition')!;
  const clonedCondition = cloned.find((b) => b.type === 'condition')!;
  // deno-lint-ignore no-explicit-any
  const origConds = (originalCondition.data as any).conditions;
  // deno-lint-ignore no-explicit-any
  const clonedConds = (clonedCondition.data as any).conditions;
  assertEquals(clonedConds.length, origConds.length);
  assertEquals(clonedConds.map((c: { value: string }) => c.value), origConds.map((c: { value: string }) => c.value));
  assertEquals(clonedConds.map((c: { variable: string }) => c.variable), origConds.map((c: { variable: string }) => c.variable));
});

Deno.test('cloneTemplateBlocks: regenera conditions[].id sem duplicar', () => {
  const { blocks, start } = realModelFixture();
  const { blocks: cloned } = cloneTemplateBlocks(blocks, start);
  const clonedCondition = cloned.find((b) => b.type === 'condition')!;
  // deno-lint-ignore no-explicit-any
  const conds = (clonedCondition.data as any).conditions as { id: string }[];
  const origIds = new Set(['fea99013-9b5c-4ea1-aaaf-d53c14caa671', 'b1be037a-45bc-4073-b4ef-8cefadbe2491']);
  for (const c of conds) assert(!origIds.has(c.id), 'id de condition original vazou');
  assertEquals(new Set(conds.map((c) => c.id)).size, conds.length);
});

Deno.test('cloneTemplateBlocks: duas chamadas sobre o mesmo modelo produzem clones sem overlap entre si', () => {
  const { blocks, start } = realModelFixture();
  const a = cloneTemplateBlocks(blocks, start);
  const b = cloneTemplateBlocks(blocks, start);
  const idsA = new Set(a.blocks.map((x) => x.id));
  const idsB = new Set(b.blocks.map((x) => x.id));
  for (const id of idsB) assert(!idsA.has(id), `clone B reutilizou id do clone A: ${id}`);
});

Deno.test('cloneTemplateBlocks: falha fechada em referência quebrada (não retorna resultado parcial)', () => {
  const { blocks } = realModelFixture();
  const broken = blocks.map((b) => ({ ...b }));
  // deno-lint-ignore no-explicit-any
  (broken[2].data as any).true_next_block_id = 'id-que-nao-existe';
  assertThrows(() => cloneTemplateBlocks(broken, broken[2].id), Error, 'Referência quebrada');
});

Deno.test('cloneTemplateBlocks: falha fechada quando start_block_id não existe entre os blocos', () => {
  const { blocks } = realModelFixture();
  assertThrows(() => cloneTemplateBlocks(blocks, 'id-inexistente'), Error, 'não existe entre os blocos');
});

Deno.test('cloneTemplateBlocks: falha fechada com lista de blocos vazia', () => {
  assertThrows(() => cloneTemplateBlocks([], 'x'), Error, 'sem blocos');
});

Deno.test('cloneTemplateBlocks: não compartilha referência de objeto com a entrada (independência)', () => {
  const { blocks, start } = realModelFixture();
  const { blocks: cloned } = cloneTemplateBlocks(blocks, start);
  const clonedImage = cloned.find((b) => b.type === 'image')!;
  // deno-lint-ignore no-explicit-any
  (clonedImage.data as any).image_url = 'MUTATED';
  const originalImage = blocks.find((b) => b.type === 'image')!;
  assertNotEquals(originalImage.data?.image_url, 'MUTATED', 'mutar o clone não pode afetar o funil-modelo original');
});

// ── extractMedia ─────────────────────────────────────────────────────────

Deno.test('extractMedia: usa metadata.media.url/kind/caption (formato real de produção)', () => {
  const msg = {
    id: 'm1',
    content: '🖼️ Imagem: 1. Valor: 10.00\n2. Nome do Pagador: Fulano',
    metadata: {
      media: { url: 'https://x/img.jpg', kind: 'image', mime: 'image/jpeg', filename: null, caption: null },
    },
  };
  const media = extractMedia(msg);
  assertEquals(media?.kind, 'image');
  assertEquals(media?.url, 'https://x/img.jpg');
  // Garantia central: o `content` (texto gerado por OCR/IA) NUNCA é usado
  // como legenda — extractMedia nem olha para `content`.
  assertEquals(media?.caption, null);
});

Deno.test('extractMedia: preserva legenda real do WhatsApp quando existe', () => {
  const msg = {
    id: 'm2',
    content: 'qualquer coisa',
    metadata: { media: { url: 'https://x/img.jpg', kind: 'image', caption: 'Olha isso!' } },
  };
  const media = extractMedia(msg);
  assertEquals(media?.caption, 'Olha isso!');
});

Deno.test('extractMedia: mensagem sem metadata.media retorna null (é texto puro)', () => {
  const msg = { id: 'm3', content: 'Sim', metadata: { sender_name: 'Fulano' } };
  assertEquals(extractMedia(msg), null);
});

Deno.test('extractMedia: falha fechada quando metadata.media existe mas sem url', () => {
  const msg = { id: 'm4', content: 'x', metadata: { media: { kind: 'image' } } };
  assertThrows(() => extractMedia(msg), Error, 'não tem url');
});

Deno.test('extractMedia: falha fechada em kind desconhecido', () => {
  const msg = { id: 'm5', content: 'x', metadata: { media: { url: 'https://x/f', kind: 'sticker-3d' } } };
  assertThrows(() => extractMedia(msg), Error, 'tipo desconhecido');
});

Deno.test('extractMedia: fallback legado imageMessage', () => {
  const msg = { id: 'm6', content: 'x', metadata: { imageMessage: { url: 'https://x/legacy.jpg', caption: 'legenda antiga' } } };
  const media = extractMedia(msg);
  assertEquals(media?.kind, 'image');
  assertEquals(media?.caption, 'legenda antiga');
});

// ── normalizeKind ────────────────────────────────────────────────────────

Deno.test('normalizeKind: reconhece as 4 variantes esperadas', () => {
  assertEquals(normalizeKind('image'), 'image');
  assertEquals(normalizeKind('ptt'), 'audio');
  assertEquals(normalizeKind('audio'), 'audio');
  assertEquals(normalizeKind('video'), 'video');
  assertEquals(normalizeKind('document'), 'document');
  assertEquals(normalizeKind('pdf'), 'document');
  assertEquals(normalizeKind('sticker'), null);
  assertEquals(normalizeKind(undefined), null);
});

// ── genBlockId / sha256Hex ───────────────────────────────────────────────

Deno.test('genBlockId: nunca repete um id já usado', () => {
  const used = new Set<string>();
  used.add('block_1_aaa');
  const id = genBlockId(used);
  assert(!used.has(id));
});

Deno.test('sha256Hex: determinístico para a mesma entrada', async () => {
  const h1 = await sha256Hex('conversa+modelo+mensagens');
  const h2 = await sha256Hex('conversa+modelo+mensagens');
  assertEquals(h1, h2);
  const h3 = await sha256Hex('outra coisa');
  assertNotEquals(h1, h3);
});

// ── selectEligibleLeadMessages (Fase 4B — extração pura, cobertura dos ────
//    2 comportamentos antes só validados por leitura de código) ───────────

function msg(over: Partial<RawMessageLike> & { id: string }): RawMessageLike {
  return { direction: 'inbound', sender_type: 'visitor', is_deleted: false, ...over };
}

Deno.test('selectEligibleLeadMessages: mantém a ordem cronológica original de entrada (não reordena)', () => {
  const input = [msg({ id: 'm1' }), msg({ id: 'm2' }), msg({ id: 'm3' })];
  const { eligible } = selectEligibleLeadMessages(input);
  assertEquals(eligible.map((m) => m.id), ['m1', 'm2', 'm3']);
});

Deno.test('selectEligibleLeadMessages: mantém a ordem mesmo com mensagens excluídas intercaladas', () => {
  const input = [
    msg({ id: 'lead-1' }),
    msg({ id: 'agent-1', direction: 'outbound', sender_type: 'agent' }),
    msg({ id: 'lead-2' }),
    msg({ id: 'bot-1', direction: 'outbound', sender_type: 'bot' }),
    msg({ id: 'lead-3' }),
  ];
  const { eligible } = selectEligibleLeadMessages(input);
  assertEquals(eligible.map((m) => m.id), ['lead-1', 'lead-2', 'lead-3']);
});

Deno.test('selectEligibleLeadMessages: exclui mensagem enviada pela instância/atendente (direction=outbound)', () => {
  const input = [msg({ id: 'm1', direction: 'outbound' })];
  const { eligible } = selectEligibleLeadMessages(input);
  assertEquals(eligible.length, 0);
});

Deno.test('selectEligibleLeadMessages: exclui mensagem de agente humano (sender_type=agent)', () => {
  const input = [msg({ id: 'm1', sender_type: 'agent' })];
  const { eligible } = selectEligibleLeadMessages(input);
  assertEquals(eligible.length, 0);
});

Deno.test('selectEligibleLeadMessages: exclui mensagem do bot (sender_type=bot)', () => {
  const input = [msg({ id: 'm1', sender_type: 'bot' })];
  const { eligible } = selectEligibleLeadMessages(input);
  assertEquals(eligible.length, 0);
});

Deno.test('selectEligibleLeadMessages: exclui mensagem marcada como deletada', () => {
  const input = [msg({ id: 'm1', is_deleted: true })];
  const { eligible } = selectEligibleLeadMessages(input);
  assertEquals(eligible.length, 0);
});

Deno.test('selectEligibleLeadMessages: sinais ambíguos (direction e sender_type contraditórios) nunca entram em eligible, e são reportados em ambiguous', () => {
  const input = [msg({ id: 'm1', direction: 'inbound', sender_type: 'agent' })];
  const { eligible, ambiguous } = selectEligibleLeadMessages(input);
  assertEquals(eligible.length, 0, 'ambíguo nunca entra silenciosamente em eligible');
  assertEquals(ambiguous.map((m) => m.id), ['m1']);
});

Deno.test('selectEligibleLeadMessages: mensagem genuinamente do lead nunca aparece em ambiguous', () => {
  const input = [msg({ id: 'lead-1' })];
  const { ambiguous } = selectEligibleLeadMessages(input);
  assertEquals(ambiguous.length, 0);
});
