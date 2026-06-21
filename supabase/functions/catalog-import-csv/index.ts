import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ImportBody {
  organization_id: string;
  product_id?: string | null;
  // Array de itens já parseados no frontend (CSV/XLSX)
  items: Array<{
    title: string;
    description?: string;
    price?: number | null;
    url?: string;
    thumbnail_url?: string;
    images?: string[];
    tags?: string[];
    attributes?: Record<string, any>;
    external_id?: string;
  }>;
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

    const body = (await req.json()) as ImportBody;
    if (!body.organization_id || !Array.isArray(body.items) || body.items.length === 0) {
      return new Response(JSON.stringify({ error: "organization_id and items required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = body.items.slice(0, 1000).map((it) => ({
      organization_id: body.organization_id,
      product_id: body.product_id ?? null,
      title: it.title,
      description: it.description ?? null,
      price: it.price ?? null,
      currency: "BRL",
      url: it.url ?? null,
      thumbnail_url: it.thumbnail_url ?? null,
      images: it.images ?? [],
      tags: it.tags ?? [],
      attributes: it.attributes ?? {},
      external_id: it.external_id ?? null,
      source_type: "csv",
    }));

    const { data, error } = await supabase
      .from("product_catalog_items")
      .insert(rows)
      .select("id");

    if (error) {
      console.error("[catalog-import-csv] error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, inserted: data?.length ?? 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[catalog-import-csv] exception:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
