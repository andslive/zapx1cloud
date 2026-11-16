-- ═══════════════════════════════════════════════════════════════════════
-- Fatos de conversa para cobrança manual -- histórico auditável e
-- append-only do que o lead disse (data prometida, recusa, pagamento
-- alegado, adiamento, ambiguidade), para `manual_charge_evaluate` (Fase
-- A) consumir como mais uma fonte de fato, do mesmo jeito que já consome
-- purchase_audit/ai_receipt_audits/manual_charge_suppressions hoje.
--
-- ESCOPO: só schema + função de leitura de estado corrente. Nenhum
-- classificador de IA, nenhum worker, nenhum envio. Reaproveita
-- explicitamente os fluxos já existentes (manual_charge_suppressions para
-- recusa, payment_claim_intake para pagamento alegado) em vez de criar
-- fontes de verdade concorrentes -- ver comentários abaixo.
--
-- PRÉ-REQUISITO: exige a constraint `webchat_messages_conversation_id_id_uk`
-- UNIQUE(conversation_id, id) já promovida (rollout online concluído
-- antes da Fase A) para a FK composta abaixo funcionar.
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
-- 1) Tabela append-only. Nunca UPDATE, nunca DELETE (trigger abaixo) --
--    mesmo padrão já usado em manual_charge_send_attempt_events (v4).
--
--    IDEMPOTÊNCIA: UNIQUE(organization_id, source_message_id, fact_type)
--    -- reprocessar o mesmo webhook/mensagem não duplica o MESMO tipo de
--    fato extraído dela, mas permite que a mesma mensagem produza vários
--    fact_type diferentes (ex.: uma mensagem pode conter, ao mesmo tempo,
--    uma data prometida E uma recusa parcial -- achado real do requisito:
--    "uma mesma mensagem pode conter mais de um fato relevante").
--
--    ORDEM POR OCORRÊNCIA, NÃO POR detected_at: message_occurred_at é
--    copiado de webchat_messages.created_at no momento da classificação.
--    LIMITAÇÃO REAL DECLARADA: webchat_messages não tem nenhuma coluna de
--    timestamp nativo do provedor (confirmado por leitura direta do
--    schema -- só existe created_at, hora de inserção no nosso banco).
--    created_at é portanto a MELHOR aproximação real disponível hoje da
--    ordem de ocorrência, não uma garantia absoluta contra mensagens que
--    cheguem fora de ordem por atraso de webhook -- declarado como
--    limitação conhecida, não resolvido nesta migration.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.manual_charge_conversation_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  dispatch_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  source_message_id uuid NOT NULL,
  -- Cópia de webchat_messages.created_at no momento da classificação --
  -- ver limitação declarada acima.
  message_occurred_at timestamptz NOT NULL,
  fact_type text NOT NULL CHECK (fact_type IN (
    'promised_date', 'postponement_requested', 'refused_contact',
    'payment_claimed', 'ambiguous', 'no_signal'
  )),
  -- Só preenchido quando fact_type='promised_date'; nunca nos outros.
  promised_date date,
  -- Trecho da mensagem que sustenta o fato -- auditoria, nunca instrução:
  -- este texto é dado de negócio a ser exibido/auditado, jamais
  -- interpretado como comando técnico por nenhuma função desta migration
  -- nem por nenhuma futura.
  raw_excerpt text NOT NULL CHECK (raw_excerpt <> ''),
  -- Rastreabilidade de origem/versão do classificador (requisito
  -- explícito) -- 'rule_v1' para uma regra determinística simples,
  -- 'model:<nome>:<versão>' quando vier de IA. Nenhum valor mágico aceito
  -- silenciosamente -- sempre exigido, nunca NULL/vazio.
  classifier_source text NOT NULL CHECK (classifier_source <> ''),
  classifier_version text NOT NULL CHECK (classifier_version <> ''),
  -- Quando o classificador RODOU (tempo de processamento) -- distinto de
  -- message_occurred_at (quando a mensagem realmente aconteceu). Nunca
  -- usado para decidir precedência entre fatos -- só para auditoria de
  -- quando o processamento aconteceu.
  detected_at timestamptz NOT NULL DEFAULT now(),

  CHECK ((fact_type = 'promised_date') = (promised_date IS NOT NULL)),

  UNIQUE (organization_id, source_message_id, fact_type),

  -- FKs compostas por organização, no mesmo padrão da Fase A -- nunca uma
  -- FK simples que permitisse misturar organizações.
  FOREIGN KEY (organization_id, dispatch_id)
    REFERENCES public.manual_charge_dispatches (organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, lead_id)
    REFERENCES public.leads (organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, lead_id, conversation_id)
    REFERENCES public.webchat_conversations (organization_id, lead_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (conversation_id, source_message_id)
    REFERENCES public.webchat_messages (conversation_id, id) ON DELETE RESTRICT
);

CREATE INDEX manual_charge_conversation_facts_dispatch_idx
  ON public.manual_charge_conversation_facts (organization_id, dispatch_id, fact_type, message_occurred_at DESC);

COMMENT ON TABLE public.manual_charge_conversation_facts IS
  'Histórico append-only de fatos extraídos das mensagens do lead para cobrança manual (data prometida, recusa, pagamento alegado, adiamento, ambiguidade). Nunca UPDATE/DELETE. Estado corrente é derivado por manual_charge_conversation_current_facts(), nunca armazenado/mutado nesta tabela.';

-- Append-only real, não só por convenção -- mesmo padrão de
-- manual_charge_send_attempt_events (v4): qualquer tentativa de
-- UPDATE/DELETE é rejeitada pelo próprio banco, não só pela aplicação.
CREATE OR REPLACE FUNCTION public.manual_charge_conversation_facts_forbid_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  RAISE EXCEPTION 'manual_charge_conversation_facts é append-only -- UPDATE/DELETE nunca permitido' USING ERRCODE = 'P0030';
END;
$$;

REVOKE ALL ON FUNCTION public.manual_charge_conversation_facts_forbid_mutation() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER manual_charge_conversation_facts_forbid_update
  BEFORE UPDATE ON public.manual_charge_conversation_facts
  FOR EACH ROW EXECUTE FUNCTION public.manual_charge_conversation_facts_forbid_mutation();

CREATE TRIGGER manual_charge_conversation_facts_forbid_delete
  BEFORE DELETE ON public.manual_charge_conversation_facts
  FOR EACH ROW EXECUTE FUNCTION public.manual_charge_conversation_facts_forbid_mutation();

ALTER TABLE public.manual_charge_conversation_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manual_charge_conversation_facts_org_read" ON public.manual_charge_conversation_facts
  FOR SELECT TO authenticated
  USING (public.manual_charge_actor_authorized(organization_id));

REVOKE ALL ON public.manual_charge_conversation_facts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.manual_charge_conversation_facts TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 2) Escrita -- única via, SECURITY DEFINER, exatamente como o resto da
--    Fase A. Recebe o fato já classificado (o classificador em si, Fase
--    B.2, fica fora desta migration -- aqui só a persistência e as regras
--    de precedência de leitura).
--
--    IDEMPOTÊNCIA: usa a UNIQUE acima via ON CONFLICT DO NOTHING --
--    reprocessar o mesmo webhook/mensagem para o mesmo fact_type é
--    seguro, não duplica nem lança erro.
-- ═══════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.record_conversation_fact(
  p_dispatch_id uuid,
  p_lead_id uuid,
  p_conversation_id uuid,
  p_source_message_id uuid,
  p_message_occurred_at timestamptz,
  p_fact_type text,
  p_promised_date date,
  p_raw_excerpt text,
  p_classifier_source text,
  p_classifier_version text
) RETURNS TABLE(status text, fact_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_org uuid;
  v_id uuid;
BEGIN
  SELECT organization_id INTO v_org
  FROM public.manual_charge_dispatches
  WHERE id = p_dispatch_id;

  IF v_org IS NULL THEN
    RETURN QUERY SELECT 'dispatch_not_found'::text, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.manual_charge_conversation_facts (
    organization_id, dispatch_id, lead_id, conversation_id, source_message_id,
    message_occurred_at, fact_type, promised_date, raw_excerpt,
    classifier_source, classifier_version
  ) VALUES (
    v_org, p_dispatch_id, p_lead_id, p_conversation_id, p_source_message_id,
    p_message_occurred_at, p_fact_type, p_promised_date, p_raw_excerpt,
    p_classifier_source, p_classifier_version
  )
  ON CONFLICT (organization_id, source_message_id, fact_type) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    -- Já existia (reprocessamento idempotente) -- busca o id real para
    -- retorno informativo, nunca trata como erro.
    SELECT f.id INTO v_id FROM public.manual_charge_conversation_facts f
    WHERE f.organization_id = v_org AND f.source_message_id = p_source_message_id AND f.fact_type = p_fact_type;
    RETURN QUERY SELECT 'already_recorded'::text, v_id;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'recorded'::text, v_id;
END;
$$;

COMMENT ON FUNCTION public.record_conversation_fact IS
  'Única via de escrita em manual_charge_conversation_facts. Idempotente via ON CONFLICT DO NOTHING na UNIQUE(organization_id, source_message_id, fact_type) -- reprocessar o mesmo webhook/mensagem nunca duplica nem falha. O classificador real (Fase B.2) fica fora desta função.';

REVOKE ALL ON FUNCTION public.record_conversation_fact(uuid, uuid, uuid, uuid, timestamptz, text, date, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_conversation_fact(uuid, uuid, uuid, uuid, timestamptz, text, date, text, text, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 3) Leitura do estado CORRENTE -- nunca armazenado, sempre derivado por
--    consulta, com as regras de precedência abaixo (interpretação minha
--    dos princípios do requisito -- PENDENTE DE VALIDAÇÃO DE NEGÓCIO
--    explícita, não uma decisão técnica unilateral definitiva):
--
--    - promised_date: o fato mais recente por message_occurred_at VENCE
--      (uma nova promessa substitui a anterior).
--    - refused_contact / payment_claimed: são "grudentos" -- uma vez que
--      existem, NUNCA são apagados por nenhum outro fato (inclusive um
--      'no_signal'/'ambiguous' posterior) -- só um processo de negócio
--      explícito os resolve (manual_charge_suppressions para recusa,
--      payment_claim_intake para pagamento -- ambos já existentes,
--      reaproveitados, não reimplementados aqui).
--    - ambiguous/no_signal: nunca apagam nada. Só sinalizam "revisão
--      pendente" quando são, elas mesmas, o sinal mais recente (nenhum
--      fato de negócio mais novo já explica a mensagem).
-- ═══════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.manual_charge_conversation_current_facts(
  p_dispatch_id uuid
) RETURNS TABLE(
  effective_promised_date date,
  promised_date_source_message_id uuid,
  is_refused boolean,
  refused_source_message_id uuid,
  is_payment_claimed boolean,
  payment_claimed_source_message_id uuid,
  has_pending_ambiguous_signal boolean,
  ambiguous_source_message_id uuid
)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  WITH latest_promised AS (
    SELECT f.promised_date, f.source_message_id
    FROM public.manual_charge_conversation_facts f
    WHERE f.dispatch_id = p_dispatch_id AND f.fact_type = 'promised_date'
    ORDER BY f.message_occurred_at DESC, f.detected_at DESC
    LIMIT 1
  ),
  latest_refused AS (
    SELECT f.source_message_id
    FROM public.manual_charge_conversation_facts f
    WHERE f.dispatch_id = p_dispatch_id AND f.fact_type = 'refused_contact'
    ORDER BY f.message_occurred_at DESC
    LIMIT 1
  ),
  latest_payment AS (
    SELECT f.source_message_id
    FROM public.manual_charge_conversation_facts f
    WHERE f.dispatch_id = p_dispatch_id AND f.fact_type = 'payment_claimed'
    ORDER BY f.message_occurred_at DESC
    LIMIT 1
  ),
  latest_business_signal AS (
    SELECT max(f.message_occurred_at) AS ts
    FROM public.manual_charge_conversation_facts f
    WHERE f.dispatch_id = p_dispatch_id
      AND f.fact_type IN ('promised_date', 'refused_contact', 'payment_claimed', 'postponement_requested')
  ),
  latest_ambiguous AS (
    SELECT f.source_message_id, f.message_occurred_at
    FROM public.manual_charge_conversation_facts f
    WHERE f.dispatch_id = p_dispatch_id AND f.fact_type IN ('ambiguous', 'no_signal')
    ORDER BY f.message_occurred_at DESC
    LIMIT 1
  )
  SELECT
    (SELECT promised_date FROM latest_promised),
    (SELECT source_message_id FROM latest_promised),
    EXISTS (SELECT 1 FROM latest_refused),
    (SELECT source_message_id FROM latest_refused),
    EXISTS (SELECT 1 FROM latest_payment),
    (SELECT source_message_id FROM latest_payment),
    EXISTS (
      SELECT 1 FROM latest_ambiguous la
      WHERE la.message_occurred_at > COALESCE((SELECT ts FROM latest_business_signal), '-infinity'::timestamptz)
    ),
    (SELECT source_message_id FROM latest_ambiguous la
      WHERE la.message_occurred_at > COALESCE((SELECT ts FROM latest_business_signal), '-infinity'::timestamptz));
$$;

COMMENT ON FUNCTION public.manual_charge_conversation_current_facts IS
  'Deriva o estado CORRENTE de fatos de conversa para um dispatch, sem armazenar/mutar a tabela append-only. Regras de precedência: promised_date usa o mais recente por message_occurred_at; refused_contact/payment_claimed são "grudentos" (nunca apagados por outro fato); ambiguous/no_signal só sinalizam pendência quando são o sinal mais recente. Interpretação sujeita a validação de negócio explícita -- ver comentário da seção 3 na migration.';

REVOKE ALL ON FUNCTION public.manual_charge_conversation_current_facts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manual_charge_conversation_current_facts(uuid) TO authenticated, service_role;
