import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  organization_id: string;
  email: string;
  full_name?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
    } = await userClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verifica se o caller é super_admin
    const { data: isSuper } = await admin.rpc("is_super_admin", {
      _user_id: caller.id,
    });
    if (!isSuper) {
      return new Response(JSON.stringify({ error: "Permissão negada" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Payload;
    const organization_id = (body.organization_id || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const full_name = (body.full_name || "").trim() || email;

    if (!organization_id || !email) {
      return new Response(
        JSON.stringify({ error: "organization_id e email são obrigatórios" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Procura usuário existente por email (paginado)
    let existingUserId: string | null = null;
    let page = 1;
    while (page <= 20 && !existingUserId) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw error;
      const found = data.users.find(
        (u) => (u.email || "").toLowerCase() === email
      );
      if (found) {
        existingUserId = found.id;
        break;
      }
      if (data.users.length < 200) break;
      page++;
    }

    let userId = existingUserId;
    let invited = false;

    if (!userId) {
      // Convida via email (Supabase manda link de definir senha)
      const redirectTo =
        req.headers.get("origin") || `${SUPABASE_URL.replace(".supabase.co", ".lovable.app")}`;

      const { data: invite, error: inviteError } =
        await admin.auth.admin.inviteUserByEmail(email, {
          data: { full_name },
          redirectTo: `${redirectTo}/login`,
        });

      if (inviteError || !invite?.user) {
        // Fallback: cria usuário direto (sem email) com senha aleatória
        const randomPwd =
          crypto.randomUUID().replace(/-/g, "") + "Aa1!";
        const { data: created, error: createError } =
          await admin.auth.admin.createUser({
            email,
            password: randomPwd,
            email_confirm: true,
            user_metadata: { full_name },
          });
        if (createError || !created?.user) {
          throw createError || new Error("Falha ao criar usuário");
        }
        userId = created.user.id;
      } else {
        userId = invite.user.id;
        invited = true;
      }
    } else {
      // Usuário já existe — verifica se já pertence a outra org
      const { data: existingProfile } = await admin
        .from("profiles")
        .select("organization_id")
        .eq("id", userId)
        .maybeSingle();
      if (
        existingProfile?.organization_id &&
        existingProfile.organization_id !== organization_id
      ) {
        return new Response(
          JSON.stringify({
            error:
              "Este e-mail já pertence a outra empresa. Use um e-mail diferente.",
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Upsert profile com organization_id
    await admin.from("profiles").upsert(
      {
        id: userId!,
        email,
        full_name,
        organization_id,
      },
      { onConflict: "id" }
    );

    // Insere role admin (ignora duplicata)
    const { error: roleError } = await admin
      .from("user_roles")
      .insert({ user_id: userId!, role: "admin" });
    if (
      roleError &&
      !(roleError.code === "23505" || /duplicate/i.test(roleError.message))
    ) {
      console.error("[create-organization-admin] role error:", roleError);
    }

    // Remove qualquer outro role (ex: 'seller' inserido por trigger handle_new_user)
    // garantindo que admin de empresa tenha somente o papel 'admin'
    const { error: cleanupError } = await admin
      .from("user_roles")
      .delete()
      .eq("user_id", userId!)
      .neq("role", "admin");
    if (cleanupError) {
      console.error("[create-organization-admin] cleanup error:", cleanupError);
    }

    // Cria (ou reaproveita) team_invitation com role admin para gerar link copiável
    let invite_token: string | null = null;
    const { data: existingInvite } = await admin
      .from("team_invitations")
      .select("token")
      .eq("organization_id", organization_id)
      .eq("email", email)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (existingInvite?.token) {
      invite_token = existingInvite.token;
    } else {
      const { data: newInvite, error: inviteInsertErr } = await admin
        .from("team_invitations")
        .insert({
          email,
          role: "admin",
          organization_id,
          invited_by: caller.id,
          status: "pending",
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select("token")
        .single();
      if (inviteInsertErr) {
        console.error("[create-organization-admin] invite insert error:", inviteInsertErr);
      } else {
        invite_token = newInvite?.token ?? null;
      }
    }

    // Audit log
    await admin.from("platform_audit_logs").insert({
      actor_id: caller.id,
      action: `Admin da empresa criado: ${email}`,
      entity_type: "organization",
      entity_id: organization_id,
      metadata: { email, invited } as any,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        user_id: userId,
        invited,
        invite_token,
        invite_email: email,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[create-organization-admin] error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
