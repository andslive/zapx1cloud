CREATE TABLE IF NOT EXISTS public.agent_post_sale_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_event TEXT NOT NULL CHECK (trigger_event IN ('paid', 'abandoned', 'refunded')),
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Instrução natural pro agente seguir nesse cenário
  instruction TEXT NOT NULL,
  -- Links que o agente pode oferecer (ex: acesso, grupo, webinário)
  -- [{label, url, when_to_offer}]
  links JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Tags a aplicar automaticamente
  tags_to_apply TEXT[] NOT NULL DEFAULT '{}',
  -- Filtros opcionais: produto específico, valor mínimo, etc
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_post_sale_scenarios_org_event 
  ON public.agent_post_sale_scenarios(organization_id, trigger_event, is_active, priority DESC);

ALTER TABLE public.agent_post_sale_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/managers can view scenarios"
  ON public.agent_post_sale_scenarios FOR SELECT
  USING (
    public.user_belongs_to_organization(auth.uid(), organization_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

CREATE POLICY "Admins/managers can insert scenarios"
  ON public.agent_post_sale_scenarios FOR INSERT
  WITH CHECK (
    public.user_belongs_to_organization(auth.uid(), organization_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

CREATE POLICY "Admins/managers can update scenarios"
  ON public.agent_post_sale_scenarios FOR UPDATE
  USING (
    public.user_belongs_to_organization(auth.uid(), organization_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

CREATE POLICY "Admins/managers can delete scenarios"
  ON public.agent_post_sale_scenarios FOR DELETE
  USING (
    public.user_belongs_to_organization(auth.uid(), organization_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

CREATE TRIGGER trg_post_sale_scenarios_updated_at
  BEFORE UPDATE ON public.agent_post_sale_scenarios
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();