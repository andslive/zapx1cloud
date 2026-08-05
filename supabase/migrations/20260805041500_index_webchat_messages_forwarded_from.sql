CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webchat_messages_forwarded_from_message_id
  ON public.webchat_messages (forwarded_from_message_id)
  WHERE forwarded_from_message_id IS NOT NULL;
