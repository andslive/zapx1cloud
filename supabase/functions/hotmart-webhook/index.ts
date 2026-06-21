// Hotmart Postback (Webhook) — público, valida hottok por organização
// Mapeia eventos da Hotmart para nossa engine de tag automations
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

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

// Hotmart event → nosso event_type para tag_automations
const EVENT_MAP: Record<string, string> = {
  PURCHASE_APPROVED: 'compra_aprovada',
  PURCHASE_COMPLETE: 'compra_aprovada',
  PURCHASE_BILLET_PRINTED: 'boleto_gerado',
  PURCHASE_OUT_OF_SHOPPING_CART: 'checkout_abandonado',
  PURCHASE_REFUNDED: 'reembolso',
  PURCHASE_CHARGEBACK: 'reembolso',
  PURCHASE_PROTEST: 'reembolso',
  // Hotmart usa BILLET para boleto e PIX é detectado pelo payment_type
};

const STATUS_MAP: Record<string, string> = {
  APPROVED: 'paid',
  COMPLETE: 'paid',
  WAITING_PAYMENT: 'waiting_payment',
  BILLET_PRINTED: 'waiting_payment',
  REFUNDED: 'refunded',
  CHARGEBACK: 'chargeback',
  PROTEST: 'chargeback',
  CANCELLED: 'cancelled',
  EXPIRED: 'cancelled',
  ABANDONED: 'abandoned',
};

function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('55')) return digits;
  if (digits.length >= 10) return `55${digits}`;
  return digits;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const url = new URL(req.url);
    const orgId = url.searchParams.get('org');
    const hottokParam = url.searchParams.get('hottok') ?? req.headers.get('x-hotmart-hottok');

    if (!orgId) return json({ error: 'org query param required' }, 400);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: cred } = await admin
      .from('hotmart_credentials')
      .select('*')
      .eq('organization_id', orgId)
      .maybeSingle();

    if (!cred) return json({ error: 'credentials not found' }, 404);

    const payload = await req.json().catch(() => null);
    if (!payload) return json({ error: 'invalid json' }, 400);

    // Hotmart manda hottok dentro do body também (campo "hottok")
    const incomingHottok = hottokParam ?? payload.hottok ?? payload.data?.hottok;
    if (cred.hottok && cred.hottok !== incomingHottok) {
      console.warn('[hotmart-webhook] invalid hottok for org', orgId);
      return json({ error: 'invalid hottok' }, 401);
    }

    const event: string = payload.event ?? payload.type ?? 'UNKNOWN';
    const data = payload.data ?? payload;
    const purchase = data.purchase ?? data;
    const buyer = data.buyer ?? purchase.buyer ?? {};
    const product = data.product ?? purchase.product ?? {};
    const subscription = data.subscription ?? purchase.subscription ?? null;

    const transactionId =
      purchase.transaction ?? purchase.id ?? data.transaction ?? data.id ?? `${event}-${Date.now()}`;

    const rawStatus = (purchase.status ?? data.status ?? '').toString().toUpperCase();
    const status = STATUS_MAP[rawStatus] ?? STATUS_MAP[event.replace('PURCHASE_', '')] ?? 'pending';

    const paymentTypeRaw = (purchase.payment?.type ?? data.payment?.type ?? '').toString().toUpperCase();
    let paymentMethod: string | null = null;
    if (paymentTypeRaw.includes('PIX')) paymentMethod = 'pix';
    else if (paymentTypeRaw.includes('BILLET') || paymentTypeRaw.includes('BOLETO')) paymentMethod = 'billet';
    else if (paymentTypeRaw.includes('CREDIT')) paymentMethod = 'credit_card';
    else if (paymentTypeRaw) paymentMethod = paymentTypeRaw.toLowerCase();

    // Detecta PIX gerado: evento WAITING_PAYMENT + payment pix
    let mappedEvent = EVENT_MAP[event] ?? null;
    if (!mappedEvent && status === 'waiting_payment' && paymentMethod === 'pix') {
      mappedEvent = 'pix_gerado';
    }

    const amount = Number(
      purchase.price?.value ?? purchase.full_price?.value ?? purchase.offer?.price ?? data.amount ?? 0,
    );
    const currency = purchase.price?.currency_value ?? purchase.full_price?.currency_value ?? 'BRL';

    const hotmartProductId = String(product.id ?? product.ucode ?? '');
    const hotmartProductName = product.name ?? null;

    // Resolve mapeamento → produto interno
    let internalProductId: string | null = null;
    if (hotmartProductId) {
      const { data: mapping } = await admin
        .from('hotmart_product_mapping')
        .select('product_id')
        .eq('organization_id', orgId)
        .eq('hotmart_product_id', hotmartProductId)
        .maybeSingle();

      if (mapping?.product_id) {
        internalProductId = mapping.product_id;
      } else {
        // Auto-cria mapeamento órfão pra aparecer na tela de configuração
        await admin
          .from('hotmart_product_mapping')
          .upsert(
            {
              organization_id: orgId,
              hotmart_product_id: hotmartProductId,
              hotmart_product_name: hotmartProductName,
            },
            { onConflict: 'organization_id,hotmart_product_id' },
          );
      }
    }

    const buyerEmail = (buyer.email ?? '').toLowerCase().trim() || null;
    const buyerPhone = normalizePhone(buyer.checkout_phone ?? buyer.phone);

    // Upsert do pedido
    const { error: upsertErr } = await admin
      .from('hotmart_orders')
      .upsert(
        {
          organization_id: orgId,
          transaction_id: String(transactionId),
          event_type: event,
          product_id: internalProductId,
          hotmart_product_id: hotmartProductId || null,
          hotmart_product_name: hotmartProductName,
          hotmart_offer_code: purchase.offer?.code ?? null,
          buyer_email: buyerEmail,
          buyer_name: buyer.name ?? null,
          buyer_phone: buyerPhone,
          buyer_doc: buyer.document ?? null,
          amount: amount || null,
          currency,
          status,
          payment_method: paymentMethod,
          installments: purchase.payment?.installments_number ?? null,
          affiliate_email: data.affiliates?.[0]?.email ?? null,
          commission_amount: data.commissions?.[0]?.value ?? null,
          subscription_code: subscription?.subscriber?.code ?? subscription?.code ?? null,
          raw_payload: payload,
          created_at_hotmart: purchase.order_date
            ? new Date(purchase.order_date).toISOString()
            : new Date().toISOString(),
          synced_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,transaction_id,event_type' },
      );

    if (upsertErr) {
      console.error('[hotmart-webhook] upsert error', upsertErr);
      return json({ error: upsertErr.message }, 500);
    }

    // Cria/atualiza Lead se temos identificação do comprador
    // Busca por phone_normalized (mesma coluna usada na constraint única).
    let leadId: string | null = null;
    if (buyerEmail || buyerPhone) {
      let existingLead: { id: string } | null = null;
      if (buyerPhone) {
        const { data } = await admin
          .from('leads')
          .select('id')
          .eq('organization_id', orgId)
          .eq('phone_normalized', buyerPhone)
          .limit(1)
          .maybeSingle();
        existingLead = data ?? null;
      }
      if (!existingLead && buyerEmail) {
        const { data } = await admin
          .from('leads')
          .select('id')
          .eq('organization_id', orgId)
          .eq('email', buyerEmail)
          .limit(1)
          .maybeSingle();
        existingLead = data ?? null;
      }

      if (existingLead?.id) {
        leadId = existingLead.id;
        await admin
          .from('leads')
          .update({
            ...(buyerPhone ? { phone: buyerPhone } : {}),
            ...(buyer.name ? { name: buyer.name } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq('id', leadId);
      } else {
        const { data: newLead, error: insertErr } = await admin
          .from('leads')
          .insert({
            organization_id: orgId,
            name: buyer.name ?? buyerEmail ?? 'Comprador Hotmart',
            email: buyerEmail,
            phone: buyerPhone,
            product_id: internalProductId,
            source: 'hotmart',
          })
          .select('id')
          .single();
        if (insertErr) {
          console.error('[hotmart-webhook] lead insert failed', insertErr);
          // Recupera por unique conflict
          if (buyerPhone) {
            const { data: rec } = await admin
              .from('leads')
              .select('id')
              .eq('organization_id', orgId)
              .eq('phone_normalized', buyerPhone)
              .limit(1)
              .maybeSingle();
            if (rec?.id) leadId = rec.id;
          }
          if (!leadId && buyerEmail) {
            const { data: rec } = await admin
              .from('leads')
              .select('id')
              .eq('organization_id', orgId)
              .eq('email', buyerEmail)
              .limit(1)
              .maybeSingle();
            if (rec?.id) leadId = rec.id;
          }
        } else {
          leadId = newLead?.id ?? null;
        }
      }
    }

    // Dispara automações de tag (mesmo motor da Cakto)
    if (leadId && mappedEvent) {
      await admin.rpc('apply_tag_automations', {
        p_lead_id: leadId,
        p_event_type: mappedEvent,
        p_product_id: internalProductId,
        p_organization_id: orgId,
      });
    }

    return json({ ok: true, event, status, mappedEvent, leadId });
  } catch (err) {
    console.error('[hotmart-webhook] fatal', err);
    return json({ error: (err as Error).message }, 500);
  }
});
