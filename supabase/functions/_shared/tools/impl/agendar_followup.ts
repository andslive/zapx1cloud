// Agenda um follow-up futuro com o lead (entra na fila ai_outreach_queue).
import type { ToolDefinition } from '../types.ts';

export const agendarFollowupTool: ToolDefinition = {
  name: 'agendar_followup',
  description:
    'Agenda um follow-up automático com o lead em uma data/hora futura. Use quando o lead pedir para retornar mais tarde, quando ficar de pensar, ou quando você quiser garantir uma reativação. Respeita horário comercial automaticamente.',
  categories: ['crm', 'communication'],
  estimated_cost_cents: 0,
  parameters: {
    type: 'object',
    properties: {
      hours_from_now: {
        type: 'number',
        description: 'Em quantas horas o follow-up deve ser disparado (ex: 24 = amanhã).',
      },
      objective: {
        type: 'string',
        description:
          'Objetivo do follow-up (ex: "retomar conversa sobre plano anual", "lembrar do desconto").',
      },
      extra_context: {
        type: 'string',
        description: 'Contexto adicional para o agente usar no follow-up.',
      },
    },
    required: ['hours_from_now', 'objective'],
    additionalProperties: false,
  },
  handler: async (input, ctx) => {
    if (!ctx.leadId) return { success: false, error: 'leadId obrigatório' };

    const hours = Math.max(0.25, Number(input.hours_from_now));
    const nextAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    // Carrega dados do lead para snapshot.
    const { data: lead } = await ctx.supabase
      .from('leads')
      .select('name, email, phone, product_id')
      .eq('id', ctx.leadId)
      .single();

    if (!lead) return { success: false, error: 'Lead não encontrado' };

    const { data: queued, error } = await ctx.supabase
      .from('ai_outreach_queue')
      .insert({
        organization_id: ctx.organizationId,
        lead_id: ctx.leadId,
        conversation_id: ctx.conversationId ?? null,
        agent_id: ctx.agentId ?? null,
        product_id: lead.product_id ?? null,
        objective: input.objective,
        extra_context: input.extra_context ?? null,
        lead_data: {
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
        },
        status: 'scheduled',
        followup_enabled: true,
        followup_interval_hours: 24,
        max_followups: 3,
        followups_sent: 0,
        next_followup_at: nextAt.toISOString(),
      })
      .select('id')
      .single();

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: { queue_id: queued.id, scheduled_for: nextAt.toISOString() },
      user_message: `Follow-up agendado para ${nextAt.toLocaleString('pt-BR')}.`,
    };
  },
};
