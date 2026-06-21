import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SANKHYA_API_URL = "https://api.sankhya.com.br/gateway/v1/mge/service.sbr";

interface SyncRequest {
  organization_id: string;
}

interface SankhyaConfig {
  client_id: string;
  client_secret: string;
  x_token: string;
}

async function getAuthToken(organizationId: string, supabaseUrl: string, supabaseKey: string): Promise<{ token: string; xToken: string }> {
  const supabaseClient = createClient(supabaseUrl, supabaseKey);
  
  const { data: settings, error } = await supabaseClient
    .from("integration_settings")
    .select("settings")
    .eq("organization_id", organizationId)
    .eq("integration_type", "sankhya")
    .single();

  if (error || !settings) {
    throw new Error("Configurações do Sankhya não encontradas");
  }

  const config = (settings.settings as unknown) as SankhyaConfig;

  // Get auth token
  const authResponse = await fetch("https://api.sankhya.com.br/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "token": config.x_token,
      "appkey": config.client_id,
    },
    body: JSON.stringify({
      serviceName: "MobileLoginSP.login",
      requestBody: {
        NOMUSU: { $: config.client_id },
        INTERNO: { $: config.client_secret },
        KEEPCONNECTED: { $: "S" }
      }
    }),
  });

  if (!authResponse.ok) {
    throw new Error("Falha na autenticação Sankhya");
  }

  const authData = await authResponse.json();
  const token = authData.responseBody?.jsessionid?.$;

  if (!token) {
    throw new Error("Token de sessão não retornado");
  }

  return { token, xToken: config.x_token };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  let syncLogId: string | null = null;

  try {
    const { organization_id }: SyncRequest = await req.json();

    if (!organization_id) {
      throw new Error("organization_id é obrigatório");
    }

    // Create sync log
    const { data: logData, error: logError } = await supabase
      .from("sankhya_sync_logs")
      .insert({
        organization_id,
        sync_type: "manual",
        entity_type: "clients",
        status: "running"
      })
      .select("id")
      .single();

    if (logError) throw logError;
    syncLogId = logData.id;

    // Get authentication
    const { token, xToken } = await getAuthToken(organization_id, supabaseUrl, supabaseKey);

    // Fetch partners from Sankhya
    const response = await fetch(`${SANKHYA_API_URL}?serviceName=CRUDServiceProvider.loadRecords`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": `JSESSIONID=${token}`,
        "token": xToken,
      },
      body: JSON.stringify({
        serviceName: "CRUDServiceProvider.loadRecords",
        requestBody: {
          dataSet: {
            rootEntity: "Parceiro",
            includePresentationFields: "S",
            offsetPage: "0",
            dataRow: {
              localFields: {
                CODPARC: {},
                NOMEPARC: {},
                RAZAOSOCIAL: {},
                EMAIL: {},
                TELEFONE: {},
                CGC_CPF: {},
                CLIENTE: { $: "S" }
              }
            },
            criteria: {
              expression: { $: "this.CLIENTE = 'S' AND this.ATIVO = 'S'" }
            }
          }
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`Erro ao buscar parceiros: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.status === "0") {
      throw new Error(data.statusMessage || "Erro ao buscar dados do Sankhya");
    }

    const partners = data.responseBody?.entities?.entity || [];
    const partnerList = Array.isArray(partners) ? partners : [partners];

    let successCount = 0;
    let failedCount = 0;

    for (const partner of partnerList) {
      try {
        const codParc = partner.CODPARC?.$;
        const name = partner.NOMEPARC?.$ || partner.RAZAOSOCIAL?.$;
        const email = partner.EMAIL?.$;
        const phone = partner.TELEFONE?.$;

        if (!codParc || !name) continue;

        // Check if mapping exists
        const { data: existingMapping } = await supabase
          .from("sankhya_mappings")
          .select("local_id")
          .eq("organization_id", organization_id)
          .eq("entity_type", "lead")
          .eq("sankhya_id", codParc)
          .single();

        if (existingMapping) {
          // Update existing lead
          await supabase
            .from("leads")
            .update({
              name,
              email,
              phone,
              updated_at: new Date().toISOString()
            })
            .eq("id", existingMapping.local_id);

          await supabase
            .from("sankhya_mappings")
            .update({
              last_sync_at: new Date().toISOString(),
              sync_status: "synced"
            })
            .eq("organization_id", organization_id)
            .eq("entity_type", "lead")
            .eq("sankhya_id", codParc);
        } else {
          // Create new lead
          const { data: newLead, error: leadError } = await supabase
            .from("leads")
            .insert({
              organization_id,
              name,
              email,
              phone,
              source: "sankhya",
              lead_origin: "ERP Sankhya"
            })
            .select("id")
            .single();

          if (leadError) throw leadError;

          // Create mapping
          await supabase
            .from("sankhya_mappings")
            .insert({
              organization_id,
              entity_type: "lead",
              local_id: newLead.id,
              sankhya_id: codParc,
              last_sync_at: new Date().toISOString(),
              sync_status: "synced"
            });
        }

        successCount++;
      } catch (err) {
        console.error("Error processing partner:", err);
        failedCount++;
      }
    }

    // Update sync log
    await supabase
      .from("sankhya_sync_logs")
      .update({
        records_processed: partnerList.length,
        records_success: successCount,
        records_failed: failedCount,
        finished_at: new Date().toISOString(),
        status: "completed"
      })
      .eq("id", syncLogId);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sincronização concluída: ${successCount} registros sincronizados`,
        processed: partnerList.length,
        successCount,
        failedCount
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in sankhya-sync-clients:", error);

    // Update sync log with error
    if (syncLogId) {
      await supabase
        .from("sankhya_sync_logs")
        .update({
          finished_at: new Date().toISOString(),
          status: "failed",
          error_details: { message: (error as Error).message }
        })
        .eq("id", syncLogId);
    }

    return new Response(
      JSON.stringify({ 
        success: false,
        error: (error as Error).message 
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
