-- Add compatibility columns for generic webhooks
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS webhook_id UUID REFERENCES public.webhooks(id);
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS request_method TEXT;
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS request_headers JSONB;
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS request_ip TEXT;
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS parsed_fields JSONB;
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS status TEXT;

-- Index for the new columns
CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id ON public.webhook_logs(webhook_id);
