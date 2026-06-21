
-- 1. cakto_credentials
CREATE TABLE public.cakto_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('platform','organization')),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['read','orders','products']::text[],
  webhook_secret TEXT,
  last_token TEXT,
  token_expires_at TIMESTAMPTZ,
  connection_status TEXT NOT NULL DEFAULT 'disconnected',
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cakto_creds_org_required CHECK (
    (scope = 'platform' AND organization_id IS NULL) OR
    (scope = 'organization' AND organization_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX cakto_credentials_platform_unique ON public.cakto_credentials (scope) WHERE scope = 'platform';
CREATE UNIQUE INDEX cakto_credentials_org_unique ON public.cakto_credentials (organization_id) WHERE scope = 'organization';

ALTER TABLE public.cakto_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage platform cakto credentials"
  ON public.cakto_credentials FOR ALL
  USING (
    scope = 'platform' AND public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    scope = 'platform' AND public.is_super_admin(auth.uid())
  );

CREATE POLICY "Org admins view their cakto credentials"
  ON public.cakto_credentials FOR SELECT
  USING (
    scope = 'organization' AND organization_id = public.get_user_organization(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.is_super_admin(auth.uid()))
  );

CREATE POLICY "Org admins manage their cakto credentials"
  ON public.cakto_credentials FOR ALL
  USING (
    scope = 'organization' AND organization_id = public.get_user_organization(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  )
  WITH CHECK (
    scope = 'organization' AND organization_id = public.get_user_organization(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  );

CREATE TRIGGER cakto_credentials_updated_at
  BEFORE UPDATE ON public.cakto_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. cakto_orders
CREATE TABLE public.cakto_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('platform','organization')),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  cakto_id TEXT NOT NULL,
  cakto_ref_id TEXT,
  status TEXT NOT NULL,
  type TEXT,
  offer_type TEXT,
  payment_method TEXT,
  base_amount NUMERIC(12,2),
  discount NUMERIC(12,2),
  amount NUMERIC(12,2),
  coupon_code TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_document TEXT,
  product_cakto_id TEXT,
  product_name TEXT,
  product_image TEXT,
  paid_at TIMESTAMPTZ,
  created_at_cakto TIMESTAMPTZ,
  raw_payload JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cakto_orders_unique_per_scope
  ON public.cakto_orders (scope, COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), cakto_id);

CREATE INDEX cakto_orders_lookup_idx
  ON public.cakto_orders (scope, organization_id, status, paid_at DESC);

ALTER TABLE public.cakto_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins view platform cakto orders"
  ON public.cakto_orders FOR SELECT
  USING (scope = 'platform' AND public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins manage platform cakto orders"
  ON public.cakto_orders FOR ALL
  USING (scope = 'platform' AND public.is_super_admin(auth.uid()))
  WITH CHECK (scope = 'platform' AND public.is_super_admin(auth.uid()));

CREATE POLICY "Org members view their cakto orders"
  ON public.cakto_orders FOR SELECT
  USING (
    scope = 'organization'
    AND organization_id = public.get_user_organization(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.is_super_admin(auth.uid()))
  );

CREATE POLICY "Org admins manage their cakto orders"
  ON public.cakto_orders FOR ALL
  USING (
    scope = 'organization'
    AND organization_id = public.get_user_organization(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  )
  WITH CHECK (
    scope = 'organization'
    AND organization_id = public.get_user_organization(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  );

CREATE TRIGGER cakto_orders_updated_at
  BEFORE UPDATE ON public.cakto_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. organizations.cakto_subscription_id
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS cakto_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS cakto_customer_email TEXT;

-- 4. platform_plans cakto mapping
ALTER TABLE public.platform_plans
  ADD COLUMN IF NOT EXISTS cakto_product_id TEXT,
  ADD COLUMN IF NOT EXISTS checkout_url_cakto TEXT;
