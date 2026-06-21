import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ─── AUTH GUARD: only authenticated super_admin can call this ──────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(401, { error: "Não autenticado" });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return json(401, { error: "Sessão inválida" });
    }
    const callerId = claimsData.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: isSuper, error: roleErr } = await admin.rpc("is_super_admin", { _user_id: callerId });
    if (roleErr || !isSuper) {
      return json(403, { error: "Permissão negada" });
    }

    const { email, password } = await req.json();
    if (!email || !password) {
      return json(400, { error: "Email e senha obrigatórios" });
    }

    // Find user by email
    const { data: { users }, error: listErr } = await admin.auth.admin.listUsers({
      perPage: 1000,
    });
    if (listErr) throw listErr;

    const user = users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (!user) {
      return json(404, { error: "Usuário não encontrado" });
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, { password });
    if (updateErr) throw updateErr;

    return json(200, { ok: true, user_id: user.id });
  } catch (err: any) {
    console.error("[set-user-password] error:", err);
    return json(500, { ok: false, error: err.message || "Erro interno" });
  }
});
