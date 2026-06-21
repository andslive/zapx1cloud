ALTER TABLE public.post_sale_event_actions
  ADD COLUMN IF NOT EXISTS delay_minutes integer NOT NULL DEFAULT 0;

ALTER TABLE public.post_sale_event_actions
  DROP CONSTRAINT IF EXISTS post_sale_actions_delay_minutes_check;
ALTER TABLE public.post_sale_event_actions
  ADD CONSTRAINT post_sale_actions_delay_minutes_check
  CHECK (delay_minutes >= 0 AND delay_minutes <= 10080);

CREATE TABLE IF NOT EXISTS public.post_sale_scheduled_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid,
  action_id uuid NOT NULL REFERENCES public.post_sale_event_actions(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  event_type text NOT NULL,
  source text NOT NULL DEFAULT 'webhook',
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.post_sale_scheduled_runs
  DROP CONSTRAINT IF EXISTS post_sale_scheduled_runs_status_check;
ALTER TABLE public.post_sale_scheduled_runs
  ADD CONSTRAINT post_sale_scheduled_runs_status_check
  CHECK (status IN ('pending','running','done','failed','canceled'));

CREATE INDEX IF NOT EXISTS idx_post_sale_scheduled_runs_due
  ON public.post_sale_scheduled_runs (run_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_post_sale_scheduled_runs_lead
  ON public.post_sale_scheduled_runs (lead_id, event_type);

ALTER TABLE public.post_sale_scheduled_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_sale_scheduled_runs_org_read" ON public.post_sale_scheduled_runs;
CREATE POLICY "post_sale_scheduled_runs_org_read"
  ON public.post_sale_scheduled_runs FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
         OR public.has_role(auth.uid(), 'super_admin'::app_role));