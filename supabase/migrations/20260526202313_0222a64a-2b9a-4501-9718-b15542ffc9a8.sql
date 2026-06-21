
-- 1) booking_requests: remove broad anon UPDATE (token validation must be server-side)
DROP POLICY IF EXISTS "Public can cancel or reschedule by token" ON public.booking_requests;

-- 2) team_invitations: remove broad anon SELECT (token validation must be server-side via edge fn)
DROP POLICY IF EXISTS "Public can view pending invitations by token" ON public.team_invitations;

-- 3) user_availability: restrict SELECT to org members
DROP POLICY IF EXISTS "Anyone can view user availability" ON public.user_availability;
CREATE POLICY "Org members can view user availability"
ON public.user_availability
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_availability.user_id
      AND p.organization_id = public.get_user_organization(auth.uid())
  )
  OR user_id = auth.uid()
);

-- 4) webchat_messages: enforce org membership on INSERT
DROP POLICY IF EXISTS "Users can insert messages to their org conversations" ON public.webchat_messages;
CREATE POLICY "Users can insert messages to their org conversations"
ON public.webchat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.webchat_conversations c
    WHERE c.id = webchat_messages.conversation_id
      AND c.organization_id = public.get_user_organization(auth.uid())
  )
);
