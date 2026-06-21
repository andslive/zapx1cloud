
-- Tabela de valores por etapa do funil
CREATE TABLE public.stage_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  expected_value NUMERIC DEFAULT 0,
  probability_percent NUMERIC DEFAULT 0 CHECK (probability_percent >= 0 AND probability_percent <= 100),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(stage_id)
);

-- Tabela de regras de comissão
CREATE TABLE public.commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL DEFAULT 'percentage' CHECK (rule_type IN ('percentage', 'fixed')),
  base_value NUMERIC NOT NULL DEFAULT 10,
  min_value NUMERIC DEFAULT 0,
  max_value NUMERIC,
  applies_to TEXT DEFAULT 'deal' CHECK (applies_to IN ('deal', 'stage')),
  stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  is_default BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de negócios fechados
CREATE TABLE public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_value NUMERIC NOT NULL,
  status TEXT DEFAULT 'won' CHECK (status IN ('won', 'lost', 'cancelled')),
  notes TEXT,
  closed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de comissões
CREATE TABLE public.commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  percentage_applied NUMERIC,
  rule_id UUID REFERENCES public.commission_rules(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
  earned_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  paid_at TIMESTAMPTZ,
  paid_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.stage_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies para stage_values
CREATE POLICY "Users can view stage values of their org products"
ON public.stage_values FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = stage_values.product_id
  AND p.organization_id = get_user_organization(auth.uid())
));

CREATE POLICY "Admins and managers can manage stage values"
ON public.stage_values FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = stage_values.product_id
    AND p.organization_id = get_user_organization(auth.uid())
  )
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
);

-- RLS Policies para commission_rules
CREATE POLICY "Users can view commission rules of their org"
ON public.commission_rules FOR SELECT
USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Admins and managers can manage commission rules"
ON public.commission_rules FOR ALL
USING (
  organization_id = get_user_organization(auth.uid())
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
);

-- RLS Policies para deals
CREATE POLICY "Users can view deals in their org"
ON public.deals FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid())
  AND (
    seller_id = auth.uid()
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'manager')
  )
);

CREATE POLICY "Users can insert deals"
ON public.deals FOR INSERT
WITH CHECK (
  organization_id = get_user_organization(auth.uid())
);

CREATE POLICY "Admins and managers can update deals"
ON public.deals FOR UPDATE
USING (
  organization_id = get_user_organization(auth.uid())
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
);

-- RLS Policies para commissions
CREATE POLICY "Users can view their commissions"
ON public.commissions FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid())
  AND (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'manager')
  )
);

CREATE POLICY "System can insert commissions"
ON public.commissions FOR INSERT
WITH CHECK (
  organization_id = get_user_organization(auth.uid())
);

CREATE POLICY "Admins and managers can update commissions"
ON public.commissions FOR UPDATE
USING (
  organization_id = get_user_organization(auth.uid())
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
);

-- Triggers para updated_at
CREATE TRIGGER update_stage_values_updated_at
  BEFORE UPDATE ON public.stage_values
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_commission_rules_updated_at
  BEFORE UPDATE ON public.commission_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Função para calcular comissão automaticamente
CREATE OR REPLACE FUNCTION public.calculate_commission(
  p_deal_id UUID,
  p_deal_value NUMERIC,
  p_product_id UUID,
  p_seller_id UUID,
  p_organization_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule RECORD;
  v_commission NUMERIC;
BEGIN
  -- Buscar regra específica do vendedor ou regra padrão
  SELECT * INTO v_rule
  FROM public.commission_rules
  WHERE product_id = p_product_id
    AND organization_id = p_organization_id
    AND is_active = true
    AND (user_id = p_seller_id OR (user_id IS NULL AND is_default = true))
  ORDER BY user_id NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Calcular comissão baseado no tipo de regra
  IF v_rule.rule_type = 'percentage' THEN
    v_commission := p_deal_value * (v_rule.base_value / 100);
  ELSE
    v_commission := v_rule.base_value;
  END IF;

  -- Aplicar limites min/max
  IF v_rule.min_value IS NOT NULL AND v_commission < v_rule.min_value THEN
    v_commission := v_rule.min_value;
  END IF;
  
  IF v_rule.max_value IS NOT NULL AND v_commission > v_rule.max_value THEN
    v_commission := v_rule.max_value;
  END IF;

  -- Inserir registro de comissão
  INSERT INTO public.commissions (
    deal_id, user_id, product_id, organization_id, 
    amount, percentage_applied, rule_id, status
  ) VALUES (
    p_deal_id, p_seller_id, p_product_id, p_organization_id,
    v_commission, v_rule.base_value, v_rule.id, 'pending'
  );

  RETURN v_commission;
END;
$$;
