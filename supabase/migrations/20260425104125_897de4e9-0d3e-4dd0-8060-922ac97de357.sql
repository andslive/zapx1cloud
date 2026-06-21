ALTER TABLE public.help_categories
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'all';

ALTER TABLE public.help_categories
  DROP CONSTRAINT IF EXISTS help_categories_visibility_check;

ALTER TABLE public.help_categories
  ADD CONSTRAINT help_categories_visibility_check
  CHECK (visibility IN ('all', 'super_admin_only'));