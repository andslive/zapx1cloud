CREATE TABLE public.receipt_shadow_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz,
  instance text,
  message_id text,
  amount numeric,
  payer_name text,
  pix_id text,
  is_receipt boolean,
  confidence numeric,
  ocr_text text,
  provider text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.receipt_shadow_results TO authenticated;
GRANT ALL ON public.receipt_shadow_results TO service_role;

ALTER TABLE public.receipt_shadow_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_select_receipt_shadow_results"
ON public.receipt_shadow_results
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "super_admin_all_receipt_shadow_results"
ON public.receipt_shadow_results
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE INDEX idx_receipt_shadow_results_received_at ON public.receipt_shadow_results (received_at DESC);
CREATE INDEX idx_receipt_shadow_results_message_id ON public.receipt_shadow_results (message_id);