import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveAIProvider } from "../_shared/ai-credentials.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function sanitizeFileName(name: string): string {
  if (!name) return `file-${Date.now()}`;
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-zA-Z0-9.-]/g, "_") // Keep only safe chars
    .replace(/\.\.+/g, ".") // No double dots
    .replace(/^_+|_+$/g, ""); // No leading/trailing underscores
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { conversation_id, organization_id, user_id } = await req.json();

    if (!conversation_id) {
      throw new Error('conversation_id is required');
    }

    // 1. Fetch conversation and lead
    const { data: conversation, error: convError } = await supabase
      .from('webchat_conversations')
      .select('*, leads(*)')
      .eq('id', conversation_id)
      .single();

    if (convError || !conversation) {
      throw new Error('Conversation not found');
    }

    const lead = conversation.leads;
    const leadName = lead?.name || conversation.visitor_name || 'Visitante';
    let productId = lead?.product_id;

    // 2. Fetch first product if missing
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
      throw new Error('No product found for this organization');
    }

    // 3. Fetch inbound messages
    const { data: messages, error: msgError } = await supabase
      .from('webchat_messages')
      .select('*')
      .eq('conversation_id', conversation_id)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: true });

    if (msgError) {
      throw new Error('Failed to fetch messages');
    }

    // Helper to upload media
    const uploadMedia = async (url: string, kind: string, fileName?: string) => {
      try {
        if (url.includes('.supabase.co/storage/v1/object/public/')) {
          if (url.includes('/funnel-assets/')) return url;
        }

        const response = await fetch(url);
        if (!response.ok) {
          console.error(`Failed to fetch media from ${url}: ${response.status}`);
          return null;
        }
        
        const blob = await response.blob();
        const extension = blob.type.split('/')[1]?.split(';')[0] || 'bin';
        const safeKind = kind.toLowerCase().replace(/[^a-z]/g, 'document');
        const safeFileName = sanitizeFileName(fileName || `file-${Date.now()}.${extension}`);
        const path = `${safeKind}/${Date.now()}-${safeFileName}`;

        const { data, error } = await supabase.storage
          .from('funnel-assets')
          .upload(path, blob, {
            contentType: blob.type,
            upsert: true
          });

        if (error) {
          console.error('Storage upload error:', error);
          return null;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('funnel-assets')
          .getPublicUrl(path);

        return publicUrl;
      } catch (e) {
        console.error('Failed to proxy media:', e);
        return null;
      }
    };

    // Prepare message data for AI
    const preparedMessages: any[] = [];
    for (const msg of messages) {
      let metadata = msg.metadata || {};
      
      // Try parsing content as metadata if empty
      if ((!metadata || Object.keys(metadata).length === 0) && msg.content && msg.content.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(msg.content);
          metadata = parsed.message || parsed;
        } catch (e) { /* ignore */ }
      }

      let mediaUrl = null;
      let mediaKind = null;
      let fileName = null;

      // Media extraction
      if (metadata.media && metadata.media.url) {
        mediaUrl = metadata.media.url;
        mediaKind = metadata.media.kind || metadata.media.type || metadata.media.multimodal_processed;
        fileName = metadata.media.filename || metadata.media.fileName;
      } else if (metadata.imageMessage) {
        mediaUrl = metadata.imageMessage.url || metadata.imageMessage.directPath || metadata.imageMessage.URL || metadata.imageMessage.DirectPath;
        mediaKind = 'image';
      } else if (metadata.videoMessage) {
        mediaUrl = metadata.videoMessage.url || metadata.videoMessage.directPath || metadata.videoMessage.URL || metadata.videoMessage.DirectPath;
        mediaKind = 'video';
      } else if (metadata.audioMessage) {
        mediaUrl = metadata.audioMessage.url || metadata.audioMessage.directPath || metadata.audioMessage.URL || metadata.audioMessage.DirectPath;
        mediaKind = 'audio';
      } else if (metadata.documentMessage) {
        mediaUrl = metadata.documentMessage.url || metadata.documentMessage.directPath || metadata.documentMessage.URL || metadata.documentMessage.DirectPath;
        mediaKind = 'document';
        fileName = metadata.documentMessage.fileName || metadata.documentMessage.filename;
      }

      let finalMediaUrl = null;
      if (mediaUrl) {
        finalMediaUrl = await uploadMedia(mediaUrl, mediaKind || 'document', fileName);
      }

      preparedMessages.push({
        sender: msg.sender_type === 'visitor' ? 'Lead' : 'Bot',
        text: msg.content,
        mediaUrl: finalMediaUrl,
        mediaKind: mediaKind,
        fileName: fileName
      });
    }

    // 4. Use AI to generate funnel blocks
    console.log('[clone-funnel] calling AI for block generation');
    const { provider, apiKey, model } = await resolveAIProvider(organization_id, "content_generation");
    
    const systemPrompt = `Você é um arquiteto de funis de vendas para WhatsApp. Sua tarefa é transformar uma sequência de mensagens em um funil de automação no formato JSON.
    As mensagens foram enviadas pelo Lead durante uma conversa. O usuário quer transformar essas mensagens (incluindo áudios e documentos) em um funil que possa ser enviado para outros leads.
    
    REGRAS:
    1. Crie blocos individuais para cada mensagem, áudio ou documento.
    2. NÃO conecte os blocos. O campo 'next_block_id' deve ser SEMPRE null.
    3. Tipos de blocos suportados e seus dados:
       - 'message': Para texto. Data: { "content": string, "delay_ms": 5000, "typing_duration_ms": 5000, "channels": ["chat", "form", "widget", "whatsapp"] }
       - 'audio': Para áudio. Data: { "audio_url": string, "ptt": true, "delay_ms": 0, "typing_duration_ms": 5000, "channels": [...] }
       - 'image': Para imagens. Data: { "image_url": string, "content": string, "channels": [...] }
       - 'video': Para vídeos. Data: { "video_url": string, "video_type": "file", "content": string, "channels": [...] }
       - 'document': Para PDFs/Arquivos. Data: { "document_url": string, "file_name": string, "content": string, "channels": [...] }
    4. Organize os blocos em 3 colunas paralelas conforme o tipo:
       - Coluna 1 (Mensagens/Imagens): x: 250
       - Coluna 2 (Áudios): x: 550
       - Coluna 3 (Vídeos/Documentos): x: 850
    5. O valor de 'y' deve ser incremental dentro de cada coluna (ex: 100, 250, 400...).
    6. Retorne APENAS o JSON no formato: { "blocks": [...] }.`;

    const userPrompt = `Conversa com o Lead (${leadName}):
    ${preparedMessages.map((m, i) => `Mensagem ${i}: [${m.sender}] ${m.text} ${m.mediaUrl ? `(Mídia: ${m.mediaUrl}, Tipo: ${m.mediaKind}, Nome: ${m.fileName})` : ''}`).join('\n')}`;

    let flowBlocks: any[] = [];
    
    try {
      const isOpenAI = apiKey.startsWith("sk-");
      const aiUrl = isOpenAI
        ? "https://api.openai.com/v1/chat/completions"
        : "https://ai.gateway.lovable.dev/v1/chat/completions";

      let modelName = model || 'gpt-4o-mini';
      if (!isOpenAI && !modelName.includes("/")) {
        modelName = `openai/${modelName}`;
      }

      const aiResponse = await fetch(aiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        })
      });

      const aiData = await aiResponse.json();
      const content = aiData.choices?.[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        flowBlocks = parsed.blocks || [];
        
        // Post-process to ensure columns and no connections
        if (flowBlocks.length > 0) {
          let messageY = 100;
          let audioY = 100;
          let documentY = 100;

          flowBlocks = flowBlocks.map((block: any) => {
            const type = block.type;
            let x = 250;
            let y = 100;

            if (type === 'audio') {
              x = 550;
              y = audioY;
              audioY += 200;
            } else if (type === 'document' || type === 'video') {
              x = 850;
              y = documentY;
              documentY += 200;
            } else {
              x = 250;
              y = messageY;
              messageY += 200;
            }

            return {
              ...block,
              next_block_id: null,
              position: { x, y },
              data: {
                ...block.data,
                delay_ms: type === 'message' ? (block.data.delay_ms ?? 5000) : (type === 'audio' ? 0 : (block.data.delay_ms ?? 500)),
                typing_duration_ms: (type === 'message' || type === 'audio') ? (block.data.typing_duration_ms ?? 5000) : block.data.typing_duration_ms,
                ptt: type === 'audio' ? true : block.data.ptt,
                channels: block.data.channels || ['chat', 'form', 'widget', 'whatsapp']
              }
            };
          });
        }
      }
    } catch (e) {
      console.error('[clone-funnel] AI generation failed, falling back to basic logic', e);
      // Fallback logic here if needed, but we'll try to rely on AI first
    }

    // 5. Create the funnel
    const funnelName = `Funil ${leadName} - AI`;
    const slug = `${leadName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString().slice(-4)}`;

    if (flowBlocks.length === 0) {
      throw new Error('No blocks generated for the funnel');
    }

    const { data: newFunnel, error: insertError } = await supabase
      .from('capture_funnels')
      .insert({
        organization_id,
        product_id: productId,
        name: funnelName,
        slug,
        status: 'draft',
        flow_blocks: flowBlocks,
        start_block_id: null,
        created_by: user_id,
        channels: {
          chat: { enabled: true },
          form: { enabled: true },
          widget: { enabled: true },
          whatsapp: { enabled: true }
        }
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to create funnel: ${insertError.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, funnel_id: newFunnel.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Clone funnel error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});