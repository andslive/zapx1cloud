-- Fix the permissive RLS policy for webchat_conversations INSERT
-- Replace WITH CHECK (true) with proper organization validation

DROP POLICY IF EXISTS "System can insert conversations" ON public.webchat_conversations;

-- Allow inserts only when widget belongs to a valid organization
CREATE POLICY "Allow conversation inserts via valid widget"
  ON public.webchat_conversations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.webchat_widgets w
      WHERE w.id = webchat_conversations.widget_id
      AND w.organization_id = webchat_conversations.organization_id
      AND w.is_active = true
    )
  );

-- Also fix the messages policy to be more restrictive for anon inserts
DROP POLICY IF EXISTS "Users can insert messages to their org conversations" ON public.webchat_messages;

CREATE POLICY "Users can insert messages to their org conversations"
  ON public.webchat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.webchat_conversations c
      WHERE c.id = webchat_messages.conversation_id
    )
  );