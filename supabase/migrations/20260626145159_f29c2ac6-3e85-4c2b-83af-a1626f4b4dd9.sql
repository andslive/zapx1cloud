
CREATE TABLE IF NOT EXISTS public.vps_receipt_results (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id text NOT NULL UNIQUE,
  instance text,
  pix_id text,
  is_receipt boolean,
  amount numeric,
  customer_name text,
  confidence numeric,
  ocr_text text,
  ai_reason text,
  phone text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vps_receipt_results_instance_idx ON public.vps_receipt_results (instance);
CREATE INDEX IF NOT EXISTS vps_receipt_results_pix_id_idx ON public.vps_receipt_results (pix_id);
CREATE INDEX IF NOT EXISTS vps_receipt_results_created_at_idx ON public.vps_receipt_results (created_at DESC);

GRANT ALL ON public.vps_receipt_results TO service_role;

ALTER TABLE public.vps_receipt_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role full access vps_receipt_results"
  ON public.vps_receipt_results
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.vps_receipt_results_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS vps_receipt_results_updated_at ON public.vps_receipt_results;
CREATE TRIGGER vps_receipt_results_updated_at
  BEFORE UPDATE ON public.vps_receipt_results
  FOR EACH ROW EXECUTE FUNCTION public.vps_receipt_results_touch_updated_at();
