-- =====================================================
-- BIZON CAPTURE: Hub Unificado de Funis de Leads
-- =====================================================

-- Tabela principal: capture_funnels
CREATE TABLE public.capture_funnels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  -- Identificacao
  name TEXT NOT NULL,
  description TEXT,
  slug TEXT NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  
  -- Flow (logica do funil - JSONB com blocos)
  flow_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  start_block_id TEXT,
  
  -- Canais habilitados
  channels JSONB NOT NULL DEFAULT '{"chat": {"enabled": false, "slug_override": null}, "form": {"enabled": false, "slug_override": null}, "widget": {"enabled": false}}'::jsonb,
  
  -- Widget config (quando canal widget habilitado)
  widget_config JSONB DEFAULT '{"position": "bottom-right", "primary_color": "#3B82F6", "greeting": "Ola! Como posso ajudar?", "avatar_url": null, "allowed_domains": []}'::jsonb,
  
  -- Distribuicao de leads
  distribution_rule TEXT NOT NULL DEFAULT 'manual' CHECK (distribution_rule IN ('manual', 'round_robin', 'squad', 'user')),
  assigned_squad_id UUID REFERENCES sales_squads(id) ON DELETE SET NULL,
  assigned_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  round_robin_config JSONB DEFAULT '{"users": [], "current_index": 0}'::jsonb,
  
  -- Qualificacao
  default_temperature TEXT DEFAULT 'warm',
  default_tags TEXT[] DEFAULT '{}',
  
  -- Tracking
  facebook_pixel_id TEXT,
  google_tag_id TEXT,
  custom_scripts JSONB DEFAULT '{"header": "", "footer": ""}'::jsonb,
  utm_capture BOOLEAN DEFAULT true,
  
  -- Tema visual (aplicado a todos os canais)
  theme JSONB DEFAULT '{"primary_color": "#3B82F6", "background_color": "#0F172A", "text_color": "#FFFFFF", "font_family": "Inter", "logo_url": null, "show_progress": true}'::jsonb,
  
  -- AI Config
  ai_enabled BOOLEAN DEFAULT true,
  ai_context TEXT,
  
  -- Metricas agregadas
  total_views INTEGER DEFAULT 0,
  total_leads INTEGER DEFAULT 0,
  
  -- Metadata
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indices para capture_funnels
CREATE UNIQUE INDEX capture_funnels_org_slug_idx ON capture_funnels(organization_id, slug);
CREATE INDEX capture_funnels_product_idx ON capture_funnels(product_id);
CREATE INDEX capture_funnels_status_idx ON capture_funnels(status);
CREATE INDEX capture_funnels_organization_idx ON capture_funnels(organization_id);

-- RLS para capture_funnels
ALTER TABLE capture_funnels ENABLE ROW LEVEL SECURITY;

-- Política de leitura: usuários veem funis da sua organização
CREATE POLICY "Users can view funnels of their organization"
  ON capture_funnels FOR SELECT
  TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid()) 
    OR public.is_super_admin(auth.uid())
  );

-- Política de inserção: admins podem criar funis
CREATE POLICY "Admins can insert funnels"
  ON capture_funnels FOR INSERT
  TO authenticated
  WITH CHECK (
    (organization_id = public.get_user_organization(auth.uid()) AND public.has_role(auth.uid(), 'admin'))
    OR public.is_super_admin(auth.uid())
  );

-- Política de atualização: admins podem atualizar funis
CREATE POLICY "Admins can update funnels"
  ON capture_funnels FOR UPDATE
  TO authenticated
  USING (
    (organization_id = public.get_user_organization(auth.uid()) AND public.has_role(auth.uid(), 'admin'))
    OR public.is_super_admin(auth.uid())
  );

-- Política de exclusão: admins podem excluir funis
CREATE POLICY "Admins can delete funnels"
  ON capture_funnels FOR DELETE
  TO authenticated
  USING (
    (organization_id = public.get_user_organization(auth.uid()) AND public.has_role(auth.uid(), 'admin'))
    OR public.is_super_admin(auth.uid())
  );

-- Política de acesso público para leitura (para páginas públicas)
CREATE POLICY "Public can view active funnels by slug"
  ON capture_funnels FOR SELECT
  TO anon
  USING (status = 'active');

-- Trigger para updated_at
CREATE TRIGGER update_capture_funnels_updated_at
  BEFORE UPDATE ON capture_funnels
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- Tabela de analytics por canal: funnel_analytics
-- =====================================================

CREATE TABLE public.funnel_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id UUID NOT NULL REFERENCES capture_funnels(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('chat', 'form', 'widget')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  views INTEGER DEFAULT 0,
  starts INTEGER DEFAULT 0,
  completions INTEGER DEFAULT 0,
  leads_created INTEGER DEFAULT 0,
  
  UNIQUE(funnel_id, channel, date)
);

-- Indices para funnel_analytics
CREATE INDEX funnel_analytics_funnel_idx ON funnel_analytics(funnel_id);
CREATE INDEX funnel_analytics_date_idx ON funnel_analytics(date);
CREATE INDEX funnel_analytics_channel_idx ON funnel_analytics(channel);

-- RLS para funnel_analytics
ALTER TABLE funnel_analytics ENABLE ROW LEVEL SECURITY;

-- Política: usuários veem analytics dos funis da sua organização
CREATE POLICY "Users can view analytics of their funnels"
  ON funnel_analytics FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM capture_funnels cf
      WHERE cf.id = funnel_analytics.funnel_id
      AND (cf.organization_id = public.get_user_organization(auth.uid()) OR public.is_super_admin(auth.uid()))
    )
  );

-- Política: sistema pode inserir/atualizar analytics
CREATE POLICY "System can manage analytics"
  ON funnel_analytics FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM capture_funnels cf
      WHERE cf.id = funnel_analytics.funnel_id
      AND (cf.organization_id = public.get_user_organization(auth.uid()) OR public.is_super_admin(auth.uid()))
    )
  );

-- Política para anon incrementar views
CREATE POLICY "Anon can insert analytics"
  ON funnel_analytics FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can update analytics"
  ON funnel_analytics FOR UPDATE
  TO anon
  USING (true);

-- =====================================================
-- Função para incrementar views do funil
-- =====================================================

CREATE OR REPLACE FUNCTION public.increment_funnel_views(p_funnel_id UUID, p_channel TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Atualiza contador agregado no funil
  UPDATE capture_funnels SET total_views = total_views + 1 WHERE id = p_funnel_id;
  
  -- Insere ou atualiza analytics por canal/dia
  INSERT INTO funnel_analytics (funnel_id, channel, date, views)
  VALUES (p_funnel_id, p_channel, CURRENT_DATE, 1)
  ON CONFLICT (funnel_id, channel, date)
  DO UPDATE SET views = funnel_analytics.views + 1;
END;
$$;

-- =====================================================
-- Função para incrementar leads do funil
-- =====================================================

CREATE OR REPLACE FUNCTION public.increment_funnel_leads(p_funnel_id UUID, p_channel TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Atualiza contador agregado no funil
  UPDATE capture_funnels SET total_leads = total_leads + 1 WHERE id = p_funnel_id;
  
  -- Insere ou atualiza analytics por canal/dia
  INSERT INTO funnel_analytics (funnel_id, channel, date, leads_created, completions)
  VALUES (p_funnel_id, p_channel, CURRENT_DATE, 1, 1)
  ON CONFLICT (funnel_id, channel, date)
  DO UPDATE SET 
    leads_created = funnel_analytics.leads_created + 1,
    completions = funnel_analytics.completions + 1;
END;
$$;