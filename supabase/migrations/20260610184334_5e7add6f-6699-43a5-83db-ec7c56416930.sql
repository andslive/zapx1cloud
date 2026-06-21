-- 1. Enable pg_cron and pg_net if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Create or Update the heartbeat cron schedule
-- This will call the uazapi-heartbeat function every 1 minute
-- We use a placeholder for URL and Key which will be resolved by the function if possible, 
-- or we can use the project's internal service role.
SELECT cron.schedule(
    'uazapi-heartbeat-cron',
    '* * * * *',
    $$
    SELECT
      net.http_post(
        url := (SELECT value FROM platform_settings WHERE key = 'supabase_url') || '/functions/v1/uazapi-heartbeat',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT value FROM platform_settings WHERE key = 'service_role_key')
        ),
        body := '{}'
      )
    $$
);

-- 3. Ensure Realtime is enabled for evolution_instances
-- Check if the publication exists first
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE evolution_instances;

-- 4. Add missing tracking columns to evolution_instances if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'evolution_instances' AND COLUMN_NAME = 'last_health_at') THEN
        ALTER TABLE evolution_instances ADD COLUMN last_health_at TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'evolution_instances' AND COLUMN_NAME = 'last_real_whatsapp_ping') THEN
        ALTER TABLE evolution_instances ADD COLUMN last_real_whatsapp_ping TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'evolution_instances' AND COLUMN_NAME = 'last_real_whatsapp_state') THEN
        ALTER TABLE evolution_instances ADD COLUMN last_real_whatsapp_state TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'evolution_instances' AND COLUMN_NAME = 'is_stable') THEN
        ALTER TABLE evolution_instances ADD COLUMN is_stable BOOLEAN DEFAULT TRUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'evolution_instances' AND COLUMN_NAME = 'is_ghost') THEN
        ALTER TABLE evolution_instances ADD COLUMN is_ghost BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'evolution_instances' AND COLUMN_NAME = 'one_tick_count') THEN
        ALTER TABLE evolution_instances ADD COLUMN one_tick_count INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'evolution_instances' AND COLUMN_NAME = 'health_data') THEN
        ALTER TABLE evolution_instances ADD COLUMN health_data JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;
