-- Fix purchase_audit -> pixel_event_logs relationship
ALTER TABLE public.purchase_audit
DROP CONSTRAINT IF EXISTS purchase_audit_pixel_event_log_id_fkey,
ADD CONSTRAINT purchase_audit_pixel_event_log_id_fkey 
    FOREIGN KEY (pixel_event_log_id) 
    REFERENCES public.pixel_event_logs(id) 
    ON DELETE CASCADE;

-- Ensure pixel_event_logs -> leads also cascades to allow lead deletion
ALTER TABLE public.pixel_event_logs
DROP CONSTRAINT IF EXISTS pixel_event_logs_lead_id_fkey,
ADD CONSTRAINT pixel_event_logs_lead_id_fkey 
    FOREIGN KEY (lead_id) 
    REFERENCES public.leads(id) 
    ON DELETE CASCADE;
