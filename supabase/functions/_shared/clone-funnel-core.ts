// Lógica pura e determinística usada por `clone-funnel`. Nenhuma função
// aqui toca rede/banco — só transforma dados já carregados em memória.
// Testável via `deno test --allow-import clone-funnel-core.test.ts`.
//
// Ver supabase/functions/clone-funnel/index.ts para o fluxo completo
// (autenticação, I/O de banco/Storage, chamada de rede).

export interface FlowBlockLike {
  id: string;
  type: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
  next_block_id?: string | null;
}

// Todos os campos que referenciam block.id dentro de flow_blocks[].data,
// auditados contra FunnelBlockData (src/types/funnel.ts) e contra os 33
// blocos reais do "Funil (Modelo)" (types em uso: message, image, document,
// pixel, condition, wait_response, ai_receipt).
export const REF_FIELDS_DATA = [
  'true_next_block_id',
  'false_next_block_id',
  'sim_next_block_id',
  'nao_next_block_id',
  'success_next_block_id',
  'timeout_next_block_id',
  'receipt_success_block_id',
] as const;

export function sanitizeFileName(name: string): string {
  if (!name) return `file-${Date.now()}`;
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9.-]/g, "_")
    .replace(/\.\.+/g, ".")
    .replace(/^_+|_+$/g, "");
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function genBlockId(existingIds?: Set<string>): string {
  let id = `block_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  if (existingIds) {
    while (existingIds.has(id)) {
      id = `block_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    }
  }
  return id;
}

export type MediaKind = 'image' | 'audio' | 'video' | 'document';

export function normalizeKind(raw: unknown): MediaKind | null {
  const v = String(raw || '').toLowerCase();
  if (v.includes('image')) return 'image';
  if (v.includes('audio') || v.includes('ptt')) return 'audio';
  if (v.includes('video')) return 'video';
  if (v.includes('document') || v.includes('file') || v.includes('pdf')) return 'document';
  return null;
}

export interface ExtractedMedia {
  url: string;
  kind: MediaKind;
  mime: string | null;
  filename: string | null;
  caption: string | null;
}

// Extrai a mídia REAL de uma mensagem inbound. Nunca usa `content` para
// mensagens com mídia: nos dados reais desta organização, `content` para
// mensagens de imagem/áudio/documento é texto gerado pela IA de
// reconhecimento de comprovante (transcrição/OCR), não o texto do lead — a
// legenda real (se houver) só existe em `metadata.media.caption`.
// deno-lint-ignore no-explicit-any
export function extractMedia(msg: any): ExtractedMedia | null {
  const metadata = msg.metadata || {};

  if (metadata.media) {
    if (!metadata.media.url) {
      throw new Error(`Mensagem ${msg.id} indica mídia (metadata.media) mas não tem url — falha antes de criar o funil.`);
    }
    const kind = normalizeKind(metadata.media.kind || metadata.media.type || metadata.media.multimodal_processed);
    if (!kind) {
      throw new Error(`Mensagem ${msg.id} tem mídia de tipo desconhecido: ${JSON.stringify(metadata.media.kind)}`);
    }
    return {
      url: metadata.media.url,
      kind,
      mime: metadata.media.mime || null,
      filename: metadata.media.filename || null,
      caption: metadata.media.caption || null,
    };
  }

  if (metadata.imageMessage) {
    const m = metadata.imageMessage;
    const url = m.url || m.URL || m.directPath || m.DirectPath;
    if (!url) throw new Error(`Mensagem ${msg.id} (imageMessage legado) sem url localizável.`);
    return { url, kind: 'image', mime: m.mimetype || null, filename: null, caption: m.caption || null };
  }
  if (metadata.videoMessage) {
    const m = metadata.videoMessage;
    const url = m.url || m.URL || m.directPath || m.DirectPath;
    if (!url) throw new Error(`Mensagem ${msg.id} (videoMessage legado) sem url localizável.`);
    return { url, kind: 'video', mime: m.mimetype || null, filename: null, caption: m.caption || null };
  }
  if (metadata.audioMessage) {
    const m = metadata.audioMessage;
    const url = m.url || m.URL || m.directPath || m.DirectPath;
    if (!url) throw new Error(`Mensagem ${msg.id} (audioMessage legado) sem url localizável.`);
    return { url, kind: 'audio', mime: m.mimetype || null, filename: null, caption: null };
  }
  if (metadata.documentMessage) {
    const m = metadata.documentMessage;
    const url = m.url || m.URL || m.directPath || m.DirectPath;
    if (!url) throw new Error(`Mensagem ${msg.id} (documentMessage legado) sem url localizável.`);
    return {
      url,
      kind: 'document',
      mime: m.mimetype || null,
      filename: m.fileName || m.filename || null,
      caption: m.caption || null,
    };
  }

  return null;
}

// Raiz topológica real de um funil: o único bloco que nenhum outro bloco
// referencia (nem via next_block_id, nem via nenhum dos campos
// REF_FIELDS_DATA). Usado para achar a entrada de fato do funil-modelo em
// vez de confiar cegamente no `start_block_id` gravado no registro — que
// pode ter sido deixado apontando para um ponto no MEIO do grafo (ex.:
// auditoria do "Funil (Modelo)" em 2026-08-08: start_block_id configurado
// apontava para um bloco `condition` que só faz sentido depois de uma
// pergunta + wait_response que o precedem no grafo, mas que o
// start_block_id pulava). Falha fechada (nunca escolhe arbitrariamente) se
// não houver exatamente uma raiz.
export function computeTopologicalRoot(blocks: FlowBlockLike[]): string {
  const referenced = new Set<string>();
  for (const b of blocks) {
    // deno-lint-ignore no-explicit-any
    const data: any = b.data || {};
    if (b.next_block_id) referenced.add(b.next_block_id);
    for (const f of REF_FIELDS_DATA) {
      if (data[f]) referenced.add(data[f]);
    }
  }
  const roots = blocks.filter((b) => !referenced.has(b.id));
  if (roots.length === 0) {
    throw new Error('Funil-modelo não tem raiz topológica (todo bloco é referenciado por outro bloco).');
  }
  if (roots.length > 1) {
    throw new Error(`Funil-modelo tem ${roots.length} blocos sem referência de entrada — raiz ambígua: ${roots.map((r) => r.id).join(', ')}`);
  }
  return roots[0].id;
}

// Clone profundo do funil-modelo: todo bloco, toda propriedade, toda
// condição são preservados como estão. A única mudança é a identidade: cada
// block.id (e cada conditions[].id) recebe um ID novo, e toda referência
// interna é reescrita para apontar para os novos IDs. Nenhum bloco é
// removido, reordenado, resumido ou reinterpretado. Lança erro (nunca
// retorna resultado parcial) em qualquer inconsistência.
export function cloneTemplateBlocks(
  templateBlocks: FlowBlockLike[],
  templateStartBlockId: string | null
): { blocks: FlowBlockLike[]; start_block_id: string } {
  if (!Array.isArray(templateBlocks) || templateBlocks.length === 0) {
    throw new Error('Funil-modelo sem blocos.');
  }

  const idMap = new Map<string, string>();
  const usedIds = new Set<string>();
  for (const b of templateBlocks) {
    if (!b || typeof b !== 'object' || !b.id) {
      throw new Error('Bloco inválido no funil-modelo (sem id).');
    }
    if (idMap.has(b.id)) throw new Error(`ID de bloco duplicado no funil-modelo: ${b.id}`);
    const newId = genBlockId(usedIds);
    usedIds.add(newId);
    idMap.set(b.id, newId);
  }

  const cloned = templateBlocks.map((b) => {
    // deno-lint-ignore no-explicit-any
    const newBlock: any = JSON.parse(JSON.stringify(b));
    newBlock.id = idMap.get(b.id);

    if ('next_block_id' in newBlock) {
      if (b.next_block_id) {
        const mapped = idMap.get(b.next_block_id);
        if (!mapped) throw new Error(`Referência quebrada no funil-modelo: bloco ${b.id}.next_block_id -> ${b.next_block_id}`);
        newBlock.next_block_id = mapped;
      } else {
        newBlock.next_block_id = null;
      }
    }

    // deno-lint-ignore no-explicit-any
    const data: any = newBlock.data || {};
    for (const f of REF_FIELDS_DATA) {
      if (data[f] !== undefined && data[f] !== null) {
        const mapped = idMap.get(data[f]);
        if (!mapped) throw new Error(`Referência quebrada no funil-modelo: bloco ${b.id}.data.${f} -> ${data[f]}`);
        data[f] = mapped;
      }
    }
    if (Array.isArray(data.conditions)) {
      // deno-lint-ignore no-explicit-any
      data.conditions = data.conditions.map((c: any) => ({ ...c, id: crypto.randomUUID() }));
      // deno-lint-ignore no-explicit-any
      const condIds = data.conditions.map((c: any) => c.id);
      if (new Set(condIds).size !== condIds.length) {
        throw new Error('IDs de condição duplicados após regeneração no clone do modelo');
      }
    }
    newBlock.data = data;
    return newBlock as FlowBlockLike;
  });

  if (!templateStartBlockId || !idMap.has(templateStartBlockId)) {
    throw new Error('start_block_id do funil-modelo não existe entre os blocos do funil-modelo.');
  }
  const newStartBlockId = idMap.get(templateStartBlockId)!;

  const newIds = new Set(cloned.map((b) => b.id));
  if (newIds.size !== cloned.length) throw new Error('IDs de bloco duplicados após clonagem do modelo.');
  for (const origId of idMap.keys()) {
    if (newIds.has(origId)) throw new Error(`ID original do funil-modelo vazou para o clone: ${origId}`);
  }
  for (const b of cloned) {
    // deno-lint-ignore no-explicit-any
    const data: any = b.data || {};
    const refs = [b.next_block_id, ...REF_FIELDS_DATA.map((f) => data[f])].filter(Boolean) as string[];
    for (const r of refs) {
      if (!newIds.has(r)) throw new Error(`Referência para id inexistente no clone do modelo: ${r}`);
    }
  }

  return { blocks: JSON.parse(JSON.stringify(cloned)), start_block_id: newStartBlockId };
}
