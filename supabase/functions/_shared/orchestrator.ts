// Orchestrator: classifies an incoming lead message into product + intent
// and decides whether to route, ask a clarifying question, or hand off to a human.

import { injectPromptVariables } from "./prompt-variables.ts";
import { aiChat } from "./ai-call.ts";

export type Intent = 'informacao' | 'compra' | 'suporte' | 'financeiro' | 'humano' | 'indefinida';

export interface OrchestratorOutput {
  produto_id: string | null;
  produto_nome: string | null;
  intencao: Intent;
  confianca: number;
  contexto_extraido: string;
  resposta_orquestrador: string;
}

export interface OrchestratorRunInput {
  supabase?: any;
  organizationId?: string | null;
  organizationName: string;
  channel: string;
  channelIdentifier?: string | null;
  products: Array<{ id: string; name: string; description?: string | null }>;
  orchestratorContext: string;
  questionCount: number;
  maxTriageQuestions: number;
  message: string;
  customPrompt?: string | null; // overrides the default prompt template
}

const DEFAULT_ORCHESTRATOR_TEMPLATE = `Você é o orquestrador de atendimento da {{organization_name}}.

Sua ÚNICA função é ler a mensagem recebida, classificar produto e intenção,
e retornar um JSON estruturado. Você não vende, não explica produtos,
não responde dúvidas técnicas. Apenas classifica e roteia.

CANAL DE ENTRADA
Canal: {{channel}}
Conexão: {{channel_identifier}}

PRODUTOS DISPONÍVEIS NESTA ORGANIZAÇÃO
{{products_list}}
Formato de cada produto: NOME (id: UUID) — descrição curta

INTENÇÕES QUE VOCÊ DEVE IDENTIFICAR
- informacao → lead quer entender o produto, tirar dúvida
- compra     → lead quer contratar, saber preço, condições
- suporte    → lead já é cliente e tem problema técnico
- financeiro → boleto, reembolso, cobrança, nota fiscal
- humano     → lead pediu explicitamente para falar com humano
- indefinida → não foi possível classificar com confiança

CONTEXTO ACUMULADO
{{orchestrator_context}}
Perguntas já feitas: {{question_count}}

MENSAGEM RECEBIDA
"{{message}}"

REGRAS
1. Se o lead falar "humano", "atendente", "pessoa", "vendedor", "falar com alguém"
   → intencao = "humano" imediatamente.
2. Se a confiança for menor que 0.6 para identificar o produto → produto_id = null.
3. Se produto_id for null e ainda houver perguntas disponíveis,
   → intencao = "indefinida" e escreva UMA pergunta curta em resposta_orquestrador.
4. Se produto_id continuar null e o limite de perguntas for atingido,
   → intencao = "humano" e resposta_orquestrador = "Vou te conectar com um dos nossos atendentes agora."
5. contexto_extraido deve ser uma frase objetiva do que o lead quer.
6. resposta_orquestrador só é preenchida quando intencao = "indefinida".`;

function buildPrompt(input: OrchestratorRunInput): string {
  const productsList = input.products.length
    ? input.products
        .map((p) => `- ${p.name} (id: ${p.id})${p.description ? ` — ${p.description.slice(0, 120)}` : ''}`)
        .join('\n')
    : '- (nenhum produto cadastrado)';

  const template = (input.customPrompt && input.customPrompt.trim().length > 0)
    ? input.customPrompt
    : DEFAULT_ORCHESTRATOR_TEMPLATE;

  return injectPromptVariables(template, {
    organization: { name: input.organizationName },
    conversation: {
      channel: input.channel,
      channel_identifier: input.channelIdentifier || '',
      orchestrator_context: input.orchestratorContext || '(nenhum)',
      question_count: input.questionCount,
    },
    message: input.message,
    products_list: productsList,
  });
}

const VALID_INTENTS: Intent[] = ['informacao', 'compra', 'suporte', 'financeiro', 'humano', 'indefinida'];

function safeOutput(partial: Partial<OrchestratorOutput>): OrchestratorOutput {
  const intent = (partial.intencao && VALID_INTENTS.includes(partial.intencao)) ? partial.intencao : 'indefinida';
  return {
    produto_id: partial.produto_id ?? null,
    produto_nome: partial.produto_nome ?? null,
    intencao: intent,
    confianca: typeof partial.confianca === 'number' ? Math.max(0, Math.min(1, partial.confianca)) : 0,
    contexto_extraido: partial.contexto_extraido || '',
    resposta_orquestrador: partial.resposta_orquestrador || '',
  };
}

export async function runOrchestrator(input: OrchestratorRunInput): Promise<OrchestratorOutput> {
  const systemPrompt = buildPrompt(input);

  const tool = {
    type: 'function',
    function: {
      name: 'classify_message',
      description: 'Classifica a mensagem recebida em produto + intenção',
      parameters: {
        type: 'object',
        properties: {
          produto_id: { type: ['string', 'null'], description: 'UUID exato do produto identificado, ou null' },
          produto_nome: { type: ['string', 'null'], description: 'Nome legível do produto, ou null' },
          intencao: { type: 'string', enum: VALID_INTENTS },
          confianca: { type: 'number', description: 'Confiança 0-1' },
          contexto_extraido: { type: 'string' },
          resposta_orquestrador: { type: 'string', description: 'Pergunta curta para o lead apenas se intencao=indefinida' },
        },
        required: ['intencao', 'confianca', 'contexto_extraido', 'resposta_orquestrador'],
        additionalProperties: false,
      },
    },
  };

  try {
    const { response: resp, config } = await aiChat({
      supabase: input.supabase,
      organizationId: input.organizationId,
      capability: 'agent_chat',
      model: 'google/gemini-2.5-flash',
      label: 'orchestrator',
      body: {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: input.message },
        ],
        tools: [tool],
        tool_choice: { type: 'function', function: { name: 'classify_message' } },
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('[orchestrator] provider error:', config.provider, resp.status, text);
      return safeOutput({
        intencao: 'indefinida',
        resposta_orquestrador: 'Pode me explicar com mais detalhes o que você precisa?',
      });
    }

    const data = await resp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return safeOutput({ intencao: 'indefinida', resposta_orquestrador: 'Pode me dizer um pouco mais sobre o que você procura?' });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (parseErr) {
      console.error('[orchestrator] JSON parse error:', parseErr);
      return safeOutput({ intencao: 'indefinida', resposta_orquestrador: 'Pode me dizer um pouco mais sobre o que você precisa?' });
    }

    return safeOutput(parsed);
  } catch (err) {
    console.error('[orchestrator] unexpected error:', err);
    return safeOutput({
      intencao: 'indefinida',
      resposta_orquestrador: 'Pode me explicar rapidamente o que você precisa?',
    });
  }
}

export const ORCHESTRATOR_DEFAULT_TEMPLATE = DEFAULT_ORCHESTRATOR_TEMPLATE;
