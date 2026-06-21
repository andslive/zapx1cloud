
-- =============================================
-- BIZON AUTO DISPATCH - Database Migration
-- =============================================

-- 1. User Status table (real-time availability)
CREATE TABLE public.user_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'away', 'offline')),
  last_status_change timestamptz NOT NULL DEFAULT now(),
  active_leads_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.user_status ENABLE ROW LEVEL SECURITY;

-- Users in same org can view all statuses
CREATE POLICY "Users can view statuses in their org"
ON public.user_status FOR SELECT
TO authenticated
USING (public.user_belongs_to_organization(auth.uid(), organization_id));

-- Users can only update their own status
CREATE POLICY "Users can update own status"
ON public.user_status FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

-- Users can insert their own status
CREATE POLICY "Users can insert own status"
ON public.user_status FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_status;

-- 2. Lead Queue table (pending leads waiting for assignment)
CREATE TABLE public.lead_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  squad_id uuid REFERENCES public.sales_squads(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  priority integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'expired')),
  queued_at timestamptz NOT NULL DEFAULT now(),
  assigned_at timestamptz,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE(lead_id)
);

ALTER TABLE public.lead_queue ENABLE ROW LEVEL SECURITY;

-- Admins/managers see all in org; sellers see their squad
CREATE POLICY "Admins can view all queue in org"
ON public.lead_queue FOR SELECT
TO authenticated
USING (
  public.user_belongs_to_organization(auth.uid(), organization_id)
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR squad_id IN (SELECT squad_id FROM public.squad_members WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Service role can manage queue"
ON public.lead_queue FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 3. Distribution Config table
CREATE TABLE public.distribution_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  squad_id uuid REFERENCES public.sales_squads(id) ON DELETE CASCADE,
  method text NOT NULL DEFAULT 'round_robin' CHECK (method IN ('round_robin', 'least_busy', 'performance')),
  round_robin_index integer NOT NULL DEFAULT 0,
  auto_reassign boolean NOT NULL DEFAULT true,
  max_accept_time_minutes integer DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(squad_id)
);

ALTER TABLE public.distribution_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view distribution config in org"
ON public.distribution_config FOR SELECT
TO authenticated
USING (public.user_belongs_to_organization(auth.uid(), organization_id));

CREATE POLICY "Admins can manage distribution config"
ON public.distribution_config FOR ALL
TO authenticated
USING (
  public.user_belongs_to_organization(auth.uid(), organization_id)
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);

-- 4. DB Function: distribute_lead
CREATE OR REPLACE FUNCTION public.distribute_lead(
  p_lead_id uuid,
  p_squad_id uuid,
  p_organization_id uuid,
  p_product_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_config RECORD;
  v_member RECORD;
  v_assigned_user_id uuid;
  v_members uuid[];
  v_idx integer;
BEGIN
  -- Get distribution config for this squad
  SELECT * INTO v_config
  FROM distribution_config
  WHERE squad_id = p_squad_id AND organization_id = p_organization_id;

  -- Default to round_robin if no config
  IF NOT FOUND THEN
    INSERT INTO distribution_config (organization_id, squad_id, method)
    VALUES (p_organization_id, p_squad_id, 'round_robin')
    RETURNING * INTO v_config;
  END IF;

  -- Get online members of this squad
  SELECT ARRAY_AGG(sm.user_id ORDER BY sm.user_id) INTO v_members
  FROM squad_members sm
  JOIN user_status us ON us.user_id = sm.user_id
  WHERE sm.squad_id = p_squad_id
    AND us.status = 'online'
    AND us.organization_id = p_organization_id;

  -- No online members? Queue the lead
  IF v_members IS NULL OR array_length(v_members, 1) IS NULL THEN
    INSERT INTO lead_queue (lead_id, organization_id, squad_id, product_id, status)
    VALUES (p_lead_id, p_organization_id, p_squad_id, p_product_id, 'pending')
    ON CONFLICT (lead_id) DO NOTHING;
    RETURN NULL;
  END IF;

  -- Apply distribution method
  IF v_config.method = 'round_robin' THEN
    v_idx := v_config.round_robin_index % array_length(v_members, 1);
    v_assigned_user_id := v_members[v_idx + 1];
    -- Update round robin index
    UPDATE distribution_config SET round_robin_index = v_config.round_robin_index + 1
    WHERE id = v_config.id;

  ELSIF v_config.method = 'least_busy' THEN
    SELECT us.user_id INTO v_assigned_user_id
    FROM user_status us
    WHERE us.user_id = ANY(v_members) AND us.status = 'online'
    ORDER BY us.active_leads_count ASC
    LIMIT 1;

  ELSE -- performance or fallback to round_robin
    v_idx := v_config.round_robin_index % array_length(v_members, 1);
    v_assigned_user_id := v_members[v_idx + 1];
    UPDATE distribution_config SET round_robin_index = v_config.round_robin_index + 1
    WHERE id = v_config.id;
  END IF;

  -- Assign lead
  IF v_assigned_user_id IS NOT NULL THEN
    UPDATE leads SET assigned_to = v_assigned_user_id WHERE id = p_lead_id;
    -- Increment active leads count
    UPDATE user_status SET active_leads_count = active_leads_count + 1
    WHERE user_id = v_assigned_user_id;
    RETURN v_assigned_user_id;
  END IF;

  -- Fallback: queue
  INSERT INTO lead_queue (lead_id, organization_id, squad_id, product_id, status)
  VALUES (p_lead_id, p_organization_id, p_squad_id, p_product_id, 'pending')
  ON CONFLICT (lead_id) DO NOTHING;
  RETURN NULL;
END;
$$;

-- 5. DB Function: process_pending_queue
CREATE OR REPLACE FUNCTION public.process_pending_queue(p_user_id uuid)
RETURNS TABLE(assigned_lead_id uuid, assigned_squad_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_queue_item RECORD;
  v_user_squads uuid[];
BEGIN
  -- Get user's squads
  SELECT ARRAY_AGG(squad_id) INTO v_user_squads
  FROM squad_members WHERE user_id = p_user_id;

  IF v_user_squads IS NULL THEN
    RETURN;
  END IF;

  -- Find oldest pending lead in user's squads
  SELECT * INTO v_queue_item
  FROM lead_queue lq
  WHERE lq.squad_id = ANY(v_user_squads)
    AND lq.status = 'pending'
  ORDER BY lq.priority DESC, lq.queued_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Assign the lead
  UPDATE leads SET assigned_to = p_user_id WHERE id = v_queue_item.lead_id;

  -- Update queue
  UPDATE lead_queue SET
    status = 'assigned',
    assigned_to = p_user_id,
    assigned_at = now()
  WHERE id = v_queue_item.id;

  -- Increment active leads
  UPDATE user_status SET active_leads_count = active_leads_count + 1
  WHERE user_id = p_user_id;

  assigned_lead_id := v_queue_item.lead_id;
  assigned_squad_id := v_queue_item.squad_id;
  RETURN NEXT;
END;
$$;

-- Triggers for updated_at
CREATE TRIGGER update_user_status_updated_at
BEFORE UPDATE ON public.user_status
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_distribution_config_updated_at
BEFORE UPDATE ON public.distribution_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
