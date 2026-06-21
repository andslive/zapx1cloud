import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPlatformEmail } from "../_shared/platform-email-send.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InviteEmailRequest {
  email: string;
  inviteLink: string;
  role: string;
  squadName?: string;
  invitedByName?: string;
  organizationName?: string;
}

const getRoleName = (role: string) => {
  const roles: Record<string, string> = {
    admin: "Administrador",
    manager: "Gestor",
    seller: "Vendedor",
  };
  return roles[role] || role;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ===== AUTH: require valid JWT and admin/manager role =====
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const { data: claims, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const userId = claims.claims.sub as string;
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: rolesRows } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const allowed = (rolesRows ?? []).some((r: any) =>
      ["super_admin", "admin", "manager"].includes(r.role)
    );
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { email, inviteLink, role, squadName, invitedByName, organizationName }: InviteEmailRequest = await req.json();

    if (!email || !inviteLink) {
      return new Response(
        JSON.stringify({ error: "Email e link de convite são obrigatórios" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Busca nome da plataforma (white-label)
    const { data: platformSettings } = await adminClient
      .from("platform_settings")
      .select("platform_name")
      .maybeSingle();
    const platformName = platformSettings?.platform_name || "X1ZAP";

    const result = await sendPlatformEmail({
      slug: "team_invite",
      to: email,
      idempotencyKey: `invite-${email}-${Date.now()}`,
      variables: {
        platform_name: platformName,
        organization_name: organizationName || platformName,
        invited_by_name: invitedByName || "Sua equipe",
        role_name: getRoleName(role),
        squad_text: squadName ? ` (squad ${squadName})` : "",
        invite_link: inviteLink,
      },
    });

    if (!result.ok) {
      throw new Error(result.error || "Falha ao enviar convite");
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Erro ao enviar email de convite:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
