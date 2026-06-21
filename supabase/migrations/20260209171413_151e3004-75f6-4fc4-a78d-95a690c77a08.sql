
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS bant_budget text,
  ADD COLUMN IF NOT EXISTS bant_authority text,
  ADD COLUMN IF NOT EXISTS bant_need text,
  ADD COLUMN IF NOT EXISTS bant_timing text,
  ADD COLUMN IF NOT EXISTS sdr_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_sdr_id ON public.leads(sdr_id);
CREATE INDEX IF NOT EXISTS idx_leads_closer_id ON public.leads(closer_id);
