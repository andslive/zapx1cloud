-- Tabela para armazenar integrações do Facebook Lead Ads
CREATE TABLE public.facebook_lead_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  
  -- Configuração do Facebook
  page_id TEXT NOT NULL,
  page_name TEXT,
  page_access_token TEXT NOT NULL,
  app_secret TEXT,
  verify_token TEXT NOT NULL,
  
  -- Mapeamento de campos
  field_mapping JSONB DEFAULT '{"full_name": "name", "email": "email", "phone_number": "phone"}',
  
  -- Configuração de distribuição
  distribution_rule TEXT DEFAULT 'manual',
  assigned_user_id UUID REFERENCES public.profiles(id),
  assigned_squad_id UUID REFERENCES public.sales_squads(id),
  default_temperature TEXT DEFAULT 'hot',
  default_tags TEXT[] DEFAULT '{}',
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_lead_received_at TIMESTAMPTZ,
  leads_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX idx_fb_integrations_page ON public.facebook_lead_integrations(page_id);
CREATE INDEX idx_fb_integrations_org ON public.facebook_lead_integrations(organization_id);
CREATE INDEX idx_fb_integrations_product ON public.facebook_lead_integrations(product_id);

-- Tabela de logs de leads recebidos
CREATE TABLE public.facebook_lead_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID REFERENCES public.facebook_lead_integrations(id) ON DELETE CASCADE,
  leadgen_id TEXT NOT NULL,
  form_id TEXT,
  ad_id TEXT,
  campaign_id TEXT,
  raw_payload JSONB,
  lead_data JSONB,
  lead_id UUID REFERENCES public.leads(id),
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_fb_logs_integration ON public.facebook_lead_logs(integration_id);
CREATE INDEX idx_fb_logs_leadgen ON public.facebook_lead_logs(leadgen_id);
CREATE INDEX idx_fb_logs_status ON public.facebook_lead_logs(status);

-- Enable RLS
ALTER TABLE public.facebook_lead_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_lead_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies para facebook_lead_integrations
CREATE POLICY "Users can view their org integrations"
ON public.facebook_lead_integrations FOR SELECT
USING (
  organization_id = public.get_user_organization(auth.uid())
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "Admins can insert integrations"
ON public.facebook_lead_integrations FOR INSERT
WITH CHECK (
  organization_id = public.get_user_organization(auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
);

CREATE POLICY "Admins can update integrations"
ON public.facebook_lead_integrations FOR UPDATE
USING (
  organization_id = public.get_user_organization(auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
);

CREATE POLICY "Admins can delete integrations"
ON public.facebook_lead_integrations FOR DELETE
USING (
  organization_id = public.get_user_organization(auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
);

-- RLS Policies para facebook_lead_logs
CREATE POLICY "Users can view their org logs"
ON public.facebook_lead_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.facebook_lead_integrations fi
    WHERE fi.id = facebook_lead_logs.integration_id
    AND (
      fi.organization_id = public.get_user_organization(auth.uid())
      OR public.is_super_admin(auth.uid())
    )
  )
);

-- Trigger para updated_at
CREATE TRIGGER update_facebook_lead_integrations_updated_at
  BEFORE UPDATE ON public.facebook_lead_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();