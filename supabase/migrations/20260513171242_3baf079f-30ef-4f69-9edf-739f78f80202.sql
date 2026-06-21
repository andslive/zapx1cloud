
-- 1) Drop unique index that depends on phone_normalized
DROP INDEX IF EXISTS public.leads_org_phone_unique;

-- 2) Drop generated column
ALTER TABLE public.leads DROP COLUMN IF EXISTS phone_normalized;

-- 3) Replace function with mobile-9 awareness
CREATE OR REPLACE FUNCTION public.normalize_phone_br(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  d text;
  ddd text;
  rest text;
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  d := regexp_replace(p, '\D', '', 'g');
  d := regexp_replace(d, '^0+', '', 'g');
  IF length(d) < 8 THEN RETURN NULL; END IF;

  -- Strip leading 55 to inspect the national portion
  IF left(d, 2) = '55' AND length(d) IN (12, 13) THEN
    d := substring(d from 3);
  END IF;

  -- Now d should be the national number: DDD(2) + 8 or 9 digits
  IF length(d) = 10 THEN
    ddd := substring(d from 1 for 2);
    rest := substring(d from 3);
    -- Mobile range starts 6-9; insert leading 9
    IF substring(rest from 1 for 1) ~ '[6-9]' THEN
      d := ddd || '9' || rest;
    END IF;
  END IF;

  IF length(d) IN (10, 11) THEN
    d := '55' || d;
  END IF;

  RETURN d;
END;
$function$;

-- 4) Recreate generated column (auto-populates)
ALTER TABLE public.leads
  ADD COLUMN phone_normalized text
  GENERATED ALWAYS AS (public.normalize_phone_br(phone)) STORED;

-- 5) Merge duplicates: keep oldest per (organization_id, phone_normalized)
DO $$
DECLARE
  grp RECORD;
  keeper UUID;
  victim_ids UUID[];
  newest_name TEXT;
  newest_email TEXT;
  fk_table TEXT;
  tables_with_lead_id TEXT[] := ARRAY[
    'agent_action_logs','agent_activation_logs','agent_handoff_history',
    'agent_tool_executions','ai_outreach_queue','ai_quality_evaluations',
    'booking_requests','cakto_orders','cakto_recovery_dispatches',
    'calendar_events','deals','facebook_lead_logs','form_submissions',
    'funnel_webhook_logs','interactions','lead_notes','lead_queue',
    'lead_semantic_memory','lead_stage_history','lead_tag_assignments',
    'lead_transfer_history','orchestration_logs','payment_links',
    'post_sale_event_logs','post_sale_scheduled_runs','tasks',
    'webchat_conversations','webhook_logs'
  ];
BEGIN
  FOR grp IN
    SELECT organization_id, phone_normalized, array_agg(id ORDER BY created_at ASC) AS ids
    FROM public.leads
    WHERE phone_normalized IS NOT NULL AND phone_normalized <> ''
    GROUP BY organization_id, phone_normalized
    HAVING count(*) > 1
  LOOP
    keeper := grp.ids[1];
    victim_ids := grp.ids[2:array_length(grp.ids, 1)];

    -- Pick newest non-empty name/email from the group
    SELECT name INTO newest_name FROM public.leads
      WHERE id = ANY(grp.ids) AND name IS NOT NULL AND name <> ''
      ORDER BY created_at DESC LIMIT 1;
    SELECT email INTO newest_email FROM public.leads
      WHERE id = ANY(grp.ids) AND email IS NOT NULL AND email <> ''
      ORDER BY created_at DESC LIMIT 1;

    -- Update keeper with newest values
    UPDATE public.leads
       SET name  = COALESCE(newest_name, name),
           email = COALESCE(email, newest_email)
     WHERE id = keeper;

    -- Repoint all FKs
    FOREACH fk_table IN ARRAY tables_with_lead_id LOOP
      EXECUTE format(
        'UPDATE public.%I SET lead_id = $1 WHERE lead_id = ANY($2)',
        fk_table
      ) USING keeper, victim_ids;
    END LOOP;

    -- Conversations table (if exists with lead_id)
    BEGIN
      EXECUTE 'UPDATE public.conversations SET lead_id = $1 WHERE lead_id = ANY($2)'
        USING keeper, victim_ids;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
    END;

    -- Compra aprovada eventos
    BEGIN
      EXECUTE 'UPDATE public.compra_aprovada_eventos SET lead_id = $1 WHERE lead_id = ANY($2)'
        USING keeper, victim_ids;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
    END;

    -- Lead score events
    BEGIN
      EXECUTE 'UPDATE public.lead_score_events SET lead_id = $1 WHERE lead_id = ANY($2)'
        USING keeper, victim_ids;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
    END;

    -- Finally delete victims (FKs that were not handled above will SET NULL or CASCADE)
    DELETE FROM public.leads WHERE id = ANY(victim_ids);
  END LOOP;
END $$;

-- 6) Recreate unique index
CREATE UNIQUE INDEX leads_org_phone_unique
  ON public.leads (organization_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL AND phone_normalized <> '';
