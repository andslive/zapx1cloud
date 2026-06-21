CREATE OR REPLACE FUNCTION public.delete_lead_cascade(_lead_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Verifica permissão (super_admin ou admin da mesma organização)
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

    -- Coleta conversas vinculadas pelo lead OU pelo telefone normalizado
    SELECT array_agg(DISTINCT id) INTO _conv_ids
    FROM public.webchat_conversations
    WHERE organization_id = _lead.organization_id
      AND (
        lead_id = _lead.id
        OR (_phone_norm IS NOT NULL AND _phone_norm <> '' AND visitor_phone_normalized = _phone_norm)
      );

    -- Exclui dependências das conversas
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
      DELETE FROM public.pixel_event_logs WHERE conversation_id = ANY(_conv_ids);
      DELETE FROM public.webchat_conversations WHERE id = ANY(_conv_ids);
    END IF;

    -- Exclui dependências diretas do lead
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
    DELETE FROM public.lead_tracking WHERE lead_id = _lead.id;
    DELETE FROM public.pixel_event_logs WHERE lead_id = _lead.id;

    -- Finalmente exclui o lead
    DELETE FROM public.leads WHERE id = _lead.id;
    _deleted_count := _deleted_count + 1;
  END LOOP;

  RETURN jsonb_build_object('deleted', _deleted_count);
END;
$function$;
