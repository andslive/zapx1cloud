import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SearchBody {
  organization_id: string;
  product_id?: string | null;
  query?: string;
  filters?: {
    price_min?: number;
    price_max?: number;
    attribute_filters?: Record<string, any>;
    tags?: string[];
  };
  limit?: number;
}

/**
 * Expande filtros de preço quando o usuário menciona um valor exato.
 * Ex: cliente diz "13.5 milhões" → busca entre 11.5M e 15.5M (±15%).
 * Isso evita zero resultados quando o catálogo tem item próximo mas não exato.
 */
function expandPriceRange(
  filters: SearchBody["filters"]
): { price_min?: number; price_max?: number } {
  if (!filters) return {};
  let { price_min, price_max } = filters;

  // Se min e max são iguais (busca exata), expande ±15%
  if (
    price_min != null &&
    price_max != null &&
    Math.abs(price_min - price_max) < 0.01
  ) {
    const center = price_min;
    const spread = center * 0.15;
    price_min = center - spread;
    price_max = center + spread;
  } else if (price_min != null && price_max == null) {
    // Só min: aceita até 30% acima
    price_max = price_min * 1.3;
  } else if (price_max != null && price_min == null) {
    // Só max: aceita a partir de 30% abaixo
    price_min = price_max * 0.7;
  }

  return { price_min, price_max };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = (await req.json()) as SearchBody;
    if (!body.organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const limit = Math.min(Math.max(body.limit ?? 5, 1), 10);
    const expandedPrice = expandPriceRange(body.filters);

    // Chama a RPC inteligente que faz fulltext → fuzzy → fallback
    const { data, error } = await supabase.rpc("search_catalog_smart", {
      p_organization_id: body.organization_id,
      p_product_id: body.product_id ?? null,
      p_query: body.query?.trim() || null,
      p_price_min: expandedPrice.price_min ?? null,
      p_price_max: expandedPrice.price_max ?? null,
      p_tags: body.filters?.tags ?? null,
      p_attribute_filters: body.filters?.attribute_filters ?? null,
      p_limit: limit,
    });

    if (error) {
      console.error("[catalog-search] RPC error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items = (data ?? []).map((it: any) => {
      const videos = Array.isArray(it.videos) ? it.videos : [];
      const documents = Array.isArray(it.documents) ? it.documents : [];
      return {
        id: it.id,
        title: it.title,
        price: it.price,
        currency: it.currency,
        url: it.url,
        thumbnail_url: it.thumbnail_url,
        summary: it.description?.slice(0, 200) ?? null,
        key_attributes: it.attributes ?? {},
        tags: it.tags ?? [],
        image_count: Array.isArray(it.images) ? it.images.length : 0,
        video_count: videos.length,
        document_count: documents.length,
        has_video: videos.length > 0,
        has_document: documents.length > 0,
        document_names: documents.map((d: any) => d?.name).filter(Boolean),
        match_score: it.match_score,
        match_strategy: it.match_strategy, // 'fulltext' | 'fuzzy' | 'alternatives' | 'filter_only'
      };
    });

    // Detecta se o resultado é fallback de alternativas (para o agente comunicar honestamente)
    const isAlternativeMatch =
      items.length > 0 && items[0].match_strategy === "alternatives";
    const isFuzzyMatch =
      items.length > 0 && items[0].match_strategy === "fuzzy";

    return new Response(
      JSON.stringify({
        success: true,
        items,
        count: items.length,
        is_alternative_match: isAlternativeMatch,
        is_fuzzy_match: isFuzzyMatch,
        // Mensagem que o agente pode usar literalmente quando não achou exato
        agent_hint: isAlternativeMatch
          ? "Não encontrei exatamente o que o cliente pediu, mas tenho essas opções similares. Apresente como alternativas, sem dizer 'não tenho'."
          : isFuzzyMatch
          ? "Encontrei estas opções aproximadas (pode ter sido erro de digitação do cliente). Confirme se é o que ele queria."
          : null,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("[catalog-search] exception:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
