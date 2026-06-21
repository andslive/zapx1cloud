import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
    if (!profile?.organization_id) return new Response(JSON.stringify({ error: "No organization found" }), { status: 400, headers: corsHeaders });

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/functions\/v1\/instances-api/, "");
    
    const body = req.method !== "GET" ? await req.json().catch(() => ({})) : {};
    const action = body.action || url.searchParams.get("action");

    // GET /instances or action=list
    if ((path === "/instances" || path === "/" || action === "list") && req.method === "GET") {
      const { data, error } = await supabase
        .from("evolution_instances")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return new Response(JSON.stringify(data), { headers: corsHeaders });
    }

    // POST /instances/sync or action=sync
    if ((path === "/instances/sync" || action === "sync") && req.method === "POST") {
      const { data, error } = await supabase.functions.invoke("whatsapp-proxy", {
        body: { action: "sync_instances", organization_id: profile.organization_id }
      });
      if (error) throw error;
      return new Response(JSON.stringify(data), { headers: corsHeaders });
    }

    // POST /instances/create or action=create
    if ((path === "/instances/create" || action === "create") && req.method === "POST") {
      const { name, channel = "whatsapp", provider: incomingProvider } = body;
      const provider = incomingProvider || "uazapi"; // Default to UazAPI
      
      if (!name) return new Response(JSON.stringify({ error: "Name is required" }), { status: 400, headers: corsHeaders });

      // Block Evolution creation
      if (provider === "evolution") {
        return new Response(JSON.stringify({ 
          error: "O provedor Evolution é legado e não permite mais a criação de novas instâncias. Por favor, utilize UazAPI." 
        }), { status: 403, headers: corsHeaders });
      }

      if (channel === "whatsapp" && provider === "uazapi") {
        const { data, error } = await supabase.functions.invoke("whatsapp-proxy", {
          body: { action: "create_instance_self", name, provider }
        });
        if (error) throw error;
        
        if (data.instance?.id) {
          await supabase.from("evolution_instances")
            .update({ channel, provider })
            .eq("id", data.instance.id);
        }
        
        return new Response(JSON.stringify(data), { headers: corsHeaders });
      }

      if (channel === "whatsapp" && provider === "chromium") {
        // Chromium is for observability/status only
        const { data, error } = await supabase.from("evolution_instances").insert({
          organization_id: profile.organization_id,
          name,
          channel,
          provider,
          status: "disconnected"
        }).select().single();
        
        if (error) throw error;
        return new Response(JSON.stringify({ ok: true, instance: data }), { headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: "Unsupported channel/provider" }), { status: 400, headers: corsHeaders });

    }

    // QR Code: GET /instances/qr/{id} or action=qr (accepts POST/GET)
    const qrMatch = path.match(/\/instances\/qr\/(.+)/);
    const qrId = qrMatch ? qrMatch[1] : (action === "qr" ? body.id : null);
    if (qrId) {
      const { data: inst } = await supabase.from("evolution_instances").select("*").eq("id", qrId).single();
      if (!inst) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: corsHeaders });

      const { data, error } = await supabase.functions.invoke("whatsapp-proxy", {
        body: { action: "connect_instance", id: qrId }
      });
      if (error) throw error;
      
      return new Response(JSON.stringify({ qr: data.qr_code || inst.qr_code }), { headers: corsHeaders });
    }

    // Start/Reconnect: POST /instances/start/{id} or action=start
    const startMatch = path.match(/\/instances\/start\/(.+)/);
    const startId = startMatch ? startMatch[1] : (action === "start" ? body.id : null);
    if (startId && req.method === "POST") {
      const { data, error } = await supabase.functions.invoke("whatsapp-proxy", {
        body: { action: "connect_instance", id: startId }
      });
      if (error) throw error;
      return new Response(JSON.stringify(data), { headers: corsHeaders });
    }

    // Delete: DELETE /instances/{id} or action=delete (accepts POST with action=delete)
    const deleteMatch = path.match(/\/instances\/(.+)/);
    const deleteId = deleteMatch ? deleteMatch[1] : (action === "delete" ? body.id : null);
    if (deleteId && (req.method === "DELETE" || (req.method === "POST" && action === "delete"))) {
      const { data, error } = await supabase.functions.invoke("whatsapp-proxy", {
        body: { action: "delete_instance_self", id: deleteId }
      });
      if (error) throw error;
      return new Response(JSON.stringify(data), { headers: corsHeaders });
    }



    return new Response(JSON.stringify({ error: "Not Found", path }), { status: 404, headers: corsHeaders });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
