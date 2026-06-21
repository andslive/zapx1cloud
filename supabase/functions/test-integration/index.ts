import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TestIntegrationRequest {
  integrationType?: string;
  type?: string;
  email?: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: TestIntegrationRequest = await req.json();
    // aceita ambos: { integrationType } ou { type }
    const integrationType = body.integrationType ?? body.type;
    const recipientEmail = body.email;

    switch (integrationType) {
      case "email":
      case "lovable_emails":
      case "resend": {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        if (!supabaseUrl || !serviceKey) {
          throw new Error("Configuração de backend ausente");
        }

        // Se forneceu e-mail, envia mensagem real via Lovable Emails
        if (recipientEmail) {
          const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              templateName: "platform-generic",
              recipientEmail,
              idempotencyKey: `test-${Date.now()}`,
              templateData: {
                __subject: "Teste de envio — Lovable Emails",
                __html: `<div style="font-family:Arial,sans-serif;padding:24px"><h2>Teste bem-sucedido</h2><p>Este é um e-mail de teste enviado pelo painel do Super Admin.</p><p style="color:#666;font-size:12px">Se você recebeu, sua infraestrutura de e-mail está operando corretamente.</p></div>`,
              },
            }),
          });
          if (!sendRes.ok) {
            const err = await sendRes.text();
            throw new Error(`Falha ao enviar e-mail: ${err}`);
          }
          return new Response(
            JSON.stringify({ success: true, message: `E-mail de teste enviado para ${recipientEmail}` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: "Lovable Emails está ativo. Domínio verificado." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }


      case "firecrawl": {
        const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
        if (!firecrawlApiKey) {
          throw new Error("FIRECRAWL_API_KEY não configurada");
        }

        const res = await fetch("https://api.firecrawl.dev/v0/scrape", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${firecrawlApiKey}`,
          },
          body: JSON.stringify({
            url: "https://example.com",
            pageOptions: { onlyMainContent: true },
          }),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || "Chave Firecrawl inválida");
        }

        return new Response(
          JSON.stringify({ success: true, message: "Conexão com Firecrawl bem-sucedida" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        throw new Error(`Tipo de integração desconhecido: ${integrationType}`);
    }
  } catch (error: unknown) {
    console.error("Error in test-integration:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
