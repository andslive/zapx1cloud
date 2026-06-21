import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NEW_EMAIL = "anderson.nads@gmail.com";
const FULL_NAME = "Anderson (Super Admin)";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body, null, 2), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Senha temporária descartável — usuário deve usar o link de reset
    const tempPassword =
      crypto.randomUUID().replace(/-/g, "") + "Aa1!" + crypto.randomUUID().slice(0, 8);

    // 1. Cria usuário com email confirmado
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: NEW_EMAIL,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: FULL_NAME },
    });
    if (createErr) throw new Error("createUser: " + createErr.message);

    const userId = created.user!.id;

    // 2. Garante profile
    const { error: profErr } = await admin
      .from("profiles")
      .upsert(
        { id: userId, email: NEW_EMAIL, full_name: FULL_NAME, is_active: true },
        { onConflict: "id" }
      );
    if (profErr) console.warn("profiles upsert:", profErr.message);

    // 3. Garante roles super_admin + admin
    await admin
      .from("user_roles")
      .upsert({ user_id: userId, role: "super_admin" }, { onConflict: "user_id,role" });
    await admin
      .from("user_roles")
      .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });

    // 4. Marca platform_settings: bootstrapped + senha não trocada (força reset no 1º login)
    const { data: existingSettings } = await admin
      .from("platform_settings")
      .select("id")
      .maybeSingle();
    const payload = {
      super_admin_bootstrapped: true,
      super_admin_bootstrapped_at: new Date().toISOString(),
      default_password_changed: false,
    };
    if (existingSettings?.id) {
      await admin.from("platform_settings").update(payload).eq("id", existingSettings.id);
    } else {
      await admin.from("platform_settings").insert({ ...payload, remix_setup_completed: false });
    }

    // 5. Gera link de recovery (entrega depende de email infra configurada)
    const { data: resetLink, error: resetErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: NEW_EMAIL,
    });

    // 6. Auditoria
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const oldExists = list?.users.some(
      (u) => (u.email || "").toLowerCase() === "superadmin@vendus.com.br"
    );
    const newOnly =
      list?.users.length === 1 &&
      (list.users[0].email || "").toLowerCase() === NEW_EMAIL.toLowerCase();

    const { data: profile } = await admin
      .from("profiles")
      .select("id,email,full_name,is_active")
      .eq("id", userId)
      .maybeSingle();

    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const { count: oldProfiles } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("email", "superadmin@vendus.com.br");

    return json(200, {
      ok: true,
      user_id: userId,
      audit: {
        only_new_user_in_auth: newOnly,
        total_auth_users: list?.users.length,
        old_email_in_auth: oldExists,
        old_email_in_profiles: (oldProfiles ?? 0) > 0,
        profile,
        roles: roles?.map((r) => r.role).sort(),
        recovery_link_generated: !resetErr,
        recovery_error: resetErr?.message,
      },
    });
  } catch (err) {
    console.error("[create-super-admin-direct]", err);
    return json(500, { ok: false, error: (err as Error).message });
  }
});
