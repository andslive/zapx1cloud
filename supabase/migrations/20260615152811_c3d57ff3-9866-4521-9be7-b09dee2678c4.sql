ALTER TABLE public.purchase_audit
  ADD COLUMN IF NOT EXISTS ctwa_clid text,
  ADD COLUMN IF NOT EXISTS ad_source_id text,
  ADD COLUMN IF NOT EXISTS ad_source_type text,
  ADD COLUMN IF NOT EXISTS entry_point_conversion_source text,
  ADD COLUMN IF NOT EXISTS action_source text;