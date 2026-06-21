import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { ensureCaktoToken, caktoGet, mapCaktoOrderForUpsert, fetchCaktoToken } from '../_shared/cakto-client.ts';

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

function maskSecret(secret: string | null | undefined): string | null {
  if (!secret) return null;
  if (secret.length <= 4) return '••••';
  return `••••${secret.slice(-4)}`;
}

function sanitizeCred(cred: any) {
  if (!cred) return null;
  return {
    id: cred.id,
    scope: cred.scope,
    organization_id: cred.organization_id,
    client_id: cred.client_id,
    client_secret_masked: maskSecret(cred.client_secret),
    scopes: cred.scopes,
    connection_status: cred.connection_status,
    last_sync_at: cred.last_sync_at,
    last_error: cred.last_error,
    has_secret: !!cred.client_secret,
    webhook_secret_set: !!cred.webhook_secret,
    updated_at: cred.updated_at,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: 'Unauthorized' }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    // Resolve scope + permissões
    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', userId);
    const roleSet = new Set((roles ?? []).map((r: any) => r.role));
    const isSuper = roleSet.has('super_admin');
    const isAdminOrManager = roleSet.has('admin') || roleSet.has('manager');

    let scope: 'platform' | 'organization';
    let organizationId: string | null = null;

    if (body.scope === 'platform' || (isSuper && !body.scope)) {
      if (!isSuper) return json({ error: 'Apenas super admin pode acessar o escopo platform' }, 403);
      scope = 'platform';
    } else {
      scope = 'organization';
      const { data: profile } = await admin.from('profiles').select('organization_id').eq('id', userId).maybeSingle();
      organizationId = profile?.organization_id ?? null;
      if (!organizationId) return json({ error: 'Usuário sem organização' }, 400);
      if (!isAdminOrManager && !isSuper) return json({ error: 'Permissão negada' }, 403);
    }

    // Helper: localiza credencial atual
    const fetchCred = async () => {
      const q = admin.from('cakto_credentials').select('*').eq('scope', scope);
      if (scope === 'organization') q.eq('organization_id', organizationId);
      const { data } = await q.maybeSingle();
      return data;
    };

    switch (action) {
      case 'get_credentials': {
        const cred = await fetchCred();
        return json({ credentials: sanitizeCred(cred) });
      }

      case 'save_credentials': {
        const { client_id, client_secret, scopes, webhook_secret } = body;
        if (!client_id || typeof client_id !== 'string') return json({ error: 'client_id obrigatório' }, 400);
        const existing = await fetchCred();
        const finalSecret = client_secret && client_secret.length > 0 ? client_secret : existing?.client_secret;
        if (!finalSecret) return json({ error: 'client_secret obrigatório' }, 400);

        const payload: any = {
          scope,
          organization_id: organizationId,
          client_id,
          client_secret: finalSecret,
          scopes: Array.isArray(scopes) && scopes.length > 0 ? scopes : ['read', 'orders', 'products'],
          webhook_secret: webhook_secret ?? existing?.webhook_secret ?? null,
          last_token: null,
          token_expires_at: null,
          connection_status: 'disconnected',
          last_error: null,
        };

        const { data: upserted, error } = existing
          ? await admin.from('cakto_credentials').update(payload).eq('id', existing.id).select().maybeSingle()
          : await admin.from('cakto_credentials').insert(payload).select().maybeSingle();

        if (error) return json({ error: error.message }, 500);

        // Auto-test após salvar para já refletir o status real (connected/error)
        let testResult: { ok: boolean; error?: string; scope?: string } = { ok: false };
        if (upserted) {
          try {
            const tok = await fetchCaktoToken(upserted.client_id, upserted.client_secret);
            const expiresIso = new Date(Date.now() + tok.expires_in * 1000).toISOString();
            const { data: refreshed } = await admin.from('cakto_credentials').update({
              last_token: tok.access_token,
              token_expires_at: expiresIso,
              connection_status: 'connected',
              last_error: null,
            }).eq('id', upserted.id).select().maybeSingle();
            testResult = { ok: true, scope: tok.scope };
            return json({ credentials: sanitizeCred(refreshed ?? upserted), test: testResult });
          } catch (e: any) {
            const msg = String(e?.message ?? e).slice(0, 500);
            const { data: refreshed } = await admin.from('cakto_credentials').update({
              connection_status: 'error',
              last_error: msg,
            }).eq('id', upserted.id).select().maybeSingle();
            testResult = { ok: false, error: msg };
            return json({ credentials: sanitizeCred(refreshed ?? upserted), test: testResult });
          }
        }

        return json({ credentials: sanitizeCred(upserted), test: testResult });
      }

      case 'test_connection': {
        const cred = await fetchCred();
        if (!cred) return json({ error: 'Credenciais não configuradas' }, 400);
        try {
          const tok = await fetchCaktoToken(cred.client_id, cred.client_secret);
          const expiresIso = new Date(Date.now() + tok.expires_in * 1000).toISOString();
          await admin.from('cakto_credentials').update({
            last_token: tok.access_token,
            token_expires_at: expiresIso,
            connection_status: 'connected',
            last_error: null,
          }).eq('id', cred.id);
          return json({ ok: true, scope: tok.scope, expires_in: tok.expires_in });
        } catch (e: any) {
          await admin.from('cakto_credentials').update({
            connection_status: 'error',
            last_error: String(e?.message ?? e).slice(0, 500),
          }).eq('id', cred.id);
          return json({ ok: false, error: String(e?.message ?? e) }, 400);
        }
      }

      case 'disconnect': {
        const cred = await fetchCred();
        if (!cred) return json({ ok: true });
        await admin.from('cakto_credentials').delete().eq('id', cred.id);
        return json({ ok: true });
      }

      case 'sync_orders': {
        const cred = await fetchCred();
        if (!cred) return json({ error: 'Credenciais não configuradas' }, 400);
        const accessToken = await ensureCaktoToken(admin, cred);
        let synced = 0;
        let nextUrl: string | null = '/public_api/orders/';
        let safety = 0;
        while (nextUrl && safety < 10) {
          safety++;
          const data: any = await caktoGet(accessToken, nextUrl, {});
          const results = Array.isArray(data?.results) ? data.results : [];
          if (results.length === 0) break;
          const rows = results.map((o: any) => mapCaktoOrderForUpsert(o, scope, organizationId));
          const { error: upErr } = await admin.from('cakto_orders').upsert(rows, {
            onConflict: 'scope,organization_id,cakto_id',
          });
          if (upErr) return json({ error: upErr.message }, 500);
          synced += rows.length;
          // Cakto retorna URLs absolutas; convertemos para path para próximo loop
          if (data.next) {
            try {
              const u = new URL(data.next);
              nextUrl = u.pathname + u.search;
            } catch {
              nextUrl = null;
            }
          } else {
            nextUrl = null;
          }
        }
        await admin.from('cakto_credentials').update({ last_sync_at: new Date().toISOString() }).eq('id', cred.id);
        return json({ synced });
      }

      case 'get_summary': {
        const q = admin.from('cakto_orders').select('amount, status, paid_at').eq('scope', scope);
        if (scope === 'organization') q.eq('organization_id', organizationId);
        const { data: orders } = await q;
        const list = orders ?? [];
        const paid = list.filter((o: any) => o.status === 'paid');
        const totalRevenue = paid.reduce((s: number, o: any) => s + Number(o.amount ?? 0), 0);
        const refunded = list.filter((o: any) => o.status === 'refunded').length;
        const pending = list.filter((o: any) => ['pending', 'waiting_payment'].includes(o.status)).length;
        const ticket = paid.length > 0 ? totalRevenue / paid.length : 0;
        return json({
          totalRevenue,
          paidCount: paid.length,
          refundedCount: refunded,
          pendingCount: pending,
          ticketAvg: ticket,
        });
      }

      default:
        return json({ error: `Ação inválida: ${action}` }, 400);
    }
  } catch (e: any) {
    console.error('cakto-proxy error', e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
