-- 1. Remove FK rígida que impede usar IDs de capture_funnels em current_flow_id
ALTER TABLE public.webchat_conversations
  DROP CONSTRAINT IF EXISTS webchat_conversations_current_flow_id_fkey;

-- 2. Atualiza a constraint de flow_source para incluir as origens reais usadas pelo sistema
ALTER TABLE public.webchat_conversations
  DROP CONSTRAINT IF EXISTS webchat_conversations_flow_source_check;

ALTER TABLE public.webchat_conversations
  ADD CONSTRAINT webchat_conversations_flow_source_check
  CHECK (flow_source IS NULL OR flow_source IN ('chat_flow','funnel','webhook_trigger'));