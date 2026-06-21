// Gera um link de pagamento para o lead. Inicialmente integra com Cakto (suportado pela plataforma);
// no futuro pode rotear para Asaas/Stripe baseado na configuração da organização.
import type { ToolDefinition } from '../types.ts';

export const gerarLinkPagamentoTool: ToolDefinition = {
  name: 'gerar_link_pagamento',
  description:
    'Gera um link de pagamento (Pix/cartão) para o lead finalizar a compra. Use quando o lead confirmar a intenção de pagar AGORA. O link já vem com o e-mail/telefone do lead pré-preenchido quando possível.',
  categories: ['finance'],
  estimated_cost_cents: 0,
  parameters: {
    type: 'object',
    properties: {
      product_id: {
        type: 'string',
        description: 'UUID do produto a ser vendido.',
      },
      offer_id: {
        type: 'string',
        description: 'UUID da oferta específica (opcional). Se omitido, usa a oferta padrão do produto.',
      },
      payment_method: {
        type: 'string',
        enum: ['pix', 'credit_card', 'any'],
        description: 'Método de pagamento preferido. "any" deixa o cliente escolher.',
      },
    },
    required: ['product_id'],
    additionalProperties: false,
  },
  handler: async (input, ctx) => {
    if (!ctx.leadId) {
      return { success: false, error: 'leadId obrigatório' };
    }

    // 1) Carrega o produto e busca a oferta com link público da Cakto.
    const { data: product } = await ctx.supabase
      .from('products')
      .select('id, name')
      .eq('id', input.product_id)
      .single();

    if (!product) return { success: false, error: 'Produto não encontrado' };

    let offerQuery = ctx.supabase
      .from('product_offers')
      .select('id, checkout_url, name, price')
      .eq('product_id', input.product_id);

    if (input.offer_id) offerQuery = offerQuery.eq('id', input.offer_id);

    const { data: offers } = await offerQuery.limit(1);
    const offer = offers?.[0];

    if (!offer?.checkout_url) {
      return {
        success: false,
        error:
          'Produto não tem link de checkout configurado. Configure uma oferta com checkout_url (ex: link Cakto) na seção Produtos.',
      };
    }

    // 2) Carrega dados do lead para pré-preencher o checkout.
    const { data: lead } = await ctx.supabase
      .from('leads')
      .select('name, email, phone')
      .eq('id', ctx.leadId)
      .single();

    // 3) Anexa parâmetros de tracking + dados do lead na URL.
    const url = new URL(offer.checkout_url);
    if (lead?.name) url.searchParams.set('name', lead.name);
    if (lead?.email) url.searchParams.set('email', lead.email);
    if (lead?.phone) url.searchParams.set('phone', lead.phone);
    url.searchParams.set('utm_source', 'agente-ia');
    url.searchParams.set('utm_medium', ctx.channel ?? 'chat');
    if (ctx.agentId) url.searchParams.set('utm_campaign', ctx.agentId);
    if (input.payment_method && input.payment_method !== 'any') {
      url.searchParams.set('payment_method', input.payment_method);
    }

    const checkoutUrl = url.toString();

    return {
      success: true,
      data: {
        checkout_url: checkoutUrl,
        offer_id: offer.id,
        offer_name: offer.name,
        price: offer.price,
      },
      user_message: `Aqui está seu link de pagamento: ${checkoutUrl}`,
    };
  },
};
