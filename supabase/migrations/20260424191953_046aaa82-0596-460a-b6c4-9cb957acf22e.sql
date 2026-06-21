ALTER TABLE public.platform_plans
  ADD COLUMN IF NOT EXISTS checkout_url TEXT,
  ADD COLUMN IF NOT EXISTS highlight_label TEXT;