ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS guided_onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS guided_onboarding_skipped_at TIMESTAMPTZ;