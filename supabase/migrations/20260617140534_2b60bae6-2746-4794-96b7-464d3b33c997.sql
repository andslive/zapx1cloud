CREATE TABLE IF NOT EXISTS public.ai_receipt_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid,
  lead_id uuid,
  organization_id uuid,
  funnel_id uuid,
  block_id text,
  message_id text,
  source text,
  ocr_text_preview text,
  identified boolean,
  name text,
  value text,
  route text,
  decision text,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_receipt_audits_conv_created
  ON public.ai_receipt_audits (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_receipt_audits_lead_created
  ON public.ai_receipt_audits (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_receipt_audits_org_created
  ON public.ai_receipt_audits (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_receipt_audits_decision
  ON public.ai_receipt_audits (decision, created_at DESC);

GRANT SELECT ON public.ai_receipt_audits TO authenticated;
GRANT ALL ON public.ai_receipt_audits TO service_role;

ALTER TABLE public.ai_receipt_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_receipt_audits_org_read" ON public.ai_receipt_audits
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "ai_receipt_audits_service_all" ON public.ai_receipt_audits
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);