-- Add admin notification phone to organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS admin_status_notify_phone TEXT;

-- Create admin_status_alerts table
CREATE TABLE IF NOT EXISTS public.admin_status_alerts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL, -- evolution_instances.id
    connection_name TEXT NOT NULL,
    connection_phone TEXT,
    old_status TEXT,
    new_status TEXT NOT NULL,
    notify_phone TEXT NOT NULL,
    sender_connection_id UUID, -- connection used to send the alert
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, failed, skipped_rate_limit
    error TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_status_alerts TO authenticated;
GRANT ALL ON public.admin_status_alerts TO service_role;

-- Enable RLS
ALTER TABLE public.admin_status_alerts ENABLE ROW LEVEL SECURITY;

-- Policies for admin_status_alerts
CREATE POLICY "Users can view their organization's alerts" ON public.admin_status_alerts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.organization_id = admin_status_alerts.organization_id
        )
    );

-- Index for rate limit checking
CREATE INDEX IF NOT EXISTS idx_admin_status_alerts_rate_limit ON public.admin_status_alerts (connection_id, new_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_status_alerts_pending ON public.admin_status_alerts (status) WHERE status = 'pending';
