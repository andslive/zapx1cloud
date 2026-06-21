ALTER TABLE public.webchat_conversations
  ADD COLUMN IF NOT EXISTS flow_source text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'webchat_conversations_flow_source_check'
  ) THEN
    ALTER TABLE public.webchat_conversations
      ADD CONSTRAINT webchat_conversations_flow_source_check
      CHECK (flow_source IS NULL OR flow_source IN ('chat_flow','funnel'));
  END IF;
END $$;