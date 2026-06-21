
-- 1. booking_requests: drop public SELECT, replace with SECURITY DEFINER RPC
DROP POLICY IF EXISTS "Public can view bookings by token" ON public.booking_requests;

CREATE OR REPLACE FUNCTION public.get_booking_by_token(p_token text)
RETURNS TABLE (
  id uuid,
  guest_name text,
  guest_email text,
  guest_phone text,
  start_time timestamptz,
  end_time timestamptz,
  timezone text,
  status text,
  confirmation_token text,
  additional_info jsonb,
  created_at timestamptz,
  event_type_id uuid,
  host_user_id uuid,
  calendar_event_id uuid,
  organization_id uuid,
  cancellation_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    br.id,
    br.guest_name,
    br.guest_email,
    br.guest_phone,
    br.start_time,
    br.end_time,
    br.timezone,
    br.status::text,
    br.confirmation_token,
    br.additional_info,
    br.created_at,
    br.event_type_id,
    br.host_user_id,
    br.calendar_event_id,
    br.organization_id,
    br.cancellation_reason
  FROM public.booking_requests br
  WHERE p_token IS NOT NULL
    AND length(p_token) >= 16
    AND br.confirmation_token = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_booking_by_token(text) TO anon, authenticated;

-- 2. agent_action_logs: restrict INSERT to service_role only
DROP POLICY IF EXISTS "Service role can insert action logs" ON public.agent_action_logs;

CREATE POLICY "Service role can insert action logs"
  ON public.agent_action_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 3. availability_overrides: restrict SELECT to org members
DROP POLICY IF EXISTS "Anyone can view availability overrides" ON public.availability_overrides;

CREATE POLICY "Org members can view availability overrides"
  ON public.availability_overrides
  FOR SELECT
  TO authenticated
  USING (public.user_belongs_to_organization(auth.uid(), organization_id));
