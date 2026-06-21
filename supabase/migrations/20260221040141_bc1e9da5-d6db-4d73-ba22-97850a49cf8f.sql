
ALTER TABLE public.ai_outreach_queue
  ADD COLUMN IF NOT EXISTS followup_steps jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS business_hours_start text DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS business_hours_end text DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS business_days integer[] DEFAULT '{1,2,3,4,5}';
