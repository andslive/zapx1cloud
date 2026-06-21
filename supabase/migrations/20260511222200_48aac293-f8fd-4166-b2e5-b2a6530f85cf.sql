DELETE FROM public.webchat_messages m
USING (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY conversation_id, (metadata->>'evolution_message_id')
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.webchat_messages
  WHERE direction = 'inbound'
    AND metadata->>'evolution_message_id' IS NOT NULL
) dup
WHERE m.id = dup.id AND dup.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS webchat_messages_inbound_evolution_msg_uniq
ON public.webchat_messages (conversation_id, ((metadata->>'evolution_message_id')))
WHERE direction = 'inbound' AND metadata->>'evolution_message_id' IS NOT NULL;