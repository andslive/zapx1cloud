-- ═══════════════════════════════════════════════════════════════════════
-- Correção de 3 pontos levantados na revisão de
-- manual_charge_conversation_facts (20260923182000). NÃO reedita nenhuma
-- migration anterior — Fase A permanece intocada; a migration anterior
-- desta própria feature (conversation_facts) também não é reeditada, só
-- alterada por uma migration NOVA e posterior, como já vínhamos fazendo.
--
-- PONTO 1 -- webchat_messages.created_at não comprova ordem real de envio:
--   Verificado no código real (supabase/functions/uazapi-webhook/index.ts):
--   o payload da UazAPI TRAZ um timestamp nativo (msg.messageTimestamp),
--   já parseado em memória como `norm.createdAt`, mas ele NUNCA era
--   persistido -- só created_at (hora de INSERT no nosso banco) existia.
--   Sob reentrega atrasada de webhook (retry, fila, reconexão), a ordem de
--   INSERT pode divergir da ordem real de envio. Corrigido em dois
--   lugares: (a) nova coluna webchat_messages.provider_occurred_at
--   (nullable, aditiva) + captura de norm.createdAt no ponto exato de
--   inserção inbound (edição mínima e aditiva do
--   uazapi-webhook/index.ts, só neste worktree isolado -- ver commit); (b)
--   record_conversation_fact (abaixo) agora DERIVA o horário de ocorrência
--   internamente (nunca aceita como parâmetro do chamador, que poderia
--   mentir) via COALESCE(provider_occurred_at, created_at), registrando
--   explicitamente occurred_at_source para nunca inflar confiança quando
--   cai no fallback. LIMITAÇÃO REAL DECLARADA, NÃO RESOLVIDA: mensagens
--   ingeridas ANTES desta coluna existir, e qualquer webhook de provedor
--   que não informe messageTimestamp, permanecem com occurred_at_source=
--   'db_insertion_fallback' -- para essas, a ordem de insenção AINDA é a
--   única aproximação disponível. Testado (ver test 12): uma mensagem com
--   provider_occurred_at ANTERIOR mas inserida DEPOIS de outra não
--   sobrescreve a promessa mais recente.
--
-- PONTO 2 -- ON CONFLICT DO NOTHING descartava correções legítimas:
--   A UNIQUE(organization_id, source_message_id, fact_type) anterior
--   impedia uma reclassificação da MESMA mensagem/fact_type com uma
--   DECISÃO diferente (ex.: promised_date corrigido de 10 para 15) de ser
--   sequer registrada -- ON CONFLICT DO NOTHING descartava silenciosamente
--   a correção. Corrigido: a chave de idempotência agora inclui o
--   conteúdo DECIDIDO (decision_key, coluna gerada), não só a identidade
--   da mensagem. Reprocessar a MESMA mensagem com a MESMA decisão continua
--   idempotente (no-op). Uma correção com decisão DIFERENTE agora sempre
--   vira uma NOVA linha, preservando o histórico completo (nunca
--   apaga/sobrescreve). manual_charge_conversation_current_facts já
--   desempata por detected_at DESC quando message_occurred_at é igual
--   (mesma mensagem, reclassificada depois) -- a correção mais recente
--   prevalece automaticamente, sem nenhuma mudança adicional necessária
--   nessa function.
--
-- PONTO 3 -- refused_contact/payment_claimed duplicavam mecanismos já
--   existentes e mais robustos: achado real de revisão (mesma classe do
--   achado sobre dedup cross-dispatch na fase anterior) -- eu já tinha
--   fact_type='refused_contact'/'payment_claimed' nesta tabela, mas a
--   Fase A JÁ TEM, prontos e testados: manual_charge_suppressions (com
--   create_suppression_candidate/confirm_suppression, reason=
--   'stop_contact' para recusa) e payment_claim_events +
--   payment_claim_resolution_events + payment_claim_intake (com
--   register_payment_claim/record_payment_claim_resolution) -- inclusive
--   já com a resolução explícita que o requisito pede:
--   record_payment_claim_resolution(claim_id, 'not_found'|'invalid', nota)
--   rejeita a alegação SEM bloqueio eterno (manual_charge_evaluate só
--   bloqueia para 'pending_reconciliation'/'needs_review'; uma vez
--   resolvida como not_found/invalid, o dispatch simplesmente deixa de
--   casar esses dois valores e volta a cair no fluxo normal de avaliação,
--   sem nenhum reagendamento automático -- nenhum código cria uma nova
--   data só porque a alegação foi rejeitada). Manter os dois fact_types
--   aqui criaria DUAS fontes de verdade conflitantes, exatamente o que o
--   requisito pede para evitar. Corrigido: removidos de
--   manual_charge_conversation_facts; o classificador (Fase B.2, fora do
--   escopo desta migration) deve chamar create_suppression_candidate/
--   register_payment_claim diretamente para esses dois sinais, nunca
--   escrever aqui. Esta tabela agora cobre só o que NÃO tem mecanismo
--   dedicado: promised_date, postponement_requested, ambiguous,
--   no_signal. Nova function manual_charge_conversation_state() (abaixo)
--   combina os três mecanismos (promessa + supressão + payment claim) numa
--   única leitura para o painel, sem duplicar armazenamento.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Pré-requisito do Ponto 1 ──
ALTER TABLE public.webchat_messages
  ADD COLUMN provider_occurred_at timestamptz;

COMMENT ON COLUMN public.webchat_messages.provider_occurred_at IS
  'Timestamp nativo do provedor (ex.: messageTimestamp da UazAPI), quando informado no webhook. NULL para mensagens ingeridas antes desta coluna existir ou quando o provedor não informa timestamp -- nesses casos created_at (hora de INSERT) é o único proxy disponível, com confiança reduzida (ver manual_charge_conversation_facts.occurred_at_source).';

-- ── Ponto 3: reduz o vocabulário de fact_type ──
ALTER TABLE public.manual_charge_conversation_facts
  DROP CONSTRAINT manual_charge_conversation_facts_fact_type_check;

ALTER TABLE public.manual_charge_conversation_facts
  ADD CONSTRAINT manual_charge_conversation_facts_fact_type_check
  CHECK (fact_type IN ('promised_date', 'postponement_requested', 'ambiguous', 'no_signal'));

-- ── Ponto 1: rastreabilidade de confiança da ordenação ──
ALTER TABLE public.manual_charge_conversation_facts
  ADD COLUMN occurred_at_source text NOT NULL DEFAULT 'db_insertion_fallback'
    CHECK (occurred_at_source IN ('provider_native', 'db_insertion_fallback'));

ALTER TABLE public.manual_charge_conversation_facts
  ALTER COLUMN occurred_at_source DROP DEFAULT;

-- ── Ponto 2: idempotência por DECISÃO, não só por identidade da mensagem ──
ALTER TABLE public.manual_charge_conversation_facts
  DROP CONSTRAINT manual_charge_conversation_fa_organization_id_source_messag_key;

ALTER TABLE public.manual_charge_conversation_facts
  -- date::text não é IMMUTABLE (depende de DateStyle) -- usa subtração de
  -- epoch (inteiro), que é IMMUTABLE, para o fingerprint da data.
  ADD COLUMN decision_key text GENERATED ALWAYS AS (
    fact_type || ':' || COALESCE((promised_date - DATE '1970-01-01')::text, '')
  ) STORED;

ALTER TABLE public.manual_charge_conversation_facts
  ADD CONSTRAINT manual_charge_conversation_facts_org_msg_decision_uk
  UNIQUE (organization_id, source_message_id, fact_type, decision_key);

COMMENT ON COLUMN public.manual_charge_conversation_facts.decision_key IS
  'Fingerprint do conteúdo DECIDIDO (fact_type + promised_date). Reprocessar a mesma mensagem com a MESMA decisão é idempotente (UNIQUE com fact_type inclui isso). Uma reclassificação com decisão DIFERENTE (correção) sempre vira uma nova linha -- nunca apaga/sobrescreve a anterior.';

COMMENT ON TABLE public.manual_charge_conversation_facts IS
  'Histórico append-only de fatos NÃO cobertos por mecanismo dedicado (promised_date, postponement_requested, ambiguous, no_signal). Recusa (refused_contact) usa manual_charge_suppressions; pagamento alegado (payment_claimed) usa payment_claim_events/payment_claim_resolution_events -- ambos já existentes na Fase A, nunca duplicados aqui. Nunca UPDATE/DELETE. Estado corrente é derivado, nunca armazenado/mutado.';

-- ═══════════════════════════════════════════════════════════════════════
-- Reescreve record_conversation_fact: deriva message_occurred_at e
-- occurred_at_source internamente (nunca confia no chamador); não recebe
-- mais fact_type IN ('refused_contact','payment_claimed').
-- ═══════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.record_conversation_fact(uuid, uuid, uuid, uuid, timestamptz, text, date, text, text, text);

CREATE FUNCTION public.record_conversation_fact(
  p_dispatch_id uuid,
  p_lead_id uuid,
  p_conversation_id uuid,
  p_source_message_id uuid,
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
  v_occurred_at timestamptz;
  v_provider_ts timestamptz;
  v_occurred_at_source text;
BEGIN
  IF p_fact_type IN ('refused_contact', 'payment_claimed') THEN
    RAISE EXCEPTION 'use_dedicated_mechanism: refused_contact->create_suppression_candidate, payment_claimed->register_payment_claim' USING ERRCODE = 'P0009';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.manual_charge_dispatches
  WHERE id = p_dispatch_id;

  IF v_org IS NULL THEN
    RETURN QUERY SELECT 'dispatch_not_found'::text, NULL::uuid;
    RETURN;
  END IF;

  -- Fonte única da verdade para o horário de ocorrência: derivado AQUI, do
  -- próprio registro da mensagem -- nunca aceito como parâmetro do
  -- chamador (que poderia informar um valor incorreto ou desatualizado).
  SELECT wm.provider_occurred_at, wm.created_at
  INTO v_provider_ts, v_occurred_at
  FROM public.webchat_messages wm
  WHERE wm.id = p_source_message_id AND wm.conversation_id = p_conversation_id;

  IF v_occurred_at IS NULL THEN
    RETURN QUERY SELECT 'source_message_not_found'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_provider_ts IS NOT NULL THEN
    v_occurred_at := v_provider_ts;
    v_occurred_at_source := 'provider_native';
  ELSE
    v_occurred_at_source := 'db_insertion_fallback';
  END IF;

  INSERT INTO public.manual_charge_conversation_facts (
    organization_id, dispatch_id, lead_id, conversation_id, source_message_id,
    message_occurred_at, occurred_at_source, fact_type, promised_date, raw_excerpt,
    classifier_source, classifier_version
  ) VALUES (
    v_org, p_dispatch_id, p_lead_id, p_conversation_id, p_source_message_id,
    v_occurred_at, v_occurred_at_source, p_fact_type, p_promised_date, p_raw_excerpt,
    p_classifier_source, p_classifier_version
  )
  ON CONFLICT (organization_id, source_message_id, fact_type, decision_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT f.id INTO v_id FROM public.manual_charge_conversation_facts f
    WHERE f.organization_id = v_org AND f.source_message_id = p_source_message_id
      AND f.fact_type = p_fact_type
      AND f.decision_key = (p_fact_type || ':' || COALESCE((p_promised_date - DATE '1970-01-01')::text, ''));
    RETURN QUERY SELECT 'already_recorded'::text, v_id;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'recorded'::text, v_id;
END;
$$;

COMMENT ON FUNCTION public.record_conversation_fact IS
  'Deriva message_occurred_at/occurred_at_source internamente (COALESCE(provider_occurred_at, created_at), nunca aceito do chamador). Idempotente por (organization_id, source_message_id, fact_type, decision_key) -- reprocessar a MESMA decisão é no-op; uma correção com decisão diferente sempre vira nova linha. Rejeita fact_type refused_contact/payment_claimed -- esses usam create_suppression_candidate/register_payment_claim.';

REVOKE ALL ON FUNCTION public.record_conversation_fact(uuid, uuid, uuid, uuid, text, date, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_conversation_fact(uuid, uuid, uuid, uuid, text, date, text, text, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- Reescreve manual_charge_conversation_current_facts: só promised_date/
-- ambiguous (refused/payment saíram, ver Ponto 3). Desempate por
-- detected_at DESC quando message_occurred_at empata (Ponto 2: correção
-- da mesma mensagem prevalece).
-- ═══════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.manual_charge_conversation_current_facts(uuid);

CREATE FUNCTION public.manual_charge_conversation_current_facts(
  p_dispatch_id uuid
) RETURNS TABLE(
  effective_promised_date date,
  promised_date_source_message_id uuid,
  promised_date_occurred_at_source text,
  has_pending_ambiguous_signal boolean,
  ambiguous_source_message_id uuid
)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  WITH latest_promised AS (
    SELECT f.promised_date, f.source_message_id, f.occurred_at_source
    FROM public.manual_charge_conversation_facts f
    WHERE f.dispatch_id = p_dispatch_id AND f.fact_type = 'promised_date'
    ORDER BY f.message_occurred_at DESC, f.detected_at DESC
    LIMIT 1
  ),
  latest_business_signal AS (
    SELECT max(f.message_occurred_at) AS ts
    FROM public.manual_charge_conversation_facts f
    WHERE f.dispatch_id = p_dispatch_id
      AND f.fact_type IN ('promised_date', 'postponement_requested')
  ),
  latest_ambiguous AS (
    SELECT f.source_message_id, f.message_occurred_at
    FROM public.manual_charge_conversation_facts f
    WHERE f.dispatch_id = p_dispatch_id AND f.fact_type IN ('ambiguous', 'no_signal')
    ORDER BY f.message_occurred_at DESC, f.detected_at DESC
    LIMIT 1
  )
  SELECT
    (SELECT promised_date FROM latest_promised),
    (SELECT source_message_id FROM latest_promised),
    (SELECT occurred_at_source FROM latest_promised),
    EXISTS (
      SELECT 1 FROM latest_ambiguous la
      WHERE la.message_occurred_at > COALESCE((SELECT ts FROM latest_business_signal), '-infinity'::timestamptz)
    ),
    (SELECT source_message_id FROM latest_ambiguous la
      WHERE la.message_occurred_at > COALESCE((SELECT ts FROM latest_business_signal), '-infinity'::timestamptz));
$$;

COMMENT ON FUNCTION public.manual_charge_conversation_current_facts IS
  'Escopo reduzido ao Ponto 3: só promised_date/ambiguous (refused_contact/payment_claimed usam manual_charge_suppressions/payment_claim_current_status -- ver manual_charge_conversation_state). Desempata por detected_at DESC quando message_occurred_at empata, para que uma correção da mesma mensagem sempre prevaleça sobre a classificação original.';

REVOKE ALL ON FUNCTION public.manual_charge_conversation_current_facts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manual_charge_conversation_current_facts(uuid) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- manual_charge_conversation_state -- leitura combinada para o painel:
-- promessa (esta tabela) + recusa (manual_charge_suppressions) + pagamento
-- alegado (payment_claim_current_status). Nenhum armazenamento novo --
-- só um JOIN de leitura sobre os 3 mecanismos já existentes.
-- ═══════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.manual_charge_conversation_state(
  p_dispatch_id uuid
) RETURNS TABLE(
  effective_promised_date date,
  promised_date_occurred_at_source text,
  has_pending_ambiguous_signal boolean,
  is_refused boolean,
  refused_reason text,
  is_payment_claimed boolean,
  payment_claim_status text
)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT
    cf.effective_promised_date,
    cf.promised_date_occurred_at_source,
    cf.has_pending_ambiguous_signal,
    (sup.reason IS NOT NULL) AS is_refused,
    sup.reason AS refused_reason,
    (pcs.current_status IS NOT NULL) AS is_payment_claimed,
    pcs.current_status AS payment_claim_status
  FROM public.manual_charge_conversation_current_facts(p_dispatch_id) cf
  LEFT JOIN LATERAL (
    SELECT s.reason
    FROM public.manual_charge_dispatches d
    JOIN public.leads l ON l.id = d.lead_id
    JOIN public.manual_charge_suppressions s
      ON s.organization_id = d.organization_id
     AND s.phone_normalized = l.phone_normalized
     AND s.status = 'confirmed'
     AND (
       s.scope = 'all_contact'
       OR (s.scope = 'campaign' AND s.campaign_key = d.campaign_key)
       OR (s.scope = 'product' AND s.product_ref = d.campaign_key)
     )
    WHERE d.id = p_dispatch_id
    ORDER BY s.confirmed_at DESC
    LIMIT 1
  ) sup ON true
  LEFT JOIN LATERAL (
    SELECT pcs.current_status
    FROM public.payment_claim_events ce
    JOIN public.payment_claim_current_status pcs ON pcs.claim_event_id = ce.id
    WHERE ce.manual_charge_dispatch_id = p_dispatch_id
    ORDER BY ce.created_at DESC
    LIMIT 1
  ) pcs ON true;
$$;

COMMENT ON FUNCTION public.manual_charge_conversation_state IS
  'Leitura combinada para o painel: promessa (manual_charge_conversation_facts) + recusa confirmada (manual_charge_suppressions) + pagamento alegado (payment_claim_current_status). Não armazena nada -- apenas junta os 3 mecanismos já existentes numa única chamada.';

REVOKE ALL ON FUNCTION public.manual_charge_conversation_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manual_charge_conversation_state(uuid) TO authenticated, service_role;
