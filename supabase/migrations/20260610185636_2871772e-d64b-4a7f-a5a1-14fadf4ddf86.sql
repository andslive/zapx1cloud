CREATE TABLE IF NOT EXISTS public.admin_notification_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id),
    connection_id UUID REFERENCES public.evolution_instances(id),
    instance_name TEXT,
    old_status TEXT,
    new_status TEXT,
    reason TEXT,
    sent_to TEXT,
    payload JSONB,
    send_response JSONB,
    success BOOLEAN DEFAULT false,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_notification_logs TO authenticated;
GRANT ALL ON public.admin_notification_logs TO service_role;

ALTER TABLE public.admin_notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own organization logs" ON public.admin_notification_logs
    FOR SELECT USING (auth.uid() IN (
        SELECT profiles.id FROM profiles 
        WHERE profiles.organization_id = admin_notification_logs.organization_id
    ));

-- Also create the admin_status_alerts table if missing (referenced by existing webhook code)
CREATE TABLE IF NOT EXISTS public.admin_status_alerts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id),
    connection_id UUID REFERENCES public.evolution_instances(id),
    connection_name TEXT,
    connection_phone TEXT,
    old_status TEXT,
    new_status TEXT,
    notify_phone TEXT,
    message TEXT,
    status TEXT DEFAULT 'pending', -- pending, sent, error, skipped_rate_limit
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_status_alerts TO authenticated;
GRANT ALL ON public.admin_status_alerts TO service_role;

ALTER TABLE public.admin_status_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own organization alerts" ON public.admin_status_alerts
    FOR SELECT USING (auth.uid() IN (
        SELECT profiles.id FROM profiles 
        WHERE profiles.organization_id = admin_status_alerts.organization_id
    ));
