-- 1. Tabela evolution_instances
CREATE TABLE public.evolution_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  instance_id text,
  instance_token text,
  phone_number text,
  status text NOT NULL DEFAULT 'disconnected',
  qr_code text,
  qr_code_updated_at timestamptz,
  webhook_subscribed boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  last_connected_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_evolution_instances_org ON public.evolution_instances(organization_id);
CREATE INDEX idx_evolution_instances_instance_id ON public.evolution_instances(instance_id);
CREATE UNIQUE INDEX idx_evolution_instances_one_default
  ON public.evolution_instances(organization_id) WHERE is_default = true;

-- 2. Coluna em webchat_conversations
ALTER TABLE public.webchat_conversations
  ADD COLUMN IF NOT EXISTS evolution_instance_id uuid REFERENCES public.evolution_instances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_webchat_conversations_evolution_instance
  ON public.webchat_conversations(evolution_instance_id);

-- 3. RLS
ALTER TABLE public.evolution_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and managers can view evolution instances"
ON public.evolution_instances FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.user_belongs_to_organization(auth.uid(), organization_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  )
);

CREATE POLICY "Admins and managers can insert evolution instances"
ON public.evolution_instances FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    public.user_belongs_to_organization(auth.uid(), organization_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  )
);

CREATE POLICY "Admins and managers can update evolution instances"
ON public.evolution_instances FOR UPDATE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.user_belongs_to_organization(auth.uid(), organization_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  )
);

CREATE POLICY "Admins and managers can delete evolution instances"
ON public.evolution_instances FOR DELETE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.user_belongs_to_organization(auth.uid(), organization_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  )
);

-- 4. Trigger updated_at
CREATE TRIGGER update_evolution_instances_updated_at
BEFORE UPDATE ON public.evolution_instances
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();