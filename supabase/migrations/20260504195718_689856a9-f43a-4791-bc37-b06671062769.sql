
ALTER TABLE public.cakto_orders
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'cakto',
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

ALTER TABLE public.cakto_orders
  DROP CONSTRAINT IF EXISTS cakto_orders_provider_check;
ALTER TABLE public.cakto_orders
  ADD CONSTRAINT cakto_orders_provider_check
  CHECK (provider IN ('cakto','doppus','hotmart','kiwify','manual'));

CREATE INDEX IF NOT EXISTS idx_cakto_orders_provider
  ON public.cakto_orders(organization_id, provider, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_cakto_orders_assigned_to
  ON public.cakto_orders(assigned_to);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cakto_orders'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.cakto_orders';
  END IF;
END$$;
