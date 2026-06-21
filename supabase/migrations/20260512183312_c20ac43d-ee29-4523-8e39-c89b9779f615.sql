ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS presence_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS presence_recording_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS presence_typing_chars_per_sec integer NOT NULL DEFAULT 28,
  ADD COLUMN IF NOT EXISTS presence_jitter_pct integer NOT NULL DEFAULT 15;