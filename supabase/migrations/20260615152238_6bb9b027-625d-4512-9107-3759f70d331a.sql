-- GRANTs faltando em lead_tracking (causa silenciosa do bug)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tracking TO authenticated;
GRANT ALL ON public.lead_tracking TO service_role;

-- Novas colunas CTWA em lead_tracking
ALTER TABLE public.lead_tracking
  ADD COLUMN IF NOT EXISTS ctwa_clid text,
  ADD COLUMN IF NOT EXISTS ctwa_signals text,
  ADD COLUMN IF NOT EXISTS ad_source_id text,
  ADD COLUMN IF NOT EXISTS ad_source_type text,
  ADD COLUMN IF NOT EXISTS conversion_delay_seconds integer,
  ADD COLUMN IF NOT EXISTS entry_point_conversion_delay_seconds integer;

CREATE INDEX IF NOT EXISTS idx_lead_tracking_ctwa_clid
  ON public.lead_tracking (ctwa_clid)
  WHERE ctwa_clid IS NOT NULL;

-- Snapshot CTWA por conversa
ALTER TABLE public.webchat_conversations
  ADD COLUMN IF NOT EXISTS ctwa_data jsonb;