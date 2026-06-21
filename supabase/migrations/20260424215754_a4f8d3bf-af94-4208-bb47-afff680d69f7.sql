-- 1. product_suites
CREATE TABLE public.product_suites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  slug text,
  description text,
  icon_url text,
  color text DEFAULT '#10B981',
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_suites_org ON public.product_suites(organization_id);

ALTER TABLE public.product_suites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view suites"
  ON public.product_suites FOR SELECT
  USING (public.user_belongs_to_organization(auth.uid(), organization_id));

CREATE POLICY "Org members can insert suites"
  ON public.product_suites FOR INSERT
  WITH CHECK (public.user_belongs_to_organization(auth.uid(), organization_id));

CREATE POLICY "Org members can update suites"
  ON public.product_suites FOR UPDATE
  USING (public.user_belongs_to_organization(auth.uid(), organization_id));

CREATE POLICY "Org members can delete suites"
  ON public.product_suites FOR DELETE
  USING (public.user_belongs_to_organization(auth.uid(), organization_id));

CREATE TRIGGER trg_product_suites_updated
  BEFORE UPDATE ON public.product_suites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. products.suite_id
ALTER TABLE public.products
  ADD COLUMN suite_id uuid REFERENCES public.product_suites(id) ON DELETE SET NULL;

CREATE INDEX idx_products_suite ON public.products(suite_id);

-- 3. product_offers
CREATE TABLE public.product_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'main',
  cakto_product_id text,
  external_source text DEFAULT 'cakto',
  price numeric(12,2),
  currency text DEFAULT 'BRL',
  position integer DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_offers_role_check CHECK (role IN ('main','front_end','order_bump','upsell','downsell','cross_sell'))
);

CREATE INDEX idx_product_offers_org ON public.product_offers(organization_id);
CREATE INDEX idx_product_offers_product ON public.product_offers(product_id);
CREATE UNIQUE INDEX uq_product_offers_cakto_per_org
  ON public.product_offers(organization_id, cakto_product_id)
  WHERE cakto_product_id IS NOT NULL;

ALTER TABLE public.product_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view offers"
  ON public.product_offers FOR SELECT
  USING (public.user_belongs_to_organization(auth.uid(), organization_id));

CREATE POLICY "Org members can insert offers"
  ON public.product_offers FOR INSERT
  WITH CHECK (public.user_belongs_to_organization(auth.uid(), organization_id));

CREATE POLICY "Org members can update offers"
  ON public.product_offers FOR UPDATE
  USING (public.user_belongs_to_organization(auth.uid(), organization_id));

CREATE POLICY "Org members can delete offers"
  ON public.product_offers FOR DELETE
  USING (public.user_belongs_to_organization(auth.uid(), organization_id));

CREATE TRIGGER trg_product_offers_updated
  BEFORE UPDATE ON public.product_offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. cakto_orders.product_id + offer_id
ALTER TABLE public.cakto_orders
  ADD COLUMN product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN offer_id uuid REFERENCES public.product_offers(id) ON DELETE SET NULL;

CREATE INDEX idx_cakto_orders_product ON public.cakto_orders(product_id);
CREATE INDEX idx_cakto_orders_offer ON public.cakto_orders(offer_id);

-- 5. Backfill: cria offers órfãs para cada product_cakto_id já visto
INSERT INTO public.product_offers (organization_id, name, role, cakto_product_id, external_source, is_active)
SELECT DISTINCT
  o.organization_id,
  COALESCE(o.product_name, o.product_cakto_id) AS name,
  'main' AS role,
  o.product_cakto_id,
  'cakto',
  true
FROM public.cakto_orders o
WHERE o.product_cakto_id IS NOT NULL
  AND o.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.product_offers po
    WHERE po.organization_id = o.organization_id
      AND po.cakto_product_id = o.product_cakto_id
  );

-- 6. Vincula pedidos existentes às offers recém-criadas
UPDATE public.cakto_orders co
SET offer_id = po.id,
    product_id = po.product_id
FROM public.product_offers po
WHERE co.organization_id = po.organization_id
  AND co.product_cakto_id = po.cakto_product_id
  AND co.offer_id IS NULL;

-- 7. RPC de performance agregada por produto
CREATE OR REPLACE FUNCTION public.get_product_performance(
  p_org_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH filtered AS (
    SELECT co.*
    FROM cakto_orders co
    WHERE co.organization_id = p_org_id
      AND (p_from IS NULL OR co.created_at_cakto >= p_from)
      AND (p_to IS NULL OR co.created_at_cakto <= p_to)
  ),
  by_product AS (
    SELECT
      f.product_id,
      p.name AS product_name,
      p.suite_id,
      COUNT(*) FILTER (WHERE f.status = 'paid') AS paid_count,
      COUNT(*) FILTER (WHERE f.status IN ('pending','waiting_payment')) AS pending_count,
      COUNT(*) FILTER (WHERE f.status = 'refunded') AS refunded_count,
      COALESCE(SUM(f.amount) FILTER (WHERE f.status = 'paid'), 0) AS revenue,
      COALESCE(AVG(f.amount) FILTER (WHERE f.status = 'paid'), 0) AS avg_ticket
    FROM filtered f
    LEFT JOIN products p ON p.id = f.product_id
    GROUP BY f.product_id, p.name, p.suite_id
  ),
  by_role AS (
    SELECT
      f.product_id,
      COALESCE(po.role, 'unmapped') AS role,
      COUNT(*) FILTER (WHERE f.status = 'paid') AS paid_count,
      COALESCE(SUM(f.amount) FILTER (WHERE f.status = 'paid'), 0) AS revenue
    FROM filtered f
    LEFT JOIN product_offers po ON po.id = f.offer_id
    GROUP BY f.product_id, COALESCE(po.role, 'unmapped')
  )
  SELECT jsonb_build_object(
    'products', COALESCE(jsonb_agg(
      jsonb_build_object(
        'product_id', bp.product_id,
        'product_name', bp.product_name,
        'suite_id', bp.suite_id,
        'paid_count', bp.paid_count,
        'pending_count', bp.pending_count,
        'refunded_count', bp.refunded_count,
        'revenue', bp.revenue,
        'avg_ticket', bp.avg_ticket,
        'roles', (
          SELECT jsonb_agg(jsonb_build_object('role', br.role, 'paid_count', br.paid_count, 'revenue', br.revenue))
          FROM by_role br WHERE br.product_id IS NOT DISTINCT FROM bp.product_id
        )
      )
    ), '[]'::jsonb),
    'totals', (
      SELECT jsonb_build_object(
        'revenue', COALESCE(SUM(amount) FILTER (WHERE status='paid'),0),
        'paid_count', COUNT(*) FILTER (WHERE status='paid'),
        'pending_count', COUNT(*) FILTER (WHERE status IN ('pending','waiting_payment')),
        'refunded_count', COUNT(*) FILTER (WHERE status='refunded'),
        'avg_ticket', COALESCE(AVG(amount) FILTER (WHERE status='paid'),0)
      )
      FROM filtered
    )
  ) INTO v_result
  FROM by_product bp;

  RETURN v_result;
END;
$$;