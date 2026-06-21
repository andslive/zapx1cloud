-- 1) Habilitar pg_trgm para busca fuzzy
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2) Configuração de debounce por organização
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ai_debounce_ms integer NOT NULL DEFAULT 5000;

COMMENT ON COLUMN public.organizations.ai_debounce_ms IS
  'Tempo (ms) que o agente espera após cada mensagem do cliente antes de responder. Permite agrupar mensagens consecutivas em uma única resposta. Recomendado: 3000-10000.';

-- 3) Memória de agendamento na conversa
ALTER TABLE public.webchat_conversations
  ADD COLUMN IF NOT EXISTS meeting_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS meeting_event_id text,
  ADD COLUMN IF NOT EXISTS meeting_metadata jsonb;

COMMENT ON COLUMN public.webchat_conversations.meeting_scheduled_at IS
  'Timestamp do agendamento confirmado nesta conversa (se houver). Usado pelo agente para não propor novos horários após confirmação.';

-- 4) Índice trigram para busca fuzzy no catálogo
CREATE INDEX IF NOT EXISTS product_catalog_items_title_trgm_idx
  ON public.product_catalog_items
  USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS product_catalog_items_description_trgm_idx
  ON public.product_catalog_items
  USING gin (description gin_trgm_ops);

-- 5) Função RPC de busca inteligente em 3 camadas
CREATE OR REPLACE FUNCTION public.search_catalog_smart(
  p_organization_id uuid,
  p_product_id uuid DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_price_min numeric DEFAULT NULL,
  p_price_max numeric DEFAULT NULL,
  p_tags text[] DEFAULT NULL,
  p_attribute_filters jsonb DEFAULT NULL,
  p_limit integer DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  price numeric,
  currency text,
  url text,
  thumbnail_url text,
  images jsonb,
  videos jsonb,
  documents jsonb,
  attributes jsonb,
  tags text[],
  match_score real,
  match_strategy text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := GREATEST(LEAST(COALESCE(p_limit, 5), 20), 1);
  v_query_clean text := NULLIF(TRIM(COALESCE(p_query, '')), '');
  v_results_count integer;
BEGIN
  -- Camada 1: Full-text search (mais preciso) com filtros
  IF v_query_clean IS NOT NULL THEN
    RETURN QUERY
    SELECT
      pci.id, pci.title, pci.description, pci.price, pci.currency,
      pci.url, pci.thumbnail_url, pci.images, pci.videos, pci.documents,
      pci.attributes, pci.tags,
      ts_rank(pci.search_vector, websearch_to_tsquery('portuguese', v_query_clean))::real AS match_score,
      'fulltext'::text AS match_strategy
    FROM public.product_catalog_items pci
    WHERE pci.organization_id = p_organization_id
      AND pci.is_active = true
      AND (p_product_id IS NULL OR pci.product_id = p_product_id)
      AND (p_price_min IS NULL OR pci.price >= p_price_min)
      AND (p_price_max IS NULL OR pci.price <= p_price_max)
      AND (p_tags IS NULL OR pci.tags && p_tags)
      AND (p_attribute_filters IS NULL OR pci.attributes @> p_attribute_filters)
      AND pci.search_vector @@ websearch_to_tsquery('portuguese', v_query_clean)
    ORDER BY match_score DESC
    LIMIT v_limit;

    GET DIAGNOSTICS v_results_count = ROW_COUNT;
    IF v_results_count > 0 THEN RETURN; END IF;

    -- Camada 2: Trigram fuzzy (tolera erros de digitação)
    RETURN QUERY
    SELECT
      pci.id, pci.title, pci.description, pci.price, pci.currency,
      pci.url, pci.thumbnail_url, pci.images, pci.videos, pci.documents,
      pci.attributes, pci.tags,
      GREATEST(
        similarity(COALESCE(pci.title, ''), v_query_clean),
        similarity(COALESCE(pci.description, ''), v_query_clean) * 0.7
      )::real AS match_score,
      'fuzzy'::text AS match_strategy
    FROM public.product_catalog_items pci
    WHERE pci.organization_id = p_organization_id
      AND pci.is_active = true
      AND (p_product_id IS NULL OR pci.product_id = p_product_id)
      AND (p_price_min IS NULL OR pci.price >= p_price_min)
      AND (p_price_max IS NULL OR pci.price <= p_price_max)
      AND (p_tags IS NULL OR pci.tags && p_tags)
      AND (p_attribute_filters IS NULL OR pci.attributes @> p_attribute_filters)
      AND (
        COALESCE(pci.title, '') % v_query_clean
        OR COALESCE(pci.description, '') % v_query_clean
        OR COALESCE(pci.title, '') ILIKE '%' || v_query_clean || '%'
      )
    ORDER BY match_score DESC
    LIMIT v_limit;

    GET DIAGNOSTICS v_results_count = ROW_COUNT;
    IF v_results_count > 0 THEN RETURN; END IF;

    -- Camada 3: Fallback — alternativas próximas ignorando query (mantém só filtros estruturais)
    RETURN QUERY
    SELECT
      pci.id, pci.title, pci.description, pci.price, pci.currency,
      pci.url, pci.thumbnail_url, pci.images, pci.videos, pci.documents,
      pci.attributes, pci.tags,
      0.1::real AS match_score,
      'alternatives'::text AS match_strategy
    FROM public.product_catalog_items pci
    WHERE pci.organization_id = p_organization_id
      AND pci.is_active = true
      AND (p_product_id IS NULL OR pci.product_id = p_product_id)
      AND (p_price_min IS NULL OR pci.price >= p_price_min)
      AND (p_price_max IS NULL OR pci.price <= p_price_max)
    ORDER BY pci.created_at DESC
    LIMIT v_limit;
  ELSE
    -- Sem query: apenas filtros
    RETURN QUERY
    SELECT
      pci.id, pci.title, pci.description, pci.price, pci.currency,
      pci.url, pci.thumbnail_url, pci.images, pci.videos, pci.documents,
      pci.attributes, pci.tags,
      1.0::real AS match_score,
      'filter_only'::text AS match_strategy
    FROM public.product_catalog_items pci
    WHERE pci.organization_id = p_organization_id
      AND pci.is_active = true
      AND (p_product_id IS NULL OR pci.product_id = p_product_id)
      AND (p_price_min IS NULL OR pci.price >= p_price_min)
      AND (p_price_max IS NULL OR pci.price <= p_price_max)
      AND (p_tags IS NULL OR pci.tags && p_tags)
      AND (p_attribute_filters IS NULL OR pci.attributes @> p_attribute_filters)
    ORDER BY pci.created_at DESC
    LIMIT v_limit;
  END IF;
END;
$function$;