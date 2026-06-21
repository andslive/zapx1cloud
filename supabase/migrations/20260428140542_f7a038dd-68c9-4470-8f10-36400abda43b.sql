
CREATE OR REPLACE FUNCTION public.normalize_phone_br(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $func$
DECLARE
  digits text;
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  digits := regexp_replace(p, '\D', '', 'g');
  digits := regexp_replace(digits, '^0+', '', 'g');
  IF length(digits) < 8 THEN RETURN NULL; END IF;
  IF length(digits) IN (10, 11) THEN
    digits := '55' || digits;
  END IF;
  RETURN digits;
END;
$func$;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS phone_normalized text
  GENERATED ALWAYS AS (public.normalize_phone_br(phone)) STORED;

DO $dedup$
DECLARE
  grp RECORD;
  keeper_id uuid;
  dup_ids uuid[];
  fk_tables text[] := ARRAY[
    'agent_action_logs','agent_activation_logs','agent_handoff_history',
    'agent_tool_executions','ai_outreach_queue','ai_quality_evaluations',
    'booking_requests','cakto_recovery_dispatches','calendar_events','deals',
    'facebook_lead_logs','form_submissions','funnel_webhook_logs','interactions',
    'lead_notes','lead_queue','lead_semantic_memory','lead_stage_history',
    'lead_transfer_history','orchestration_logs','payment_links','tasks',
    'webchat_conversations','webhook_logs'
  ];
  t text;
BEGIN
  FOR grp IN
    SELECT organization_id, phone_normalized
    FROM public.leads
    WHERE phone_normalized IS NOT NULL AND phone_normalized <> ''
    GROUP BY organization_id, phone_normalized
    HAVING count(*) > 1
  LOOP
    SELECT l.id INTO keeper_id
    FROM public.leads l
    LEFT JOIN (
      SELECT lead_id, count(*) AS qty FROM public.interactions GROUP BY lead_id
    ) i ON i.lead_id = l.id
    WHERE l.organization_id = grp.organization_id
      AND l.phone_normalized = grp.phone_normalized
    ORDER BY COALESCE(i.qty, 0) DESC, l.created_at ASC, l.id ASC
    LIMIT 1;

    SELECT array_agg(id) INTO dup_ids
    FROM public.leads
    WHERE organization_id = grp.organization_id
      AND phone_normalized = grp.phone_normalized
      AND id <> keeper_id;

    IF dup_ids IS NULL OR array_length(dup_ids, 1) IS NULL THEN CONTINUE; END IF;

    FOREACH t IN ARRAY fk_tables LOOP
      EXECUTE format('UPDATE public.%I SET lead_id = $1 WHERE lead_id = ANY($2)', t)
      USING keeper_id, dup_ids;
    END LOOP;

    INSERT INTO public.lead_tag_assignments (lead_id, tag_id, source, applied_by, applied_at)
    SELECT keeper_id, tag_id, source, applied_by, applied_at
    FROM public.lead_tag_assignments
    WHERE lead_id = ANY(dup_ids)
    ON CONFLICT (lead_id, tag_id) DO NOTHING;
    DELETE FROM public.lead_tag_assignments WHERE lead_id = ANY(dup_ids);

    UPDATE public.leads SET
      email = COALESCE(email, (SELECT l2.email FROM public.leads l2 WHERE l2.id = ANY(dup_ids) AND l2.email IS NOT NULL AND l2.email <> '' ORDER BY l2.created_at ASC LIMIT 1)),
      company = COALESCE(company, (SELECT l2.company FROM public.leads l2 WHERE l2.id = ANY(dup_ids) AND l2.company IS NOT NULL AND l2.company <> '' ORDER BY l2.created_at ASC LIMIT 1)),
      position = COALESCE(position, (SELECT l2.position FROM public.leads l2 WHERE l2.id = ANY(dup_ids) AND l2.position IS NOT NULL AND l2.position <> '' ORDER BY l2.created_at ASC LIMIT 1)),
      utm_source = COALESCE(utm_source, (SELECT l2.utm_source FROM public.leads l2 WHERE l2.id = ANY(dup_ids) AND l2.utm_source IS NOT NULL ORDER BY l2.created_at ASC LIMIT 1)),
      utm_medium = COALESCE(utm_medium, (SELECT l2.utm_medium FROM public.leads l2 WHERE l2.id = ANY(dup_ids) AND l2.utm_medium IS NOT NULL ORDER BY l2.created_at ASC LIMIT 1)),
      utm_campaign = COALESCE(utm_campaign, (SELECT l2.utm_campaign FROM public.leads l2 WHERE l2.id = ANY(dup_ids) AND l2.utm_campaign IS NOT NULL ORDER BY l2.created_at ASC LIMIT 1)),
      utm_term = COALESCE(utm_term, (SELECT l2.utm_term FROM public.leads l2 WHERE l2.id = ANY(dup_ids) AND l2.utm_term IS NOT NULL ORDER BY l2.created_at ASC LIMIT 1)),
      utm_content = COALESCE(utm_content, (SELECT l2.utm_content FROM public.leads l2 WHERE l2.id = ANY(dup_ids) AND l2.utm_content IS NOT NULL ORDER BY l2.created_at ASC LIMIT 1)),
      bant_budget = COALESCE(bant_budget, (SELECT l2.bant_budget FROM public.leads l2 WHERE l2.id = ANY(dup_ids) AND l2.bant_budget IS NOT NULL ORDER BY l2.created_at DESC LIMIT 1)),
      bant_authority = COALESCE(bant_authority, (SELECT l2.bant_authority FROM public.leads l2 WHERE l2.id = ANY(dup_ids) AND l2.bant_authority IS NOT NULL ORDER BY l2.created_at DESC LIMIT 1)),
      bant_need = COALESCE(bant_need, (SELECT l2.bant_need FROM public.leads l2 WHERE l2.id = ANY(dup_ids) AND l2.bant_need IS NOT NULL ORDER BY l2.created_at DESC LIMIT 1)),
      bant_timing = COALESCE(bant_timing, (SELECT l2.bant_timing FROM public.leads l2 WHERE l2.id = ANY(dup_ids) AND l2.bant_timing IS NOT NULL ORDER BY l2.created_at DESC LIMIT 1)),
      sdr_id = COALESCE(sdr_id, (SELECT l2.sdr_id FROM public.leads l2 WHERE l2.id = ANY(dup_ids) AND l2.sdr_id IS NOT NULL ORDER BY l2.created_at DESC LIMIT 1)),
      closer_id = COALESCE(closer_id, (SELECT l2.closer_id FROM public.leads l2 WHERE l2.id = ANY(dup_ids) AND l2.closer_id IS NOT NULL ORDER BY l2.created_at DESC LIMIT 1)),
      deal_value = COALESCE(deal_value, (SELECT l2.deal_value FROM public.leads l2 WHERE l2.id = ANY(dup_ids) AND l2.deal_value IS NOT NULL ORDER BY l2.created_at DESC LIMIT 1)),
      metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(
        (SELECT jsonb_object_agg(key, value)
           FROM (
             SELECT DISTINCT ON (key) key, value
             FROM public.leads l2, jsonb_each(COALESCE(l2.metadata, '{}'::jsonb))
             WHERE l2.id = ANY(dup_ids)
             ORDER BY key, l2.created_at ASC
           ) sub
        ), '{}'::jsonb),
      notes = NULLIF(
        concat_ws(E'\n---\n',
          NULLIF(notes, ''),
          (SELECT string_agg(l2.notes, E'\n---\n' ORDER BY l2.created_at ASC)
             FROM public.leads l2
             WHERE l2.id = ANY(dup_ids) AND l2.notes IS NOT NULL AND l2.notes <> '')
        ), '')
    WHERE id = keeper_id;

    DELETE FROM public.leads WHERE id = ANY(dup_ids);
  END LOOP;
END
$dedup$;

CREATE UNIQUE INDEX IF NOT EXISTS leads_org_phone_unique
  ON public.leads (organization_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL AND phone_normalized <> '';
