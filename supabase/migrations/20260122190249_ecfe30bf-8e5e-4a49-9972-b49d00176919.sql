-- Add meet_link column to calendar_events for storing Google Meet links
ALTER TABLE public.calendar_events 
ADD COLUMN IF NOT EXISTS meet_link TEXT,
ADD COLUMN IF NOT EXISTS create_meet BOOLEAN DEFAULT false;