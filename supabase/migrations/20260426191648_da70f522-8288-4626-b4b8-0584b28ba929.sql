-- ============================================
-- SPRINT 3: Avaliação + A/B Testing
-- ============================================

-- LLM-as-Judge avaliações
CREATE TABLE IF NOT EXISTS public.ai_quality_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  conversation_id UUID,
  agent_id UUID,
  lead_id UUID,
  evaluated_messages_count INT DEFAULT 0,
  -- Scores 0-100
  score_overall NUMERIC,
  score_clarity NUMERIC,
  score_tone NUMERIC,
  score_objectivity NUMERIC,
  score_accuracy NUMERIC,
  score_conversion_potential NUMERIC,
  -- Sinais
  detected_objections JSONB DEFAULT '[]'::jsonb,
  detected_intents JSONB DEFAULT '[]'::jsonb,
  detected_issues JSONB DEFAULT '[]'::jsonb,
  -- Resumo
  summary TEXT,
  improvement_suggestions TEXT,
  -- Meta
  judge_model TEXT,
  cost_usd NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_quality_org_created ON public.ai_quality_evaluations(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_quality_agent ON public.ai_quality_evaluations(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_quality_conv ON public.ai_quality_evaluations(conversation_id);

ALTER TABLE public.ai_quality_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read evaluations"
  ON public.ai_quality_evaluations FOR SELECT
  TO authenticated
  USING (public.user_belongs_to_organization(auth.uid(), organization_id));

CREATE POLICY "Service role full access on evaluations"
  ON public.ai_quality_evaluations FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Experimentos A/B
CREATE TABLE IF NOT EXISTS public.ai_prompt_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  agent_id UUID, -- agente alvo (opcional: null = aplica a todos)
  status TEXT NOT NULL DEFAULT 'draft', -- draft, running, paused, finished
  primary_metric TEXT DEFAULT 'score_overall', -- score_overall, conversion_rate, response_time
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_experiments_org ON public.ai_prompt_experiments(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_experiments_agent ON public.ai_prompt_experiments(agent_id);

ALTER TABLE public.ai_prompt_experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage experiments"
  ON public.ai_prompt_experiments FOR ALL
  TO authenticated
  USING (public.user_belongs_to_organization(auth.uid(), organization_id))
  WITH CHECK (public.user_belongs_to_organization(auth.uid(), organization_id));

CREATE POLICY "Service role full access on experiments"
  ON public.ai_prompt_experiments FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER ai_experiments_updated_at
  BEFORE UPDATE ON public.ai_prompt_experiments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Variantes
CREATE TABLE IF NOT EXISTS public.ai_prompt_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES public.ai_prompt_experiments(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  label TEXT NOT NULL, -- "A", "B", "Controle", etc
  prompt_override TEXT, -- prompt completo OU additivo
  prompt_mode TEXT NOT NULL DEFAULT 'append', -- append (anexa ao prompt do agente) | replace (substitui)
  weight INT NOT NULL DEFAULT 50, -- peso pra distribuição (0-100)
  -- Métricas agregadas
  impressions INT NOT NULL DEFAULT 0,
  conversions INT NOT NULL DEFAULT 0,
  total_score NUMERIC NOT NULL DEFAULT 0,
  evaluations_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_variants_exp ON public.ai_prompt_variants(experiment_id);

ALTER TABLE public.ai_prompt_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage variants"
  ON public.ai_prompt_variants FOR ALL
  TO authenticated
  USING (public.user_belongs_to_organization(auth.uid(), organization_id))
  WITH CHECK (public.user_belongs_to_organization(auth.uid(), organization_id));

CREATE POLICY "Service role full access on variants"
  ON public.ai_prompt_variants FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER ai_variants_updated_at
  BEFORE UPDATE ON public.ai_prompt_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Função: escolha determinística de variante por hash do seed
CREATE OR REPLACE FUNCTION public.pick_prompt_variant(
  p_experiment_id UUID,
  p_seed TEXT
)
RETURNS TABLE (
  variant_id UUID,
  label TEXT,
  prompt_override TEXT,
  prompt_mode TEXT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_weight INT;
  v_hash_pos INT;
  v_cumulative INT := 0;
  v_chosen RECORD;
BEGIN
  -- Soma pesos das variantes
  SELECT COALESCE(SUM(weight), 0) INTO v_total_weight
  FROM public.ai_prompt_variants
  WHERE experiment_id = p_experiment_id AND weight > 0;

  IF v_total_weight = 0 THEN
    RETURN;
  END IF;

  -- Hash determinístico do seed (lead_id) -> 0..total_weight-1
  v_hash_pos := abs(hashtext(COALESCE(p_seed, '') || p_experiment_id::text)) % v_total_weight;

  -- Itera variantes ordenadas e acha a faixa
  FOR v_chosen IN
    SELECT id, label, prompt_override, prompt_mode, weight
    FROM public.ai_prompt_variants
    WHERE experiment_id = p_experiment_id AND weight > 0
    ORDER BY created_at ASC, id ASC
  LOOP
    v_cumulative := v_cumulative + v_chosen.weight;
    IF v_hash_pos < v_cumulative THEN
      variant_id := v_chosen.id;
      label := v_chosen.label;
      prompt_override := v_chosen.prompt_override;
      prompt_mode := v_chosen.prompt_mode;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;
END;
$$;

-- Função: incrementar impression atomicamente
CREATE OR REPLACE FUNCTION public.record_variant_impression(p_variant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_prompt_variants
  SET impressions = impressions + 1
  WHERE id = p_variant_id;
END;
$$;

-- Função: registrar score de avaliação na variante
CREATE OR REPLACE FUNCTION public.record_variant_score(p_variant_id UUID, p_score NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_prompt_variants
  SET total_score = total_score + p_score,
      evaluations_count = evaluations_count + 1
  WHERE id = p_variant_id;
END;
$$;

-- View agregada de métricas por agente (últimos 30d)
CREATE OR REPLACE VIEW public.v_agent_quality_30d
WITH (security_invoker = true) AS
SELECT
  organization_id,
  agent_id,
  COUNT(*)::INT AS evaluations,
  ROUND(AVG(score_overall)::NUMERIC, 2) AS avg_overall,
  ROUND(AVG(score_clarity)::NUMERIC, 2) AS avg_clarity,
  ROUND(AVG(score_tone)::NUMERIC, 2) AS avg_tone,
  ROUND(AVG(score_objectivity)::NUMERIC, 2) AS avg_objectivity,
  ROUND(AVG(score_accuracy)::NUMERIC, 2) AS avg_accuracy,
  ROUND(AVG(score_conversion_potential)::NUMERIC, 2) AS avg_conversion_potential
FROM public.ai_quality_evaluations
WHERE created_at >= now() - INTERVAL '30 days'
GROUP BY organization_id, agent_id;