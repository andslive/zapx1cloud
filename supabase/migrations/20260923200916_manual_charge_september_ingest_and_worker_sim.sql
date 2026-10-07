-- ═══════════════════════════════════════════════════════════════════════
-- Seção 1 (carga real, não só prévia) + Seção 8 (fluxo completo
-- demonstrado com provedor simulado). ESCOPO: tudo aqui roda em
-- ambiente isolado, com provedor SIMULADO -- nenhuma chamada de rede,
-- nenhuma chamada paga, nenhuma leitura de conversa real de produção.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Compromissos voluntários -- visibilidade, NUNCA dívida. Um lead que
--    promete CONTRIBUIR (sem obrigação de compra) nunca vira dispatch
--    (o modelo de dispatch é ancorado em purchase_audit, ver correção
--    anterior) -- fica só registrado aqui para o painel mostrar, sem
--    acionar nenhum mecanismo de cobrança/lembrete. Lembrete futuro para
--    compromissos voluntários é pendência de decisão de negócio
--    separada, não implementada aqui. ──
CREATE TABLE public.manual_charge_voluntary_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  source_message_id uuid NOT NULL,
  committed_date date,
  raw_excerpt text NOT NULL CHECK (raw_excerpt <> ''),
  detected_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organization_id, source_message_id),
  FOREIGN KEY (organization_id, lead_id) REFERENCES public.leads (organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, lead_id, conversation_id) REFERENCES public.webchat_conversations (organization_id, lead_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (conversation_id, source_message_id) REFERENCES public.webchat_messages (conversation_id, id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.manual_charge_voluntary_commitments IS
  'Compromisso de CONTRIBUIÇÃO voluntária (sem obrigação de compra) -- só visibilidade para o painel, nunca aciona cobrança/lembrete/dispatch. Não afirma débito -- é o registro exato do que o lead disse, para humano decidir o que fazer, se algo.';

REVOKE ALL ON public.manual_charge_voluntary_commitments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.manual_charge_voluntary_commitments TO authenticated;
ALTER TABLE public.manual_charge_voluntary_commitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manual_charge_voluntary_commitments_org_read" ON public.manual_charge_voluntary_commitments
  FOR SELECT TO authenticated
  USING (public.manual_charge_actor_authorized(organization_id));

-- ═══════════════════════════════════════════════════════════════════════
-- manual_charge_september_2026_classify_message precisa também informar
-- date_precision -- sem isso, o ingest não conseguiria diferenciar
-- "final do mês" (flexível) de uma data explícita (exata) ao gravar o
-- fato. Muda o tipo de retorno -- exige DROP+CREATE.
-- ═══════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.manual_charge_september_2026_classify_message(text);

CREATE FUNCTION public.manual_charge_september_2026_classify_message(
  p_content text
) RETURNS TABLE(signal text, detected_date date, date_precision text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
DECLARE
  v_lower text := lower(p_content);
  v_day int;
  v_match text[];
BEGIN
  IF v_lower ~ '(já paguei|ja paguei|acabei de pagar|paguei agora)' THEN
    RETURN QUERY SELECT 'payment_informed'::text, NULL::date, NULL::text; RETURN;
  END IF;

  IF v_lower ~ '(não me (liga|manda|incomod)|nao me (liga|manda|incomod)|pare de|para de mandar|não quero mais|nao quero mais)' THEN
    RETURN QUERY SELECT 'refused'::text, NULL::date, NULL::text; RETURN;
  END IF;

  IF v_lower ~ '(final do m[eê]s|final de setembro|fim do m[eê]s|fim de setembro|at[eé] o fim do m[eê]s)' THEN
    RETURN QUERY SELECT 'promised_date'::text, '2026-09-29'::date, 'flexible_period_start'::text; RETURN;
  END IF;

  v_match := regexp_match(v_lower, 'dia (\d{1,2})');
  IF v_match IS NOT NULL THEN
    v_day := v_match[1]::int;
    IF v_day BETWEEN 1 AND 31 THEN
      BEGIN
        RETURN QUERY SELECT 'promised_date'::text, make_date(2026, 9, v_day), 'exact'::text; RETURN;
      EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'ambiguous'::text, NULL::date, NULL::text; RETURN;
      END;
    END IF;
  END IF;

  IF v_lower ~ '(depois|mais pra frente|quando eu conseguir|quando puder|em breve)' THEN
    RETURN QUERY SELECT 'ambiguous'::text, NULL::date, NULL::text; RETURN;
  END IF;

  RETURN QUERY SELECT 'no_signal'::text, NULL::date, NULL::text;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_september_2026_classify_message IS
  'CORRIGIDO 20260923200916: também retorna date_precision (exact/flexible_period_start) -- "final do mês" nunca vira uma data exata sozinha, precisa ficar marcada como período flexível para a distribuição corrigida funcionar.';

-- manual_charge_september_2026_dry_run_preview usa esta function só
-- pelas 2 primeiras colunas (signal, detected_date) -- adicionar uma
-- 3a coluna no final não quebra sua chamada existente.

-- ═══════════════════════════════════════════════════════════════════════
-- manual_charge_record_classified_signal precisa repassar
-- date_precision/supersedes_fact_id (novos parâmetros de
-- record_conversation_fact, migration 20260923195721) -- sem isso, toda
-- promessa "final do mês" roteada por aqui cairia no default 'exact' e
-- perderia a distribuição flexível corrigida.
-- ═══════════════════════════════════════════════════════════════════════

-- Adicionar parâmetros no final, mesmo com DEFAULT, cria um OVERLOAD
-- novo em vez de substituir (achado real: identidade de function no
-- Postgres é por tipos de parâmetro, não por nome sozinho) -- DROP
-- explícito da assinatura antiga evita duas versões coexistindo.
DROP FUNCTION IF EXISTS public.manual_charge_record_classified_signal(uuid, uuid, uuid, uuid, text, date, text, text, text);

CREATE FUNCTION public.manual_charge_record_classified_signal(
  p_dispatch_id uuid,
  p_lead_id uuid,
  p_conversation_id uuid,
  p_source_message_id uuid,
  p_signal_type text,
  p_promised_date date DEFAULT NULL,
  p_raw_excerpt text DEFAULT NULL,
  p_classifier_source text DEFAULT 'rule_v1',
  p_classifier_version text DEFAULT '1',
  p_supersedes_fact_id uuid DEFAULT NULL,
  p_date_precision text DEFAULT 'exact'
) RETURNS TABLE(routed_to text, outcome text, reference_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_org uuid;
  v_phone_normalized text;
  v_claim RECORD;
  v_suppression_id uuid;
  v_fact RECORD;
BEGIN
  SELECT organization_id INTO v_org FROM public.manual_charge_dispatches WHERE id = p_dispatch_id;
  IF v_org IS NULL THEN
    RETURN QUERY SELECT NULL::text, 'dispatch_not_found'::text, NULL::uuid; RETURN;
  END IF;

  IF p_signal_type = 'payment_claimed' THEN
    SELECT c.outcome, c.claim_event_id, c.review_id INTO v_claim
    FROM public.register_payment_claim(v_org, p_conversation_id, p_lead_id, p_source_message_id, p_classifier_source) c;

    RETURN QUERY SELECT 'payment_claim'::text, v_claim.outcome,
      COALESCE(v_claim.claim_event_id, v_claim.review_id);
    RETURN;
  END IF;

  IF p_signal_type = 'refused_contact' THEN
    SELECT phone_normalized INTO v_phone_normalized
    FROM public.manual_charge_dispatches WHERE id = p_dispatch_id;

    SELECT public.create_suppression_candidate(
      v_org, v_phone_normalized, 'all_contact', 'stop_contact',
      NULL, NULL, p_conversation_id, p_source_message_id,
      p_classifier_source, NULL, NULL
    ) INTO v_suppression_id;

    RETURN QUERY SELECT 'suppression'::text, 'candidate_created'::text, v_suppression_id;
    RETURN;
  END IF;

  IF p_signal_type NOT IN ('promised_date', 'postponement_requested', 'ambiguous', 'no_signal') THEN
    RETURN QUERY SELECT NULL::text, 'unknown_signal_type'::text, NULL::uuid; RETURN;
  END IF;

  SELECT f.status, f.fact_id INTO v_fact
  FROM public.record_conversation_fact(
    p_dispatch_id, p_lead_id, p_conversation_id, p_source_message_id,
    p_signal_type, p_promised_date, p_raw_excerpt, p_classifier_source, p_classifier_version,
    p_supersedes_fact_id, p_date_precision
  ) f;

  RETURN QUERY SELECT 'conversation_fact'::text, v_fact.status, v_fact.fact_id;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_record_classified_signal(uuid, uuid, uuid, uuid, text, date, text, text, text, uuid, text) IS
  'CORRIGIDO 20260923200916: repassa date_precision/supersedes_fact_id para record_conversation_fact -- sem isso, promessas roteadas por aqui perderiam a distinção exact/flexible_period_start.';

REVOKE ALL ON FUNCTION public.manual_charge_record_classified_signal(uuid, uuid, uuid, uuid, text, date, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_record_classified_signal(uuid, uuid, uuid, uuid, text, date, text, text, text, uuid, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- manual_charge_september_2026_ingest -- carga REAL (grava), idempotente
-- por composição (cada mecanismo que chama já é idempotente:
-- manual_charge_create_dispatch_for_obligation via UNIQUE de obrigação,
-- record_conversation_fact via decision_key/supersedes,
-- manual_charge_voluntary_commitments via UNIQUE de mensagem). Reusa o
-- MESMO classificador de teste da prévia (rotulado como tal -- produção
-- real precisa de IA, fora do escopo). Alimenta o painel continuamente:
-- pode ser chamada de novo a qualquer momento (ex.: periodicamente) só
-- processando o que for novo.
-- ═══════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.manual_charge_september_2026_ingest(
  p_organization_id uuid,
  p_campaign_prefix text DEFAULT 'sept2026'
) RETURNS TABLE(lead_id uuid, outcome text, dispatch_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_lead RECORD;
  v_msg RECORD;
  v_pa_id uuid;
  v_dispatch_id uuid;
  v_create_status text;
  v_capture_status text;
  v_signal text;
  v_date date;
  v_precision text;
  v_conv_id uuid;
BEGIN
  FOR v_lead IN
    SELECT DISTINCT l.id AS lid, l.organization_id AS org
    FROM public.leads l
    WHERE l.organization_id = p_organization_id
      AND EXISTS (
        SELECT 1 FROM public.webchat_conversations wc
        JOIN public.webchat_messages wm ON wm.conversation_id = wc.id
        WHERE wc.lead_id = l.id AND wc.organization_id = p_organization_id
          AND wm.direction = 'inbound' AND wm.sender_type = 'visitor'
          AND COALESCE(wm.provider_occurred_at, wm.created_at) >= '2026-09-01 00:00:00+00'::timestamptz
      )
  LOOP
    -- Obrigação pendente real -- a mais antiga ainda não paga.
    SELECT pa.id INTO v_pa_id
    FROM public.purchase_audit pa
    WHERE pa.lead_id = v_lead.lid AND (pa.purchase_status IS NULL OR pa.purchase_status NOT IN ('success', 'recognized'))
    ORDER BY pa.created_at ASC
    LIMIT 1;

    IF v_pa_id IS NOT NULL THEN
      SELECT c.status, c.dispatch_id INTO v_create_status, v_dispatch_id
      FROM public.manual_charge_create_dispatch_for_obligation(p_organization_id, v_lead.lid, v_pa_id, p_campaign_prefix || '-' || v_pa_id::text) c;

      IF v_dispatch_id IS NOT NULL THEN
        -- Classifica e registra cada mensagem de Setembro em ordem --
        -- mesma heurística de teste da prévia (nunca a de produção).
        FOR v_msg IN
          SELECT wm.id AS mid, wm.conversation_id AS cid, wm.content
          FROM public.webchat_conversations wc
          JOIN public.webchat_messages wm ON wm.conversation_id = wc.id
          WHERE wc.lead_id = v_lead.lid AND wc.organization_id = p_organization_id
            AND wm.direction = 'inbound' AND wm.sender_type = 'visitor'
            AND COALESCE(wm.provider_occurred_at, wm.created_at) >= '2026-09-01 00:00:00+00'::timestamptz
          ORDER BY COALESCE(wm.provider_occurred_at, wm.created_at) ASC
        LOOP
          SELECT c.signal, c.detected_date, c.date_precision INTO v_signal, v_date, v_precision
          FROM public.manual_charge_september_2026_classify_message(v_msg.content) c;

          IF v_signal = 'payment_informed' THEN
            PERFORM public.manual_charge_record_classified_signal(v_dispatch_id, v_lead.lid, v_msg.cid, v_msg.mid, 'payment_claimed', NULL, v_msg.content, 'sept2026_ingest_stub', '1');
          ELSIF v_signal = 'refused' THEN
            PERFORM public.manual_charge_record_classified_signal(v_dispatch_id, v_lead.lid, v_msg.cid, v_msg.mid, 'refused_contact', NULL, v_msg.content, 'sept2026_ingest_stub', '1');
          ELSIF v_signal = 'promised_date' THEN
            PERFORM public.manual_charge_record_classified_signal(v_dispatch_id, v_lead.lid, v_msg.cid, v_msg.mid,
              'promised_date', v_date, v_msg.content, 'sept2026_ingest_stub', '1', NULL, COALESCE(v_precision, 'exact'));
          ELSIF v_signal = 'ambiguous' THEN
            PERFORM public.manual_charge_record_classified_signal(v_dispatch_id, v_lead.lid, v_msg.cid, v_msg.mid, 'ambiguous', NULL, v_msg.content, 'sept2026_ingest_stub', '1');
          END IF;
        END LOOP;

        -- Achado real: chamar schedule_dispatch incondicionalmente,
        -- mesmo quando capture_scheduling_inputs não achou promessa
        -- alguma (ex.: dispatch só com recusa/pagamento alegado,
        -- nenhum promised_date), fazia schedule_dispatch rotular o
        -- motivo como "blocked_no_connection" (o primeiro check que
        -- falha) -- enganoso, já que o problema real é "não há data
        -- prometida", não a conexão. Só agenda quando a captura
        -- realmente achou/atualizou uma data.
        SELECT c.status INTO v_capture_status FROM public.manual_charge_capture_scheduling_inputs(v_dispatch_id) c;
        IF v_capture_status IN ('inputs_captured', 'inputs_unchanged') THEN
          PERFORM public.manual_charge_schedule_dispatch(v_dispatch_id);
        END IF;

        -- Achado real (visto na captura de tela integrada): sem chamar
        -- manual_charge_evaluate aqui, dispatches recusados/com
        -- pagamento alegado ficavam mostrando "eligible" no painel
        -- (valor padrão da coluna) até algum passo LATER chamar
        -- evaluate -- o painel mentia por omissão. Chama aqui para que
        -- a situação exibida reflita a realidade imediatamente após a
        -- carga, nunca dependendo de um passo futuro pra "descobrir"
        -- uma recusa/pagamento que já existia.
        PERFORM public.manual_charge_evaluate(v_dispatch_id);
      END IF;

      lead_id := v_lead.lid; outcome := v_create_status; dispatch_id := v_dispatch_id;
      RETURN NEXT;
    ELSE
      -- Sem obrigação real -- verifica se é um compromisso voluntário
      -- explícito (nunca cria dispatch, nunca afirma dívida).
      SELECT wm.id, wm.conversation_id, wm.content INTO v_msg
      FROM public.webchat_conversations wc
      JOIN public.webchat_messages wm ON wm.conversation_id = wc.id
      WHERE wc.lead_id = v_lead.lid AND wc.organization_id = p_organization_id
        AND wm.direction = 'inbound' AND wm.sender_type = 'visitor'
        AND lower(wm.content) ~ '(quero contribuir|vou contribuir|posso contribuir|contribuicao|contribuição)'
      ORDER BY COALESCE(wm.provider_occurred_at, wm.created_at) DESC
      LIMIT 1;

      IF v_msg.id IS NOT NULL THEN
        INSERT INTO public.manual_charge_voluntary_commitments (organization_id, lead_id, conversation_id, source_message_id, raw_excerpt)
        VALUES (p_organization_id, v_lead.lid, v_msg.conversation_id, v_msg.id, left(v_msg.content, 200))
        ON CONFLICT (organization_id, source_message_id) DO NOTHING;
        lead_id := v_lead.lid; outcome := 'voluntary_commitment_recorded'; dispatch_id := NULL;
      ELSE
        lead_id := v_lead.lid; outcome := 'no_obligation_no_commitment_skipped'; dispatch_id := NULL;
      END IF;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_september_2026_ingest IS
  'Carga REAL (grava), idempotente por composição -- reexecutar só processa o que mudou. Reusa o classificador de teste (rotulado como tal). Compromisso voluntário (sem obrigação real) nunca vira dispatch -- só manual_charge_voluntary_commitments, visibilidade sem cobrança.';

REVOKE ALL ON FUNCTION public.manual_charge_september_2026_ingest(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_september_2026_ingest(uuid, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- manual_charge_worker_tick_simulated -- demonstra o fluxo completo
-- (agendamento -> reivindicação -> fronteira do provider -> resultado)
-- com um provedor SIMULADO (p_simulated_outcome controla o resultado --
-- nunca uma chamada de rede real). Processa NO MÁXIMO um dispatch por
-- chamada (o próximo scheduled+devido para a conexão), para poder
-- observar cada passo isoladamente nos testes (reinício, reconexão,
-- resposta chegando antes do envio).
-- ═══════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.manual_charge_worker_tick_simulated(
  p_organization_id uuid,
  p_connection_id uuid,
  p_simulated_outcome text DEFAULT 'sent'
) RETURNS TABLE(dispatch_id uuid, outcome text, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_next_id uuid;
  v_pre_ok boolean;
  v_pre_reason text;
  v_claim_status text;
  v_claim_token uuid;
  v_attempt_id uuid;
  v_boundary_attempt uuid;
  v_result_status text;
BEGIN
  IF p_simulated_outcome NOT IN ('sent', 'failed', 'unknown_result') THEN
    RAISE EXCEPTION 'invalid_simulated_outcome' USING ERRCODE = 'P0013';
  END IF;

  SELECT d.id INTO v_next_id
  FROM public.manual_charge_dispatches d
  WHERE d.organization_id = p_organization_id AND d.connection_id = p_connection_id
    AND d.status = 'eligible' AND d.scheduling_status = 'scheduled'
    AND d.planned_send_at <= now()
  ORDER BY d.planned_send_at ASC
  LIMIT 1;

  IF v_next_id IS NULL THEN
    dispatch_id := NULL; outcome := 'nothing_due'; detail := NULL;
    RETURN NEXT; RETURN;
  END IF;

  -- Revalidação imediatamente antes do envio -- pode ter mudado desde
  -- que foi agendado (mensagem nova, pagamento, recusa, pausa, conexão).
  SELECT p.ok, p.reason INTO v_pre_ok, v_pre_reason FROM public.manual_charge_prevalidate_send(v_next_id) p;
  IF v_pre_ok IS NOT TRUE THEN
    dispatch_id := v_next_id; outcome := 'blocked_at_prevalidate'; detail := v_pre_reason;
    RETURN NEXT; RETURN;
  END IF;

  SELECT c.status, c.claim_token, c.attempt_id INTO v_claim_status, v_claim_token, v_attempt_id
  FROM public.claim_charge_for_send(v_next_id, 'automatic:worker-simulated') c;

  IF v_claim_status <> 'sending' THEN
    dispatch_id := v_next_id; outcome := 'claim_failed'; detail := v_claim_status;
    RETURN NEXT; RETURN;
  END IF;

  -- Fronteira objetiva ANTES de "chamar o provider" -- se zero linhas,
  -- aborta sem simular envio algum.
  SELECT b.attempt_id INTO v_boundary_attempt FROM public.mark_provider_boundary(v_next_id, v_attempt_id, v_claim_token) b;
  IF v_boundary_attempt IS NULL THEN
    dispatch_id := v_next_id; outcome := 'boundary_not_crossed'; detail := NULL;
    RETURN NEXT; RETURN;
  END IF;

  -- ── PROVEDOR SIMULADO -- nenhuma chamada de rede real acontece aqui.
  --    p_simulated_outcome é controlado só pelo teste. ──
  v_result_status := p_simulated_outcome;

  SELECT r.status INTO v_result_status FROM public.record_send_result(v_next_id, v_attempt_id, p_simulated_outcome, jsonb_build_object('simulated', true)) r;

  dispatch_id := v_next_id; outcome := 'attempt_completed'; detail := p_simulated_outcome;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_worker_tick_simulated IS
  'Demonstra o fluxo completo (agendamento->claim->fronteira do provider->resultado) com provedor SIMULADO (p_simulated_outcome, nunca rede real). Processa no máximo 1 dispatch por chamada (o próximo devido) -- revalida imediatamente antes via manual_charge_prevalidate_send. unknown_result nunca é reprocessado automaticamente por esta function -- exige reconcile_unknown_result (humano/separado).';

REVOKE ALL ON FUNCTION public.manual_charge_worker_tick_simulated(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_worker_tick_simulated(uuid, uuid, text) TO service_role;
