-- Adicionar colunas CTWA na tabela lead_tracking
ALTER TABLE public.lead_tracking 
ADD COLUMN IF NOT EXISTS ctwa_payload TEXT,
ADD COLUMN IF NOT EXISTS conversion_data TEXT,
ADD COLUMN IF NOT EXISTS conversion_source TEXT,
ADD COLUMN IF NOT EXISTS entry_point_conversion_source TEXT,
ADD COLUMN IF NOT EXISTS entry_point_conversion_app TEXT,
ADD COLUMN IF NOT EXISTS ad_headline TEXT,
ADD COLUMN IF NOT EXISTS ad_body TEXT,
ADD COLUMN IF NOT EXISTS ad_source_app TEXT,
ADD COLUMN IF NOT EXISTS ad_source_url TEXT,
ADD COLUMN IF NOT EXISTS ad_media_type TEXT,
ADD COLUMN IF NOT EXISTS ad_media_url TEXT,
ADD COLUMN IF NOT EXISTS raw_ctwa_payload JSONB;

-- Garantir privilégios
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tracking TO authenticated;
GRANT ALL ON public.lead_tracking TO service_role;
