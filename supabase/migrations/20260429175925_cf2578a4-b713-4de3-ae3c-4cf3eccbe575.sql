CREATE INDEX IF NOT EXISTS idx_webchat_conv_org_lastmsg
  ON public.webchat_conversations (organization_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_webchat_conv_org_status_lastmsg
  ON public.webchat_conversations (organization_id, status, last_message_at DESC NULLS LAST);