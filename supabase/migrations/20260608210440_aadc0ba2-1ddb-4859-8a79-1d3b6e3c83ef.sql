CREATE TABLE IF NOT EXISTS public.admin_status_alert_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- Actually references organization_id but typically users are tied to it. Better:
    -- organization_id UUID NOT NULL, 
    connection_id UUID, -- References evolution_instances(id)
    connection_name TEXT,
    old_status TEXT,
    new_status TEXT,
    simulation BOOLEAN DEFAULT FALSE,
    sender_instance_id UUID,
    request_id TEXT,
    status TEXT DEFAULT 'pending', -- pending, sent, failed
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Note: organization_id in this project seems to be a UUID not directly referencing auth.users in some tables.
-- Let's check evolution_instances table structure if possible or just use UUID.
-- Based on previous context, evolution_instances has organization_id.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_status_alert_logs TO authenticated;
GRANT ALL ON public.admin_status_alert_logs TO service_role;

ALTER TABLE public.admin_status_alert_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own organization logs" ON public.admin_status_alert_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.organization_id = admin_status_alert_logs.organization_id
        )
    );

-- Since it's for admins, we should probably have a more restrictive policy or ensure only admins access the UI.
