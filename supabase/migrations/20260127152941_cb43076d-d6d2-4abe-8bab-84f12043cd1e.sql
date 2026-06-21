-- Add booking_experience column to booking_event_types
ALTER TABLE public.booking_event_types
ADD COLUMN booking_experience TEXT DEFAULT 'standard'
CHECK (booking_experience IN ('standard', 'conversational'));