// Sprint 2 — Retrieval semântico
// Recebe lead_id + query, gera embedding e retorna top-K memórias relevantes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

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

    const {
      lead_id,
      query,
      match_count = 8,
      min_similarity = 0.5,
    } = await req.json();

    if (!lead_id || !query) {
      return new Response(
        JSON.stringify({ error: "lead_id and query required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const embedding = await generateEmbedding(query);

    const { data, error } = await supabase.rpc("search_lead_memory", {
      p_lead_id: lead_id,
      p_query_embedding: embedding as unknown as string,
      p_match_count: match_count,
      p_min_similarity: min_similarity,
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({ ok: true, memories: data ?? [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("memory-search error", e);
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
