-- Add pixel columns to facebook_lead_integrations
ALTER TABLE public.facebook_lead_integrations
ADD COLUMN IF NOT EXISTS pixel_name TEXT,
ADD COLUMN IF NOT EXISTS pixel_id TEXT,
ADD COLUMN IF NOT EXISTS pixel_access_token TEXT;

-- We don't need to change the leads table columns as they are already TEXT.
-- The unique constraint leads_org_phone_unique is on (organization_id, phone_normalized).
-- If we start storing JIDs in phone_normalized, it should still work as they will be unique per org.
-- However, we should ensure the normalization function or the logic calling it doesn't strip important characters.

-- Add a new column to capture_funnels for default pixel (optional, but requested for the block later)
-- The user asked for a Pixel block IN the funnel, so it's mainly in flow_blocks JSONB.
