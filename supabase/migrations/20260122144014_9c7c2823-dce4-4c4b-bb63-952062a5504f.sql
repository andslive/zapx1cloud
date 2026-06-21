-- Add missing columns to google_calendar_connections
ALTER TABLE public.google_calendar_connections
ADD COLUMN IF NOT EXISTS google_email TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS selected_calendar_id TEXT,
ADD COLUMN IF NOT EXISTS google_event_id TEXT;

-- Add google_event_id and related columns to calendar_events for sync tracking
ALTER TABLE public.calendar_events
ADD COLUMN IF NOT EXISTS google_event_id TEXT,
ADD COLUMN IF NOT EXISTS google_calendar_id TEXT,
ADD COLUMN IF NOT EXISTS synced_from_google BOOLEAN DEFAULT false;

-- Create index for faster sync lookups
CREATE INDEX IF NOT EXISTS idx_calendar_events_google_event_id 
ON public.calendar_events(google_event_id) 
WHERE google_event_id IS NOT NULL;