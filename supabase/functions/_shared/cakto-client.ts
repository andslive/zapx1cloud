// Helpers compartilhados para integração com Cakto API
// https://docs.cakto.com.br/authentication

export const CAKTO_BASE_URL = 'https://api.cakto.com.br';

export interface CaktoTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface CaktoCredentialsRow {
  id: string;
  client_id: string;
  client_secret: string;
  scopes: string[];
  last_token: string | null;
  token_expires_at: string | null;
}

export async function fetchCaktoToken(clientId: string, clientSecret: string): Promise<CaktoTokenResponse> {
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });
  const res = await fetch(`${CAKTO_BASE_URL}/public_api/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Cakto auth failed [${res.status}]: ${text}`);
  }
  return JSON.parse(text) as CaktoTokenResponse;
}

export async function ensureCaktoToken(
  supabase: any,
  cred: CaktoCredentialsRow,
): Promise<string> {
  const now = Date.now();
  const expiresAt = cred.token_expires_at ? new Date(cred.token_expires_at).getTime() : 0;
  // Renova com 60s de antecedência
  if (cred.last_token && expiresAt - 60_000 > now) {
    return cred.last_token;
  }
  const token = await fetchCaktoToken(cred.client_id, cred.client_secret);
  const expiresIso = new Date(now + token.expires_in * 1000).toISOString();
  await supabase.from('cakto_credentials').update({
    last_token: token.access_token,
    token_expires_at: expiresIso,
    connection_status: 'connected',
    last_error: null,
  }).eq('id', cred.id);
  return token.access_token;
}

export async function caktoGet(token: string, path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${CAKTO_BASE_URL}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Cakto GET ${path} failed [${res.status}]: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

export interface CaktoOrderItem {
  product_cakto_id: string | null;
  name: string | null;
  role: 'main' | 'orderbump' | 'upsell' | 'downsell';
  amount: number | null;
  quantity: number;
  image: string | null;
}

/**
 * Extrai a lista normalizada de itens de um pedido Cakto.
 * A Cakto pode enviar orderbumps em vários formatos:
 *  - order.bumps / order.orderBumps / order.order_bumps (array)
 *  - order.items (array completo, principal + bumps)
 *  - order.upsells / order.downsells
 */
export function extractCaktoItems(order: any): CaktoOrderItem[] {
  const items: CaktoOrderItem[] = [];
  const seen = new Set<string>();

  const push = (raw: any, role: CaktoOrderItem['role']) => {
    if (!raw) return;
    const prod = raw.product ?? raw;
    const id = prod?.id ? String(prod.id) : null;
    const key = `${role}:${id ?? raw.name ?? Math.random()}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({
      product_cakto_id: id,
      name: prod?.name ?? raw.name ?? null,
      role,
      amount: raw.amount != null ? Number(raw.amount) : prod?.price != null ? Number(prod.price) : null,
      quantity: raw.quantity ? Number(raw.quantity) : 1,
      image: prod?.image ?? raw.image ?? null,
    });
  };

  // 1) Item principal
  if (order.product) push({ product: order.product, amount: order.baseAmount ?? order.amount }, 'main');

  // 2) Order bumps (vários nomes possíveis)
  const bumps = order.bumps ?? order.orderBumps ?? order.order_bumps ?? [];
  if (Array.isArray(bumps)) bumps.forEach((b: any) => push(b, 'orderbump'));

  // 3) Upsells / downsells
  const upsells = order.upsells ?? order.upsell ?? [];
  if (Array.isArray(upsells)) upsells.forEach((u: any) => push(u, 'upsell'));
  else if (upsells && typeof upsells === 'object') push(upsells, 'upsell');

  const downsells = order.downsells ?? order.downsell ?? [];
  if (Array.isArray(downsells)) downsells.forEach((d: any) => push(d, 'downsell'));

  // 4) order.items (formato consolidado — só usa se nada acima preencheu)
  if (items.length === 0 && Array.isArray(order.items)) {
    order.items.forEach((it: any, idx: number) =>
      push(it, idx === 0 ? 'main' : 'orderbump'),
    );
  }

  return items;
}

export function mapCaktoOrderForUpsert(order: any, scope: 'platform' | 'organization', orgId: string | null) {
  const product = order.product ?? {};
  const customer = order.customer ?? order.user ?? {};
  const items = extractCaktoItems(order);
  return {
    scope,
    organization_id: orgId,
    cakto_id: String(order.id),
    cakto_ref_id: order.refId ?? order.ref_id ?? null,
    status: order.status ?? 'unknown',
    type: order.type ?? null,
    offer_type: order.offer_type ?? null,
    payment_method: order.paymentMethod ?? order.payment_method ?? null,
    base_amount: order.baseAmount ? Number(order.baseAmount) : null,
    discount: order.discount ? Number(order.discount) : null,
    amount: order.amount ? Number(order.amount) : null,
    coupon_code: order.couponCode ?? order.coupon ?? null,
    customer_name: customer.name ?? null,
    customer_email: customer.email ?? null,
    customer_phone: customer.phone ?? null,
    customer_document: customer.document ?? customer.cpf ?? null,
    product_cakto_id: product.id ? String(product.id) : null,
    product_name: product.name ?? null,
    product_image: product.image ?? null,
    paid_at: order.paid_at ?? order.paidAt ?? null,
    created_at_cakto: order.created_at ?? order.createdAt ?? null,
    items,
    raw_payload: order,
  };
}
