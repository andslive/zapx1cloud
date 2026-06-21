
-- Fix foreign key constraint on webhook_logs to allow lead deletion
ALTER TABLE public.webhook_logs
  DROP CONSTRAINT IF EXISTS webhook_logs_lead_id_fkey;

ALTER TABLE public.webhook_logs
  ADD CONSTRAINT webhook_logs_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;
