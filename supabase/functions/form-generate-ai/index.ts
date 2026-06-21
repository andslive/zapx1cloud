import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateFormRequest {
  product_id: string;
  objective: 'qualification' | 'diagnostic' | 'capture' | 'presale' | 'feedback';
  tone: 'formal' | 'informal' | 'technical';
  num_questions: number;
  form_name?: string;
  // New fields for enhanced generation
  user_context?: string;
  use_brain?: boolean;
  use_objections?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      product_id, 
      objective, 
      tone, 
      num_questions, 
      form_name,
      user_context = '',
      use_brain = true,
      use_objections = true
    } = await req.json() as GenerateFormRequest;

    console.log('Generating form for product:', product_id, 'objective:', objective, 'with brain:', use_brain, 'with objections:', use_objections);

    // Fetch product details
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', product_id)
      .single();

    if (productError || !product) {
      console.error('Product not found:', productError);
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
ICP (Cliente Ideal): ${product.icp_description || 'N/A'}
Diferenciais: ${product.differentials || 'N/A'}
Problemas que resolve: ${product.problems_solved || 'N/A'}
`;

    // Fetch knowledge sources for context (if use_brain is true)
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
          return `${ks.title} (${ks.source_type}): ${ks.extracted_content?.substring(0, 800) || ''}`;
        }).join('\n\n');
      }

      // Fetch agent training materials
      const { data: trainingMaterials } = await supabase
        .from('agent_training_materials')
        .select('content')
        .eq('product_id', product_id)
        .limit(5);

      if (trainingMaterials && trainingMaterials.length > 0) {
        knowledgeContext += '\n\nMateriais de Treinamento:\n' + 
          trainingMaterials.map(m => m.content?.substring(0, 500)).join('\n');
      }
    }

    // Fetch objections (if use_objections is true)
    let objectionsContext = '';
    if (use_objections) {
      const { data: objections } = await supabase
        .from('objections')
        .select('category, what_they_say, what_they_mean, suggested_response')
        .eq('product_id', product_id)
        .limit(10);

      if (objections && objections.length > 0) {
        objectionsContext = objections.map(obj => 
          `- Categoria: ${obj.category}\n  O que dizem: "${obj.what_they_say}"\n  O que significa: ${obj.what_they_mean || 'N/A'}`
        ).join('\n\n');
      }
    }

    const objectiveDescriptions = {
      qualification: 'Qualificar leads identificando fit com o produto e maturidade de compra. Crie perguntas que identifiquem se o lead é um ICP qualificado.',
      diagnostic: 'Diagnosticar necessidades e dores do lead para personalizar a abordagem comercial. Foque em entender o cenário atual e desafios.',
      capture: 'Captar informações básicas de contato de forma rápida e não-invasiva. Mantenha o formulário curto e direto.',
      presale: 'Preparar o lead para uma reunião de vendas coletando informações detalhadas sobre expectativas e orçamento.',
      feedback: 'Coletar feedback sobre o produto ou processo de vendas. Use escalas e perguntas abertas.',
    };

    const toneDescriptions = {
      formal: 'Use linguagem formal e profissional, adequada para B2B corporativo. Evite gírias e mantenha tom respeitoso.',
      informal: 'Use linguagem amigável e descontraída, como uma conversa casual. Seja acolhedor e empático.',
      technical: 'Use termos técnicos relevantes ao setor, assumindo conhecimento prévio. Seja preciso e objetivo.',
    };

    // Build enhanced system prompt
    const systemPrompt = `Você é um especialista em criação de formulários de captação de leads para vendas B2B.
Seu objetivo é gerar um formulário otimizado para conversão, baseado no contexto completo do produto e da campanha.

CONTEXTO DO PRODUTO:
${productContext}

${knowledgeContext ? `CONHECIMENTO DO CÉREBRO DO PRODUTO (Fontes Processadas):
${knowledgeContext}

` : ''}${objectionsContext ? `OBJEÇÕES COMUNS DOS CLIENTES (Use para criar perguntas de qualificação):
${objectionsContext}

` : ''}${user_context ? `CONTEXTO ESPECÍFICO DA CAMPANHA (Fornecido pelo usuário):
${user_context}

` : ''}OBJETIVO DO FORMULÁRIO: ${objectiveDescriptions[objective]}

TOM DE COMUNICAÇÃO: ${toneDescriptions[tone]}

REGRAS IMPORTANTES:
1. Crie perguntas claras e objetivas que qualifiquem o lead
2. Use a linguagem adequada ao tom solicitado
3. ${use_objections && objectionsContext ? 'Use as objeções para criar perguntas inteligentes de qualificação (ex: se objeção é preço, pergunte sobre orçamento disponível)' : 'Inclua perguntas que ajudem a entender o perfil do lead'}
4. ${use_brain && knowledgeContext ? 'Baseie as perguntas no conhecimento real do produto e seus diferenciais' : 'Foque nas necessidades típicas do ICP descrito'}
5. Limite ao número de perguntas solicitado (${num_questions} perguntas + telas de boas-vindas e agradecimento)
6. Retorne APENAS um JSON válido, sem explicações ou markdown

TIPOS DE BLOCOS DISPONÍVEIS:
- welcome_screen: Tela de boas-vindas (SEMPRE inclua como primeiro bloco)
- text: Pergunta de texto livre curto
- textarea: Pergunta de texto longo
- email: Captura de email (use maps_to: "email")
- phone: Captura de telefone (use maps_to: "phone")
- name: Captura de nome (use maps_to: "name")
- company: Captura de empresa (use maps_to: "company")
- select: Seleção única - use para perguntas de múltipla escolha (inclua "options" array)
- multi_select: Seleção múltipla (inclua "options" array)
- scale: Escala numérica (inclua "scale_options" com min, max, min_label, max_label)
- thank_you_screen: Tela de agradecimento (SEMPRE inclua como último bloco)

FORMATO DE RESPOSTA (JSON ARRAY):
[
  {
    "block_type": "welcome_screen",
    "label": "Título acolhedor baseado no pitch do produto",
    "description": "Subtítulo que gera expectativa para preencher"
  },
  {
    "block_type": "name",
    "label": "Como você se chama?",
    "placeholder": "Seu nome completo",
    "required": true,
    "maps_to": "name"
  },
  {
    "block_type": "select",
    "label": "Qual seu principal desafio hoje?",
    "description": "Isso nos ajuda a personalizar nossa conversa",
    "options": [
      {"label": "Opção baseada no ICP", "value": "opcao_1"},
      {"label": "Outra opção relevante", "value": "opcao_2"}
    ],
    "required": true
  },
  {
    "block_type": "scale",
    "label": "De 1 a 10, quão urgente é resolver isso?",
    "scale_options": {"min": 1, "max": 10, "min_label": "Pode esperar", "max_label": "Muito urgente"},
    "required": true
  },
  {
    "block_type": "email",
    "label": "Qual seu melhor email?",
    "placeholder": "seu@email.com",
    "required": true,
    "maps_to": "email"
  },
  {
    "block_type": "thank_you_screen",
    "label": "Obrigado pelo interesse!",
    "description": "Entraremos em contato em breve para ajudar você."
  }
]

IMPORTANTE: O array deve conter exatamente ${num_questions} blocos de pergunta, mais a tela de boas-vindas e a tela de agradecimento (total: ${num_questions + 2} blocos).`;

    const userPrompt = `Gere o formulário de ${num_questions} perguntas seguindo as instruções acima. Retorne APENAS o JSON array, sem explicações ou código markdown.`;

    console.log('Calling AI to generate form with enriched context...');

    // Call Lovable AI Gateway
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
        max_tokens: 3000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Erro ao gerar formulário com IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content;

    console.log('AI response received, parsing...');

    // Parse the JSON response
    let blocks;
    try {
      // Clean up the response (remove markdown code blocks if present)
      let cleanContent = aiContent.trim();
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }
      blocks = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiContent);
      return new Response(
        JSON.stringify({ error: 'Erro ao processar resposta da IA', raw: aiContent }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate and enhance blocks
    const enhancedBlocks = blocks.map((block: any, index: number) => ({
      id: crypto.randomUUID(),
      form_id: '', // Will be set when saving
      block_type: block.block_type,
      label: block.label || 'Pergunta',
      description: block.description || null,
      placeholder: block.placeholder || null,
      required: block.required !== false,
      options: block.options || null,
      scale_options: block.scale_options || null,
      maps_to: block.maps_to || null,
      order_index: index,
      score_value: null,
      logic_rules: null,
      validation: null,
      block_settings: null,
    }));

    console.log('Generated', enhancedBlocks.length, 'blocks successfully');

    // Generate suggested form name based on context
    const objectiveNames = {
      qualification: 'Qualificação',
      diagnostic: 'Diagnóstico',
      capture: 'Captação',
      presale: 'Pré-venda',
      feedback: 'Feedback',
    };

    const suggestedName = form_name || `${product.name} - ${objectiveNames[objective]}`;

    return new Response(
      JSON.stringify({
        success: true,
        blocks: enhancedBlocks,
        suggested_name: suggestedName,
        product_name: product.name,
        context_used: {
          brain: use_brain && !!knowledgeContext,
          objections: use_objections && !!objectionsContext,
          user_context: !!user_context,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in form-generate-ai:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
