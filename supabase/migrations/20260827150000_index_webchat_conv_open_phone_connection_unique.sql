CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS webchat_conv_open_phone_connection_unique
  ON public.webchat_conversations (organization_id, channel, visitor_phone_normalized, connection_id)
  NULLS NOT DISTINCT
  WHERE status <> 'closed'
    AND visitor_phone_normalized IS NOT NULL
    AND visitor_phone_normalized <> '';
