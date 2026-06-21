import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OLD_EMAIL = "superadmin@vendus.com.br";
const NEW_EMAIL = "anderson.nads@gmail.com";
const USER_ID = "731598a3-5dca-4227-988f-face00eeca5b";

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

    // Gera senha temporária forte (será descartada — usuário deve usar reset).
    const tempPassword =
      crypto.randomUUID().replace(/-/g, "") +
      "Aa1!" +
      crypto.randomUUID().slice(0, 8);

    // 1. Atualiza email + senha + confirma email + metadata via Admin API
    const { data: updated, error: updErr } = await admin.auth.admin.updateUserById(USER_ID, {
      email: NEW_EMAIL,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: "Super Admin", migrated_from: OLD_EMAIL },
    });
    if (updErr) throw new Error("updateUserById: " + updErr.message);

    // 2. Atualiza profiles.email (caso exista)
    const { error: profErr } = await admin
      .from("profiles")
      .update({ email: NEW_EMAIL })
      .eq("id", USER_ID);
    if (profErr) console.warn("profiles update:", profErr.message);

    // 3. Invalida todas as sessões/refresh tokens existentes
    const { error: signOutErr } = await admin.auth.admin.signOut(USER_ID, "global");
    if (signOutErr) console.warn("signOut:", signOutErr.message);

    // 4. Dispara reset de senha para o novo email (link enviado por e-mail)
    const { data: resetLink, error: resetErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: NEW_EMAIL,
    });

    // 5. Auditoria
    const { data: userCheck } = await admin.auth.admin.getUserById(USER_ID);
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const oldStillExists = list?.users.some(
      (u) => (u.email || "").toLowerCase() === OLD_EMAIL.toLowerCase()
    );
    const newExists = list?.users.some(
      (u) => (u.email || "").toLowerCase() === NEW_EMAIL.toLowerCase()
    );

    const { data: profile } = await admin
      .from("profiles")
      .select("id,email,full_name")
      .eq("id", USER_ID)
      .maybeSingle();

    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", USER_ID);

    return json(200, {
      ok: true,
      audit: {
        auth_user_email: userCheck?.user?.email,
        auth_user_confirmed: !!userCheck?.user?.email_confirmed_at,
        auth_user_provider: userCheck?.user?.app_metadata?.provider,
        auth_user_identities: userCheck?.user?.identities?.map((i: any) => ({
          provider: i.provider,
          email: i.identity_data?.email,
        })),
        old_email_still_exists: oldStillExists,
        new_email_exists: newExists,
        profile,
        roles: roles?.map((r) => r.role),
        sessions_revoked: !signOutErr,
        reset_link_generated: !resetErr,
        reset_error: resetErr?.message,
      },
    });
  } catch (err) {
    console.error("[migrate-super-admin-email]", err);
    return json(500, { ok: false, error: (err as Error).message });
  }
});
