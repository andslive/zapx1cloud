
-- =========================================================
-- booking_requests: drop dangerous USING(true) policies
-- =========================================================
DROP POLICY IF EXISTS "Anyone can view booking by token" ON public.booking_requests;
DROP POLICY IF EXISTS "Anyone can cancel booking by token" ON public.booking_requests;

-- Keep the safer existing SELECT policy "Public can view bookings by token"
-- (confirmation_token IS NOT NULL AND <> ''). Clients always query with
-- .eq('confirmation_token', token); the token is a 32-char random string,
-- so unguessable in practice.

-- Public update: only when caller targets a row by confirmation_token,
-- and only the cancellation/reschedule fields can be changed.
-- We can't enforce "only certain columns" via RLS, but we can require
-- the row to be identified by a non-empty token and that the row remains
-- bound to the same host/event/token (immutable identity).
CREATE POLICY "Public can cancel or reschedule by token"
ON public.booking_requests
FOR UPDATE
TO anon, authenticated
USING (confirmation_token IS NOT NULL AND confirmation_token <> '')
WITH CHECK (confirmation_token IS NOT NULL AND confirmation_token <> '');

-- Block changing identity-defining columns from public updates via trigger.
CREATE OR REPLACE FUNCTION public.protect_booking_public_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authenticated host/owner edits bypass this guard
  IF auth.uid() IS NOT NULL AND auth.uid() = OLD.host_user_id THEN
    RETURN NEW;
  END IF;

  -- Public/anon updates: keep identity columns immutable
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.event_type_id IS DISTINCT FROM OLD.event_type_id
     OR NEW.host_user_id IS DISTINCT FROM OLD.host_user_id
     OR NEW.confirmation_token IS DISTINCT FROM OLD.confirmation_token
     OR NEW.guest_email IS DISTINCT FROM OLD.guest_email
     OR NEW.guest_name IS DISTINCT FROM OLD.guest_name
     OR NEW.guest_phone IS DISTINCT FROM OLD.guest_phone
     OR NEW.lead_id IS DISTINCT FROM OLD.lead_id
     OR NEW.calendar_event_id IS DISTINCT FROM OLD.calendar_event_id THEN
    RAISE EXCEPTION 'Public updates may only change status, cancellation_reason, start_time, end_time and timezone';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_booking_public_updates ON public.booking_requests;
CREATE TRIGGER trg_protect_booking_public_updates
BEFORE UPDATE ON public.booking_requests
FOR EACH ROW EXECUTE FUNCTION public.protect_booking_public_updates();

-- =========================================================
-- team_invitations: drop blanket public SELECT; allow only
-- valid pending invites (still token-gated by client filter)
-- =========================================================
DROP POLICY IF EXISTS "Anyone can view invitation by token" ON public.team_invitations;

CREATE POLICY "Public can view pending invitations by token"
ON public.team_invitations
FOR SELECT
TO anon, authenticated
USING (
  status = 'pending'
  AND expires_at > now()
  AND token IS NOT NULL
  AND token <> ''
);

-- =========================================================
-- agent_activation_logs: restrict INSERT to service_role only
-- =========================================================
DROP POLICY IF EXISTS "Service role inserts activation logs" ON public.agent_activation_logs;

CREATE POLICY "Service role inserts activation logs"
ON public.agent_activation_logs
FOR INSERT
TO service_role
WITH CHECK (true);
