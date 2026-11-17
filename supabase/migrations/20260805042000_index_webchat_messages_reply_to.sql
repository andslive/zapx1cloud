CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webchat_messages_reply_to_message_id
  ON public.webchat_messages (reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;
