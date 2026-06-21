-- Create lead_tracking table
CREATE TABLE IF NOT EXISTS public.lead_tracking (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    phone TEXT,
    wa_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    source TEXT,
    source_platform TEXT,
    source_channel TEXT,
    campaign_id TEXT,
    campaign_name TEXT,
    adset_id TEXT,
    adset_name TEXT,
    ad_id TEXT,
    ad_name TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    fbclid TEXT,
    gclid TEXT,
    click_id TEXT,
    page_id TEXT,
    page_name TEXT,
    business_id TEXT,
    referral_source TEXT,
    referral_type TEXT,
    referral_headline TEXT,
    referral_body TEXT,
    referral_ctwa_clid TEXT,
    referral_media_type TEXT,
    referral_video_id TEXT,
    referral_post_id TEXT,
    referral_ad_id TEXT,
    referral_campaign_id TEXT,
    device_type TEXT,
    os TEXT,
    browser TEXT,
    country TEXT,
    state TEXT,
    city TEXT,
    landing_url TEXT,
    raw_payload JSONB
);

-- Add columns to leads table for better CRM integration
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS campaign_id TEXT,
ADD COLUMN IF NOT EXISTS campaign_name TEXT,
ADD COLUMN IF NOT EXISTS adset_id TEXT,
ADD COLUMN IF NOT EXISTS adset_name TEXT,
ADD COLUMN IF NOT EXISTS ad_id TEXT,
ADD COLUMN IF NOT EXISTS ad_name TEXT,
ADD COLUMN IF NOT EXISTS first_contact BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS first_message_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS fbclid TEXT,
ADD COLUMN IF NOT EXISTS ctwa_clid TEXT;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_lead_tracking_lead_id ON public.lead_tracking(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tracking_phone ON public.lead_tracking(phone);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tracking TO authenticated;
GRANT ALL ON public.lead_tracking TO service_role;

-- Enable RLS
ALTER TABLE public.lead_tracking ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
CREATE POLICY "Users can view tracking for their leads" ON public.lead_tracking
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.leads l
            WHERE l.id = lead_id 
            AND l.organization_id = get_user_organization(auth.uid())
        )
    );

CREATE POLICY "Service role can do everything on lead tracking" ON public.lead_tracking
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
