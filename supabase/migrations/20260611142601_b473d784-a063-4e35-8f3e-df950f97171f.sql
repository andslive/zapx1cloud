ALTER TABLE public.evolution_instances 
ADD COLUMN IF NOT EXISTS webhook_status TEXT DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS last_webhook_check_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_webhook_event_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS webhook_events TEXT[],
ADD COLUMN IF NOT EXISTS webhook_url TEXT;

COMMENT ON COLUMN public.evolution_instances.webhook_status IS 'Status do webhook na UazAPI: ok, absent, broken, unknown';
