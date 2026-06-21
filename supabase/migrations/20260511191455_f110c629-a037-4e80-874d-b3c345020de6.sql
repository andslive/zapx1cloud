
-- 1) Coluna calculada de telefone normalizado em webchat_conversations
ALTER TABLE public.webchat_conversations
  ADD COLUMN IF NOT EXISTS visitor_phone_normalized text
  GENERATED ALWAYS AS (public.normalize_phone_br(visitor_phone)) STORED;

CREATE INDEX IF NOT EXISTS idx_webchat_conversations_phone_norm
  ON public.webchat_conversations (organization_id, channel, visitor_phone_normalized)
  WHERE visitor_phone_normalized IS NOT NULL AND visitor_phone_normalized <> '';

-- 2) Consolida duplicatas existentes (preserva a conversa mais recente com instância/atendimento)
DO $dedup$
DECLARE
  grp RECORD;
  keeper_id uuid;
  dup_ids uuid[];
  child_tables text[] := ARRAY[
    'webchat_messages','scheduled_messages','orchestration_logs',
    'agent_activation_logs','agent_tool_executions','agent_action_logs',
    'ai_outreach_queue','ai_response_feedback','payment_links',
    'cakto_recovery_dispatches','lead_semantic_memory','webchat_assignment_events',
    'message_reactions','ai_quality_evaluations','conversation_transfers',
    'conversation_notes','agent_handoff_history'
  ];
  t text;
BEGIN
  FOR grp IN
    SELECT organization_id, channel, visitor_phone_normalized
    FROM public.webchat_conversations
    WHERE visitor_phone_normalized IS NOT NULL AND visitor_phone_normalized <> ''
    GROUP BY organization_id, channel, visitor_phone_normalized
    HAVING count(*) > 1
  LOOP
    -- escolhe principal: tem instância > não fechada > último update > criada antes
    SELECT id INTO keeper_id
    FROM public.webchat_conversations
    WHERE organization_id = grp.organization_id
      AND channel = grp.channel
      AND visitor_phone_normalized = grp.visitor_phone_normalized
    ORDER BY
      (evolution_instance_id IS NOT NULL) DESC,
      (status <> 'closed') DESC,
      COALESCE(last_message_at, updated_at, created_at) DESC,
      created_at ASC
    LIMIT 1;

    SELECT array_agg(id) INTO dup_ids
    FROM public.webchat_conversations
    WHERE organization_id = grp.organization_id
      AND channel = grp.channel
      AND visitor_phone_normalized = grp.visitor_phone_normalized
      AND id <> keeper_id;

    IF dup_ids IS NULL OR array_length(dup_ids,1) IS NULL THEN CONTINUE; END IF;

    -- migra filhos para a conversa principal
    FOREACH t IN ARRAY child_tables LOOP
      BEGIN
        EXECUTE format('UPDATE public.%I SET conversation_id = $1 WHERE conversation_id = ANY($2)', t)
        USING keeper_id, dup_ids;
      EXCEPTION WHEN undefined_table OR undefined_column THEN
        NULL;
      END;
    END LOOP;

    -- garante lead_id na keeper se houver alguma duplicada com lead vinculado
    UPDATE public.webchat_conversations k
       SET lead_id = COALESCE(k.lead_id,
             (SELECT lead_id FROM public.webchat_conversations
               WHERE id = ANY(dup_ids) AND lead_id IS NOT NULL
               ORDER BY created_at DESC LIMIT 1))
     WHERE k.id = keeper_id;

    -- canonicaliza telefone na keeper
    UPDATE public.webchat_conversations
       SET visitor_phone = grp.visitor_phone_normalized
     WHERE id = keeper_id;

    -- apaga as duplicadas
    DELETE FROM public.webchat_conversations WHERE id = ANY(dup_ids);
  END LOOP;
END
$dedup$;

-- 3) Trava única: 1 conversa ABERTA por (org, channel, phone_normalized)
CREATE UNIQUE INDEX IF NOT EXISTS webchat_conv_open_phone_unique
  ON public.webchat_conversations (organization_id, channel, visitor_phone_normalized)
  WHERE status <> 'closed'
    AND visitor_phone_normalized IS NOT NULL
    AND visitor_phone_normalized <> '';

-- 4) Atualiza exclusão em cascata para também apagar conversas órfãs do mesmo telefone
CREATE OR REPLACE FUNCTION public.delete_lead_cascade(_lead_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _conv_ids uuid[];
  _deleted_count int := 0;
  _lead record;
  _phone_norm text;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  FOR _lead IN SELECT id, organization_id, phone FROM public.leads WHERE id = ANY(_lead_ids)
  LOOP
    IF NOT (
      public.has_role(_caller, 'super_admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = _caller AND p.organization_id = _lead.organization_id
      )
    ) THEN
      CONTINUE;
    END IF;

    _phone_norm := public.normalize_phone_br(_lead.phone);

    -- coleta conversas vinculadas pelo lead OU pelo telefone normalizado (qualquer status)
    SELECT array_agg(DISTINCT id) INTO _conv_ids
    FROM public.webchat_conversations
    WHERE organization_id = _lead.organization_id
      AND (
        lead_id = _lead.id
        OR (_phone_norm IS NOT NULL AND _phone_norm <> '' AND visitor_phone_normalized = _phone_norm)
      );

    IF _conv_ids IS NOT NULL THEN
      DELETE FROM public.webchat_messages WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.scheduled_messages WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.orchestration_logs WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.agent_activation_logs WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.agent_tool_executions WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.agent_action_logs WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.ai_outreach_queue WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.ai_response_feedback WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.payment_links WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.cakto_recovery_dispatches WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.lead_semantic_memory WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.webchat_assignment_events WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.message_reactions WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.ai_quality_evaluations WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.conversation_transfers WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.conversation_notes WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.agent_handoff_history WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.webchat_conversations WHERE id = ANY(_conv_ids);
    END IF;

    DELETE FROM public.agent_action_logs WHERE lead_id = _lead.id;
    DELETE FROM public.agent_activation_logs WHERE lead_id = _lead.id;
    DELETE FROM public.agent_handoff_history WHERE lead_id = _lead.id;
    DELETE FROM public.agent_tool_executions WHERE lead_id = _lead.id;
    DELETE FROM public.ai_outreach_queue WHERE lead_id = _lead.id;
    DELETE FROM public.ai_quality_evaluations WHERE lead_id = _lead.id;
    DELETE FROM public.booking_requests WHERE lead_id = _lead.id;
    DELETE FROM public.cakto_orders WHERE lead_id = _lead.id;
    DELETE FROM public.cakto_recovery_dispatches WHERE lead_id = _lead.id;
    DELETE FROM public.calendar_events WHERE lead_id = _lead.id;
    DELETE FROM public.deals WHERE lead_id = _lead.id;
    DELETE FROM public.facebook_lead_logs WHERE lead_id = _lead.id;
    DELETE FROM public.form_submissions WHERE lead_id = _lead.id;
    DELETE FROM public.funnel_webhook_logs WHERE lead_id = _lead.id;
    DELETE FROM public.interactions WHERE lead_id = _lead.id;
    DELETE FROM public.lead_notes WHERE lead_id = _lead.id;
    DELETE FROM public.lead_queue WHERE lead_id = _lead.id;
    DELETE FROM public.lead_semantic_memory WHERE lead_id = _lead.id;
    DELETE FROM public.lead_stage_history WHERE lead_id = _lead.id;
    DELETE FROM public.lead_tag_assignments WHERE lead_id = _lead.id;
    DELETE FROM public.lead_transfer_history WHERE lead_id = _lead.id;
    DELETE FROM public.orchestration_logs WHERE lead_id = _lead.id;
    DELETE FROM public.payment_links WHERE lead_id = _lead.id;
    DELETE FROM public.post_sale_event_logs WHERE lead_id = _lead.id;
    DELETE FROM public.post_sale_scheduled_runs WHERE lead_id = _lead.id;
    DELETE FROM public.tasks WHERE lead_id = _lead.id;
    DELETE FROM public.webhook_logs WHERE lead_id = _lead.id;

    DELETE FROM public.leads WHERE id = _lead.id;
    _deleted_count := _deleted_count + 1;
  END LOOP;

  RETURN jsonb_build_object('deleted', _deleted_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_lead_cascade(uuid[]) TO authenticated;
