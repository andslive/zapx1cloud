ALTER TABLE public.webchat_conversations
ADD COLUMN IF NOT EXISTS welcome_sent_at TIMESTAMPTZ;