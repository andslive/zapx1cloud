ALTER TABLE public.platform_settings 
  ADD COLUMN IF NOT EXISTS login_headline text,
  ADD COLUMN IF NOT EXISTS login_subheadline text,
  ADD COLUMN IF NOT EXISTS login_stats_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS powered_by_text text DEFAULT 'Powered by';