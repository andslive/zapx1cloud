ALTER TABLE public.lead_tracking ADD COLUMN IF NOT EXISTS referral JSONB;

-- Update the existing SELECT policy to ensure all columns are accessible
-- (Usually not needed unless columns were specifically excluded, which they aren't)
