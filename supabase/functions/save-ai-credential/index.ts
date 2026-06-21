// Salva (ou atualiza) a chave de API de um provedor de IA da organização.
// Faz uma verificação real chamando o provedor antes de gravar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function verifyKey(provider: string, apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!r.ok) return { ok: false, error: `OpenAI respondeu ${r.status}: ${(await r.text()).slice(0, 200)}` };
      return { ok: true };
    }
    if (provider === "anthropic") {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      if (!r.ok && r.status !== 200) {
        const txt = await r.text();
        // 400 com erro de modelo já indica que a auth funcionou
        if (txt.includes("model") || r.status === 400) return { ok: true };
        return { ok: false, error: `Anthropic respondeu ${r.status}: ${txt.slice(0, 200)}` };
      }
      return { ok: true };
    }
    if (provider === "gemini") {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!r.ok) return { ok: false, error: `Gemini respondeu ${r.status}: ${(await r.text()).slice(0, 200)}` };
      return { ok: true };
    }
    return { ok: false, error: `Provedor desconhecido: ${provider}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "erro desconhecido" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "not authenticated" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const { provider, api_key, model_default, action } = body || {};

    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Resolve org + role
    const { data: profile } = await adminClient
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.organization_id) return json({ error: "user has no organization" }, 400);
    const orgId = profile.organization_id;

    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = roles?.some((r: any) => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) return json({ error: "only admins can manage AI credentials" }, 403);

    if (!["openai", "anthropic", "gemini"].includes(provider)) {
      return json({ error: "invalid provider" }, 400);
    }

    if (action === "delete") {
      await adminClient.from("org_ai_credentials").delete().eq("organization_id", orgId).eq("provider", provider);
      return json({ success: true });
    }

    if (typeof api_key !== "string" || api_key.trim().length < 8) {
      return json({ error: "invalid api_key" }, 400);
    }

    const trimmed = api_key.trim();
    const verify = await verifyKey(provider, trimmed);
    if (!verify.ok) {
      return json({ error: verify.error || "verification failed" }, 400);
    }

    const masked = "••••" + trimmed.slice(-4);
    const { error: upErr } = await adminClient
      .from("org_ai_credentials")
      .upsert(
        {
          organization_id: orgId,
          provider,
          api_key_encrypted: trimmed,
          api_key_masked: masked,
          model_default: model_default || null,
          last_verified_at: new Date().toISOString(),
          last_error: null,
        },
        { onConflict: "organization_id,provider" },
      );
    if (upErr) return json({ error: upErr.message }, 500);

    // Reflete no integration_settings (compatibilidade com UI antiga)
    await adminClient.from("integration_settings").upsert(
      {
        organization_id: orgId,
        integration_type: provider,
        api_key_masked: masked,
        is_configured: true,
        settings: { provider, configured_at: new Date().toISOString() },
        last_verified_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,integration_type" },
    );

    return json({ success: true, masked });
  } catch (e) {
    console.error("[save-ai-credential] error", e);
    return json({ error: e instanceof Error ? e.message : "unknown error" }, 500);
  }
});
