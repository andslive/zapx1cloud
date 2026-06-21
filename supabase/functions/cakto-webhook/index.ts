import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { mapCaktoOrderForUpsert } from '../_shared/cakto-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const scopeParam = url.searchParams.get('scope') === 'organization' ? 'organization' : 'platform';
    const orgId = url.searchParams.get('org');
    const secretParam = url.searchParams.get('secret') ?? req.headers.get('x-cakto-secret');

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Localiza credencial e valida segredo
    const credQuery = admin.from('cakto_credentials').select('*').eq('scope', scopeParam);
    if (scopeParam === 'organization') {
      if (!orgId) return json({ error: 'org param required' }, 400);
      credQuery.eq('organization_id', orgId);
    }
    const { data: cred } = await credQuery.maybeSingle();
    if (!cred) return json({ error: 'credentials not found' }, 404);
    if (cred.webhook_secret && cred.webhook_secret !== secretParam) {
      return json({ error: 'invalid secret' }, 401);
    }

    const payload = await req.json();
    const event = payload.event ?? payload.type ?? null;
    const order = payload.data?.order ?? payload.data ?? payload.order ?? payload;

    if (!order?.id) return json({ error: 'invalid payload' }, 400);

    const row: any = mapCaktoOrderForUpsert(order, scopeParam, scopeParam === 'organization' ? orgId : null);

    // Resolve product_id + offer_id a partir do product_cakto_id (mapeamento manual em product_offers)
    if (row.organization_id && row.product_cakto_id) {
      const { data: offer } = await admin
        .from('product_offers')
        .select('id, product_id')
        .eq('organization_id', row.organization_id)
        .eq('cakto_product_id', row.product_cakto_id)
        .maybeSingle();

      if (offer) {
        row.offer_id = offer.id;
        row.product_id = offer.product_id;
      } else {
        // Auto-cria oferta órfã (sem produto) pra aparecer na tela de mapeamento
        const { data: created } = await admin
          .from('product_offers')
          .insert({
            organization_id: row.organization_id,
            name: row.product_name || row.product_cakto_id,
            role: 'main',
            cakto_product_id: row.product_cakto_id,
            external_source: 'cakto',
            price: row.amount,
            is_active: true,
          })
          .select('id, product_id')
          .single();
        if (created) {
          row.offer_id = created.id;
          row.product_id = created.product_id;
        }
      }
    }

    await admin.from('cakto_orders').upsert(row, { onConflict: 'scope,organization_id,cakto_id' });

    // ===== Motor de etiquetas automáticas =====
    // Mapeia event/status do Cakto → tipo de evento das tag_automations
    if (scopeParam === 'organization' && row.organization_id) {
      try {
        const tagEventType = mapCaktoToTagEvent(event, row.status, row.payment_method);
        if (tagEventType) {
          // Resolve/cria lead pelo email/telefone do cliente
          const leadId = await resolveOrCreateLead(admin, row);
          if (leadId) {
            // Adiciona tags configuradas para esse evento+produto
            await admin.rpc('apply_tag_automations', {
              p_lead_id: leadId,
              p_event_type: tagEventType,
              p_product_id: row.product_id ?? null,
              p_organization_id: row.organization_id,
            });

            // Em compra aprovada, remove tags transitórias DESTE produto (PIX/Boleto/Aguardando/Abandonado)
            // — preserva tags permanentes (Cliente) e tags de OUTROS produtos.
            if (tagEventType === 'compra_aprovada') {
              await admin.rpc('remove_lifecycle_tags_on_event', {
                p_lead_id: leadId,
                p_event_type: tagEventType,
                p_product_id: row.product_id ?? null,
                p_organization_id: row.organization_id,
              });
            }
          }
        }
      } catch (tagErr) {
        console.error('[cakto-webhook] tag automation error', tagErr);
      }
    }

    // Dispara o agente de recuperação automática (fire-and-forget)
    if (scopeParam === 'organization' && row.organization_id) {
      try {
        const { data: savedOrder } = await admin
          .from('cakto_orders')
          .select('id')
          .eq('scope', 'organization')
          .eq('organization_id', row.organization_id)
          .eq('cakto_id', row.cakto_id)
          .maybeSingle();

        if (savedOrder?.id) {
          fetch(`${SUPABASE_URL}/functions/v1/cakto-recovery-trigger`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${SERVICE_KEY}`,
            },
            body: JSON.stringify({
              cakto_order_id: savedOrder.id,
              organization_id: row.organization_id,
            }),
          }).catch((e) => console.error('[cakto-webhook] recovery trigger fail', e));
        }
      } catch (e) {
        console.error('[cakto-webhook] recovery dispatch error', e);
      }
    }

    // Para escopo platform: tenta vincular pedido a uma organização pelo email do cliente
    if (scopeParam === 'platform' && row.customer_email) {
      const { data: org } = await admin
        .from('organizations')
        .select('id')
        .eq('cakto_customer_email', row.customer_email)
        .maybeSingle();
      if (org && row.cakto_ref_id) {
        await admin.from('organizations').update({ cakto_subscription_id: row.cakto_ref_id }).eq('id', org.id);
      }
    }

    return json({ ok: true, event });
  } catch (e: any) {
    console.error('cakto-webhook error', e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

// ===== Helpers do motor de etiquetas =====

/**
 * Traduz event/status/payment_method da Cakto para o tipo de evento das tag_automations.
 * Retorna null se o evento não dispara nenhuma automação de tag.
 */
function mapCaktoToTagEvent(
  event: string | null,
  status: string | null,
  paymentMethod: string | null
): string | null {
  const e = (event ?? '').toLowerCase();
  const s = (status ?? '').toLowerCase();
  const pm = (paymentMethod ?? '').toLowerCase();

  // Compra aprovada / paga
  if (e.includes('paid') || e.includes('approved') || s === 'paid' || s === 'approved') {
    return 'compra_aprovada';
  }
  // Reembolso
  if (e.includes('refund') || s === 'refunded') return 'reembolso';
  // Chargeback
  if (e.includes('chargeback') || s === 'chargeback') return 'chargeback';
  // Cancelamento de assinatura
  if (e.includes('subscription_cancel') || e.includes('subscription_canceled')) return 'assinatura_cancelada';
  // Checkout abandonado
  if (e.includes('abandon') || s === 'abandoned' || s === 'cart_abandoned') return 'checkout_abandonado';
  // Pendente — diferencia PIX vs Boleto
  if (s === 'waiting_payment' || s === 'pending' || e.includes('pending') || e.includes('waiting')) {
    if (pm.includes('pix')) return 'pix_gerado';
    if (pm.includes('boleto') || pm.includes('bank_slip')) return 'boleto_gerado';
    return 'pix_gerado'; // default
  }
  return null;
}

/**
 * Resolve um lead pelo email/telefone do customer Cakto. Cria se não existir.
 * Retorna null se não houver dados suficientes.
 */
async function resolveOrCreateLead(admin: any, row: any): Promise<string | null> {
  const orgId = row.organization_id;
  const email = row.customer_email?.trim().toLowerCase() || null;
  const phone = row.customer_phone?.replace(/\D/g, '') || null;
  if (!orgId || (!email && !phone)) return null;

  // Tenta achar lead existente por email primeiro, depois telefone
  let lead: { id: string } | null = null;
  if (email) {
    const { data } = await admin
      .from('leads')
      .select('id')
      .eq('organization_id', orgId)
      .eq('email', email)
      .maybeSingle();
    lead = data;
  }
  if (!lead && phone) {
    const { data } = await admin
      .from('leads')
      .select('id')
      .eq('organization_id', orgId)
      .eq('phone', phone)
      .maybeSingle();
    lead = data;
  }

  if (lead) return lead.id;

  // Cria lead novo
  const { data: created } = await admin
    .from('leads')
    .insert({
      organization_id: orgId,
      name: row.customer_name || email || phone || 'Cliente Cakto',
      email,
      phone,
      lead_origin: 'cakto',
      lead_channel: 'checkout',
    })
    .select('id')
    .single();

  return created?.id ?? null;
}
