import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SANKHYA_API_URL = "https://api.sankhya.com.br/gateway/v1/mgecom/service.sbr";

interface CreateOrderRequest {
  organization_id: string;
  deal_id: string;
  lead_id: string;
  product_id: string;
  deal_value: number;
}

interface SankhyaConfig {
  client_id: string;
  client_secret: string;
  x_token: string;
}

async function getAuthToken(organizationId: string, supabaseUrl: string, supabaseKey: string): Promise<{ token: string; xToken: string; appKey: string }> {
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

  return { token, xToken: config.x_token, appKey: config.client_id };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { organization_id, deal_id, lead_id, product_id, deal_value }: CreateOrderRequest = await req.json();

    if (!organization_id || !deal_id || !lead_id) {
      throw new Error("Parâmetros obrigatórios: organization_id, deal_id, lead_id");
    }

    // Check if Sankhya integration is configured
    const { data: integrationSettings } = await supabase
      .from("integration_settings")
      .select("is_configured")
      .eq("organization_id", organization_id)
      .eq("integration_type", "sankhya")
      .single();

    if (!integrationSettings?.is_configured) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Integração Sankhya não configurada",
          skipped: true
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Sankhya partner ID for the lead
    const { data: leadMapping } = await supabase
      .from("sankhya_mappings")
      .select("sankhya_id")
      .eq("organization_id", organization_id)
      .eq("entity_type", "lead")
      .eq("local_id", lead_id)
      .single();

    if (!leadMapping) {
      throw new Error("Lead não sincronizado com Sankhya. Sincronize primeiro.");
    }

    // Get Sankhya product ID if provided
    let sankhyaProductId: string | null = null;
    if (product_id) {
      const { data: productMapping } = await supabase
        .from("sankhya_mappings")
        .select("sankhya_id")
        .eq("organization_id", organization_id)
        .eq("entity_type", "product")
        .eq("local_id", product_id)
        .single();

      sankhyaProductId = productMapping?.sankhya_id || null;
    }

    // Get authentication
    const { token, xToken } = await getAuthToken(organization_id, supabaseUrl, supabaseKey);

    // Create order in Sankhya using CACSP.IncluirNota
    const response = await fetch(`${SANKHYA_API_URL}?serviceName=CACSP.incluirNota`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": `JSESSIONID=${token}`,
        "token": xToken,
      },
      body: JSON.stringify({
        serviceName: "CACSP.incluirNota",
        requestBody: {
          nota: {
            cabecalho: {
              CODPARC: { $: leadMapping.sankhya_id },
              DTNEG: { $: new Date().toISOString().split('T')[0] },
              CODTIPOPER: { $: "1100" }, // Tipo de operação - ajustar conforme configuração do cliente
              CODTIPVENDA: { $: "0" },
              CODEMP: { $: "1" }, // Empresa padrão - ajustar conforme configuração
            },
            itens: {
              NUNOTA: { $: "" },
              item: sankhyaProductId ? [{
                CODPROD: { $: sankhyaProductId },
                QTDNEG: { $: "1" },
                VLRUNIT: { $: String(deal_value) },
                VLRTOT: { $: String(deal_value) }
              }] : []
            }
          }
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Sankhya create order error:", errorText);
      throw new Error(`Erro ao criar pedido: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.status === "0") {
      throw new Error(data.statusMessage || "Erro ao criar pedido no Sankhya");
    }

    const nunota = data.responseBody?.pk?.NUNOTA?.$;

    // Save mapping for the deal
    await supabase
      .from("sankhya_mappings")
      .insert({
        organization_id,
        entity_type: "deal",
        local_id: deal_id,
        sankhya_id: nunota || "pending",
        last_sync_at: new Date().toISOString(),
        sync_status: nunota ? "synced" : "pending"
      });

    // Update deal with Sankhya order number
    if (nunota) {
      await supabase
        .from("deals")
        .update({
          notes: `Pedido Sankhya: ${nunota}`
        })
        .eq("id", deal_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Pedido criado no Sankhya",
        nunota
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in sankhya-create-order:", error);
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
