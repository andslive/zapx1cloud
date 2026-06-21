-- Add current_agent_id to track active agent in conversation
ALTER TABLE public.webchat_conversations 
ADD COLUMN IF NOT EXISTS current_agent_id UUID REFERENCES public.product_agents(id) ON DELETE SET NULL;

-- Create index for faster agent lookups
CREATE INDEX IF NOT EXISTS idx_webchat_conversations_agent 
ON public.webchat_conversations(current_agent_id);

-- Comment for documentation
COMMENT ON COLUMN public.webchat_conversations.current_agent_id IS 'ID of the currently active AI agent for this conversation';