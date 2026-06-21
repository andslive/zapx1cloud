-- Create team invitations table
CREATE TABLE public.team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'seller',
  squad_id UUID REFERENCES public.sales_squads(id) ON DELETE SET NULL,
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_team_invitations_token ON public.team_invitations(token);
CREATE INDEX idx_team_invitations_email ON public.team_invitations(email);
CREATE INDEX idx_team_invitations_organization ON public.team_invitations(organization_id);

-- Enable RLS
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

-- Admins and managers can manage invitations in their org
CREATE POLICY "Admins and managers can manage invitations"
ON public.team_invitations
FOR ALL
USING (
  organization_id = get_user_organization(auth.uid()) 
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
);

-- Anyone can view invitation by token (for accepting)
CREATE POLICY "Anyone can view invitation by token"
ON public.team_invitations
FOR SELECT
USING (true);

-- Function to accept invitation
CREATE OR REPLACE FUNCTION public.accept_invitation(invitation_token TEXT, user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
BEGIN
  -- Get the invitation
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
  
  -- Mark invitation as accepted
  UPDATE team_invitations 
  SET status = 'accepted' 
  WHERE id = inv.id;
  
  RETURN TRUE;
END;
$$;