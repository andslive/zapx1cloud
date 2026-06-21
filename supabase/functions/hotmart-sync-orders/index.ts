// Sincroniza vendas Hotmart via API REST (sales/history) — backfill manual
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const STATUS_MAP: Record<string, string> = {
  APPROVED: 'paid',
  COMPLETE: 'paid',
  WAITING_PAYMENT: 'waiting_payment',
  BILLET_PRINTED: 'waiting_payment',
  REFUNDED: 'refunded',
  CHARGEBACK: 'chargeback',
  CANCELLED_BY_CUSTOMER: 'cancelled',
  CANCELLED_BY_SELLER: 'cancelled',
  CANCELLED_BY_ADMIN: 'cancelled',
  EXPIRED: 'cancelled',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (!claims?.claims?.sub) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const userId = claims.claims.sub;

    const { data: profile } = await admin
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .maybeSingle();
    const orgId = profile?.organization_id;
    if (!orgId) return json({ error: 'Organization not found' }, 400);

    const body = await req.json().catch(() => ({}));
    const days = Math.min(Math.max(Number(body.days) || 30, 1), 90);

    const { data: cred } = await admin
      .from('hotmart_credentials')
      .select('*')
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!cred?.client_id || !cred?.client_secret || !cred?.basic_token) {
      return json({ error: 'Credenciais Hotmart não configuradas' }, 400);
    }

    // 1) Pega access_token
    const tokenUrl = `https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials&client_id=${encodeURIComponent(
      cred.client_id,
    )}&client_secret=${encodeURIComponent(cred.client_secret)}`;
    const basicAuth = cred.basic_token.startsWith('Basic ')
      ? cred.basic_token
      : `Basic ${cred.basic_token}`;
    const tokenResp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { Authorization: basicAuth },
    });
    const tokenData = await tokenResp.json();
    if (!tokenResp.ok || !tokenData.access_token) {
      return json({ error: 'Falha ao autenticar na Hotmart', details: tokenData }, 400);
    }

    // 2) Busca histórico
    const startDate = Date.now() - days * 24 * 60 * 60 * 1000;
    const apiUrl = `https://developers.hotmart.com/payments/api/v1/sales/history?start_date=${startDate}&max_results=100`;

    const salesResp = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const salesData = await salesResp.json();
    if (!salesResp.ok) {
      return json({ error: 'Falha ao buscar vendas', details: salesData }, 400);
    }

    const items = salesData.items ?? [];
    let inserted = 0;

    for (const item of items) {
      const purchase = item.purchase ?? {};
      const buyer = item.buyer ?? {};
      const product = item.product ?? {};
      const transactionId = purchase.transaction ?? purchase.order_id;
      if (!transactionId) continue;

      const rawStatus = (purchase.status ?? '').toString().toUpperCase();
      const status = STATUS_MAP[rawStatus] ?? 'pending';

      const { error } = await admin.from('hotmart_orders').upsert(
        {
          organization_id: orgId,
          transaction_id: String(transactionId),
          event_type: 'SYNC',
          hotmart_product_id: String(product.id ?? ''),
          hotmart_product_name: product.name ?? null,
          buyer_email: (buyer.email ?? '').toLowerCase() || null,
          buyer_name: buyer.name ?? null,
          amount: Number(purchase.price?.value ?? 0) || null,
          currency: purchase.price?.currency_value ?? 'BRL',
          status,
          payment_method: (purchase.payment?.type ?? '').toLowerCase() || null,
          installments: purchase.payment?.installments_number ?? null,
          raw_payload: item,
          created_at_hotmart: purchase.order_date
            ? new Date(purchase.order_date).toISOString()
            : null,
          synced_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,transaction_id,event_type' },
      );
      if (!error) inserted++;
    }

    return json({ ok: true, total: items.length, inserted });
  } catch (err) {
    console.error('[hotmart-sync] fatal', err);
    return json({ error: (err as Error).message }, 500);
  }
});
