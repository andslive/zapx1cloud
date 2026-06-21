ALTER TABLE public.product_agents
  ADD COLUMN IF NOT EXISTS welcome_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS welcome_message TEXT,
  ADD COLUMN IF NOT EXISTS quick_menu_mode TEXT NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS quick_menu_intro TEXT,
  ADD COLUMN IF NOT EXISTS quick_menu_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS quick_menu_invalid_message TEXT;

-- Garante que quick_menu_mode só aceita valores válidos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_agents_quick_menu_mode_check'
  ) THEN
    ALTER TABLE public.product_agents
      ADD CONSTRAINT product_agents_quick_menu_mode_check
      CHECK (quick_menu_mode IN ('off', 'always', 'fallback'));
  END IF;
END $$;