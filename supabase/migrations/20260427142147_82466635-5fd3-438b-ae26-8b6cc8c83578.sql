-- Tabela de reações em mensagens
CREATE TABLE public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.webchat_messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.webchat_conversations(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  -- Autor: ou um usuário do painel (user_id) ou um visitante (visitor_id)
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  visitor_id TEXT,
  reactor_type TEXT NOT NULL CHECK (reactor_type IN ('agent', 'visitor')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (reactor_type = 'agent' AND user_id IS NOT NULL AND visitor_id IS NULL) OR
    (reactor_type = 'visitor' AND visitor_id IS NOT NULL AND user_id IS NULL)
  )
);

-- Cada agente/visitante tem no máximo 1 reação por mensagem (substitui ao alterar emoji)
CREATE UNIQUE INDEX idx_message_reactions_unique_agent
  ON public.message_reactions (message_id, user_id)
  WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_message_reactions_unique_visitor
  ON public.message_reactions (message_id, visitor_id)
  WHERE visitor_id IS NOT NULL;
CREATE INDEX idx_message_reactions_message ON public.message_reactions (message_id);
CREATE INDEX idx_message_reactions_conversation ON public.message_reactions (conversation_id);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Membros da organização podem ver reações de conversas da sua org
CREATE POLICY "Org members can view reactions"
ON public.message_reactions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.webchat_conversations c
    JOIN public.profiles p ON p.organization_id = c.organization_id
    WHERE c.id = message_reactions.conversation_id
      AND p.id = auth.uid()
  )
);

-- Agentes podem inserir suas próprias reações
CREATE POLICY "Agents can insert their own reactions"
ON public.message_reactions FOR INSERT
WITH CHECK (
  reactor_type = 'agent'
  AND user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.webchat_conversations c
    JOIN public.profiles p ON p.organization_id = c.organization_id
    WHERE c.id = message_reactions.conversation_id
      AND p.id = auth.uid()
  )
);

-- Agentes podem deletar suas próprias reações
CREATE POLICY "Agents can delete their own reactions"
ON public.message_reactions FOR DELETE
USING (reactor_type = 'agent' AND user_id = auth.uid());

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;