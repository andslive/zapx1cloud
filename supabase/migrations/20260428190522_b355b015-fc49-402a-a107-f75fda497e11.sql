
-- ============================================================
-- HOTMART INTEGRATION
-- ============================================================

-- 1. Credenciais por organização
CREATE TABLE public.hotmart_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id TEXT,
  client_secret TEXT,
  basic_token TEXT,
  hottok TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hotmart_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage hotmart credentials of their org"
ON public.hotmart_credentials
FOR ALL
TO authenticated
USING (
  organization_id = public.get_user_organization(auth.uid())
  AND public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  organization_id = public.get_user_organization(auth.uid())
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Super admins manage all hotmart credentials"
ON public.hotmart_credentials
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_hotmart_credentials_updated_at
BEFORE UPDATE ON public.hotmart_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Pedidos vindos da Hotmart
CREATE TABLE public.hotmart_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  hotmart_product_id TEXT,
  hotmart_product_name TEXT,
  hotmart_offer_code TEXT,
  buyer_email TEXT,
  buyer_name TEXT,
  buyer_phone TEXT,
  buyer_doc TEXT,
  amount NUMERIC(12,2),
  currency TEXT DEFAULT 'BRL',
  status TEXT NOT NULL,
  event_type TEXT,
  payment_method TEXT,
  installments INTEGER,
  affiliate_email TEXT,
  commission_amount NUMERIC(12,2),
  subscription_code TEXT,
  raw_payload JSONB,
  created_at_hotmart TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, transaction_id, event_type)
);

CREATE INDEX idx_hotmart_orders_org ON public.hotmart_orders(organization_id);
CREATE INDEX idx_hotmart_orders_status ON public.hotmart_orders(organization_id, status);
CREATE INDEX idx_hotmart_orders_buyer_email ON public.hotmart_orders(organization_id, buyer_email);
CREATE INDEX idx_hotmart_orders_product ON public.hotmart_orders(product_id);
CREATE INDEX idx_hotmart_orders_created ON public.hotmart_orders(created_at_hotmart DESC);

ALTER TABLE public.hotmart_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view hotmart orders"
ON public.hotmart_orders
FOR SELECT
TO authenticated
USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Admins manage hotmart orders"
ON public.hotmart_orders
FOR ALL
TO authenticated
USING (
  organization_id = public.get_user_organization(auth.uid())
  AND public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  organization_id = public.get_user_organization(auth.uid())
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Super admins manage all hotmart orders"
ON public.hotmart_orders
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_hotmart_orders_updated_at
BEFORE UPDATE ON public.hotmart_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Mapeamento de produto Hotmart → produto interno
CREATE TABLE public.hotmart_product_mapping (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  hotmart_product_id TEXT NOT NULL,
  hotmart_product_name TEXT,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, hotmart_product_id)
);

ALTER TABLE public.hotmart_product_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view hotmart product mapping"
ON public.hotmart_product_mapping
FOR SELECT
TO authenticated
USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Admins manage hotmart product mapping"
ON public.hotmart_product_mapping
FOR ALL
TO authenticated
USING (
  organization_id = public.get_user_organization(auth.uid())
  AND public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  organization_id = public.get_user_organization(auth.uid())
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Super admins manage all hotmart product mapping"
ON public.hotmart_product_mapping
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_hotmart_product_mapping_updated_at
BEFORE UPDATE ON public.hotmart_product_mapping
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
