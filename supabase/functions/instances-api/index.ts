import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isAuthorizedForOfficialApiOrgScoped,
  isAuthorizedForOfficialApiPlatformWide,
  isProfileActiveForAdminAccess,
  OFFICIAL_API_SELECT_CLAUSE,
  projectOfficialApiRows,
  type OfficialApiDbRow,
} from "./officialApi.ts";

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

    const { data: profile } = await supabase.from("profiles")
      .select("organization_id, is_active")
      .eq("id", user.id)
      .single();
    // FASE 20D — perfil desativado nunca pode acessar dados administrativos,
    // mesmo com JWT válido. `is_active` pode vir `null` em linhas legadas —
    // tratado como ativo por retrocompatibilidade (mesma regra de outras
    // checagens `!== false` já usadas no projeto), mas `false` explícito
    // falha fechado sempre.
    if (!isProfileActiveForAdminAccess(profile)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    if (!profile?.organization_id) return new Response(JSON.stringify({ error: "No organization found" }), { status: 400, headers: corsHeaders });

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/functions\/v1\/instances-api/, "");

    const body = req.method !== "GET" ? await req.json().catch(() => ({})) : {};
    const action = body.action || url.searchParams.get("action");

    // FASE 20D — GET /instances/official-api ou action=officialApi
    //
    // Fronteira administrativa para `evolution_instances_meta_cloud` (API
    // Oficial/HookCloud/Meta direta). Bloqueador confirmado por consulta
    // direta ao banco linkado nesta fase: a tabela tem RLS habilitada com
    // policies corretas (admin/manager do próprio org OU super_admin), MAS
    // o role `authenticated` não tem NENHUM grant SELECT na tabela — um
    // embed PostgREST feito pelo cliente autenticado falha com
    // `42501 permission denied` assim que existir 1 linha real (hoje 0).
    //
    // Em vez de conceder GRANT direto (ampliaria a superfície de acesso da
    // tabela a qualquer query PostgREST futura, incluindo um `select('*')`
    // acidental que exporia `access_token_secret_ref`/hashes de webhook),
    // esta ação reusa a MESMA fronteira administrativa já usada pelo resto
    // deste endpoint (JWT + perfil resolvido no servidor + service_role) e
    // replica explicitamente a regra de autorização da policy RLS
    // (`is_super_admin` OU admin/manager do MESMO org do perfil autenticado
    // — nunca um org enviado pelo cliente), usando uma ALLOWLIST fixa de
    // colunas (nunca `select('*')`). Nenhuma credencial/hash/referência de
    // secret é incluída na resposta.
    if ((path === "/instances/official-api" || action === "officialApi") && req.method === "GET") {
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (roleError) {
        console.error("[officialApi] role lookup failed", roleError.message);
        return new Response(JSON.stringify({ error: "Unable to verify authorization" }), { status: 500, headers: corsHeaders });
      }
      const roles = new Set((roleRows ?? []).map((r: { role: string }) => r.role));
      if (!isAuthorizedForOfficialApiOrgScoped(roles)) {
        // Falha fechada: nenhuma role privilegiada -> 403, nunca lista vazia
        // silenciosa (que o frontend poderia confundir com "sem conexões").
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
      }

      // Escopo: sempre a organização do PERFIL AUTENTICADO no servidor —
      // nunca um valor vindo do body/query do cliente. `is_super_admin`
      // continua restrito à mesma organização aqui (visão platform-wide de
      // super admin é servida por `officialApiAll` abaixo, não por esta
      // ação, para não confundir os dois contratos).
      const { data, error } = await supabase
        .from("evolution_instances_meta_cloud")
        .select(OFFICIAL_API_SELECT_CLAUSE)
        .eq("organization_id", profile.organization_id);

      if (error) {
        console.error("[officialApi] query failed", error.message);
        return new Response(JSON.stringify({ error: "Data unavailable" }), { status: 500, headers: corsHeaders });
      }
      return new Response(
        JSON.stringify({ ok: true, rows: projectOfficialApiRows((data ?? []) as unknown as OfficialApiDbRow[]) }),
        { headers: corsHeaders },
      );
    }

    // FASE 20D — GET /instances/official-api-all ou action=officialApiAll
    //
    // Equivalente platform-wide de `officialApi`, para o painel de Super
    // Admin (`useAllWhatsAppInstancesAdmin`, que já consulta
    // `evolution_instances` de TODAS as organizações). Restrito a
    // `super_admin` — admin/manager de uma organização específica NUNCA
    // recebe dados de outra organização por esta ação.
    if ((path === "/instances/official-api-all" || action === "officialApiAll") && req.method === "GET") {
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (roleError) {
        console.error("[officialApiAll] role lookup failed", roleError.message);
        return new Response(JSON.stringify({ error: "Unable to verify authorization" }), { status: 500, headers: corsHeaders });
      }
      const roles = new Set((roleRows ?? []).map((r: { role: string }) => r.role));
      if (!isAuthorizedForOfficialApiPlatformWide(roles)) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
      }

      const { data, error } = await supabase
        .from("evolution_instances_meta_cloud")
        .select(OFFICIAL_API_SELECT_CLAUSE);

      if (error) {
        console.error("[officialApiAll] query failed", error.message);
        return new Response(JSON.stringify({ error: "Data unavailable" }), { status: 500, headers: corsHeaders });
      }
      return new Response(
        JSON.stringify({ ok: true, rows: projectOfficialApiRows((data ?? []) as unknown as OfficialApiDbRow[]) }),
        { headers: corsHeaders },
      );
    }

    // GET /instances or action=list
    // FASE 20H — listagem operacional: nunca inclui conexão arquivada
    // (mesmo princípio da tela de Conexões — `useWhatsAppInstances`).
    if ((path === "/instances" || path === "/" || action === "list") && req.method === "GET") {
      const { data, error } = await supabase
        .from("evolution_instances")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .is("archived_at", null)
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
      // FASE 18D — escopado pela organização do usuário autenticado (nunca
      // por texto do body): sem este filtro, qualquer usuário logado de
      // QUALQUER organização podia ler `qr_code`/dados de uma conexão de
      // outra organização só sabendo o UUID.
      const { data: inst } = await supabase.from("evolution_instances").select("*")
        .eq("id", qrId).eq("organization_id", profile.organization_id).maybeSingle();
      if (!inst) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: corsHeaders });

      // `organization_id` repassado explicitamente: este client usa a
      // service role, então `whatsapp-proxy` trata a chamada como service
      // role real — o escopo de organização precisa vir daqui, já
      // comprovado pelo `profile.organization_id` do usuário autenticado
      // acima, nunca inventado pelo cliente final.
      const { data, error } = await supabase.functions.invoke("whatsapp-proxy", {
        body: { action: "connect_instance", id: qrId, organization_id: profile.organization_id }
      });
      if (error) throw error;

      return new Response(JSON.stringify({ qr: data.qr_code || inst.qr_code }), { headers: corsHeaders });
    }

    // Start/Reconnect: POST /instances/start/{id} or action=start
    const startMatch = path.match(/\/instances\/start\/(.+)/);
    const startId = startMatch ? startMatch[1] : (action === "start" ? body.id : null);
    if (startId && req.method === "POST") {
      const { data, error } = await supabase.functions.invoke("whatsapp-proxy", {
        body: { action: "connect_instance", id: startId, organization_id: profile.organization_id }
      });
      if (error) throw error;
      return new Response(JSON.stringify(data), { headers: corsHeaders });
    }

    // Delete: DELETE /instances/{id} or action=delete (accepts POST with action=delete)
    const deleteMatch = path.match(/\/instances\/(.+)/);
    const deleteId = deleteMatch ? deleteMatch[1] : (action === "delete" ? body.id : null);
    if (deleteId && (req.method === "DELETE" || (req.method === "POST" && action === "delete"))) {
      const { data, error } = await supabase.functions.invoke("whatsapp-proxy", {
        body: { action: "delete_instance_self", id: deleteId, organization_id: profile.organization_id }
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
