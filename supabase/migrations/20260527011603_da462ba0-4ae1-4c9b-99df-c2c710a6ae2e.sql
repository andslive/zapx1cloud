-- Add status column to webchat_messages
ALTER TABLE public.webchat_messages ADD COLUMN IF NOT EXISTS status text DEFAULT 'sent';

-- Add index for evolution_message_id for faster ACK lookups
CREATE INDEX IF NOT EXISTS idx_webchat_messages_evolution_msg_id ON public.webchat_messages ((metadata->>'evolution_message_id'));
