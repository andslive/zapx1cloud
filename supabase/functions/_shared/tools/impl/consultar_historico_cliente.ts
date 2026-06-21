// Consulta o histórico do cliente: compras anteriores (Cakto), interações, deals em aberto.
import type { ToolDefinition } from '../types.ts';

export const consultarHistoricoClienteTool: ToolDefinition = {
  name: 'consultar_historico_cliente',
  description:
    'Consulta o histórico completo do lead atual: compras anteriores via Cakto, deals em aberto, número de interações. Use ANTES de fazer ofertas para personalizar (ex: oferecer upsell se já é cliente, ou desconto se abandonou checkout).',
  categories: ['crm'],
  estimated_cost_cents: 0,
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  handler: async (_input, ctx) => {
    if (!ctx.leadId) return { success: false, error: 'leadId obrigatório' };

    const { data: lead } = await ctx.supabase
      .from('leads')
      .select('id, name, email, phone, created_at, lead_origin, lead_channel')
      .eq('id', ctx.leadId)
      .single();

    if (!lead) return { success: false, error: 'Lead não encontrado' };

    // Buscas paralelas para reduzir latência.
    const [ordersRes, dealsRes, interactionsRes, tagsRes] = await Promise.all([
      // Pedidos Cakto pelo e-mail/telefone.
      ctx.supabase
        .from('cakto_orders')
        .select('cakto_id, status, amount, product_name, paid_at, created_at_cakto')
        .eq('organization_id', ctx.organizationId)
        .or(
          [
            lead.email ? `customer_email.eq.${lead.email}` : null,
            lead.phone ? `customer_phone.eq.${lead.phone}` : null,
          ]
            .filter(Boolean)
            .join(','),
        )
        .order('created_at_cakto', { ascending: false })
        .limit(10),
      // Deals do lead.
      ctx.supabase
        .from('deals')
        .select('id, status, deal_value, plan_name, created_at, closed_at')
        .eq('lead_id', ctx.leadId)
        .order('created_at', { ascending: false })
        .limit(10),
      // Contagem de interações.
      ctx.supabase
        .from('lead_interactions')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', ctx.leadId),
      // Etiquetas atuais.
      ctx.supabase
        .from('lead_tag_assignments')
        .select('lead_tags(name, color)')
        .eq('lead_id', ctx.leadId),
    ]);

    const orders = ordersRes.data ?? [];
    const deals = dealsRes.data ?? [];
    const interactionsCount = interactionsRes.count ?? 0;
    const tags = (tagsRes.data ?? []).map((r: any) => r.lead_tags?.name).filter(Boolean);

    const paidOrders = orders.filter((o: any) => o.status === 'paid');
    const totalSpent = paidOrders.reduce((s: number, o: any) => s + Number(o.amount ?? 0), 0);
    const abandonedCheckouts = orders.filter((o: any) =>
      ['pending', 'waiting_payment'].includes(o.status),
    );

    return {
      success: true,
      data: {
        lead: {
          name: lead.name,
          created_at: lead.created_at,
          origin: lead.lead_origin,
          channel: lead.lead_channel,
        },
        is_existing_customer: paidOrders.length > 0,
        total_purchases: paidOrders.length,
        total_spent_brl: totalSpent,
        last_purchase: paidOrders[0]
          ? {
              product: paidOrders[0].product_name,
              amount: paidOrders[0].amount,
              paid_at: paidOrders[0].paid_at,
            }
          : null,
        abandoned_checkouts: abandonedCheckouts.length,
        open_deals: deals.filter((d: any) => d.status === 'open').length,
        won_deals: deals.filter((d: any) => d.status === 'won').length,
        lost_deals: deals.filter((d: any) => d.status === 'lost').length,
        total_interactions: interactionsCount,
        tags,
      },
    };
  },
};
