ALTER TABLE public.evolution_instances 
ADD COLUMN IF NOT EXISTS last_reconnect_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS high_delivery_mode BOOLEAN DEFAULT true;

ALTER TABLE public.whatsapp_message_retries
ADD COLUMN IF NOT EXISTS ack_status INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Index for stuck ACK monitoring
CREATE INDEX IF NOT EXISTS idx_whatsapp_retries_stuck_ack ON public.whatsapp_message_retries (instance_id, created_at) WHERE ack_status < 1;
