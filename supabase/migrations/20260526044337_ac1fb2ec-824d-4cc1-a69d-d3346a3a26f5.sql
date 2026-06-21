-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the funnel resume cron to run every minute
-- This calls the funnel-resume-cron Edge Function
-- We use the service role key for authentication (injected by Supabase in the vault or env, 
-- but here we'll use a direct net call if possible or just the RPC approach)

SELECT cron.schedule(
  'resume-funnels-every-minute',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://qagoydprfofyohrwntjv.supabase.co/functions/v1/funnel-resume-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'
    ) as request_id;
  $$
);

-- Note: app.settings.service_role_key must be set in the database settings 
-- for the above to work automatically. If not, the cron job might fail.
-- Alternatively, we can use the vault.
