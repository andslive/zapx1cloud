
-- =====================================================
-- BIZON FORMS - Lead Capture Engine
-- =====================================================

-- 1. Tabela principal de formulários
CREATE TABLE public.forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  -- Identificação
  name TEXT NOT NULL,
  description TEXT,
  slug TEXT NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  
  -- Configurações de Distribuição
  distribution_rule TEXT DEFAULT 'queue' CHECK (distribution_rule IN ('manual', 'round_robin', 'squad', 'user')),
  assigned_squad_id UUID REFERENCES sales_squads(id),
  assigned_user_id UUID,
  default_temperature TEXT DEFAULT 'warm',
  round_robin_config JSONB DEFAULT '{"users": [], "current_index": 0}',
  
  -- Design/Tema
  theme JSONB DEFAULT '{
    "primary_color": "#8B5CF6",
    "secondary_color": "#6366F1",
    "background_color": "#ffffff",
    "text_color": "#1f2937",
    "font_family": "Inter",
    "border_radius": "8px",
    "button_style": "filled",
    "logo_url": null,
    "show_progress": true,
    "redirect_url": null
  }',
  
  -- Tracking
  facebook_pixel_id TEXT,
  google_tag_id TEXT,
  custom_scripts JSONB DEFAULT '{"header": "", "footer": ""}',
  utm_capture BOOLEAN DEFAULT true,
  
  -- Configurações adicionais
  settings JSONB DEFAULT '{
    "show_branding": true,
    "allow_multiple_submissions": false,
    "notify_on_submission": true,
    "auto_create_lead": true
  }',
  
  -- Metadados
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Analytics
  views_count INTEGER DEFAULT 0,
  submissions_count INTEGER DEFAULT 0,
  
  -- Unique slug per organization
  UNIQUE(organization_id, slug)
);

-- 2. Tabela de blocos do formulário
CREATE TABLE public.form_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  
  -- Posicionamento
  order_index INTEGER NOT NULL DEFAULT 0,
  
  -- Tipo de Bloco
  block_type TEXT NOT NULL CHECK (block_type IN (
    'text', 'email', 'phone', 'number', 'textarea',
    'select', 'multi_select', 'yes_no', 'scale',
    'conditional', 'score', 'tag', 'hidden_field',
    'ai_question', 'ai_followup',
    'welcome_screen', 'end_screen'
  )),
  
  -- Conteúdo
  label TEXT NOT NULL,
  description TEXT,
  placeholder TEXT,
  required BOOLEAN DEFAULT false,
  
  -- Opções (para select, multi_select, scale)
  options JSONB DEFAULT '[]',
  
  -- Regras de Lógica
  logic_rules JSONB DEFAULT '[]',
  
  -- Mapeamento para Lead
  maps_to TEXT,
  
  -- Scoring
  score_value INTEGER DEFAULT 0,
  score_rules JSONB DEFAULT '[]',
  
  -- Tags a aplicar
  apply_tags TEXT[] DEFAULT '{}',
  
  -- Validação customizada
  validation JSONB DEFAULT '{}',
  
  -- Configurações visuais do bloco
  block_settings JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabela de submissões
CREATE TABLE public.form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  
  -- Dados coletados
  responses JSONB NOT NULL DEFAULT '{}',
  
  -- Score calculado
  total_score INTEGER DEFAULT 0,
  
  -- Tags aplicadas
  tags TEXT[] DEFAULT '{}',
  
  -- Tracking
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  referrer_url TEXT,
  landing_page TEXT,
  user_agent TEXT,
  ip_address INET,
  
  -- Geolocalização (opcional)
  geo_country TEXT,
  geo_city TEXT,
  
  -- Status
  status TEXT DEFAULT 'completed' CHECK (status IN ('started', 'abandoned', 'completed')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  
  -- Analytics por etapa
  step_analytics JSONB DEFAULT '[]',
  
  -- Tempo gasto
  time_spent_seconds INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabela de templates
CREATE TABLE public.form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'qualification', 'diagnostic', 'pre_sale', 'feedback', 'survey')),
  thumbnail_url TEXT,
  
  -- Estrutura do template
  blocks JSONB NOT NULL DEFAULT '[]',
  theme JSONB DEFAULT '{}',
  settings JSONB DEFAULT '{}',
  
  -- Metadados
  is_public BOOLEAN DEFAULT false,
  is_system BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Índices para performance
CREATE INDEX idx_forms_organization ON forms(organization_id);
CREATE INDEX idx_forms_product ON forms(product_id);
CREATE INDEX idx_forms_status ON forms(status);
CREATE INDEX idx_forms_slug ON forms(slug);

CREATE INDEX idx_form_blocks_form ON form_blocks(form_id);
CREATE INDEX idx_form_blocks_order ON form_blocks(form_id, order_index);

CREATE INDEX idx_form_submissions_form ON form_submissions(form_id);
CREATE INDEX idx_form_submissions_lead ON form_submissions(lead_id);
CREATE INDEX idx_form_submissions_status ON form_submissions(status);
CREATE INDEX idx_form_submissions_created ON form_submissions(created_at DESC);

CREATE INDEX idx_form_templates_org ON form_templates(organization_id);
CREATE INDEX idx_form_templates_category ON form_templates(category);

-- 6. Trigger para updated_at
CREATE TRIGGER update_forms_updated_at
  BEFORE UPDATE ON forms
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_form_templates_updated_at
  BEFORE UPDATE ON form_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Função para incrementar contadores
CREATE OR REPLACE FUNCTION public.increment_form_views(p_form_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE forms SET views_count = views_count + 1 WHERE id = p_form_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.increment_form_submissions_count(p_form_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE forms SET submissions_count = submissions_count + 1 WHERE id = p_form_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. RLS Policies

-- Forms
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view forms from their organization"
  ON forms FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert forms in their organization"
  ON forms FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update forms in their organization"
  ON forms FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete forms in their organization"
  ON forms FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Form Blocks
ALTER TABLE form_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view blocks from their org forms"
  ON form_blocks FOR SELECT
  USING (
    form_id IN (
      SELECT f.id FROM forms f
      JOIN profiles p ON p.organization_id = f.organization_id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Users can insert blocks in their org forms"
  ON form_blocks FOR INSERT
  WITH CHECK (
    form_id IN (
      SELECT f.id FROM forms f
      JOIN profiles p ON p.organization_id = f.organization_id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Users can update blocks in their org forms"
  ON form_blocks FOR UPDATE
  USING (
    form_id IN (
      SELECT f.id FROM forms f
      JOIN profiles p ON p.organization_id = f.organization_id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Users can delete blocks in their org forms"
  ON form_blocks FOR DELETE
  USING (
    form_id IN (
      SELECT f.id FROM forms f
      JOIN profiles p ON p.organization_id = f.organization_id
      WHERE p.id = auth.uid()
    )
  );

-- Form Submissions (público para inserção, restrito para leitura)
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit forms"
  ON form_submissions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can view submissions from their org"
  ON form_submissions FOR SELECT
  USING (
    form_id IN (
      SELECT f.id FROM forms f
      JOIN profiles p ON p.organization_id = f.organization_id
      WHERE p.id = auth.uid()
    )
  );

-- Form Templates
ALTER TABLE form_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view public and org templates"
  ON form_templates FOR SELECT
  USING (
    is_public = true 
    OR is_system = true
    OR organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert templates in their org"
  ON form_templates FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update templates in their org"
  ON form_templates FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete templates in their org"
  ON form_templates FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- 9. Templates do sistema (exemplos)
INSERT INTO form_templates (name, description, category, is_system, is_public, blocks, theme) VALUES
(
  'Qualificação Rápida',
  'Formulário simples para qualificar leads rapidamente',
  'qualification',
  true,
  true,
  '[
    {"block_type": "welcome_screen", "label": "Bem-vindo!", "description": "Responda algumas perguntas rápidas para conhecermos melhor suas necessidades."},
    {"block_type": "text", "label": "Qual é o seu nome?", "placeholder": "Digite seu nome completo", "required": true, "maps_to": "name"},
    {"block_type": "email", "label": "Qual é o seu email?", "placeholder": "seu@email.com", "required": true, "maps_to": "email"},
    {"block_type": "phone", "label": "Qual é o seu telefone?", "placeholder": "(00) 00000-0000", "required": true, "maps_to": "phone"},
    {"block_type": "text", "label": "Qual é o nome da sua empresa?", "placeholder": "Nome da empresa", "required": false, "maps_to": "company"},
    {"block_type": "select", "label": "Quantos funcionários sua empresa tem?", "required": true, "options": [{"value": "1-10", "label": "1 a 10"}, {"value": "11-50", "label": "11 a 50"}, {"value": "51-200", "label": "51 a 200"}, {"value": "200+", "label": "Mais de 200"}], "score_rules": [{"value": "200+", "score": 10}, {"value": "51-200", "score": 7}, {"value": "11-50", "score": 5}]},
    {"block_type": "end_screen", "label": "Obrigado!", "description": "Entraremos em contato em breve."}
  ]'::jsonb,
  '{"primary_color": "#8B5CF6"}'::jsonb
),
(
  'Diagnóstico Completo',
  'Formulário para entender profundamente as necessidades do lead',
  'diagnostic',
  true,
  true,
  '[
    {"block_type": "welcome_screen", "label": "Vamos fazer um diagnóstico", "description": "Em poucos minutos, vamos entender sua situação atual e como podemos ajudar."},
    {"block_type": "text", "label": "Qual é o seu nome?", "required": true, "maps_to": "name"},
    {"block_type": "email", "label": "Seu melhor email", "required": true, "maps_to": "email"},
    {"block_type": "phone", "label": "WhatsApp para contato", "required": true, "maps_to": "phone"},
    {"block_type": "text", "label": "Empresa", "required": true, "maps_to": "company"},
    {"block_type": "text", "label": "Seu cargo", "required": false, "maps_to": "position"},
    {"block_type": "scale", "label": "De 1 a 10, qual sua urgência em resolver esse problema?", "options": {"min": 1, "max": 10}, "required": true, "score_rules": [{"min": 8, "score": 10}, {"min": 5, "score": 5}]},
    {"block_type": "textarea", "label": "Descreva brevemente seu principal desafio", "required": true, "maps_to": "notes"},
    {"block_type": "yes_no", "label": "Você tem orçamento disponível para investir em uma solução?", "required": true, "score_rules": [{"value": true, "score": 15}]},
    {"block_type": "end_screen", "label": "Diagnóstico recebido!", "description": "Um especialista entrará em contato em até 24h."}
  ]'::jsonb,
  '{"primary_color": "#6366F1"}'::jsonb
),
(
  'Captação Simples',
  'Formulário minimalista para captar leads rapidamente',
  'general',
  true,
  true,
  '[
    {"block_type": "text", "label": "Nome", "required": true, "maps_to": "name"},
    {"block_type": "email", "label": "Email", "required": true, "maps_to": "email"},
    {"block_type": "phone", "label": "Telefone", "required": false, "maps_to": "phone"},
    {"block_type": "end_screen", "label": "Pronto!", "description": "Você receberá novidades em breve."}
  ]'::jsonb,
  '{"primary_color": "#10B981"}'::jsonb
);
