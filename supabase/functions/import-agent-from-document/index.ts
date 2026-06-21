// Importa um agente a partir de um documento (PDF / DOCX / TXT / Markdown).
// Extrai o texto do arquivo e usa Lovable AI Gateway para estruturar nos campos do agente.
//
// Body: { filename: string, mime_type: string, file_base64: string, agent_type?: string }
// Resp: { agent: GeneratedAgent }
//
// Obs.: O caso JSON é tratado 100% no client (validação + insert direto).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unzipSync, strFromU8 } from "https://esm.sh/fflate@0.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^,]+,/, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function extractDocxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const xmlBytes = files["word/document.xml"];
  if (!xmlBytes) return "";
  const xml = strFromU8(xmlBytes);
  // Remove tags, junta com quebras nos parágrafos
  const withBreaks = xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<[^>]+>/g, "");
  return withBreaks.replace(/\s+\n/g, "\n").trim();
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  try {
    // unpdf é puro JS, sem deps nativas → roda em Deno/edge
    const { extractText, getDocumentProxy } = await import("https://esm.sh/unpdf@0.12.1");
    const doc = await getDocumentProxy(bytes);
    const { text } = await extractText(doc, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : String(text || "");
  } catch (err) {
    console.error("[import-agent-from-document] PDF parse error", err);
    throw new Error("Não foi possível extrair texto do PDF.");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { filename, mime_type, file_base64, agent_type } = body as {
      filename?: string;
      mime_type?: string;
      file_base64?: string;
      agent_type?: string;
    };

    if (!file_base64 || !filename) {
      return new Response(JSON.stringify({ error: "Arquivo ausente" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bytes = base64ToBytes(file_base64);
    if (bytes.byteLength > MAX_BYTES) {
      return new Response(JSON.stringify({ error: "Arquivo acima de 5 MB" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lower = filename.toLowerCase();
    let extracted = "";

    if (lower.endsWith(".txt") || lower.endsWith(".md") || (mime_type || "").startsWith("text/")) {
      extracted = new TextDecoder().decode(bytes);
    } else if (lower.endsWith(".docx") || mime_type?.includes("officedocument.wordprocessingml")) {
      extracted = extractDocxText(bytes);
    } else if (lower.endsWith(".pdf") || mime_type === "application/pdf") {
      extracted = await extractPdfText(bytes);
    } else {
      return new Response(
        JSON.stringify({ error: "Formato não suportado. Use PDF, DOCX, TXT ou Markdown." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    extracted = extracted.replace(/\n{3,}/g, "\n\n").trim();
    if (!extracted || extracted.length < 30) {
      return new Response(
        JSON.stringify({ error: "Não foi possível extrair conteúdo legível do arquivo." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (extracted.length > 20000) extracted = extracted.slice(0, 20000);

    const systemPrompt = `Você é especialista em projetar agentes de IA conversacionais para vendas e atendimento.
A partir do briefing/documento abaixo, extraia uma configuração completa de agente.

REGRAS:
- Identifique tom, missão, capacidades, restrições e gatilhos de transferência diretamente do texto.
- Se o texto não menciona um campo, infira algo razoável e profissional, sem clichês.
- Mensagens devem seguir SPIN Selling: profissional, objetivo, no máximo 2 linhas por bloco.
- Nunca use emojis em prompts.
- additional_prompt deve consolidar TUDO que o documento diz sobre comportamento, em 3-6 parágrafos.`;

    const userInstruction = `TIPO DE AGENTE SUGERIDO: ${agent_type || "custom"}

DOCUMENTO/BRIEFING:
"""
${extracted}
"""

Crie a configuração completa do agente baseada nisso.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userInstruction },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_agent",
              description: "Configuração completa de um agente de IA",
              parameters: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  primary_objective: { type: "string" },
                  additional_prompt: { type: "string" },
                  can_do: { type: "array", items: { type: "string" } },
                  cannot_do: { type: "array", items: { type: "string" } },
                  handoff_triggers: { type: "array", items: { type: "string" } },
                  end_conversation_triggers: { type: "array", items: { type: "string" } },
                  tone_style: { type: "string", enum: ["formal", "consultive", "friendly", "technical"] },
                  message_style: { type: "string", enum: ["short", "balanced", "detailed"] },
                  required_phrases: { type: "array", items: { type: "string" } },
                  prohibited_phrases: { type: "array", items: { type: "string" } },
                },
                required: [
                  "name", "description", "primary_objective", "additional_prompt",
                  "can_do", "cannot_do", "handoff_triggers", "tone_style", "message_style",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_agent" } },
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("AI gateway error", aiResp.status, txt);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de uso de IA atingido. Tente novamente em alguns minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos para continuar." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("Erro no gateway de IA");
    }

    const data = await aiResp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("IA não retornou estrutura válida");
    const agent = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ agent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[import-agent-from-document] error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
