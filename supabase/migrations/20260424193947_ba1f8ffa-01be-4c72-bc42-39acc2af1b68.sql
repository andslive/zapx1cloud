ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS max_connections INTEGER NULL;

CREATE OR REPLACE FUNCTION public.get_organization_effective_limits(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org RECORD;
  v_plan RECORD;
  v_result JSONB;
BEGIN
  SELECT * INTO v_org FROM public.organizations WHERE id = p_org_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_org.plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.platform_plans WHERE id = v_org.plan_id;
  END IF;

  v_result := jsonb_build_object(
    'plan_id', v_org.plan_id,
    'plan_name', COALESCE(v_plan.name, 'Personalizado'),
    'plan_slug', COALESCE(v_plan.slug, 'custom'),
    'limits', jsonb_build_object(
      'max_users', COALESCE(v_org.max_users, v_plan.max_users, 5),
      'max_connections', COALESCE(v_org.max_connections, v_plan.max_connections, 1),
      'max_sectors', COALESCE(v_plan.max_sectors, 3),
      'max_products', COALESCE(v_org.max_products, v_plan.max_products, 5),
      'max_contacts', COALESCE(v_plan.max_contacts, 1000),
      'max_messages_month', COALESCE(v_plan.max_messages_month, 5000),
      'max_ai_tokens_month', COALESCE(v_plan.max_ai_tokens_month, 100000)
    ),
    'features', COALESCE(v_org.features, '{}'::jsonb) || jsonb_build_object(
      'whatsapp', COALESCE(v_plan.feature_whatsapp, true),
      'facebook', COALESCE(v_plan.feature_facebook, false),
      'instagram', COALESCE(v_plan.feature_instagram, false),
      'campaigns', COALESCE(v_plan.feature_campaigns, false),
      'scheduling', COALESCE(v_plan.feature_scheduling, true),
      'internal_chat', COALESCE(v_plan.feature_internal_chat, true),
      'external_api', COALESCE(v_plan.feature_external_api, false),
      'kanban', COALESCE(v_plan.feature_kanban, true),
      'pipeline', COALESCE(v_plan.feature_pipeline, true),
      'integrations', COALESCE(v_plan.feature_integrations, false),
      'audio_transcription_ai', COALESCE(v_plan.feature_audio_transcription_ai, false),
      'text_correction_ai', COALESCE(v_plan.feature_text_correction_ai, false),
      'ai_agents', COALESCE(v_plan.feature_ai_agents, false),
      'voice_agents', COALESCE(v_plan.feature_voice_agents, false),
      'outreach', COALESCE(v_plan.feature_outreach, false),
      'capture_funnels', COALESCE(v_plan.feature_capture_funnels, false),
      'forms', COALESCE(v_plan.feature_forms, true),
      'webhooks', COALESCE(v_plan.feature_webhooks, false)
    ) || COALESCE(v_plan.extra_features, '{}'::jsonb)
  );

  RETURN v_result;
END;
$function$;