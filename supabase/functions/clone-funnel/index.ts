import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  REF_FIELDS_DATA,
  sanitizeFileName,
  sha256Hex,
  genBlockId,
  extractMedia,
  cloneTemplateBlocks,
  computeTopologicalRoot,
  type MediaKind,
  type ExtractedMedia,
} from "../_shared/clone-funnel-core.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// "Clonar Funil" (Atendimentos) — DETERMINISTIC reimplementation.
//
// novo funil = sequência inbound do lead (100% determinística, sem IA)
//              + cópia profunda e independente do funil "Funil (Modelo)"
//
// Nenhuma IA participa da geração/organização da primeira parte. As
// mensagens do lead viram blocos 1:1, na ordem exata em que o Chat de
// Atendimentos as exibe, e são ligadas linearmente (next_block_id) até o
// start_block_id clonado do Funil (Modelo).
//
// Lógica pura/testável (clone do modelo, extração de mídia, hashing) vive em
// ../_shared/clone-funnel-core.ts — ver clone-funnel-core.test.ts.
// ---------------------------------------------------------------------------

// Defaults neutros já usados pelo sistema para blocos criados manualmente no
// editor (src/types/funnel.ts::createDefaultBlock) — não são deduzidos do
// intervalo real entre as mensagens da conversa nem escolhidos por IA.
const BLOCK_DEFAULTS: Record<string, Record<string, unknown>> = {
  message: { delay_ms: 5000, show_typing: true, typing_duration_ms: 5000 },
  image: { delay_ms: 5000, show_typing: true },
  audio: { delay_ms: 5000, show_typing: true, typing_duration_ms: 5000, ptt: true },
  video: { delay_ms: 5000, show_typing: true, video_type: 'file' },
  document: { delay_ms: 5000, show_typing: true },
};

const DEFAULT_BLOCK_CHANNELS = ['chat', 'form', 'widget', 'whatsapp'];

// Tipos/extensões/tamanho aceitos ao materializar mídia inbound em
// Storage permanente. Rejeita disfarces (ex.: .exe renomeado para .jpg) e
// path traversal (nome sempre passa por sanitizeFileName).
const MIME_ALLOW_PREFIX: Record<MediaKind, string[]> = {
  image: ['image/'],
  audio: ['audio/'],
  video: ['video/'],
  document: ['application/pdf', 'application/msword', 'application/vnd.', 'text/plain', 'image/'],
};
const MAX_MEDIA_BYTES = 60 * 1024 * 1024; // 60MB, bem acima do que WhatsApp permite

interface ManifestItem {
  message_id: string;
  provider_message_id: string | null;
  position: number;
  timestamp_used: string;
  kind: MediaKind | 'text';
  block_id: string;
  extra_block_id?: string; // legenda de áudio, quando aplicável
}

interface ResolvedMediaAsset {
  manifestIndex: number;
  kind: MediaKind;
  bytes: Uint8Array;
  mime: string;
  extension: string;
  originalFileName: string | null;
  caption: string | null;
  hash: string;
}

async function fetchAndValidateMedia(media: ExtractedMedia, messageId: string): Promise<ResolvedMediaAsset> {
  const response = await fetch(media.url);
  if (!response.ok) {
    throw new Error(`Falha ao baixar mídia da mensagem ${messageId}: HTTP ${response.status}`);
  }
  const buf = new Uint8Array(await response.arrayBuffer());
  if (buf.length === 0) throw new Error(`Mídia da mensagem ${messageId} veio vazia.`);
  if (buf.length > MAX_MEDIA_BYTES) {
    throw new Error(`Mídia da mensagem ${messageId} excede o limite de ${MAX_MEDIA_BYTES} bytes.`);
  }

  const mime = (response.headers.get('content-type') || media.mime || '').split(';')[0].trim().toLowerCase();
  const allowedPrefixes = MIME_ALLOW_PREFIX[media.kind];
  const mimeOk = mime && allowedPrefixes.some((p) => mime.startsWith(p));
  if (!mimeOk) {
    throw new Error(`Mídia da mensagem ${messageId} tem MIME type incompatível com '${media.kind}': ${mime || '(vazio)'}`);
  }

  const hash = await sha256Hex(buf);
  const extension = mime.split('/')[1]?.split('+')[0] || 'bin';

  return {
    manifestIndex: -1,
    kind: media.kind,
    bytes: buf,
    mime,
    extension,
    originalFileName: media.filename,
    caption: media.caption,
    hash,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Paths de Storage criados NESTA execução — usados para compensação caso
  // uma etapa posterior falhe antes da persistência do funil.
  const uploadedPaths: string[] = [];

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1-2. Autenticação/organização
    const { conversation_id, organization_id, user_id } = await req.json();

    if (!conversation_id || typeof conversation_id !== 'string') {
      throw new Error('conversation_id is required');
    }
    if (!organization_id || typeof organization_id !== 'string') {
      throw new Error('organization_id is required');
    }

    const { data: orgRow, error: orgError } = await supabase
      .from('organizations')
      .select('id, settings')
      .eq('id', organization_id)
      .single();
    if (orgError || !orgRow) {
      throw new Error('Organização não encontrada');
    }

    const templateFunnelId = orgRow.settings?.clone_funnel_template_id;
    if (!templateFunnelId || typeof templateFunnelId !== 'string') {
      throw new Error('Nenhum funil-modelo configurado para esta organização (organizations.settings.clone_funnel_template_id). Configure antes de usar "Clonar Funil".');
    }

    // 3. Conversa — busca EXATAMENTE pelo ID recebido, sem ampliar por
    // telefone/lead/instância/organização.
    const { data: conversation, error: convError } = await supabase
      .from('webchat_conversations')
      .select('*, leads(*)')
      .eq('id', conversation_id)
      .eq('organization_id', organization_id)
      .single();
    if (convError || !conversation) {
      throw new Error('Conversa não encontrada ou não pertence a esta organização.');
    }

    const lead = conversation.leads;
    const leadName = lead?.name || conversation.visitor_name || 'Visitante';
    let productId = lead?.product_id;
    if (!productId) {
      const { data: firstProduct } = await supabase
        .from('products')
        .select('id')
        .eq('organization_id', organization_id)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();
      productId = firstProduct?.id;
    }
    if (!productId) {
      throw new Error('Nenhum produto encontrado para esta organização.');
    }

    // 4-6. Mensagens: MESMA fonte e MESMO critério de ordenação usados pelo
    // Chat de Atendimentos (supabase/functions/webchat-inbox/index.ts):
    // .eq('conversation_id', id).order('created_at', { ascending: true }).
    // Adicionamos `id` como desempate estável (a tela não tem desempate
    // explícito; para nossa própria reprodutibilidade usamos `id` como
    // segundo critério — isso nunca diverge da ordem exibida, exceto no
    // caso extremamente raro de duas mensagens com created_at idêntico até
    // o microssegundo, caso em que a tela também não garante uma ordem
    // estável).
    const { data: allMessages, error: msgError } = await supabase
      .from('webchat_messages')
      .select('id, conversation_id, direction, sender_type, content, metadata, is_deleted, created_at')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (msgError) {
      throw new Error(`Falha ao buscar mensagens: ${msgError.message}`);
    }

    const eligible = (allMessages || []).filter((m: any) => {
      if (m.direction !== 'inbound') return false;
      if (m.sender_type !== 'visitor') return false;
      if (m.is_deleted === true) return false;
      return true;
    });

    // Autoria/direção ambígua (registros legados divergentes): não incluir
    // silenciosamente, apenas registrar para o relatório.
    const ambiguous = (allMessages || []).filter((m: any) => {
      const looksInbound = m.direction === 'inbound' || m.sender_type === 'visitor';
      const looksOutbound = m.direction === 'outbound' || m.sender_type === 'agent' || m.sender_type === 'bot';
      return looksInbound && looksOutbound;
    });
    if (ambiguous.length > 0) {
      console.warn(`[clone-funnel] ${ambiguous.length} mensagem(ns) com direção/autoria ambígua na conversa ${conversation_id} — excluídas por segurança.`);
    }

    if (eligible.length === 0) {
      throw new Error('A conversa selecionada não possui nenhuma mensagem inbound elegível do lead. Nenhum funil foi criado.');
    }

    // 7. Manifesto determinístico (em memória)
    const manifest: ManifestItem[] = [];
    const mediaToResolve: { index: number; media: ExtractedMedia; messageId: string }[] = [];
    const textItems: { index: number; content: string }[] = [];

    eligible.forEach((msg: any, i: number) => {
      const media = extractMedia(msg); // lança erro (fail-closed) se mídia mal-formada
      if (media) {
        mediaToResolve.push({ index: i, media, messageId: msg.id });
      } else {
        textItems.push({ index: i, content: msg.content ?? '' });
      }
    });

    // 8. Localizar e validar TODAS as mídias antes de qualquer persistência.
    const resolvedAssets = new Map<number, ResolvedMediaAsset>();
    for (const item of mediaToResolve) {
      const asset = await fetchAndValidateMedia(item.media, item.messageId);
      asset.manifestIndex = item.index;
      resolvedAssets.set(item.index, asset);
    }

    // 9. Validar o funil-modelo configurado.
    const { data: templateFunnel, error: templateError } = await supabase
      .from('capture_funnels')
      .select('id, name, organization_id, start_block_id, flow_blocks')
      .eq('id', templateFunnelId)
      .eq('organization_id', organization_id)
      .single();
    if (templateError || !templateFunnel) {
      throw new Error('Funil-modelo configurado não foi encontrado ou não pertence a esta organização.');
    }
    if (!Array.isArray(templateFunnel.flow_blocks) || templateFunnel.flow_blocks.length === 0) {
      throw new Error('Funil-modelo configurado está sem blocos válidos.');
    }

    // 10. Clonar o modelo em memória (IDs novos, sem executar nada dele).
    //
    // A entrada usada é a RAIZ TOPOLÓGICA REAL do grafo (o único bloco que
    // nenhum outro referencia) — não o `start_block_id` gravado no registro.
    // Auditoria de 2026-08-08 confirmou que, no "Funil (Modelo)", o
    // start_block_id configurado pulava a pergunta inicial ("Consegue abrir
    // os rótulos? 🥰") e o wait_response que preenche a variável `resposta`,
    // entrando direto no bloco de condição que testa essa variável — que
    // ficaria sempre vazia. computeTopologicalRoot() falha fechado se o
    // funil-modelo não tiver exatamente uma raiz (nunca escolhe por
    // aproximação).
    const modelEntryBlockId = computeTopologicalRoot(templateFunnel.flow_blocks as any[]);
    const { blocks: modelBlocks, start_block_id: modelStartBlockId } = cloneTemplateBlocks(
      templateFunnel.flow_blocks as any[],
      modelEntryBlockId
    );

    // 11-12. Construir a sequência linear do lead e ligar ao modelo.
    // Idempotência: fingerprint determinístico (conversa + modelo + IDs das
    // mensagens incluídas) vira o slug do funil. Duas chamadas equivalentes
    // (clique duplo, retry) colidem no índice único (organization_id, slug)
    // já existente na tabela e a segunda apenas retorna o funil já criado —
    // sem depender de migration nova.
    const fingerprintInput = JSON.stringify({
      conversation_id,
      template_funnel_id: templateFunnelId,
      message_ids: eligible.map((m: any) => m.id),
    });
    const fingerprint = await sha256Hex(fingerprintInput);
    const slug = `clone-${conversation_id.slice(0, 8)}-${fingerprint.slice(0, 12)}`;

    const { data: existingFunnel } = await supabase
      .from('capture_funnels')
      .select('id')
      .eq('organization_id', organization_id)
      .eq('slug', slug)
      .maybeSingle();
    if (existingFunnel) {
      return new Response(
        JSON.stringify({ success: true, funnel_id: existingFunnel.id, idempotent: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const leadBlocks: any[] = [];
    let leadBlockCursor = 0;

    for (let i = 0; i < eligible.length; i++) {
      const msg = eligible[i];
      const asset = resolvedAssets.get(i);

      if (asset) {
        const blockId = genBlockId();
        const data: any = {
          ...BLOCK_DEFAULTS[asset.kind],
          channels: DEFAULT_BLOCK_CHANNELS,
        };

        if (asset.kind === 'image') {
          data.image_url = '__PENDING_UPLOAD__';
          data.image_alt = asset.originalFileName || '';
          if (asset.caption) data.content = asset.caption;
        } else if (asset.kind === 'video') {
          data.video_url = '__PENDING_UPLOAD__';
          if (asset.caption) data.content = asset.caption;
        } else if (asset.kind === 'document') {
          data.document_url = '__PENDING_UPLOAD__';
          data.file_name = asset.originalFileName || `documento.${asset.extension}`;
          if (asset.caption) data.content = asset.caption;
        } else if (asset.kind === 'audio') {
          data.audio_url = '__PENDING_UPLOAD__';
          // 'audio' não tem campo de legenda no schema — legenda vira um
          // bloco de texto separado, logo depois, sem alterar o conteúdo.
        }

        const block = { id: blockId, type: asset.kind, position: { x: 0, y: 0 }, data, next_block_id: null };
        leadBlocks.push(block);
        (asset as any).__blockId = blockId;
        leadBlockCursor++;

        const manifestItem: ManifestItem = {
          message_id: msg.id,
          provider_message_id: msg.metadata?.evolution_message_id || null,
          position: i,
          timestamp_used: msg.created_at,
          kind: asset.kind,
          block_id: blockId,
        };

        if (asset.kind === 'audio' && asset.caption) {
          const captionBlockId = genBlockId();
          leadBlocks.push({
            id: captionBlockId,
            type: 'message',
            position: { x: 0, y: 0 },
            data: { content: asset.caption, ...BLOCK_DEFAULTS.message, channels: DEFAULT_BLOCK_CHANNELS },
            next_block_id: null,
          });
          manifestItem.extra_block_id = captionBlockId;
          leadBlockCursor++;
        }

        manifest.push(manifestItem);
      } else {
        const blockId = genBlockId();
        leadBlocks.push({
          id: blockId,
          type: 'message',
          position: { x: 0, y: 0 },
          data: { content: msg.content ?? '', ...BLOCK_DEFAULTS.message, channels: DEFAULT_BLOCK_CHANNELS },
          next_block_id: null,
        });
        leadBlockCursor++;
        manifest.push({
          message_id: msg.id,
          provider_message_id: msg.metadata?.evolution_message_id || null,
          position: i,
          timestamp_used: msg.created_at,
          kind: 'text',
          block_id: blockId,
        });
      }
    }

    // Liga a sequência: block[i].next_block_id = block[i+1].id; o último
    // aponta para a entrada clonada do funil-modelo.
    for (let i = 0; i < leadBlocks.length; i++) {
      leadBlocks[i].next_block_id = i < leadBlocks.length - 1 ? leadBlocks[i + 1].id : modelStartBlockId;
    }

    // Posições visuais: sequência do lead em linha, seguida pelo modelo
    // deslocado (preservando as posições relativas internas do modelo).
    const LEAD_SPACING_X = 320;
    leadBlocks.forEach((b, i) => {
      b.position = { x: i * LEAD_SPACING_X, y: 0 };
    });
    const modelMinX = Math.min(...modelBlocks.map((b: any) => (typeof b.position?.x === 'number' ? b.position.x : 0)));
    const offsetX = leadBlocks.length * LEAD_SPACING_X + LEAD_SPACING_X - modelMinX;
    modelBlocks.forEach((b: any) => {
      const x = typeof b.position?.x === 'number' ? b.position.x : 0;
      const y = typeof b.position?.y === 'number' ? b.position.y : 0;
      b.position = { x: x + offsetX, y };
    });

    const flowBlocks = [...leadBlocks, ...modelBlocks];
    const startBlockId = leadBlocks[0].id;

    // 13. Validar o grafo completo antes de qualquer upload/persistência.
    const allIds = new Set(flowBlocks.map((b: any) => b.id));
    if (allIds.size !== flowBlocks.length) throw new Error('IDs de bloco duplicados no funil final.');
    if (!allIds.has(startBlockId)) throw new Error('start_block_id calculado não existe no funil final.');
    for (const b of flowBlocks as any[]) {
      const refs = [b.next_block_id, ...REF_FIELDS_DATA.map((f) => b.data?.[f])].filter(Boolean);
      for (const r of refs) {
        if (!allIds.has(r)) throw new Error(`Referência para id inexistente no funil final: bloco ${b.id} -> ${r}`);
      }
    }
    // Nenhum bloco do lead pode ficar órfão (sem next_block_id resolvido) e
    // nenhum item outbound deve ter entrado no manifesto.
    if (manifest.length !== eligible.length) {
      throw new Error('Divergência entre manifesto e mensagens elegíveis — abortando.');
    }

    // 14. Upload permanente das mídias validadas (content-addressed: mesmo
    // hash => mesmo path, sem re-upload físico; duas ocorrências distintas
    // do mesmo arquivo continuam gerando dois blocos, apenas compartilham o
    // asset).
    const uploadedUrlByHash = new Map<string, string>();
    for (const [, asset] of resolvedAssets) {
      let publicUrl = uploadedUrlByHash.get(asset.hash);
      if (!publicUrl) {
        const safeName = sanitizeFileName(asset.originalFileName || `${asset.hash}.${asset.extension}`);
        const path = `${asset.kind}/${organization_id}/${asset.hash}-${safeName}`;

        const { data: existingList } = await supabase.storage.from('funnel-assets').list(`${asset.kind}/${organization_id}`, {
          search: `${asset.hash}-`,
        });
        const alreadyThere = (existingList || []).some((f: any) => f.name === `${asset.hash}-${safeName}`);

        if (!alreadyThere) {
          const { error: uploadError } = await supabase.storage
            .from('funnel-assets')
            .upload(path, asset.bytes, { contentType: asset.mime, upsert: false });
          if (uploadError && !String(uploadError.message || '').includes('already exists')) {
            throw new Error(`Falha ao enviar mídia para Storage permanente: ${uploadError.message}`);
          }
          if (!uploadError) uploadedPaths.push(path);
        }

        const { data: { publicUrl: url } } = supabase.storage.from('funnel-assets').getPublicUrl(path);
        publicUrl = url;
        uploadedUrlByHash.set(asset.hash, publicUrl);
      }

      const blockId = (asset as any).__blockId as string;
      const block = flowBlocks.find((b: any) => b.id === blockId);
      if (!block) throw new Error('Bloco de mídia não encontrado ao atribuir URL permanente — abortando.');
      if (asset.kind === 'image') block.data.image_url = publicUrl;
      else if (asset.kind === 'video') block.data.video_url = publicUrl;
      else if (asset.kind === 'document') block.data.document_url = publicUrl;
      else if (asset.kind === 'audio') block.data.audio_url = publicUrl;
    }

    // Nenhuma URL temporária pode sobreviver.
    for (const b of flowBlocks as any[]) {
      for (const f of ['image_url', 'video_url', 'document_url', 'audio_url']) {
        if (b.data?.[f] === '__PENDING_UPLOAD__') {
          throw new Error(`Bloco ${b.id} ficou com URL de mídia não resolvida — abortando.`);
        }
      }
    }

    // 15. Persistir — só agora, depois de toda validação.
    const funnelName = `Funil ${leadName} - Clonado`;

    const { data: newFunnel, error: insertError } = await supabase
      .from('capture_funnels')
      .insert({
        organization_id,
        product_id: productId,
        name: funnelName,
        slug,
        status: 'draft',
        flow_blocks: flowBlocks,
        start_block_id: startBlockId,
        created_by: user_id,
        channels: {
          chat: { enabled: true },
          form: { enabled: true },
          widget: { enabled: true },
          whatsapp: { enabled: true },
        },
      })
      .select()
      .single();

    if (insertError) {
      // 16. Compensação: remove somente os arquivos criados NESTA execução.
      if (uploadedPaths.length > 0) {
        await supabase.storage.from('funnel-assets').remove(uploadedPaths);
      }
      // Corrida real (dois cliques simultâneos ganhando a checagem de
      // idempotência ao mesmo tempo): o índice único (organization_id, slug)
      // rejeita o segundo insert — devolve o que já existe em vez de erro.
      if (insertError.code === '23505') {
        const { data: raceWinner } = await supabase
          .from('capture_funnels')
          .select('id')
          .eq('organization_id', organization_id)
          .eq('slug', slug)
          .maybeSingle();
        if (raceWinner) {
          return new Response(
            JSON.stringify({ success: true, funnel_id: raceWinner.id, idempotent: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      throw new Error(`Falha ao criar funil: ${insertError.message}`);
    }

    console.log(`[clone-funnel] funil ${newFunnel.id} criado: ${manifest.length} mensagens do lead + ${modelBlocks.length} blocos do modelo`);

    return new Response(
      JSON.stringify({ success: true, funnel_id: newFunnel.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    if (uploadedPaths.length > 0) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        await supabase.storage.from('funnel-assets').remove(uploadedPaths);
      } catch (cleanupError) {
        console.error('[clone-funnel] Falha na compensação de Storage:', cleanupError);
      }
    }
    console.error('Clone funnel error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
