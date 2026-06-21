
-- Create user_permissions table
CREATE TABLE public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Inbox / Conversas
  view_queue_conversations BOOLEAN DEFAULT false,
  view_other_users_conversations BOOLEAN DEFAULT false,
  view_other_queues_conversations BOOLEAN DEFAULT false,
  allow_close_pending_tickets BOOLEAN DEFAULT true,
  
  -- CRM / Leads
  view_all_contacts BOOLEAN DEFAULT false,
  allow_pipeline BOOLEAN DEFAULT false,
  allow_manage_client_portfolio BOOLEAN DEFAULT false,
  
  -- Kanban
  view_all_kanban_cards BOOLEAN DEFAULT false,
  
  -- Calendário
  view_all_schedules BOOLEAN DEFAULT false,
  
  -- Painéis
  allow_dashboard BOOLEAN DEFAULT false,
  allow_inbox_panel BOOLEAN DEFAULT false,
  
  -- Grupos / Squads
  allow_groups BOOLEAN DEFAULT false,
  
  -- Conexões
  allow_connection_actions BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Own user can read their permissions
CREATE POLICY "Users can view own permissions"
ON public.user_permissions FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Admins/managers can manage permissions in their org
CREATE POLICY "Admins can manage permissions"
ON public.user_permissions FOR ALL
TO authenticated
USING (
  organization_id = public.get_user_organization(auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
)
WITH CHECK (
  organization_id = public.get_user_organization(auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);

-- Super admins can manage all
CREATE POLICY "Super admins can manage all permissions"
ON public.user_permissions FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Function to initialize permissions based on role
CREATE OR REPLACE FUNCTION public.initialize_user_permissions(p_user_id uuid, p_organization_id uuid, p_role text DEFAULT 'seller')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_permissions (user_id, organization_id,
    view_queue_conversations, view_other_users_conversations, view_other_queues_conversations,
    allow_close_pending_tickets, view_all_contacts, allow_pipeline,
    allow_manage_client_portfolio, view_all_kanban_cards, view_all_schedules,
    allow_dashboard, allow_inbox_panel, allow_groups, allow_connection_actions)
  VALUES (
    p_user_id, p_organization_id,
    CASE WHEN p_role IN ('admin') THEN true WHEN p_role = 'manager' THEN true ELSE false END,
    CASE WHEN p_role IN ('admin') THEN true WHEN p_role = 'manager' THEN true ELSE false END,
    CASE WHEN p_role IN ('admin') THEN true WHEN p_role = 'manager' THEN true ELSE false END,
    true,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role = 'admin' THEN true ELSE false END
  )
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- Update accept_invitation to also initialize permissions
CREATE OR REPLACE FUNCTION public.accept_invitation(invitation_token text, user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
BEGIN
  SELECT * INTO inv FROM team_invitations 
  WHERE token = invitation_token 
  AND status = 'pending' 
  AND expires_at > now();
  
  IF inv IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Update profile with organization
  UPDATE profiles 
  SET organization_id = inv.organization_id 
  WHERE id = user_id;
  
  -- Add user role
  INSERT INTO user_roles (user_id, role)
  VALUES (user_id, inv.role)
  ON CONFLICT DO NOTHING;
  
  -- Add to squad if specified
  IF inv.squad_id IS NOT NULL THEN
    INSERT INTO squad_members (squad_id, user_id, role)
    VALUES (inv.squad_id, user_id, 'member')
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Initialize permissions based on role
  PERFORM public.initialize_user_permissions(user_id, inv.organization_id, inv.role::text);
  
  -- Mark invitation as accepted
  UPDATE team_invitations 
  SET status = 'accepted' 
  WHERE id = inv.id;
  
  RETURN TRUE;
END;
$$;
