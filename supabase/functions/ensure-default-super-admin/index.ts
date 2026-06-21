import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Default identity is loaded from secrets (no hardcoded email/password fallback).
// Use SUPER_ADMIN_EMAIL (preferred) or DEFAULT_SUPER_ADMIN_EMAIL.
// In production, set DEFAULT_SUPER_ADMIN_PASSWORD as a secret and rotate the
// seeded account password immediately after first login.
const DEFAULT_EMAIL = (
  Deno.env.get("SUPER_ADMIN_EMAIL") ||
  Deno.env.get("DEFAULT_SUPER_ADMIN_EMAIL") ||
  ""
).trim().toLowerCase();
const DEFAULT_PASSWORD = Deno.env.get("DEFAULT_SUPER_ADMIN_PASSWORD") || crypto.randomUUID() + "!Aa1";
const DEFAULT_NAME = Deno.env.get("DEFAULT_SUPER_ADMIN_NAME") || "Super Admin";


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (!DEFAULT_EMAIL) {
      return json(200, { status: "skipped", reason: "missing_super_admin_email_secret" });
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ─── CAMADA 1: Lock permanente em platform_settings ───────────────────
    const { data: settings } = await admin
      .from("platform_settings")
      .select("id, super_admin_bootstrapped")
      .maybeSingle();

    if (settings?.super_admin_bootstrapped === true) {
      return json(200, { status: "locked", reason: "already_bootstrapped" });
    }

    // ─── CAMADA 2: Já existe algum super_admin no banco? ──────────────────
    const { data: existingRoles } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "super_admin")
      .limit(1);

    if (existingRoles && existingRoles.length > 0) {
      // Marca lock para nunca mais executar
      await markLocked(admin, settings?.id);
      return json(200, { status: "locked", reason: "super_admin_exists" });
    }

    // ─── CAMADA 3: Cria o usuário via Auth Admin API ──────────────────────
    let userId: string | null = null;

    // Verifica se o email já existe (raro, mas possível)
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users.find(
      (u) => (u.email || "").toLowerCase() === DEFAULT_EMAIL
    );

    if (existing) {
      userId = existing.id;
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: DEFAULT_EMAIL,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: DEFAULT_NAME },
      });
      if (createErr) throw createErr;
      userId = created.user.id;
    }

    if (!userId) throw new Error("Failed to resolve user_id");

    // Garante profile (trigger on_auth_user_created normalmente cria, mas blindamos)
    await admin
      .from("profiles")
      .upsert({ id: userId, full_name: DEFAULT_NAME, email: DEFAULT_EMAIL }, { onConflict: "id" });

    // Promove a super_admin (e admin como bônus para acesso completo)
    await admin
      .from("user_roles")
      .upsert({ user_id: userId, role: "super_admin" }, { onConflict: "user_id,role" });
    await admin
      .from("user_roles")
      .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });

    // ─── CAMADA 4: Marca lock permanente ──────────────────────────────────
    await markLocked(admin, settings?.id);

    return json(200, {
      status: "created",
      email: DEFAULT_EMAIL,
      user_id: userId,
    });
  } catch (err) {
    console.error("[ensure-default-super-admin] error:", err);
    return json(500, { status: "error", error: (err as Error).message });
  }
});

async function markLocked(admin: any, settingsId?: string) {
  const payload = {
    super_admin_bootstrapped: true,
    super_admin_bootstrapped_at: new Date().toISOString(),
  };
  if (settingsId) {
    await admin.from("platform_settings").update(payload).eq("id", settingsId);
  } else {
    await admin.from("platform_settings").insert({
      ...payload,
      default_password_changed: false,
      remix_setup_completed: false,
    });
  }
}
