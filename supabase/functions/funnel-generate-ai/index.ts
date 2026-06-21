import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateFunnelRequest {
  product_id: string;
  prompt: string;
  tone: 'formal' | 'informal' | 'technical';
  use_brain: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: 'LOVABLE_API_KEY não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { product_id, prompt, tone = 'informal', use_brain = true } = await req.json() as GenerateFunnelRequest;

    if (!product_id || !prompt) {
      return new Response(
        JSON.stringify({ error: 'product_id e prompt são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating funnel for product:', product_id);

    // Fetch product details
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', product_id)
      .single();

    if (productError || !product) {
      return new Response(
        JSON.stringify({ error: 'Produto não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build product context
    let productContext = `
Produto: ${product.name}
Descrição: ${product.description || 'N/A'}
Pitch: ${product.pitch || 'N/A'}
ICP (Cliente Ideal): ${product.icp || 'N/A'}
Diferenciais: ${product.differentials || 'N/A'}
Problemas que resolve: ${product.problems_solved || 'N/A'}
`;

    // Fetch knowledge sources if use_brain
    let knowledgeContext = '';
    if (use_brain) {
      const { data: knowledgeSources } = await supabase
        .from('product_knowledge_sources')
        .select('title, source_type, extracted_content, question, answer')
        .eq('product_id', product_id)
        .eq('status', 'processed')
        .eq('is_active', true)
        .limit(10);

      if (knowledgeSources && knowledgeSources.length > 0) {
        knowledgeContext = knowledgeSources.map(ks => {
          if (ks.source_type === 'faq' && ks.question && ks.answer) {
            return `FAQ - ${ks.question}: ${ks.answer}`;
          }
          return `${ks.title} (${ks.source_type}): ${ks.extracted_content?.substring(0, 500) || ''}`;
        }).join('\n\n');
      }
    }

    const toneDescriptions: Record<string, string> = {
      formal: 'Use linguagem formal e profissional. Evite gírias.',
      informal: 'Use linguagem amigável e descontraída, como uma conversa casual. Emojis são bem-vindos.',
      technical: 'Use termos técnicos relevantes. Seja preciso e objetivo.',
    };

    const systemPrompt = `Você é um especialista em criar funis de captação de leads de alta conversão.
Seu trabalho é transformar a descrição do usuário em um fluxo de blocos estruturados que serão renderizados como uma landing page interativa.

CONTEXTO DO PRODUTO:
${productContext}

${knowledgeContext ? `CONHECIMENTO DO PRODUTO (Cérebro):
${knowledgeContext}

` : ''}TOM DE COMUNICAÇÃO: ${toneDescriptions[tone]}

TIPOS DE BLOCOS DISPONÍVEIS:

1. **message** - Exibir texto/conteúdo para o lead
   Campos: { content: "texto com suporte a markdown" }
   Use para: boas-vindas, explicações, transições entre seções

2. **input** - Capturar um dado do lead
   Campos: { input_type: "name"|"email"|"phone"|"text"|"number"|"cpf"|"textarea", variable_name: "nome_variavel", placeholder: "texto placeholder", required: true/false }
   Use para: nome, email, WhatsApp, empresa, etc.

3. **buttons** - Menu de opções clicáveis (RAMIFICAÇÃO)
   Campos: { content: "pergunta ou contexto", options: [{ id: "uuid", label: "Texto da opção", emoji: "🚀", next_block_id: "uuid_do_bloco_destino" }] }
   Use para: escolhas que levam a caminhos diferentes. CADA OPÇÃO DEVE TER next_block_id apontando para o bloco correto.

4. **video** - Exibir vídeo embedado
   Campos: { content: "texto descritivo", video_url: "URL_PLACEHOLDER" }
   Use para: vídeos explicativos. Use "URL_PLACEHOLDER" como url — o usuário substituirá depois.

5. **end** - Tela final de sucesso
   Campos: { success_message: "mensagem final", redirect_url: "" }
   Use para: finalizar um caminho do funil

6. **score** - Adicionar pontuação ao lead (invisível)
   Campos: { score_value: número }

7. **tag** - Aplicar tags ao lead (invisível)
   Campos: { apply_tags: ["tag1", "tag2"] }

REGRAS DE CONEXÃO:
- Blocos lineares: use "next_block_id" no bloco para apontar para o próximo
- Blocos buttons: cada option tem seu próprio "next_block_id" (ramificação)
- Blocos score/tag: são invisíveis, conecte-os ao próximo bloco visível via next_block_id
- Blocos end: NÃO têm next_block_id (são terminais)
- Gere IDs usando formato UUID v4

REGRAS DE POSIÇÃO (X/Y no canvas):
- Blocos em sequência linear: incrementar Y em 150, manter X constante
- Quando houver ramificação (buttons com N opções): 
  - O bloco buttons fica na posição atual
  - Os caminhos ramificam horizontalmente: primeiro caminho em X=100, segundo em X=450, terceiro em X=800
  - Cada caminho continua incrementando Y normalmente
- Use X base = 250 para o fluxo principal

FORMATO DE RESPOSTA (JSON):
{
  "suggested_name": "Nome sugerido para o funil",
  "start_block_id": "uuid_do_primeiro_bloco",
  "flow_blocks": [
    {
      "id": "uuid-gerado",
      "type": "message",
      "position": { "x": 250, "y": 50 },
      "data": { "content": "Texto..." },
      "next_block_id": "uuid-proximo"
    }
  ]
}

IMPORTANTE:
- Retorne APENAS JSON válido, sem markdown ou explicações
- Todos os IDs devem ser UUIDs v4 únicos
- Todas as conexões next_block_id devem referenciar IDs existentes
- Cada caminho de ramificação DEVE terminar com um bloco "end"
- Use emojis nos botões para tornar a experiência mais visual
- Crie copies curtas e conversacionais, otimizadas para mobile
- Se o usuário mencionar vídeos, use blocos video com video_url: "URL_PLACEHOLDER"
- Se o usuário mencionar planos/preços, crie botões com as opções e blocos end com redirect_url vazio`;

    const userPrompt = `Crie o funil de captação seguindo esta descrição:

${prompt}

Retorne APENAS o JSON no formato especificado, sem explicações.`;

    console.log('Calling AI to generate funnel...');

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 8000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente em alguns segundos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos insuficientes. Adicione créditos ao workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'Erro ao gerar funil com IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content;

    console.log('AI response received, parsing...');

    // Parse JSON response
    let parsed;
    try {
      let cleanContent = aiContent.trim();
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }
      parsed = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiContent);
      return new Response(
        JSON.stringify({ error: 'Erro ao processar resposta da IA. Tente novamente.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate structure
    if (!parsed.flow_blocks || !Array.isArray(parsed.flow_blocks) || parsed.flow_blocks.length === 0) {
      return new Response(
        JSON.stringify({ error: 'IA não gerou blocos válidos. Tente com uma descrição mais detalhada.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure all blocks have required fields
    const validatedBlocks = parsed.flow_blocks.map((block: any) => ({
      id: block.id || crypto.randomUUID(),
      type: block.type || 'message',
      position: block.position || { x: 250, y: 50 },
      data: block.data || {},
      next_block_id: block.next_block_id || null,
    }));

    console.log('Generated', validatedBlocks.length, 'blocks successfully');

    return new Response(
      JSON.stringify({
        success: true,
        flow_blocks: validatedBlocks,
        start_block_id: parsed.start_block_id || validatedBlocks[0]?.id,
        suggested_name: parsed.suggested_name || `Funil - ${product.name}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in funnel-generate-ai:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
