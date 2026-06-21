// Cria uma oportunidade (deal) no pipeline para o lead atual.
import type { ToolDefinition } from '../types.ts';

export const criarDealTool: ToolDefinition = {
  name: 'criar_deal',
  description:
    'Cria uma oportunidade de venda (deal) no pipeline para o lead atual. Use quando o lead demonstrar intenção clara de compra ou solicitar uma proposta. Não use para perguntas informativas.',
  categories: ['crm'],
  estimated_cost_cents: 0,
  parameters: {
    type: 'object',
    properties: {
      product_id: {
        type: 'string',
        description: 'UUID do produto a ser vinculado ao deal. Obrigatório.',
      },
      deal_value: {
        type: 'number',
        description: 'Valor estimado da oportunidade em reais (ex: 297.00).',
      },
      plan_name: {
        type: 'string',
        description: 'Nome do plano/oferta escolhido pelo lead, se aplicável.',
      },
      notes: {
        type: 'string',
        description: 'Observação curta sobre o contexto do deal.',
      },
    },
    required: ['product_id', 'deal_value'],
    additionalProperties: false,
  },
  handler: async (input, ctx) => {
    if (!ctx.leadId) {
      return { success: false, error: 'leadId é obrigatório no contexto' };
    }

    // Busca o vendedor responsável pelo lead (se houver)
    const { data: lead } = await ctx.supabase
      .from('leads')
      .select('assigned_to, organization_id')
      .eq('id', ctx.leadId)
      .single();

    if (!lead) {
      return { success: false, error: 'Lead não encontrado' };
    }

    // Se não há vendedor atribuído, usa um placeholder (deal "do agente")
    // — mas a tabela exige seller_id NOT NULL, então usamos o assigned_to do lead.
    const sellerId = lead.assigned_to;
    if (!sellerId) {
      return {
        success: false,
        error: 'Lead ainda não tem vendedor atribuído. Atribua antes de criar o deal.',
      };
    }

    const { data: deal, error } = await ctx.supabase
      .from('deals')
      .insert({
        lead_id: ctx.leadId,
        product_id: input.product_id,
        seller_id: sellerId,
        organization_id: ctx.organizationId,
        deal_value: input.deal_value,
        plan_name: input.plan_name ?? null,
        notes: input.notes ?? `Criado pelo agente ${ctx.agentName ?? 'IA'}`,
        status: 'open',
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: { deal_id: deal.id, deal_value: deal.deal_value },
      user_message: `Oportunidade registrada no valor de R$ ${Number(deal.deal_value).toFixed(2)}.`,
    };
  },
};
