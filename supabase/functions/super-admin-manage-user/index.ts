import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action = "confirm_email" | "set_password" | "change_email";

interface Payload {
  action: Action;
  user_id: string;
  password?: string;
  email?: string;
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
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Apenas super_admin
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
    const { action, user_id } = body;
    if (!action || !user_id) {
      return new Response(JSON.stringify({ error: "Parâmetros obrigatórios ausentes" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updateResult: any = null;
    let auditDetail = "";

    if (action === "confirm_email") {
      const { data, error } = await admin.auth.admin.updateUserById(user_id, {
        email_confirm: true,
      });
      if (error) throw error;
      updateResult = data;
      auditDetail = "Email confirmado manualmente";
    } else if (action === "set_password") {
      const password = (body.password || "").trim();
      if (password.length < 8) {
        return new Response(JSON.stringify({ error: "Senha deve ter ao menos 8 caracteres" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data, error } = await admin.auth.admin.updateUserById(user_id, { password });
      if (error) throw error;
      updateResult = data;
      auditDetail = "Senha redefinida pelo super admin";
    } else if (action === "change_email") {
      const email = (body.email || "").trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return new Response(JSON.stringify({ error: "Email inválido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data, error } = await admin.auth.admin.updateUserById(user_id, {
        email,
        email_confirm: true,
      });
      if (error) throw error;
      // Atualiza profile.email também
      await admin.from("profiles").update({ email }).eq("id", user_id);
      updateResult = data;
      auditDetail = `Email alterado para ${email}`;
    } else {
      return new Response(JSON.stringify({ error: "Ação inválida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Audit log
    await admin.from("platform_audit_logs").insert({
      actor_id: caller.id,
      action: auditDetail,
      entity_type: "user",
      entity_id: user_id,
      metadata: { action } as any,
    });

    return new Response(
      JSON.stringify({ ok: true, user_id, action }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[super-admin-manage-user] error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
