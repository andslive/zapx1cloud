-- 1. Credenciais de provedores de IA por organização
CREATE TABLE IF NOT EXISTS public.org_ai_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('openai','anthropic','gemini')),
  api_key_encrypted TEXT NOT NULL,
  api_key_masked TEXT,
  model_default TEXT,
  last_verified_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, provider)
);

ALTER TABLE public.org_ai_credentials ENABLE ROW LEVEL SECURITY;

-- Apenas admins/super-admins da própria org podem ver o status (sem acessar a chave decifrada)
CREATE POLICY "Org admins can view their AI credentials status"
ON public.org_ai_credentials FOR SELECT TO authenticated
USING (
  organization_id = public.get_user_organization(auth.uid())
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
);

CREATE POLICY "Org admins can insert AI credentials"
ON public.org_ai_credentials FOR INSERT TO authenticated
WITH CHECK (
  organization_id = public.get_user_organization(auth.uid())
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
);

CREATE POLICY "Org admins can update AI credentials"
ON public.org_ai_credentials FOR UPDATE TO authenticated
USING (
  organization_id = public.get_user_organization(auth.uid())
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
);

CREATE POLICY "Org admins can delete AI credentials"
ON public.org_ai_credentials FOR DELETE TO authenticated
USING (
  organization_id = public.get_user_organization(auth.uid())
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
);

CREATE TRIGGER update_org_ai_credentials_updated_at
BEFORE UPDATE ON public.org_ai_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Roteamento de IA por capacidade
CREATE TABLE IF NOT EXISTS public.org_ai_routing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  capability TEXT NOT NULL CHECK (capability IN (
    'agent_chat','sales_copilot','audio_transcription','image_vision',
    'content_generation','analysis_insights','embeddings'
  )),
  provider TEXT NOT NULL CHECK (provider IN ('lovable','openai','anthropic','gemini')),
  model TEXT,
  fallback_to_lovable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, capability)
);

ALTER TABLE public.org_ai_routing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view AI routing"
ON public.org_ai_routing FOR SELECT TO authenticated
USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Org admins can insert AI routing"
ON public.org_ai_routing FOR INSERT TO authenticated
WITH CHECK (
  organization_id = public.get_user_organization(auth.uid())
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
);

CREATE POLICY "Org admins can update AI routing"
ON public.org_ai_routing FOR UPDATE TO authenticated
USING (
  organization_id = public.get_user_organization(auth.uid())
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
);

CREATE POLICY "Org admins can delete AI routing"
ON public.org_ai_routing FOR DELETE TO authenticated
USING (
  organization_id = public.get_user_organization(auth.uid())
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
);

CREATE TRIGGER update_org_ai_routing_updated_at
BEFORE UPDATE ON public.org_ai_routing
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Auditoria de falhas do roteador
CREATE TABLE IF NOT EXISTS public.ai_router_failures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  capability TEXT NOT NULL,
  provider TEXT NOT NULL,
  status_code INT,
  error_message TEXT,
  fell_back_to TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_router_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can view router failures"
ON public.ai_router_failures FOR SELECT TO authenticated
USING (
  organization_id = public.get_user_organization(auth.uid())
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
);

CREATE INDEX IF NOT EXISTS idx_ai_router_failures_org_created
  ON public.ai_router_failures(organization_id, created_at DESC);