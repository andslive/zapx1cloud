// Sprint 2 — Pipeline de embeddings para memória semântica por lead
// Recebe um conteúdo + contexto, gera embedding via Lovable AI Gateway
// e persiste em lead_semantic_memory.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EmbedPayload {
  lead_id: string;
  organization_id: string;
  content: string;
  source?: "message" | "note" | "stage_change" | "deal" | "custom";
  role?: "user" | "assistant" | "system" | "internal";
  conversation_id?: string;
  message_id?: string;
  importance_score?: number;
  metadata?: Record<string, unknown>;
}

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  // Lovable AI Gateway suporta endpoint de embeddings compatível com OpenAI
  const resp = await fetch(
    "https://ai.gateway.lovable.dev/v1/embeddings",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/text-embedding-3-small",
        input: text.slice(0, 8000),
      }),
    },
  );

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Embedding error ${resp.status}: ${t}`);
  }

  const json = await resp.json();
  const vec = json?.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new Error("Invalid embedding response");
  return vec;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = (await req.json()) as
      | EmbedPayload
      | { items: EmbedPayload[] };

    const items: EmbedPayload[] = "items" in body ? body.items : [body];

    const results: Array<{ id?: string; error?: string }> = [];

    for (const item of items) {
      try {
        if (!item.lead_id || !item.organization_id || !item.content?.trim()) {
          results.push({ error: "missing required fields" });
          continue;
        }

        const embedding = await generateEmbedding(item.content);

        const { data, error } = await supabase
          .from("lead_semantic_memory")
          .insert({
            lead_id: item.lead_id,
            organization_id: item.organization_id,
            conversation_id: item.conversation_id ?? null,
            message_id: item.message_id ?? null,
            source: item.source ?? "message",
            role: item.role ?? null,
            content: item.content,
            embedding: embedding as unknown as string,
            importance_score: item.importance_score ?? 0.5,
            metadata: item.metadata ?? {},
          })
          .select("id")
          .single();

        if (error) {
          results.push({ error: error.message });
        } else {
          results.push({ id: data.id });
        }
      } catch (e) {
        results.push({ error: e instanceof Error ? e.message : String(e) });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("memory-embedder error", e);
    return new Response(
      JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : "unknown",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
