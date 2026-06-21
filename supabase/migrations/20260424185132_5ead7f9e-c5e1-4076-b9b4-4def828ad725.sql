
-- 1. Tabela platform_plans
CREATE TABLE public.platform_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,

  price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_yearly NUMERIC(10,2) NOT NULL DEFAULT 0,
  trial_days INTEGER NOT NULL DEFAULT 7,
  grace_period_days INTEGER NOT NULL DEFAULT 3,

  -- Limites
  max_users INTEGER NOT NULL DEFAULT 5,
  max_connections INTEGER NOT NULL DEFAULT 1,
  max_sectors INTEGER NOT NULL DEFAULT 3,
  max_products INTEGER NOT NULL DEFAULT 5,
  max_contacts INTEGER NOT NULL DEFAULT 1000,
  max_messages_month INTEGER NOT NULL DEFAULT 5000,
  max_ai_tokens_month INTEGER NOT NULL DEFAULT 100000,

  -- Features (canais)
  feature_whatsapp BOOLEAN NOT NULL DEFAULT true,
  feature_facebook BOOLEAN NOT NULL DEFAULT false,
  feature_instagram BOOLEAN NOT NULL DEFAULT false,
  feature_campaigns BOOLEAN NOT NULL DEFAULT false,
  feature_scheduling BOOLEAN NOT NULL DEFAULT true,
  feature_internal_chat BOOLEAN NOT NULL DEFAULT true,
  feature_external_api BOOLEAN NOT NULL DEFAULT false,
  feature_kanban BOOLEAN NOT NULL DEFAULT true,
  feature_pipeline BOOLEAN NOT NULL DEFAULT true,
  feature_integrations BOOLEAN NOT NULL DEFAULT false,
  feature_audio_transcription_ai BOOLEAN NOT NULL DEFAULT false,
  feature_text_correction_ai BOOLEAN NOT NULL DEFAULT false,
  feature_ai_agents BOOLEAN NOT NULL DEFAULT false,
  feature_voice_agents BOOLEAN NOT NULL DEFAULT false,
  feature_outreach BOOLEAN NOT NULL DEFAULT false,
  feature_capture_funnels BOOLEAN NOT NULL DEFAULT false,
  feature_forms BOOLEAN NOT NULL DEFAULT true,
  feature_webhooks BOOLEAN NOT NULL DEFAULT false,

  extra_features JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_plans_active ON public.platform_plans(is_active, display_order);

-- RLS
ALTER TABLE public.platform_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view active plans"
  ON public.platform_plans FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admins can insert plans"
  ON public.platform_plans FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update plans"
  ON public.platform_plans FOR UPDATE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete plans"
  ON public.platform_plans FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Trigger updated_at
CREATE TRIGGER update_platform_plans_updated_at
  BEFORE UPDATE ON public.platform_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Adicionar plan_id em organizations e subscriptions
ALTER TABLE public.organizations
  ADD COLUMN plan_id UUID REFERENCES public.platform_plans(id) ON DELETE SET NULL;

ALTER TABLE public.subscriptions
  ADD COLUMN plan_id UUID REFERENCES public.platform_plans(id) ON DELETE SET NULL;

-- 3. Seeds iniciais
INSERT INTO public.platform_plans (
  name, slug, description, is_public, is_active, is_default, display_order,
  price_monthly, price_yearly, trial_days, grace_period_days,
  max_users, max_connections, max_sectors, max_products, max_contacts, max_messages_month, max_ai_tokens_month,
  feature_whatsapp, feature_facebook, feature_instagram, feature_campaigns, feature_scheduling,
  feature_internal_chat, feature_external_api, feature_kanban, feature_pipeline, feature_integrations,
  feature_audio_transcription_ai, feature_text_correction_ai, feature_ai_agents, feature_voice_agents,
  feature_outreach, feature_capture_funnels, feature_forms, feature_webhooks
) VALUES
('Starter', 'starter', 'Para times pequenos começando agora', true, true, true, 1,
 97.00, 970.00, 7, 3,
 3, 1, 2, 3, 500, 2000, 50000,
 true, false, false, false, true,
 true, false, true, true, false,
 false, false, false, false,
 false, false, true, false),
('Pro', 'pro', 'Para empresas em crescimento com múltiplos canais', true, true, false, 2,
 297.00, 2970.00, 7, 5,
 10, 3, 5, 10, 5000, 15000, 300000,
 true, true, true, true, true,
 true, true, true, true, true,
 true, true, true, false,
 true, true, true, true),
('Enterprise', 'enterprise', 'Para operações de grande porte com IA avançada', true, true, false, 3,
 997.00, 9970.00, 14, 10,
 50, 10, 20, 50, 50000, 100000, 2000000,
 true, true, true, true, true,
 true, true, true, true, true,
 true, true, true, true,
 true, true, true, true);

-- 4. Função para limites efetivos
CREATE OR REPLACE FUNCTION public.get_organization_effective_limits(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org RECORD;
  v_plan RECORD;
  v_result JSONB;
BEGIN
  SELECT * INTO v_org FROM public.organizations WHERE id = p_org_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_org.plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.platform_plans WHERE id = v_org.plan_id;
  END IF;

  v_result := jsonb_build_object(
    'plan_id', v_org.plan_id,
    'plan_name', COALESCE(v_plan.name, 'Personalizado'),
    'plan_slug', COALESCE(v_plan.slug, 'custom'),
    'limits', jsonb_build_object(
      'max_users', COALESCE(v_org.max_users, v_plan.max_users, 5),
      'max_connections', COALESCE(v_plan.max_connections, 1),
      'max_sectors', COALESCE(v_plan.max_sectors, 3),
      'max_products', COALESCE(v_org.max_products, v_plan.max_products, 5),
      'max_contacts', COALESCE(v_plan.max_contacts, 1000),
      'max_messages_month', COALESCE(v_plan.max_messages_month, 5000),
      'max_ai_tokens_month', COALESCE(v_plan.max_ai_tokens_month, 100000)
    ),
    'features', COALESCE(v_org.features, '{}'::jsonb) || jsonb_build_object(
      'whatsapp', COALESCE(v_plan.feature_whatsapp, true),
      'facebook', COALESCE(v_plan.feature_facebook, false),
      'instagram', COALESCE(v_plan.feature_instagram, false),
      'campaigns', COALESCE(v_plan.feature_campaigns, false),
      'scheduling', COALESCE(v_plan.feature_scheduling, true),
      'internal_chat', COALESCE(v_plan.feature_internal_chat, true),
      'external_api', COALESCE(v_plan.feature_external_api, false),
      'kanban', COALESCE(v_plan.feature_kanban, true),
      'pipeline', COALESCE(v_plan.feature_pipeline, true),
      'integrations', COALESCE(v_plan.feature_integrations, false),
      'audio_transcription_ai', COALESCE(v_plan.feature_audio_transcription_ai, false),
      'text_correction_ai', COALESCE(v_plan.feature_text_correction_ai, false),
      'ai_agents', COALESCE(v_plan.feature_ai_agents, false),
      'voice_agents', COALESCE(v_plan.feature_voice_agents, false),
      'outreach', COALESCE(v_plan.feature_outreach, false),
      'capture_funnels', COALESCE(v_plan.feature_capture_funnels, false),
      'forms', COALESCE(v_plan.feature_forms, true),
      'webhooks', COALESCE(v_plan.feature_webhooks, false)
    ) || COALESCE(v_plan.extra_features, '{}'::jsonb)
  );

  RETURN v_result;
END;
$$;
