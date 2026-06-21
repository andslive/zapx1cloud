-- Ensure updated_at trigger exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_evolution_instances_updated_at ON public.evolution_instances;
CREATE TRIGGER update_evolution_instances_updated_at
BEFORE UPDATE ON public.evolution_instances
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create admin_status_alerts if it really doesn't exist
CREATE TABLE IF NOT EXISTS public.admin_status_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES public.evolution_instances(id) ON DELETE CASCADE,
    connection_name TEXT,
    connection_phone TEXT,
    old_status TEXT,
    new_status TEXT,
    notify_phone TEXT,
    message TEXT,
    status TEXT DEFAULT 'pending', -- pending, sent, error, skipped_rate_limit
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_status_alerts TO authenticated;
GRANT ALL ON public.admin_status_alerts TO service_role;
ALTER TABLE public.admin_status_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage alerts of their organization" ON public.admin_status_alerts
    FOR ALL USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Add trigger for status change on evolution_instances
CREATE OR REPLACE FUNCTION public.on_instance_status_change_notify_admin()
RETURNS TRIGGER AS $$
DECLARE
    v_notify_phone TEXT;
    v_alerts_enabled BOOLEAN;
    v_recent_count INT;
BEGIN
    -- Only act if status changed
    IF (OLD.status IS DISTINCT FROM NEW.status) OR (OLD.is_ghost IS DISTINCT FROM NEW.is_ghost) THEN
        
        -- Get org settings
        SELECT admin_status_notify_phone, admin_status_alerts_enabled
        INTO v_notify_phone, v_alerts_enabled
        FROM public.organizations
        WHERE id = NEW.organization_id;

        -- Check if it's a critical status or ghost
        IF v_alerts_enabled AND v_notify_phone IS NOT NULL AND 
           (NEW.status IN ('disconnected', 'offline', 'error', 'waiting_qr', 'logged_out', 'close', 'partial', 'restricted') OR NEW.is_ghost = true) THEN
            
            -- Check for rate limit: 1 alert every 30 mins per instance
            SELECT count(*)
            INTO v_recent_count
            FROM public.admin_status_alerts
            WHERE connection_id = NEW.id
              AND created_at > now() - INTERVAL '30 minutes';

            IF v_recent_count = 0 THEN
                INSERT INTO public.admin_status_alerts (
                    organization_id,
                    connection_id,
                    connection_name,
                    connection_phone,
                    old_status,
                    new_status,
                    notify_phone,
                    message,
                    status
                ) VALUES (
                    NEW.organization_id,
                    NEW.id,
                    NEW.name,
                    NEW.phone_number,
                    OLD.status,
                    CASE WHEN NEW.is_ghost THEN 'ghost_connection' ELSE NEW.status END,
                    v_notify_phone,
                    'Monitor triggered status change to ' || NEW.status,
                    'pending'
                );
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_instance_status_change ON public.evolution_instances;
CREATE TRIGGER trigger_instance_status_change
AFTER UPDATE ON public.evolution_instances
FOR EACH ROW EXECUTE FUNCTION public.on_instance_status_change_notify_admin();
