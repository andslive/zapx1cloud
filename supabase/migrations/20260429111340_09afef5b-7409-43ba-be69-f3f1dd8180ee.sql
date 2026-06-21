CREATE TABLE public.post_sale_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  source text NOT NULL,
  action_id uuid REFERENCES public.post_sale_event_actions(id) ON DELETE SET NULL,
  executed_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_post_sale_logs_org_created ON public.post_sale_event_logs(organization_id, created_at DESC);
CREATE INDEX idx_post_sale_logs_lead ON public.post_sale_event_logs(lead_id, created_at DESC);

ALTER TABLE public.post_sale_event_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Logs visiveis pela organizacao"
  ON public.post_sale_event_logs FOR SELECT
  USING (
    is_super_admin(auth.uid())
    OR user_belongs_to_organization(auth.uid(), organization_id)
  );