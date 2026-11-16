-- ═══════════════════════════════════════════════════════════════════════
-- Carga inicial de setembro/2026 -- PRÉVIA SEM ESCRITA. Nenhuma function
-- desta migration insere/altera manual_charge_dispatches,
-- manual_charge_conversation_facts, payment_claim_events ou
-- manual_charge_suppressions. Tudo aqui é leitura pura.
--
-- ESCOPO REAL, DECLARADO: a classificação de texto usada aqui
-- (manual_charge_september_2026_classify_message) é uma heurística de
-- palavras-chave SIMPLES, só para provar o mecanismo com dados
-- sintéticos -- NÃO é o classificador de produção (que dependeria de IA
-- real e de acesso a conversas reais, ambos fora de autorização nesta
-- etapa). Antes de qualquer carga real em produção, esta função precisa
-- ser substituída ou complementada por um classificador de verdade --
-- reportado como pendência explícita.
--
-- "Não tratar contribuição voluntária como dívida": só entram como
-- candidatos leads com uma obrigação de compra JÁ REGISTRADA em
-- purchase_audit (qualquer status que não seja já reconhecido como pago)
-- -- nunca todo lead que mencionou dinheiro ou demonstrou interesse.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Heurística de classificação por mensagem (stand-in de teste) ──
CREATE FUNCTION public.manual_charge_september_2026_classify_message(
  p_content text
) RETURNS TABLE(signal text, detected_date date)
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
    RETURN QUERY SELECT 'payment_informed'::text, NULL::date; RETURN;
  END IF;

  IF v_lower ~ '(não me (liga|manda|incomod)|nao me (liga|manda|incomod)|pare de|para de mandar|não quero mais|nao quero mais)' THEN
    RETURN QUERY SELECT 'refused'::text, NULL::date; RETURN;
  END IF;

  -- Aceita com e sem acentuação (mês/mes) -- mensagens reais de lead
  -- frequentemente vêm sem acento.
  IF v_lower ~ '(final do m[eê]s|final de setembro|fim do m[eê]s|fim de setembro|at[eé] o fim do m[eê]s)' THEN
    RETURN QUERY SELECT 'promised_date'::text, '2026-09-29'::date; RETURN;
  END IF;

  -- "dia N" dentro do próprio mês corrente assumido (setembro/2026) --
  -- heurística deliberadamente simples; datas ambíguas (sem mês claro)
  -- ficam como sinal fraco, tratadas mais abaixo.
  v_match := regexp_match(v_lower, 'dia (\d{1,2})');
  IF v_match IS NOT NULL THEN
    v_day := v_match[1]::int;
    IF v_day BETWEEN 1 AND 31 THEN
      BEGIN
        RETURN QUERY SELECT 'promised_date'::text, make_date(2026, 9, v_day); RETURN;
      EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'ambiguous'::text, NULL::date; RETURN;
      END;
    END IF;
  END IF;

  IF v_lower ~ '(depois|mais pra frente|quando eu conseguir|quando puder|em breve)' THEN
    -- Explicitamente NÃO tratado como "final do mês" -- fica ambíguo
    -- para revisão, nunca herda a regra de 29/09.
    RETURN QUERY SELECT 'ambiguous'::text, NULL::date; RETURN;
  END IF;

  RETURN QUERY SELECT 'no_signal'::text, NULL::date;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_september_2026_classify_message IS
  'Heurística de teste (palavras-chave), NÃO o classificador de produção. "depois"/"quando eu conseguir" NUNCA herdam a regra de final de mês -- ficam ambíguos.';

-- ═══════════════════════════════════════════════════════════════════════
-- manual_charge_september_2026_dry_run_preview -- prévia PURAMENTE DE
-- LEITURA. Para cada lead candidato (obrigação pendente em purchase_audit
-- + pelo menos 1 mensagem inbound desde 01/09/2026 até agora), processa
-- as mensagens EM ORDEM DE OCORRÊNCIA (provider_occurred_at, fallback
-- created_at) e mantém o estado mais atual -- uma mensagem posterior
-- (pagamento, recusa, nova data) sempre pode invalidar uma promessa
-- anterior, nunca o contrário.
-- ═══════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.manual_charge_september_2026_dry_run_preview(
  p_organization_id uuid
) RETURNS TABLE(
  lead_id uuid,
  conversation_id uuid,
  connection_id uuid,
  phone_normalized text,
  bucket text,
  detected_date date,
  source_message_id uuid,
  source_message_excerpt text,
  message_occurred_at timestamptz
)
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_lead RECORD;
  v_msg RECORD;
  v_signal text;
  v_date date;
  v_current_bucket text;
  v_current_date date;
  v_current_msg_id uuid;
  v_current_excerpt text;
  v_current_occurred_at timestamptz;
BEGIN
  FOR v_lead IN
    SELECT DISTINCT l.id AS lead_id, l.organization_id, l.phone_normalized
    FROM public.leads l
    WHERE l.organization_id = p_organization_id
      -- obrigação pendente real (nunca contribuição voluntária/interesse
      -- genérico) -- exige purchase_audit não reconhecido como pago.
      AND EXISTS (
        SELECT 1 FROM public.purchase_audit pa
        WHERE pa.lead_id = l.id
          AND (pa.purchase_status IS NULL OR pa.purchase_status NOT IN ('success', 'recognized'))
      )
      -- pelo menos 1 mensagem inbound desde 01/09/2026
      AND EXISTS (
        SELECT 1 FROM public.webchat_conversations wc
        JOIN public.webchat_messages wm ON wm.conversation_id = wc.id
        WHERE wc.lead_id = l.id AND wc.organization_id = p_organization_id
          AND wm.direction = 'inbound' AND wm.sender_type = 'visitor'
          AND COALESCE(wm.provider_occurred_at, wm.created_at) >= '2026-09-01 00:00:00+00'::timestamptz
      )
  LOOP
    v_current_bucket := NULL;
    v_current_date := NULL;
    v_current_msg_id := NULL;
    v_current_excerpt := NULL;
    v_current_occurred_at := NULL;

    FOR v_msg IN
      SELECT wm.id, wm.conversation_id AS conv_id, wc.evolution_instance_id AS conn_id,
             wm.content, COALESCE(wm.provider_occurred_at, wm.created_at) AS occurred_at
      FROM public.webchat_conversations wc
      JOIN public.webchat_messages wm ON wm.conversation_id = wc.id
      WHERE wc.lead_id = v_lead.lead_id AND wc.organization_id = p_organization_id
        AND wm.direction = 'inbound' AND wm.sender_type = 'visitor'
        AND COALESCE(wm.provider_occurred_at, wm.created_at) >= '2026-09-01 00:00:00+00'::timestamptz
      ORDER BY COALESCE(wm.provider_occurred_at, wm.created_at) ASC
    LOOP
      SELECT c.signal, c.detected_date INTO v_signal, v_date
      FROM public.manual_charge_september_2026_classify_message(v_msg.content) c;

      -- Contexto posterior invalida o anterior: qualquer sinal decisivo
      -- (payment_informed/refused/promised_date) SUBSTITUI o estado
      -- corrente. no_signal/ambiguous só assumem o lugar se ainda não
      -- houver NENHUM sinal decisivo -- nunca apagam um já estabelecido
      -- (mesma disciplina de manual_charge_conversation_current_facts).
      IF v_signal IN ('payment_informed', 'refused', 'promised_date') THEN
        v_current_bucket := v_signal;
        v_current_date := v_date;
        v_current_msg_id := v_msg.id;
        v_current_excerpt := left(v_msg.content, 200);
        v_current_occurred_at := v_msg.occurred_at;
      ELSIF v_current_bucket IS NULL THEN
        v_current_bucket := v_signal; -- ambiguous ou no_signal, provisório
        v_current_date := NULL;
        v_current_msg_id := v_msg.id;
        v_current_excerpt := left(v_msg.content, 200);
        v_current_occurred_at := v_msg.occurred_at;
      END IF;
    END LOOP;

    -- "não incluir indiscriminadamente": sem NENHUM sinal (nem ambíguo)
    -- em toda a janela, exclui totalmente -- nunca aparece na prévia.
    IF v_current_bucket IS NULL OR v_current_bucket = 'no_signal' THEN
      CONTINUE;
    END IF;

    -- purchase_audit já reconhecido como pago SEMPRE vence qualquer
    -- sinal de conversa -- pagamento confirmado é diferente de
    -- "informado" (que ainda pede verificação).
    IF EXISTS (
      SELECT 1 FROM public.purchase_audit pa
      WHERE pa.lead_id = v_lead.lead_id AND pa.purchase_status IN ('success', 'recognized')
    ) THEN
      v_current_bucket := 'payment_confirmed';
    END IF;

    -- Classifica promised_date entre elegível/futuro/pendência de regra,
    -- na MESMA lógica já usada no agendamento real (piso 29/09/2026).
    IF v_current_bucket = 'promised_date' THEN
      IF v_current_date >= '2026-09-29'::date THEN
        v_current_bucket := 'eligible_future_date';
      ELSE
        v_current_bucket := 'overdue_pending_rule';
      END IF;
    END IF;

    lead_id := v_lead.lead_id;
    conversation_id := (SELECT wm2.conv_id FROM (SELECT wc.id AS conv_id FROM public.webchat_conversations wc WHERE wc.lead_id = v_lead.lead_id AND wc.organization_id = p_organization_id ORDER BY wc.updated_at DESC NULLS LAST LIMIT 1) wm2);
    connection_id := (SELECT wc.evolution_instance_id FROM public.webchat_conversations wc WHERE wc.lead_id = v_lead.lead_id AND wc.organization_id = p_organization_id ORDER BY wc.updated_at DESC NULLS LAST LIMIT 1);
    phone_normalized := v_lead.phone_normalized;
    bucket := v_current_bucket;
    detected_date := v_current_date;
    source_message_id := v_current_msg_id;
    source_message_excerpt := v_current_excerpt;
    message_occurred_at := v_current_occurred_at;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_september_2026_dry_run_preview IS
  'PRÉVIA SOMENTE LEITURA -- nenhum INSERT/UPDATE. Candidatos: obrigação pendente em purchase_audit + mensagem inbound desde 01/09/2026. Processa mensagens em ordem de OCORRÊNCIA (não inserção); um sinal decisivo posterior (pagamento/recusa/nova data) sempre substitui um anterior. Buckets: payment_informed, payment_confirmed, refused, eligible_future_date, overdue_pending_rule, ambiguous. Leads sem nenhum sinal (nem ambíguo) são excluídos por completo.';

REVOKE ALL ON FUNCTION public.manual_charge_september_2026_dry_run_preview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manual_charge_september_2026_dry_run_preview(uuid) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- Resumo agregado + estimativa de custo de classificação (SÓ leitura).
-- O custo é uma ESTIMATIVA rotulada explicitamente -- nunca um valor
-- cobrado real, que o provedor de IA ainda não informou (nenhuma
-- chamada de IA acontece aqui).
-- ═══════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.manual_charge_september_2026_dry_run_summary(
  p_organization_id uuid,
  p_estimated_cost_per_message_usd numeric DEFAULT 0.002
) RETURNS TABLE(
  bucket text,
  lead_count bigint,
  estimated_classification_messages bigint,
  estimated_classification_cost_usd numeric
)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  WITH preview AS (
    SELECT * FROM public.manual_charge_september_2026_dry_run_preview(p_organization_id)
  ),
  msg_counts AS (
    SELECT p.lead_id, count(*) AS msg_count
    FROM preview p
    JOIN public.webchat_conversations wc ON wc.lead_id = p.lead_id AND wc.organization_id = p_organization_id
    JOIN public.webchat_messages wm ON wm.conversation_id = wc.id
    WHERE wm.direction = 'inbound' AND wm.sender_type = 'visitor'
      AND COALESCE(wm.provider_occurred_at, wm.created_at) >= '2026-09-01 00:00:00+00'::timestamptz
    GROUP BY p.lead_id
  )
  SELECT
    p.bucket,
    count(DISTINCT p.lead_id),
    COALESCE(sum(mc.msg_count), 0),
    round(COALESCE(sum(mc.msg_count), 0) * p_estimated_cost_per_message_usd, 4)
  FROM preview p
  LEFT JOIN msg_counts mc ON mc.lead_id = p.lead_id
  GROUP BY p.bucket
  ORDER BY p.bucket;
$$;

COMMENT ON FUNCTION public.manual_charge_september_2026_dry_run_summary IS
  'Contagens por bucket + estimativa de custo de classificação (ESTIMATIVA rotulada, parâmetro configurável, nunca um valor real cobrado -- nenhuma chamada de IA/provedor acontece nesta function). Só leitura.';

REVOKE ALL ON FUNCTION public.manual_charge_september_2026_dry_run_summary(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manual_charge_september_2026_dry_run_summary(uuid, numeric) TO authenticated, service_role;
