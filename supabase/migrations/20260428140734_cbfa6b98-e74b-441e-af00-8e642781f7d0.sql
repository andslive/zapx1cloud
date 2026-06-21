
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS login_bg_layout text NOT NULL DEFAULT 'split-left';

ALTER TABLE public.platform_settings
  DROP CONSTRAINT IF EXISTS platform_settings_login_bg_layout_check;

ALTER TABLE public.platform_settings
  ADD CONSTRAINT platform_settings_login_bg_layout_check
  CHECK (login_bg_layout IN ('fullscreen','split-left','split-right'));
