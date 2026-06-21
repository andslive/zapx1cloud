-- Integration settings table for API keys
CREATE TABLE public.integration_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  integration_type TEXT NOT NULL,
  api_key_masked TEXT,
  is_configured BOOLEAN DEFAULT false,
  settings JSONB DEFAULT '{}',
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, integration_type)
);

-- Email templates table
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  is_system BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, slug)
);

-- Mass email campaigns table
CREATE TABLE public.mass_email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'all',
  target_filters JSONB DEFAULT '{}',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'draft',
  stats JSONB DEFAULT '{"total": 0, "sent": 0, "failed": 0}',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Mass email recipients table
CREATE TABLE public.mass_email_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.mass_email_campaigns(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mass_email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mass_email_recipients ENABLE ROW LEVEL SECURITY;

-- RLS Policies for integration_settings
CREATE POLICY "Users can view their org integration settings"
ON public.integration_settings FOR SELECT
USING (public.user_belongs_to_organization(organization_id, auth.uid()));

CREATE POLICY "Admins can manage integration settings"
ON public.integration_settings FOR ALL
USING (
  public.user_belongs_to_organization(organization_id, auth.uid()) 
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- RLS Policies for email_templates
CREATE POLICY "Users can view their org email templates"
ON public.email_templates FOR SELECT
USING (public.user_belongs_to_organization(organization_id, auth.uid()));

CREATE POLICY "Admins can manage email templates"
ON public.email_templates FOR ALL
USING (
  public.user_belongs_to_organization(organization_id, auth.uid()) 
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- RLS Policies for mass_email_campaigns
CREATE POLICY "Users can view their org campaigns"
ON public.mass_email_campaigns FOR SELECT
USING (public.user_belongs_to_organization(organization_id, auth.uid()));

CREATE POLICY "Admins can manage campaigns"
ON public.mass_email_campaigns FOR ALL
USING (
  public.user_belongs_to_organization(organization_id, auth.uid()) 
  AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))
);

-- RLS Policies for mass_email_recipients
CREATE POLICY "Users can view their org recipients"
ON public.mass_email_recipients FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.mass_email_campaigns c 
    WHERE c.id = campaign_id 
    AND public.user_belongs_to_organization(c.organization_id, auth.uid())
  )
);

CREATE POLICY "Admins can manage recipients"
ON public.mass_email_recipients FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.mass_email_campaigns c 
    WHERE c.id = campaign_id 
    AND public.user_belongs_to_organization(c.organization_id, auth.uid())
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))
  )
);

-- Update timestamp triggers
CREATE TRIGGER update_integration_settings_updated_at
BEFORE UPDATE ON public.integration_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();