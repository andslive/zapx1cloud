-- Add columns to lead_tracking if they don't exist
ALTER TABLE public.lead_tracking 
ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id),
ADD COLUMN IF NOT EXISTS ad_headline text,
ADD COLUMN IF NOT EXISTS ad_body text,
ADD COLUMN IF NOT EXISTS ad_source_app text,
ADD COLUMN IF NOT EXISTS ad_source_url text,
ADD COLUMN IF NOT EXISTS ad_media_type text,
ADD COLUMN IF NOT EXISTS ad_media_url text,
ADD COLUMN IF NOT EXISTS raw_ctwa_payload jsonb,
ADD COLUMN IF NOT EXISTS ctwa_payload text,
ADD COLUMN IF NOT EXISTS conversion_data text,
ADD COLUMN IF NOT EXISTS conversion_source text,
ADD COLUMN IF NOT EXISTS entry_point_conversion_source text,
ADD COLUMN IF NOT EXISTS entry_point_conversion_app text;

-- Add columns to leads if they don't exist
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS ad_headline text,
ADD COLUMN IF NOT EXISTS ad_body text,
ADD COLUMN IF NOT EXISTS ad_source_app text,
ADD COLUMN IF NOT EXISTS ad_source_url text,
ADD COLUMN IF NOT EXISTS entry_point_conversion_source text,
ADD COLUMN IF NOT EXISTS ctwa_detected boolean DEFAULT false;

-- Add grants to ensure functions can access these columns
GRANT SELECT, INSERT, UPDATE ON public.lead_tracking TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.leads TO authenticated, service_role;