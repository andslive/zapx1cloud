import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SyncBody {
  organization_id: string;
  product_id?: string | null;
  base_url: string;
  item_pattern?: string; // ex: "/imovel/" — substring obrigatória na URL
  catalog_type?: string; // imoveis | produtos | veiculos | generico
  max_items?: number;
}

const CATALOG_SCHEMAS: Record<string, string> = {
  imoveis: "Imóveis: campos esperados — bairro, cidade, estado, quartos, banheiros, vagas, area_m2, tipo (apartamento/casa/comercial), suites.",
  veiculos: "Veículos: campos esperados — marca, modelo, ano, km, combustivel, cambio, cor, tipo.",
  produtos: "Produtos: campos esperados — categoria, marca, sku, estoque, variantes.",
  generico: "Genérico: extraia os atributos mais relevantes do produto/item.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let logId: string | null = null;

  try {
    const body = (await req.json()) as SyncBody;

    if (!body.organization_id || !body.base_url) {
      return new Response(JSON.stringify({ error: "organization_id and base_url required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    const aiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Firecrawl not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiKey) {
      return new Response(JSON.stringify({ error: "Lovable AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const catalogType = body.catalog_type || "generico";
    const maxItems = Math.min(body.max_items ?? 30, 50);

    // Identifica usuário se autenticado (pra registrar created_by)
    let userId: string | null = null;
    const auth = req.headers.get("Authorization");
    if (auth) {
      const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
      userId = user?.id ?? null;
    }

    // Cria log de sync
    const { data: logRow } = await supabase
      .from("catalog_sync_logs")
      .insert({
        organization_id: body.organization_id,
        product_id: body.product_id ?? null,
        source_type: "firecrawl",
        base_url: body.base_url,
        catalog_type: catalogType,
        status: "running",
        created_by: userId,
      })
      .select("id")
      .single();
    logId = logRow?.id ?? null;

    // 1. MAP — descobre URLs do site
    console.log("[catalog-sync] Mapping", body.base_url);
    const mapRes = await fetch("https://api.firecrawl.dev/v1/map", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: body.base_url, limit: 500, includeSubdomains: false }),
    });
    const mapData = await mapRes.json();
    if (!mapRes.ok) throw new Error(mapData.error || "Map failed");

    let urls: string[] = mapData.links || [];
    if (body.item_pattern) {
      const pat = body.item_pattern.toLowerCase();
      urls = urls.filter((u) => u.toLowerCase().includes(pat));
    }
    urls = urls.slice(0, maxItems);

    console.log(`[catalog-sync] Found ${urls.length} URLs to scrape`);

    let created = 0, updated = 0, failed = 0;

    // 2. Para cada URL: scrape + extract via IA
    for (const url of urls) {
      try {
        const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            formats: ["markdown"],
            onlyMainContent: true,
          }),
        });
        const scrapeData = await scrapeRes.json();
        if (!scrapeRes.ok) {
          console.error("[catalog-sync] scrape failed for", url);
          failed++;
          continue;
        }
        const markdown: string = scrapeData.data?.markdown || scrapeData.markdown || "";
        if (!markdown) { failed++; continue; }

        // Extract via Lovable AI (tool calling pra structured output)
        const extractRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${aiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content: `Você extrai dados estruturados de páginas web.
Tipo de catálogo: ${catalogType}.
${CATALOG_SCHEMAS[catalogType] || CATALOG_SCHEMAS.generico}
Sempre devolva preço como número (sem R$, sem pontos de milhar). Se não encontrar, retorne null.
images: array de URLs absolutas das fotos do item.`,
              },
              {
                role: "user",
                content: `URL: ${url}\n\nConteúdo:\n${markdown.slice(0, 8000)}`,
              },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "extract_item",
                  description: "Extrai dados de um item de catálogo",
                  parameters: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      price: { type: ["number", "null"] },
                      images: { type: "array", items: { type: "string" } },
                      attributes: { type: "object", additionalProperties: true },
                    },
                    required: ["title"],
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "extract_item" } },
          }),
        });

        if (!extractRes.ok) {
          if (extractRes.status === 402) {
            throw new Error("Lovable AI: créditos insuficientes");
          }
          failed++;
          continue;
        }

        const extractData = await extractRes.json();
        const tc = extractData.choices?.[0]?.message?.tool_calls?.[0];
        if (!tc) { failed++; continue; }
        const parsed = JSON.parse(tc.function.arguments);

        const externalId = `firecrawl:${url}`;
        const thumbnail = Array.isArray(parsed.images) && parsed.images.length > 0 ? parsed.images[0] : null;

        // Upsert por (org, product, external_id)
        const { data: existing } = await supabase
          .from("product_catalog_items")
          .select("id")
          .eq("organization_id", body.organization_id)
          .eq("external_id", externalId)
          .maybeSingle();

        const itemPayload = {
          organization_id: body.organization_id,
          product_id: body.product_id ?? null,
          external_id: externalId,
          title: parsed.title || "Sem título",
          description: parsed.description ?? null,
          price: parsed.price ?? null,
          currency: "BRL",
          url,
          thumbnail_url: thumbnail,
          images: Array.isArray(parsed.images) ? parsed.images : [],
          attributes: parsed.attributes ?? {},
          source_type: "firecrawl",
          source_url: url,
          last_synced_at: new Date().toISOString(),
        };

        if (existing) {
          await supabase.from("product_catalog_items").update(itemPayload).eq("id", existing.id);
          updated++;
        } else {
          await supabase.from("product_catalog_items").insert(itemPayload);
          created++;
        }
      } catch (e) {
        console.error("[catalog-sync] item error:", e);
        failed++;
      }
    }

    if (logId) {
      await supabase.from("catalog_sync_logs").update({
        status: "completed",
        items_found: urls.length,
        items_created: created,
        items_updated: updated,
        items_failed: failed,
        finished_at: new Date().toISOString(),
      }).eq("id", logId);
    }

    return new Response(JSON.stringify({
      success: true,
      items_found: urls.length,
      items_created: created,
      items_updated: updated,
      items_failed: failed,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[catalog-sync] exception:", err);
    if (logId) {
      await supabase.from("catalog_sync_logs").update({
        status: "failed",
        error_message: err.message,
        finished_at: new Date().toISOString(),
      }).eq("id", logId);
    }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
