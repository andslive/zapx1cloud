-- Cascade delete a lead and all its history/tags/related data
CREATE OR REPLACE FUNCTION public.delete_lead_cascade(_lead_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_admin boolean := false;
  _org_id uuid;
  _conv_ids uuid[];
  _deleted_count int := 0;
  _lead record;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Allow super_admin/admin/manager (anyone with management role)
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _caller
      AND role IN ('super_admin','admin','manager')
  ) INTO _is_admin;

  -- Loop: enforce org scope per lead
  FOR _lead IN SELECT id, organization_id FROM public.leads WHERE id = ANY(_lead_ids)
  LOOP
    -- Check caller belongs to org or is super_admin
    IF NOT (
      public.has_role(_caller, 'super_admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = _caller AND p.organization_id = _lead.organization_id
      )
    ) THEN
      CONTINUE;
    END IF;

    -- Collect conversation ids tied to this lead
    SELECT array_agg(id) INTO _conv_ids
    FROM public.webchat_conversations WHERE lead_id = _lead.id;

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

    -- Delete all lead-keyed rows
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