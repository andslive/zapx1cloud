
ALTER TABLE public.webchat_conversations
  ADD COLUMN IF NOT EXISTS bot_locked_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_webchat_conversations_bot_lock
  ON public.webchat_conversations (id)
  WHERE bot_locked_until IS NOT NULL;

CREATE OR REPLACE FUNCTION public.try_lock_bot(p_conv uuid, p_ttl_seconds int DEFAULT 20)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.webchat_conversations
     SET bot_locked_until = now() + make_interval(secs => p_ttl_seconds)
   WHERE id = p_conv
     AND (bot_locked_until IS NULL OR bot_locked_until < now())
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_bot_lock(p_conv uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.webchat_conversations
     SET bot_locked_until = NULL
   WHERE id = p_conv;
$$;
