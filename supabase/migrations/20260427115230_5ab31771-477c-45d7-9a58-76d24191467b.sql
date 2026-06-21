ALTER TABLE public.webchat_conversations
  ADD COLUMN IF NOT EXISTS visitor_avatar_url text;