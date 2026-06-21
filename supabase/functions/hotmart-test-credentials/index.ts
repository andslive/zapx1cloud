// Testa credenciais Hotmart trocando por access_token via OAuth Client Credentials
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
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace('Bearer ', ''),
    );
    if (claimsErr || !claims?.claims?.sub) return json({ error: 'Unauthorized' }, 401);

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
    const clientId = body.client_id as string | undefined;
    const clientSecret = body.client_secret as string | undefined;
    const basicToken = body.basic_token as string | undefined;

    // Permite testar com valores enviados ou os já salvos
    let useClientId = clientId;
    let useClientSecret = clientSecret;
    let useBasic = basicToken;

    if (!useClientId || !useClientSecret || !useBasic) {
      const { data: cred } = await admin
        .from('hotmart_credentials')
        .select('client_id, client_secret, basic_token')
        .eq('organization_id', orgId)
        .maybeSingle();
      useClientId = useClientId ?? cred?.client_id ?? '';
      useClientSecret = useClientSecret ?? cred?.client_secret ?? '';
      useBasic = useBasic ?? cred?.basic_token ?? '';
    }

    if (!useClientId || !useClientSecret || !useBasic) {
      return json({ error: 'Credenciais incompletas. Informe Client ID, Client Secret e Basic Token.' }, 400);
    }

    const tokenUrl = `https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials&client_id=${encodeURIComponent(
      useClientId,
    )}&client_secret=${encodeURIComponent(useClientSecret)}`;

    const basicAuth = useBasic.startsWith('Basic ') ? useBasic : `Basic ${useBasic}`;

    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: basicAuth,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const tokenData = await resp.json().catch(() => ({}));

    if (!resp.ok || !tokenData.access_token) {
      return json(
        {
          ok: false,
          error: tokenData.error_description ?? tokenData.error ?? 'Falha na autenticação Hotmart',
          details: tokenData,
        },
        400,
      );
    }

    // Marca como verificado
    await admin
      .from('hotmart_credentials')
      .update({ is_active: true, last_verified_at: new Date().toISOString() })
      .eq('organization_id', orgId);

    return json({
      ok: true,
      message: 'Conexão estabelecida com sucesso',
      expires_in: tokenData.expires_in,
      scope: tokenData.scope,
    });
  } catch (err) {
    console.error('[hotmart-test] fatal', err);
    return json({ error: (err as Error).message }, 500);
  }
});
