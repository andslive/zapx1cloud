import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SANKHYA_AUTH_URL = "https://api.sankhya.com.br/login";

interface AuthRequest {
  action: 'test' | 'authenticate';
  credentials?: {
    client_id: string;
    client_secret: string;
    x_token: string;
  };
  organization_id?: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, credentials, organization_id }: AuthRequest = await req.json();
    
    let clientId: string;
    let clientSecret: string;
    let xToken: string;

    // If credentials provided directly (for testing), use them
    if (credentials) {
      clientId = credentials.client_id;
      clientSecret = credentials.client_secret;
      xToken = credentials.x_token;
    } else if (organization_id) {
      // Fetch credentials from database
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: settings, error } = await supabase
        .from("integration_settings")
        .select("settings")
        .eq("organization_id", organization_id)
        .eq("integration_type", "sankhya")
        .single();

      if (error || !settings) {
        throw new Error("Configurações do Sankhya não encontradas");
      }

      const config = settings.settings as {
        client_id: string;
        client_secret: string;
        x_token: string;
      };

      clientId = config.client_id;
      clientSecret = config.client_secret;
      xToken = config.x_token;
    } else {
      throw new Error("Credenciais ou organization_id são obrigatórios");
    }

    if (!clientId || !clientSecret || !xToken) {
      throw new Error("Credenciais incompletas");
    }

    // Authenticate with Sankhya API
    const authResponse = await fetch(SANKHYA_AUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": xToken,
        "appkey": clientId,
      },
      body: JSON.stringify({
        serviceName: "MobileLoginSP.login",
        requestBody: {
          NOMUSU: { $: clientId },
          INTERNO: { $: clientSecret },
          KEEPCONNECTED: { $: "S" }
        }
      }),
    });

    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      console.error("Sankhya auth error:", errorText);
      throw new Error(`Falha na autenticação: ${authResponse.status}`);
    }

    const authData = await authResponse.json();

    // Check for Sankhya-specific error
    if (authData.status === "0" || authData.statusMessage) {
      throw new Error(authData.statusMessage || "Erro na autenticação Sankhya");
    }

    // Extract bearer token from response
    const bearerToken = authData.responseBody?.jsessionid?.$;
    
    if (!bearerToken && action === 'authenticate') {
      throw new Error("Token de sessão não retornado");
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: action === 'test' ? "Conexão estabelecida com sucesso" : "Autenticado",
        token: bearerToken,
        expiresIn: 300 // 5 minutes
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in sankhya-auth:", error);
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
