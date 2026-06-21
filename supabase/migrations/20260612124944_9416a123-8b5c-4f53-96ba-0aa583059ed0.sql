-- 1. Create indexes for I/O optimization
CREATE INDEX IF NOT EXISTS idx_webhook_health_connection_id ON public.webhook_health(connection_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at_desc ON public.webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connection_health_connection_id ON public.connection_health(connection_id);
CREATE INDEX IF NOT EXISTS idx_funnel_jobs_status_created ON public.funnel_execution_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_webchat_conv_conn ON public.webchat_conversations(connection_id);
CREATE INDEX IF NOT EXISTS idx_webchat_conv_lead ON public.webchat_conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_conn ON public.leads(connection_id);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads(phone);

-- 2. Deduplicate and add unique constraints
-- Deduplicate webhook_health
DELETE FROM public.webhook_health
WHERE id NOT IN (
    SELECT id
    FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY connection_id ORDER BY created_at DESC) as row_num
        FROM public.webhook_health
        WHERE connection_id IS NOT NULL
    ) s
    WHERE row_num = 1
);
ALTER TABLE public.webhook_health ADD CONSTRAINT webhook_health_connection_id_unique UNIQUE (connection_id);

-- Deduplicate connection_health
DELETE FROM public.connection_health
WHERE id NOT IN (
    SELECT id
    FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY connection_id ORDER BY created_at DESC) as row_num
        FROM public.connection_health
        WHERE connection_id IS NOT NULL
    ) s
    WHERE row_num = 1
);
ALTER TABLE public.connection_health ADD CONSTRAINT connection_health_connection_id_unique UNIQUE (connection_id);

-- 3. Fix the funnel-job-runner cron and the 'decrypter' error
SELECT cron.unschedule('funnel-job-runner-every-10s');

SELECT cron.schedule(
  'funnel-job-runner-v2',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url:=(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/funnel-job-runner',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY') || '"}'::jsonb,
      body:='{}'::jsonb
    );
  $$
);

-- 4. Set up Log Retention Policy (7 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM public.webhook_logs WHERE created_at < NOW() - INTERVAL '7 days';
  DELETE FROM public.processed_messages WHERE created_at < NOW() - INTERVAL '7 days';
  DELETE FROM public.admin_notification_logs WHERE created_at < NOW() - INTERVAL '7 days';
  -- Also clean up health tables if they ever grow too much (though now they are UPSERTed, it's good practice)
  DELETE FROM public.webhook_health WHERE created_at < NOW() - INTERVAL '7 days';
  DELETE FROM public.connection_health WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT cron.schedule(
  'daily-log-cleanup',
  '0 0 * * *',
  'SELECT public.cleanup_old_logs()'
);

GRANT EXECUTE ON FUNCTION public.cleanup_old_logs() TO service_role;
