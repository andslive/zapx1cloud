
-- 1) Add accepted_at column for audit
ALTER TABLE public.webchat_conversations
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS accepted_by UUID NULL;

-- 2) Helper function: sectors for a user
CREATE OR REPLACE FUNCTION public.user_sector_ids(_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sector_id FROM public.sector_members WHERE user_id = _user_id;
$$;

-- 3) RLS already exists for webchat_conversations; add a permissive policy for sector members to read queue items.
-- Skip if already in place. We rely on edge function service role for now; UI fetch goes through edge function.

-- 4) Backfill: any bot_active conversation with no assigned user and no inbound msg in 6h goes to waiting_human
-- (conservative: only those missing assigned_user_id)
UPDATE public.webchat_conversations
SET status = 'waiting_human'
WHERE status = 'bot_active'
  AND assigned_user_id IS NULL
  AND (last_message_at IS NULL OR last_message_at < now() - interval '6 hours');
