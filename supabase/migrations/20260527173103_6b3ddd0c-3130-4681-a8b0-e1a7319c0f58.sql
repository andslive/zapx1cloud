-- Add ACK tracking to processed_messages
ALTER TABLE public.processed_messages 
ADD COLUMN IF NOT EXISTS ack INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ack_at TIMESTAMP WITH TIME ZONE;

-- Add instance configuration for stability
ALTER TABLE public.evolution_instances
ADD COLUMN IF NOT EXISTS multi_device BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS always_online BOOLEAN DEFAULT true;

-- Ensure indexes for performance
CREATE INDEX IF NOT EXISTS idx_processed_messages_ack ON public.processed_messages(ack);
CREATE INDEX IF NOT EXISTS idx_processed_messages_remote_jid ON public.processed_messages(remote_jid);

-- Add last message status to leads for easy UI tracking
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS last_message_ack INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_message_ack_at TIMESTAMP WITH TIME ZONE;
