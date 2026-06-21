// Doppus Postback (Webhook) — público.
// A Doppus envia POST com header `doppus-token` e body JSON.
// Este endpoint:
//   1. Sempre responde 2xx (Doppus exige isso para aceitar a URL).
//   2. Identifica a empresa pelo produto Doppus (items[0].code) ou pelo token.
//   3. Mapeia status reais da Doppus para a engine unificada de pós-venda.
//
// URL aceita:
//   .../functions/v1/doppus-webhook
//   .../functions/v1/doppus-webhook?org=<organization_id>   (opcional)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { runPostSaleActions, normalizePhone } from '../_shared/post-sale-engine.ts';

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

function tokenFingerprint(t?: string | null) {
  if (!t) return null;
  const s = String(t);
  if (s.length <= 4) return `***`;
  return `***${s.slice(-4)} (len:${s.length})`;
}

// Mapeia status da Doppus (4.0) → evento da engine.
function mapDoppusEvent(statusCode: string, paymentMethod?: string | null): string | null {
  const st = (statusCode || '').toLowerCase().trim();
  const pm = (paymentMethod || '').toLowerCase();

  if (['approved', 'paid', 'completed', 'success'].includes(st)) return 'compra_aprovada';

  if (['waiting', 'pending', 'waiting_payment', 'processing', 'in_analysis'].includes(st)) {
    if (pm.includes('boleto') || pm.includes('billet') || pm.includes('bank_slip')) return 'boleto_gerado';
    if (pm.includes('pix')) return 'pix_gerado';
    return 'pix_gerado';
  }

  if (['abandoned', 'expired', 'exit_checkout', 'not_completed', 'cart_abandoned'].includes(st)) {
    return 'checkout_abandonado';
  }
  if (['refunded', 'refund', 'reversed', 'reverse'].includes(st)) return 'reembolso';
  if (['chargeback', 'dispute'].includes(st)) return 'chargeback';
  if (['cancelled', 'canceled', 'subscription_canceled'].includes(st)) return 'assinatura_cancelada';

  return null;
}

async function logEvent(admin: any, params: {
  orgId: string | null;
  productId: string | null;
  eventType: string;
  leadId: string | null;
  payload: any;
  extra?: Record<string, unknown>;
  results?: any[];
}) {
  if (!params.orgId) return; // tabela exige org
  try {
    await admin.from('post_sale_event_logs').insert({
      organization_id: params.orgId,
      product_id: params.productId,
      event_type: params.eventType,
      lead_id: params.leadId,
      source: 'doppus',
      executed_actions: params.results ?? [],
      event_data: { ...(params.extra ?? {}), __raw: params.payload },
    });
  } catch (err) {
    console.error('[doppus-webhook] log insert failed', err);
  }
}

function safeJsonParse(raw: string): any {
  if (!raw || !raw.trim()) return null;
  try { return JSON.parse(raw); } catch (_) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(raw.slice(start, end + 1)); } catch (_) { return null; }
    }
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Validações de URL pela Doppus podem chegar como GET/HEAD ou POST vazio.
  // SEMPRE retornamos 2xx, ou a Doppus rejeita a URL.
  if (req.method === 'GET') return json({ ok: true, provider: 'doppus-webhook', ready: true });
  if (req.method === 'HEAD') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: true, ignored: true, reason: 'method not handled' });

  const url = new URL(req.url);
  const orgParam = url.searchParams.get('org');

  const rawBody = await req.text().catch(() => '');
  const payload = safeJsonParse(rawBody);

  // Token enviado pela Doppus (header oficial é `doppus-token`).
  const authHeader = req.headers.get('authorization') ?? '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : authHeader.trim();
  const tokenReceived =
    req.headers.get('doppus-token') ??
    req.headers.get('x-doppus-token') ??
    req.headers.get('x-doppus-secret') ??
    req.headers.get('x-webhook-token') ??
    req.headers.get('x-security-token') ??
    req.headers.get('x-token') ??
    (bearer ? bearer : null) ??
    (payload?.token as string | undefined) ??
    (payload?.security_token as string | undefined) ??
    url.searchParams.get('token') ??
    url.searchParams.get('secret') ??
    null;

  // Considera "evento real" apenas se houver dados úteis no payload.
  const looksLikeRealEvent =
    !!payload &&
    typeof payload === 'object' &&
    (
      !!payload.customer ||
      !!payload.transaction ||
      !!payload.status ||
      Array.isArray(payload.items) ||
      !!payload.data
    );

  if (!looksLikeRealEvent) {
    // Validação da Doppus (POST vazio ou {"doppus": true}, etc.)
    return json({ ok: true, provider: 'doppus-webhook', ready: true, validation_only: true });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // ====== Extrai dados do payload Doppus ======
    const data = payload.data ?? payload;
    const customer = data.customer ?? data.buyer ?? {};
    const transaction = data.transaction ?? data.order ?? {};
    const payment = data.payment ?? {};
    const links = data.links ?? {};
    const items: any[] = Array.isArray(data.items) ? data.items
      : Array.isArray(transaction.items) ? transaction.items : [];
    const firstItem = items[0] ?? data.product ?? {};
    const offer = firstItem.offer_data ?? data.offer ?? {};
    const subscription = data.subscription ?? transaction.subscription ?? {};
    const affiliate = data.affiliate ?? {};
    const seller = data.seller ?? {};

    const statusRaw = data.status ?? payload.status;
    const statusCode: string = statusRaw && typeof statusRaw === 'object'
      ? String(statusRaw.code ?? statusRaw.name ?? '')
      : String(statusRaw ?? '');
    const statusMessage: string = statusRaw && typeof statusRaw === 'object'
      ? String(statusRaw.message ?? '')
      : '';

    const paymentMethod: string | null =
      payment.method ?? data.payment_method ?? transaction.payment_method ?? null;

    const doppusProductId = String(firstItem.code ?? firstItem.id ?? firstItem.sku ?? '');
    const doppusProductName = firstItem.name ?? null;
    const offerName = firstItem.offer_name ?? offer.name ?? null;
    const offerId = firstItem.offer ?? offer.id ?? offer.code ?? null;

    // ====== Resolve a organização e o produto interno ======
    // Estratégia (em ordem):
    //   A) ?org=... + produto Doppus mapeado nessa org
    //   B) qualquer org cuja config tenha esse produto Doppus mapeado
    //   C) qualquer org cuja config tenha o token recebido
    //   D) compat legado: webhook_secret + product_mapping
    let resolvedOrgId: string | null = orgParam;
    let cred: any = null;
    let matchedProduct: {
      id: string; name?: string; token: string;
      doppus_product_id: string; internal_product_id: string;
    } | null = null;

    type Row = { organization_id: string; settings: any; is_configured?: boolean };
    const { data: rowsRaw } = await admin
      .from('integration_settings')
      .select('organization_id, settings, is_configured')
      .eq('integration_type', 'doppus')
      .limit(1000);
    const rows: Row[] = rowsRaw ?? [];

    const findInRow = (row: Row) => {
      const s = row.settings ?? {};
      const list: any[] = Array.isArray(s.products) ? s.products : [];
      let p = doppusProductId
        ? list.find((x) => String(x?.doppus_product_id ?? '') === doppusProductId)
        : null;
      if (!p && tokenReceived) {
        p = list.find((x) => x?.token && x.token === tokenReceived);
      }
      return p
        ? {
            id: String(p.id ?? `${row.organization_id}-${doppusProductId}`),
            name: p.name,
            token: String(p.token ?? ''),
            doppus_product_id: String(p.doppus_product_id ?? doppusProductId),
            internal_product_id: String(p.internal_product_id ?? ''),
          }
        : null;
    };

    // A) ?org=... primeiro
    if (resolvedOrgId) {
      const row = rows.find((r) => r.organization_id === resolvedOrgId);
      if (row) {
        cred = row;
        matchedProduct = findInRow(row);
      }
    }

    // B) por produto Doppus
    if (!matchedProduct && doppusProductId) {
      for (const row of rows) {
        const p = findInRow(row);
        if (p && String(p.doppus_product_id) === doppusProductId) {
          cred = row;
          matchedProduct = p;
          resolvedOrgId = row.organization_id;
          break;
        }
      }
    }

    // C) por token
    if (!matchedProduct && tokenReceived) {
      for (const row of rows) {
        const p = findInRow(row);
        if (p && p.token === tokenReceived) {
          cred = row;
          matchedProduct = p;
          resolvedOrgId = row.organization_id;
          break;
        }
      }
    }

    // D) compat legado
    if (!matchedProduct) {
      for (const row of rows) {
        const s = row.settings ?? {};
        const expectedSecret = s.webhook_secret;
        const legacyMap = s.product_mapping ?? {};
        const legacyInternal = doppusProductId ? legacyMap[doppusProductId] : null;
        const tokenOk = !expectedSecret || expectedSecret === tokenReceived;
        if (legacyInternal && tokenOk) {
          cred = row;
          resolvedOrgId = row.organization_id;
          matchedProduct = {
            id: `legacy-${doppusProductId}`,
            name: doppusProductName ?? 'Doppus',
            token: expectedSecret ?? '',
            doppus_product_id: doppusProductId,
            internal_product_id: legacyInternal,
          };
          break;
        }
      }
    }

    if (!resolvedOrgId || !matchedProduct?.internal_product_id) {
      // Loga (sem org se não resolveu) e RESPONDE 200 — Doppus não pode rejeitar a URL.
      await logEvent(admin, {
        orgId: resolvedOrgId,
        productId: null,
        eventType: 'unmapped',
        leadId: null,
        payload,
        extra: {
          reason: 'produto Doppus não mapeado em nenhuma organização',
          doppus_product_id: doppusProductId || null,
          doppus_product_name: doppusProductName,
          token_fingerprint: tokenFingerprint(tokenReceived),
          status_code: statusCode,
          payment_method: paymentMethod,
        },
      });
      return json({
        ok: true,
        ignored: true,
        reason: 'doppus product not mapped in any organization',
        doppus_product_id: doppusProductId || null,
      });
    }

    const orgId = resolvedOrgId;
    const internalProductId = matchedProduct.internal_product_id;

    // Validação opcional de token: se há token cadastrado e veio um token diferente, registra mas segue.
    if (matchedProduct.token && tokenReceived && matchedProduct.token !== tokenReceived) {
      await logEvent(admin, {
        orgId, productId: internalProductId, eventType: 'invalid_token', leadId: null, payload,
        extra: {
          reason: 'token recebido não bate com o cadastrado para este produto',
          token_fingerprint: tokenFingerprint(tokenReceived),
        },
      });
      // Continua processando — produto foi identificado pelo items[0].code.
    }

    // ====== Valores ======
    const amountCents = Number(
      transaction.total ?? transaction.subtotal ?? firstItem.value ?? payment.amount ?? 0,
    );
    const amount = amountCents > 0 ? amountCents / 100 : 0;
    const currency = transaction.currency ?? data.currency ?? 'BRL';
    const installments = payment.plots ?? payment.installments ?? transaction.installments ?? 1;

    const transactionId = String(
      transaction.code ?? transaction.id ?? data.transaction_id ?? `doppus-${Date.now()}`,
    );
    const orderId = transaction.code ?? transaction.order_id ?? data.order_id ?? null;

    const buyerEmail = (customer.email ?? data.email ?? '').toString().toLowerCase() || null;
    const buyerPhone = normalizePhone(customer.phone ?? customer.whatsapp ?? data.phone);
    const buyerName = customer.name ?? customer.full_name ?? data.name ?? null;
    const buyerDocument = customer.doc ?? customer.document ?? customer.cpf ?? customer.cnpj ?? null;

    const mappedEvent = mapDoppusEvent(statusCode, paymentMethod);

    if (!mappedEvent) {
      await logEvent(admin, {
        orgId, productId: internalProductId, eventType: 'unmapped', leadId: null, payload,
        extra: {
          reason: `status "${statusCode}" / method "${paymentMethod ?? ''}" not mapped`,
          status_code: statusCode,
          status_message: statusMessage,
          payment_method: paymentMethod,
          customer_name: buyerName,
          customer_email: buyerEmail,
        },
      });
      return json({
        ok: true, ignored: true,
        reason: `status "${statusCode}" / method "${paymentMethod ?? ''}" not mapped`,
      });
    }

    const richEventData: Record<string, unknown> = {
      transaction_id: transactionId,
      order_id: orderId,
      status: statusCode,
      status_message: statusMessage,
      payment_method: paymentMethod,
      amount,
      amount_cents: amountCents,
      amount_formatted: amount ? amount.toFixed(2).replace('.', ',') : '',
      currency,
      installments,
      product_name: doppusProductName,
      product_id: doppusProductId,
      offer_name: offerName,
      offer_id: offerId,
      customer_name: buyerName,
      customer_email: buyerEmail,
      customer_phone: buyerPhone,
      customer_document: buyerDocument,
      customer_doc_type: customer.doc_type ?? null,
      customer_ip: customer.ip_address ?? null,
      pix_code: payment.brcode ?? payment.pix_code ?? data.pix?.code ?? null,
      pix_qrcode_url: links.qrcode ?? payment.pix_qrcode_url ?? data.pix?.qrcode_url ?? null,
      pix_expires_at: payment.expires_at ?? data.pix?.expires_at ?? null,
      boleto_url: payment.boleto_url ?? links.boleto ?? data.boleto?.url ?? null,
      boleto_barcode: payment.barcode ?? payment.line ?? data.boleto?.barcode ?? null,
      boleto_expires_at: payment.expires_at ?? data.boleto?.expires_at ?? null,
      payment_link: links.reprocess ?? payment.link ?? data.payment_link ?? null,
      checkout_url: links.checkout ?? links.reprocess ?? data.checkout_url ?? null,
      receipt_url: links.receipt ?? data.receipt_url ?? null,
      invoice_url: links.invoice ?? data.invoice_url ?? null,
      reprocess_url: links.reprocess ?? null,
      subscription_id: subscription.id ?? null,
      subscription_status: subscription.status ?? null,
      next_charge_at: subscription.next_charge_at ?? subscription.next_billing ?? null,
      affiliate_name: affiliate.name ?? null,
      seller_name: seller.name ?? null,
      raw_status: statusCode,
    };

    // ====== Resolve/cria lead ======
    // Busca por phone_normalized (mesma coluna usada na constraint única).
    let leadId: string | null = null;

    if (buyerPhone) {
      const { data: existing } = await admin
        .from('leads')
        .select('id')
        .eq('organization_id', orgId)
        .eq('phone_normalized', buyerPhone)
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        leadId = existing.id;
        await admin.from('leads').update({
          ...(buyerName ? { name: buyerName } : {}),
          ...(buyerEmail ? { email: buyerEmail } : {}),
          updated_at: new Date().toISOString(),
        }).eq('id', leadId);
      }
    } else if (buyerEmail) {
      const { data: existing } = await admin
        .from('leads')
        .select('id')
        .eq('organization_id', orgId)
        .eq('email', buyerEmail)
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        leadId = existing.id;
        await admin.from('leads').update({
          ...(buyerName ? { name: buyerName } : {}),
          updated_at: new Date().toISOString(),
        }).eq('id', leadId);
      }
    }

    if (!leadId && (buyerEmail || buyerPhone)) {
      const { data: created, error: insertErr } = await admin.from('leads').insert({
        organization_id: orgId,
        name: buyerName ?? buyerEmail ?? 'Comprador Doppus',
        email: buyerEmail,
        phone: buyerPhone,
        product_id: internalProductId,
        source: 'doppus',
      }).select('id').single();

      if (insertErr) {
        console.error('[doppus-webhook] lead insert failed', insertErr);
        // Recupera por unique conflict (org+phone_normalized) ou email
        if (buyerPhone) {
          const { data: recovered } = await admin
            .from('leads')
            .select('id')
            .eq('organization_id', orgId)
            .eq('phone_normalized', buyerPhone)
            .limit(1)
            .maybeSingle();
          if (recovered?.id) {
            leadId = recovered.id;
            await admin.from('leads').update({
              ...(buyerName ? { name: buyerName } : {}),
              ...(buyerEmail ? { email: buyerEmail } : {}),
              updated_at: new Date().toISOString(),
            }).eq('id', leadId);
          }
        }
        if (!leadId && buyerEmail) {
          const { data: recovered } = await admin
            .from('leads')
            .select('id')
            .eq('organization_id', orgId)
            .eq('email', buyerEmail)
            .limit(1)
            .maybeSingle();
          if (recovered?.id) leadId = recovered.id;
        }
      } else {
        leadId = created?.id ?? null;
      }
    }

    if (!leadId) {
      await logEvent(admin, {
        orgId, productId: internalProductId, eventType: mappedEvent, leadId: null, payload,
        extra: { ...richEventData, reason: 'no buyer identification (email/phone)' },
      });
      return json({ ok: true, skipped: true, reason: 'no buyer identification (email/phone)' });
    }

    // ====== Persiste pedido ======
    const orderStatusMap: Record<string, string> = {
      compra_aprovada: 'paid',
      pix_gerado: 'pending',
      boleto_gerado: 'pending',
      checkout_abandonado: 'cancelled',
      reembolso: 'refunded',
      chargeback: 'chargeback',
      assinatura_cancelada: 'cancelled',
    };
    const orderStatus = orderStatusMap[mappedEvent] ?? 'unknown';

    const { data: leadInfo } = await admin
      .from('leads').select('assigned_to').eq('id', leadId).maybeSingle();

    try {
      await admin.from('cakto_orders').upsert({
        provider: 'doppus',
        scope: 'organization',
        organization_id: orgId,
        cakto_id: String(transactionId),
        cakto_ref_id: String(transactionId),
        status: orderStatus,
        payment_method: paymentMethod,
        amount,
        customer_name: buyerName,
        customer_email: buyerEmail,
        customer_phone: buyerPhone,
        product_cakto_id: doppusProductId || null,
        product_name: doppusProductName,
        product_id: internalProductId,
        paid_at: mappedEvent === 'compra_aprovada' ? new Date().toISOString() : null,
        created_at_cakto: new Date().toISOString(),
        assigned_to: leadInfo?.assigned_to ?? null,
        lead_id: leadId,
        raw_payload: payload,
      }, { onConflict: 'scope,organization_id,cakto_id' });
    } catch (orderErr) {
      console.error('[doppus-webhook] order persist error', orderErr);
    }

    const engineResult = await runPostSaleActions(admin, {
      organizationId: orgId,
      productId: internalProductId,
      eventType: mappedEvent as any,
      leadId,
      source: 'doppus',
      eventData: { ...richEventData, __raw: payload },
    });

    return json({ ok: true, statusCode, mappedEvent, leadId, engine: engineResult });
  } catch (err) {
    console.error('[doppus-webhook] fatal', err);
    // Mesmo em erro inesperado, respondemos 200 para Doppus não desativar a URL.
    return json({ ok: false, error: (err as Error).message });
  }
});
