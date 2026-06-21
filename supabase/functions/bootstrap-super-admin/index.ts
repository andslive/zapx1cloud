import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPER_ADMIN_EMAIL = (Deno.env.get("SUPER_ADMIN_EMAIL") || "").trim().toLowerCase();
    if (!SUPER_ADMIN_EMAIL) {
      return new Response(
        JSON.stringify({ ok: false, error: "SUPER_ADMIN_EMAIL não configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ─── HARDENING ──────────────────────────────────────────────────────
    // 1. If a permanent bootstrap lock exists in platform_settings, refuse.
    const { data: settings } = await admin
      .from("platform_settings")
      .select("super_admin_bootstrapped")
      .maybeSingle();
    if (settings?.super_admin_bootstrapped === true) {
      return new Response(
        JSON.stringify({ ok: false, error: "Bootstrap já bloqueado", locked: true }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. If any super_admin already exists, refuse (prevents replay/race abuse).
    const { data: existingSupers } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "super_admin")
      .limit(1);
    if (existingSupers && existingSupers.length > 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "Super admin já existe", locked: true }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Optional shared-secret gate if BOOTSTRAP_SECRET is configured.
    const expectedSecret = Deno.env.get("BOOTSTRAP_SECRET");
    if (expectedSecret) {
      const provided = req.headers.get("x-bootstrap-secret");
      if (provided !== expectedSecret) {
        return new Response(
          JSON.stringify({ ok: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Procura o usuário pelo email (paginação simples até achar)
    let userId: string | null = null;
    let page = 1;
    const perPage = 200;
    while (page <= 20 && !userId) {

      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) throw error;
      const found = data.users.find((u) => (u.email || "").toLowerCase() === SUPER_ADMIN_EMAIL);
      if (found) {
        userId = found.id;
        break;
      }
      if (data.users.length < perPage) break;
      page++;
    }

    if (!userId) {
      return new Response(
        JSON.stringify({
          ok: true,
          promoted: false,
          email: SUPER_ADMIN_EMAIL,
          message: "Usuário ainda não cadastrado. Será promovido automaticamente no signup.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: insertError } = await admin
      .from("user_roles")
      .insert({ user_id: userId, role: "super_admin" });

    // Ignora erro de conflito (já existe)
    const alreadyHad = !!insertError && (insertError.code === "23505" || /duplicate/i.test(insertError.message));
    if (insertError && !alreadyHad) throw insertError;

    return new Response(
      JSON.stringify({
        ok: true,
        promoted: !alreadyHad,
        already_had: alreadyHad,
        email: SUPER_ADMIN_EMAIL,
        user_id: userId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[bootstrap-super-admin] error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
