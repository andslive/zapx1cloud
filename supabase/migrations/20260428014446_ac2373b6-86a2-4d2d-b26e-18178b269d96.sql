ALTER TABLE public.product_agents
ADD COLUMN IF NOT EXISTS ai_model TEXT NOT NULL DEFAULT 'google/gemini-3-flash-preview';

COMMENT ON COLUMN public.product_agents.ai_model IS
'Modelo de IA usado por este agente (ex: google/gemini-3-flash-preview, openai/gpt-5, openai/gpt-5-mini). Usado pelo webchat-bot ao gerar respostas.';