CREATE TABLE public.funnel_webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funnel_id UUID NOT NULL REFERENCES public.capture_funnels(id) ON DELETE CASCADE,
  block_id TEXT NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  request_url TEXT NOT NULL,
  request_method TEXT NOT NULL DEFAULT 'POST',
  request_headers JSONB DEFAULT '{}'::jsonb,
  request_body JSONB,
  response_status INTEGER,
  response_body TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  duration_ms INTEGER,
  trigger_source TEXT NOT NULL DEFAULT 'on_block',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_funnel_webhook_logs_funnel ON public.funnel_webhook_logs(funnel_id, created_at DESC);
CREATE INDEX idx_funnel_webhook_logs_block ON public.funnel_webhook_logs(funnel_id, block_id, created_at DESC);
CREATE INDEX idx_funnel_webhook_logs_org ON public.funnel_webhook_logs(organization_id, created_at DESC);

ALTER TABLE public.funnel_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can view webhook logs"
ON public.funnel_webhook_logs
FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR public.user_belongs_to_organization(auth.uid(), organization_id)
);

CREATE POLICY "Service role can insert webhook logs"
ON public.funnel_webhook_logs
FOR INSERT
WITH CHECK (true);