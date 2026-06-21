-- Add customization columns to booking_event_types
ALTER TABLE public.booking_event_types
ADD COLUMN IF NOT EXISTS thank_you_title TEXT,
ADD COLUMN IF NOT EXISTS thank_you_message TEXT,
ADD COLUMN IF NOT EXISTS what_happens JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS next_steps JSONB DEFAULT '[]'::jsonb;

-- Add RLS policy for public access to booking_requests by token
CREATE POLICY "Public can view bookings by token"
  ON public.booking_requests
  FOR SELECT
  TO anon, authenticated
  USING (confirmation_token IS NOT NULL AND confirmation_token != '');