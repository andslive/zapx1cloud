import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateMemberPayload {
  email: string;
  password: string;
  full_name: string;
  role: 'admin' | 'manager' | 'seller';
  recovery_whatsapp?: string;
  sector_ids?: string[];
  default_connection_id?: string | null;
  work_start_time?: string;
  work_end_time?: string;
  farewell_message?: string;
  default_theme?: string;
  default_menu_state?: string;
  avatar_url?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify caller using anon client
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Sessão inválida' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Caller's profile + role check
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('organization_id')
      .eq('id', caller.id)
      .maybeSingle();

    if (!callerProfile?.organization_id) {
      return new Response(JSON.stringify({ error: 'Sem organização' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: roles } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id);
    const callerRoles = (roles || []).map((r: any) => r.role);
    if (!callerRoles.some((r: string) => ['admin', 'manager', 'super_admin'].includes(r))) {
      return new Response(JSON.stringify({ error: 'Permissão negada' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as CreateMemberPayload;
    if (!body.email || !body.password || !body.full_name || !body.role) {
      return new Response(JSON.stringify({ error: 'Campos obrigatórios ausentes' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Runtime role allow-list (TypeScript constraint alone can be bypassed by attackers).
    // Managers may only create seller/manager; only admins/super_admin may create admin.
    const ALLOWED_ROLES = ['admin', 'manager', 'seller'] as const;
    if (!ALLOWED_ROLES.includes(body.role as any)) {
      return new Response(JSON.stringify({ error: 'Cargo inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const isAdminOrSuper = callerRoles.some((r: string) => ['admin', 'super_admin'].includes(r));
    if (body.role === 'admin' && !isAdminOrSuper) {
      return new Response(JSON.stringify({ error: 'Somente administradores podem criar admins' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


    // Create user
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.full_name },
    });

    if (createErr || !created.user) {
      return new Response(JSON.stringify({ error: createErr?.message || 'Erro ao criar usuário' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const newUserId = created.user.id;
    const orgId = callerProfile.organization_id;

    // Fallback: if caller didn't provide a connection, pick the first instance of the org
    let resolvedConnectionId: string | null = body.default_connection_id || null;
    if (!resolvedConnectionId) {
      const { data: firstInstance } = await admin
        .from('evolution_instances')
        .select('id')
        .eq('organization_id', orgId)
        .limit(1)
        .maybeSingle();
      resolvedConnectionId = firstInstance?.id || null;
    }

    // Update profile (handle_new_user trigger inserted basic record)
    await admin.from('profiles').update({
      full_name: body.full_name,
      organization_id: orgId,
      recovery_whatsapp: body.recovery_whatsapp || null,
      work_start_time: body.work_start_time || '00:00',
      work_end_time: body.work_end_time || '23:59',
      farewell_message: body.farewell_message || null,
      default_theme: body.default_theme || 'system',
      default_menu_state: body.default_menu_state || 'open',
      default_connection_id: resolvedConnectionId,
      avatar_url: body.avatar_url || null,
    }).eq('id', newUserId);

    // Set role (replace default seller if needed)
    await admin.from('user_roles').delete().eq('user_id', newUserId);
    await admin.from('user_roles').insert({ user_id: newUserId, role: body.role });

    // Initialize permissions + notification settings
    await admin.rpc('initialize_user_permissions', {
      p_user_id: newUserId,
      p_organization_id: orgId,
      p_role: body.role,
    });

    // Sectors
    if (body.sector_ids && body.sector_ids.length > 0) {
      await admin.from('sector_members').insert(
        body.sector_ids.map((sid) => ({ sector_id: sid, user_id: newUserId }))
      );
    }

    return new Response(JSON.stringify({ success: true, user_id: newUserId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('create-team-member error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Erro interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
