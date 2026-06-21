-- ============================================
-- SPRINT 2: Memória Semântica + Supervisor Multi-agente
-- ============================================

-- 1) Habilitar pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- MEMÓRIA SEMÂNTICA POR LEAD
-- ============================================

CREATE TABLE IF NOT EXISTS public.lead_semantic_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  conversation_id UUID,
  message_id UUID,
  source TEXT NOT NULL DEFAULT 'message', -- message, note, stage_change, deal, custom
  role TEXT, -- user, assistant, system, internal
  content TEXT NOT NULL,
  embedding vector(1536),
  importance_score NUMERIC DEFAULT 0.5, -- 0..1, para priorizar nos retrievals
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_semantic_memory_lead ON public.lead_semantic_memory(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_semantic_memory_org ON public.lead_semantic_memory(organization_id);
CREATE INDEX IF NOT EXISTS idx_lead_semantic_memory_created ON public.lead_semantic_memory(created_at DESC);

-- Índice HNSW para busca por similaridade (cosine distance)
CREATE INDEX IF NOT EXISTS idx_lead_semantic_memory_embedding 
  ON public.lead_semantic_memory 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

ALTER TABLE public.lead_semantic_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read own lead memory"
  ON public.lead_semantic_memory FOR SELECT
  TO authenticated
  USING (public.user_belongs_to_organization(auth.uid(), organization_id));

CREATE POLICY "Org members can insert lead memory"
  ON public.lead_semantic_memory FOR INSERT
  TO authenticated
  WITH CHECK (public.user_belongs_to_organization(auth.uid(), organization_id));

CREATE POLICY "Service role full access on lead memory"
  ON public.lead_semantic_memory FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Função de retrieval semântico
CREATE OR REPLACE FUNCTION public.search_lead_memory(
  p_lead_id UUID,
  p_query_embedding vector(1536),
  p_match_count INT DEFAULT 8,
  p_min_similarity NUMERIC DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  source TEXT,
  role TEXT,
  importance_score NUMERIC,
  similarity NUMERIC,
  metadata JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.content,
    m.source,
    m.role,
    m.importance_score,
    (1 - (m.embedding <=> p_query_embedding))::NUMERIC AS similarity,
    m.metadata,
    m.created_at
  FROM public.lead_semantic_memory m
  WHERE m.lead_id = p_lead_id
    AND m.embedding IS NOT NULL
    AND (1 - (m.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY 
    -- Combina similaridade + importância
    ((1 - (m.embedding <=> p_query_embedding)) * 0.7 + m.importance_score * 0.3) DESC,
    m.created_at DESC
  LIMIT p_match_count;
END;
$$;

-- ============================================
-- SUPERVISOR MULTI-AGENTE
-- ============================================

-- Especialistas: vincula um agente já existente a um papel
CREATE TABLE IF NOT EXISTS public.agent_specialists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  agent_id UUID NOT NULL, -- FK lógica para webchat_agent_configs
  role TEXT NOT NULL, -- sdr, closer, support, retention, recovery, custom
  display_name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 100, -- menor = mais prioritário em empate
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_specialists_org ON public.agent_specialists(organization_id);
CREATE INDEX IF NOT EXISTS idx_agent_specialists_agent ON public.agent_specialists(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_specialists_role ON public.agent_specialists(role);

ALTER TABLE public.agent_specialists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage specialists"
  ON public.agent_specialists FOR ALL
  TO authenticated
  USING (public.user_belongs_to_organization(auth.uid(), organization_id))
  WITH CHECK (public.user_belongs_to_organization(auth.uid(), organization_id));

CREATE POLICY "Service role full access on specialists"
  ON public.agent_specialists FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER agent_specialists_updated_at
  BEFORE UPDATE ON public.agent_specialists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Regras de roteamento
CREATE TABLE IF NOT EXISTS public.agent_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 100, -- menor = avaliada primeiro
  -- Condições (todas opcionais, ANDed)
  match_stage_ids UUID[] DEFAULT NULL,
  match_tag_ids UUID[] DEFAULT NULL,
  match_product_ids UUID[] DEFAULT NULL,
  match_channels TEXT[] DEFAULT NULL, -- whatsapp, instagram, webchat, etc
  match_events TEXT[] DEFAULT NULL,   -- paid, abandoned, refunded, new_message
  deal_value_min NUMERIC DEFAULT NULL,
  deal_value_max NUMERIC DEFAULT NULL,
  -- Ação
  target_specialist_id UUID NOT NULL REFERENCES public.agent_specialists(id) ON DELETE CASCADE,
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  match_count INT NOT NULL DEFAULT 0,
  last_matched_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_routing_rules_org ON public.agent_routing_rules(organization_id, is_active, priority);

ALTER TABLE public.agent_routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage routing rules"
  ON public.agent_routing_rules FOR ALL
  TO authenticated
  USING (public.user_belongs_to_organization(auth.uid(), organization_id))
  WITH CHECK (public.user_belongs_to_organization(auth.uid(), organization_id));

CREATE POLICY "Service role full access on routing rules"
  ON public.agent_routing_rules FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER agent_routing_rules_updated_at
  BEFORE UPDATE ON public.agent_routing_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Histórico de handoffs
CREATE TABLE IF NOT EXISTS public.agent_handoff_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  conversation_id UUID,
  lead_id UUID,
  from_agent_id UUID,
  to_agent_id UUID,
  to_specialist_id UUID,
  reason TEXT, -- rule_match, llm_supervisor, manual, fallback
  rule_id UUID,
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_handoff_history_conv ON public.agent_handoff_history(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_handoff_history_lead ON public.agent_handoff_history(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_handoff_history_org ON public.agent_handoff_history(organization_id, created_at DESC);

ALTER TABLE public.agent_handoff_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read handoff history"
  ON public.agent_handoff_history FOR SELECT
  TO authenticated
  USING (public.user_belongs_to_organization(auth.uid(), organization_id));

CREATE POLICY "Service role full access on handoff history"
  ON public.agent_handoff_history FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Função de avaliação de regras (retorna especialista vencedor)
CREATE OR REPLACE FUNCTION public.evaluate_routing_rules(
  p_organization_id UUID,
  p_lead_id UUID DEFAULT NULL,
  p_stage_id UUID DEFAULT NULL,
  p_tag_ids UUID[] DEFAULT NULL,
  p_product_id UUID DEFAULT NULL,
  p_channel TEXT DEFAULT NULL,
  p_event TEXT DEFAULT NULL,
  p_deal_value NUMERIC DEFAULT NULL
)
RETURNS TABLE (
  rule_id UUID,
  specialist_id UUID,
  agent_id UUID,
  role TEXT,
  display_name TEXT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id AS rule_id,
    s.id AS specialist_id,
    s.agent_id,
    s.role,
    s.display_name
  FROM public.agent_routing_rules r
  JOIN public.agent_specialists s ON s.id = r.target_specialist_id
  WHERE r.organization_id = p_organization_id
    AND r.is_active = true
    AND s.is_active = true
    AND (r.match_stage_ids IS NULL OR p_stage_id = ANY(r.match_stage_ids))
    AND (r.match_tag_ids IS NULL OR r.match_tag_ids && COALESCE(p_tag_ids, ARRAY[]::UUID[]))
    AND (r.match_product_ids IS NULL OR p_product_id = ANY(r.match_product_ids))
    AND (r.match_channels IS NULL OR p_channel = ANY(r.match_channels))
    AND (r.match_events IS NULL OR p_event = ANY(r.match_events))
    AND (r.deal_value_min IS NULL OR COALESCE(p_deal_value, 0) >= r.deal_value_min)
    AND (r.deal_value_max IS NULL OR COALESCE(p_deal_value, 0) <= r.deal_value_max)
  ORDER BY r.priority ASC, s.priority ASC
  LIMIT 1;
END;
$$;