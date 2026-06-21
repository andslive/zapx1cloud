
-- Remove overly permissive service role policy (service role bypasses RLS by default)
DROP POLICY IF EXISTS "Service role full access to outreach" ON public.ai_outreach_queue;
