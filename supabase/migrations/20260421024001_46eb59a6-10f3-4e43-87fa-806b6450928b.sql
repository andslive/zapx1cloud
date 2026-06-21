-- ============================================================
-- TABELA: product_catalog_items
-- ============================================================
CREATE TABLE public.product_catalog_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  external_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12,2),
  currency TEXT DEFAULT 'BRL',
  url TEXT,
  thumbnail_url TEXT,
  images TEXT[] DEFAULT '{}',
  attributes JSONB DEFAULT '{}'::jsonb,
  tags TEXT[] DEFAULT '{}',
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  search_vector tsvector,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_catalog_items_source_type_check CHECK (source_type IN ('manual','firecrawl','webhook','api','csv'))
);

-- Dedup por external_id dentro do escopo organization+product
CREATE UNIQUE INDEX product_catalog_items_org_external_unique
  ON public.product_catalog_items (organization_id, COALESCE(product_id, '00000000-0000-0000-0000-000000000000'::uuid), external_id)
  WHERE external_id IS NOT NULL;

-- Índices de busca
CREATE INDEX product_catalog_items_search_idx ON public.product_catalog_items USING GIN (search_vector);
CREATE INDEX product_catalog_items_attributes_idx ON public.product_catalog_items USING GIN (attributes);
CREATE INDEX product_catalog_items_tags_idx ON public.product_catalog_items USING GIN (tags);
CREATE INDEX product_catalog_items_org_product_active_price_idx 
  ON public.product_catalog_items (organization_id, product_id, is_active, price);

-- Trigger pra manter search_vector atualizado (português)
CREATE OR REPLACE FUNCTION public.update_catalog_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  attr_text TEXT := '';
BEGIN
  -- Concatena valores escalares do JSONB attributes para indexar
  IF NEW.attributes IS NOT NULL THEN
    SELECT string_agg(value::text, ' ')
    INTO attr_text
    FROM jsonb_each_text(NEW.attributes);
  END IF;

  NEW.search_vector :=
    setweight(to_tsvector('portuguese', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('portuguese', COALESCE(array_to_string(NEW.tags, ' '), '')), 'B') ||
    setweight(to_tsvector('portuguese', COALESCE(attr_text, '')), 'B') ||
    setweight(to_tsvector('portuguese', COALESCE(NEW.description, '')), 'C');

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_catalog_items_search_vector_trigger
  BEFORE INSERT OR UPDATE ON public.product_catalog_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_catalog_search_vector();

-- RLS
ALTER TABLE public.product_catalog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view catalog items"
  ON public.product_catalog_items
  FOR SELECT
  USING (public.user_belongs_to_organization(auth.uid(), organization_id) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Admins can insert catalog items"
  ON public.product_catalog_items
  FOR INSERT
  WITH CHECK (
    (public.user_belongs_to_organization(auth.uid(), organization_id) AND public.has_role(auth.uid(), 'admin'))
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Admins can update catalog items"
  ON public.product_catalog_items
  FOR UPDATE
  USING (
    (public.user_belongs_to_organization(auth.uid(), organization_id) AND public.has_role(auth.uid(), 'admin'))
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Admins can delete catalog items"
  ON public.product_catalog_items
  FOR DELETE
  USING (
    (public.user_belongs_to_organization(auth.uid(), organization_id) AND public.has_role(auth.uid(), 'admin'))
    OR public.is_super_admin(auth.uid())
  );

-- ============================================================
-- TABELA: catalog_sync_logs
-- ============================================================
CREATE TABLE public.catalog_sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL DEFAULT 'firecrawl',
  base_url TEXT,
  catalog_type TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  items_found INTEGER DEFAULT 0,
  items_created INTEGER DEFAULT 0,
  items_updated INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT catalog_sync_logs_status_check CHECK (status IN ('running','completed','failed','cancelled'))
);

CREATE INDEX catalog_sync_logs_org_product_idx ON public.catalog_sync_logs (organization_id, product_id, started_at DESC);

ALTER TABLE public.catalog_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view sync logs"
  ON public.catalog_sync_logs
  FOR SELECT
  USING (public.user_belongs_to_organization(auth.uid(), organization_id) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Admins can manage sync logs"
  ON public.catalog_sync_logs
  FOR ALL
  USING (
    (public.user_belongs_to_organization(auth.uid(), organization_id) AND public.has_role(auth.uid(), 'admin'))
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    (public.user_belongs_to_organization(auth.uid(), organization_id) AND public.has_role(auth.uid(), 'admin'))
    OR public.is_super_admin(auth.uid())
  );