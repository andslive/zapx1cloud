-- RESTAURAÇÃO do trigger removido pela migration 20261124120000. Idempotente. Rodar por SQL direcionado (sem db push).
BEGIN;
CREATE OR REPLACE FUNCTION public.on_instance_status_change_notify_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;
DROP TRIGGER IF EXISTS trigger_instance_status_change ON public.evolution_instances;
CREATE TRIGGER trigger_instance_status_change AFTER UPDATE ON public.evolution_instances FOR EACH ROW EXECUTE FUNCTION on_instance_status_change_notify_admin();
COMMIT;
