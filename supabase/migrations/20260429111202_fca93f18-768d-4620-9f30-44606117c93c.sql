CREATE TABLE public.post_sale_event_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  target_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  email_template_id uuid REFERENCES public.email_templates(id) ON DELETE SET NULL,
  agent_id uuid REFERENCES public.product_agents(id) ON DELETE SET NULL,
  agent_objective text,
  agent_extra_context text,
  notify_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_sale_event_actions_event_check CHECK (
    event_type IN (
      'compra_aprovada','pix_gerado','boleto_gerado',
      'checkout_abandonado','reembolso','chargeback','assinatura_cancelada'
    )
  ),
  CONSTRAINT post_sale_event_actions_unique UNIQUE (organization_id, product_id, event_type)
);

CREATE INDEX idx_post_sale_actions_org_event ON public.post_sale_event_actions(organization_id, event_type) WHERE is_active = true;
CREATE INDEX idx_post_sale_actions_product ON public.post_sale_event_actions(product_id, event_type) WHERE is_active = true;

ALTER TABLE public.post_sale_event_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acoes pos-venda visiveis pela organizacao"
  ON public.post_sale_event_actions FOR SELECT
  USING (
    is_super_admin(auth.uid())
    OR user_belongs_to_organization(auth.uid(), organization_id)
  );

CREATE POLICY "Admins gerenciam acoes pos-venda"
  ON public.post_sale_event_actions FOR ALL
  USING (
    is_super_admin(auth.uid())
    OR (
      user_belongs_to_organization(auth.uid(), organization_id)
      AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
    )
  )
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (
      user_belongs_to_organization(auth.uid(), organization_id)
      AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
    )
  );

CREATE TRIGGER update_post_sale_event_actions_updated_at
  BEFORE UPDATE ON public.post_sale_event_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();