
-- 1) Colunas novas em organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ai_grouping_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_grouping_window_ms integer NOT NULL DEFAULT 3000,
  ADD COLUMN IF NOT EXISTS ai_grouping_max_ms integer NOT NULL DEFAULT 8000,
  ADD COLUMN IF NOT EXISTS ai_typing_min_ms integer NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS ai_typing_max_ms integer NOT NULL DEFAULT 7000,
  ADD COLUMN IF NOT EXISTS ai_dedup_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_dedup_window_ms integer NOT NULL DEFAULT 120000,
  ADD COLUMN IF NOT EXISTS ai_single_processing_per_conversation boolean NOT NULL DEFAULT true;

-- Migra valores antigos de ai_debounce_ms (>8s) para 3s para o novo campo
UPDATE public.organizations
SET ai_grouping_window_ms = 3000
WHERE ai_debounce_ms IS NOT NULL AND ai_debounce_ms > 8000;

UPDATE public.organizations
SET ai_grouping_window_ms = LEAST(GREATEST(ai_debounce_ms, 0), 8000)
WHERE ai_debounce_ms IS NOT NULL AND ai_debounce_ms BETWEEN 0 AND 8000;

-- 2) processed_messages (dedup webhook)
CREATE TABLE IF NOT EXISTS public.processed_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid,
  remote_jid text,
  message_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS processed_messages_uniq
  ON public.processed_messages (instance_id, message_id);
CREATE INDEX IF NOT EXISTS processed_messages_created_at_idx
  ON public.processed_messages (created_at);
ALTER TABLE public.processed_messages ENABLE ROW LEVEL SECURITY;

-- 3) sent_responses (dedup resposta)
CREATE TABLE IF NOT EXISTS public.sent_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  response_hash text NOT NULL,
  response_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sent_responses_conv_created_idx
  ON public.sent_responses (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sent_responses_created_at_idx
  ON public.sent_responses (created_at);
ALTER TABLE public.sent_responses ENABLE ROW LEVEL SECURITY;

-- 4) conversation_processing_locks (trava por conversa)
CREATE TABLE IF NOT EXISTS public.conversation_processing_locks (
  conversation_id uuid PRIMARY KEY,
  locked_until timestamptz NOT NULL,
  locked_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conv_locks_locked_until_idx
  ON public.conversation_processing_locks (locked_until);
ALTER TABLE public.conversation_processing_locks ENABLE ROW LEVEL SECURITY;

-- Sem policies: tabelas só acessadas via service_role (edge functions)
