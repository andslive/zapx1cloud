-- ============================================================
-- 04_functions.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_invitation(invitation_token text, user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv RECORD;
BEGIN
  SELECT * INTO inv FROM team_invitations 
  WHERE token = invitation_token 
  AND status = 'pending' 
  AND expires_at > now();
  
  IF inv IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Update profile with organization
  UPDATE profiles 
  SET organization_id = inv.organization_id 
  WHERE id = user_id;
  
  -- Add user role
  INSERT INTO user_roles (user_id, role)
  VALUES (user_id, inv.role)
  ON CONFLICT DO NOTHING;
  
  -- Add to squad if specified
  IF inv.squad_id IS NOT NULL THEN
    INSERT INTO squad_members (squad_id, user_id, role)
    VALUES (inv.squad_id, user_id, 'member')
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Initialize permissions based on role
  PERFORM public.initialize_user_permissions(user_id, inv.organization_id, inv.role::text);
  
  -- Mark invitation as accepted
  UPDATE team_invitations 
  SET status = 'accepted' 
  WHERE id = inv.id;
  
  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_tag_automations(p_lead_id uuid, p_event_type text, p_product_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(tag_id uuid, action text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid := p_organization_id;
  v_automation RECORD;
  v_tag_name text;
  v_inserted boolean;
BEGIN
  -- Resolve organization_id pelo lead se não passado
  IF v_org_id IS NULL THEN
    SELECT organization_id INTO v_org_id FROM leads WHERE id = p_lead_id;
    IF v_org_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  -- Itera automações ativas que casam com o evento
  -- Regras com product_id específico têm prioridade sobre globais (NULL)
  FOR v_automation IN
    SELECT ta.id, ta.tag_id_to_add, ta.product_id
    FROM tag_automations ta
    WHERE ta.organization_id = v_org_id
      AND ta.event_type = p_event_type
      AND ta.is_active = true
      AND (
        ta.product_id IS NULL
        OR ta.product_id = p_product_id
      )
    ORDER BY ta.product_id NULLS LAST -- específicas primeiro
  LOOP
    -- Tenta inserir; se já existe, ignora silenciosamente (preserva histórico original)
    INSERT INTO lead_tag_assignments (lead_id, tag_id, source, applied_by)
    VALUES (p_lead_id, v_automation.tag_id_to_add, 'automation', NULL)
    ON CONFLICT (lead_id, tag_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted::int > 0 THEN
      -- Busca nome da tag pra nota de auditoria
      SELECT name INTO v_tag_name FROM lead_tags WHERE id = v_automation.tag_id_to_add;

      -- Registra nota de auditoria
      INSERT INTO lead_notes (lead_id, organization_id, content, note_type, created_by)
      VALUES (
        p_lead_id,
        v_org_id,
        format('Etiqueta "%s" aplicada automaticamente (evento: %s)', COALESCE(v_tag_name, 'desconhecida'), p_event_type),
        'system',
        NULL
      );

      tag_id := v_automation.tag_id_to_add;
      action := 'added';
      RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_commission(p_deal_id uuid, p_deal_value numeric, p_product_id uuid, p_seller_id uuid, p_organization_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rule RECORD;
  v_commission NUMERIC;
BEGIN
  -- Buscar regra específica do vendedor ou regra padrão
  SELECT * INTO v_rule
  FROM public.commission_rules
  WHERE product_id = p_product_id
    AND organization_id = p_organization_id
    AND is_active = true
    AND (user_id = p_seller_id OR (user_id IS NULL AND is_default = true))
  ORDER BY user_id NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Calcular comissão baseado no tipo de regra
  IF v_rule.rule_type = 'percentage' THEN
    v_commission := p_deal_value * (v_rule.base_value / 100);
  ELSE
    v_commission := v_rule.base_value;
  END IF;

  -- Aplicar limites min/max
  IF v_rule.min_value IS NOT NULL AND v_commission < v_rule.min_value THEN
    v_commission := v_rule.min_value;
  END IF;
  
  IF v_rule.max_value IS NOT NULL AND v_commission > v_rule.max_value THEN
    v_commission := v_rule.max_value;
  END IF;

  -- Inserir registro de comissão
  INSERT INTO public.commissions (
    deal_id, user_id, product_id, organization_id, 
    amount, percentage_applied, rule_id, status
  ) VALUES (
    p_deal_id, p_seller_id, p_product_id, p_organization_id,
    v_commission, v_rule.base_value, v_rule.id, 'pending'
  );

  RETURN v_commission;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_first_super_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin'::public.app_role) THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'super_admin'::public.app_role)
  ON CONFLICT DO NOTHING;

  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_product_tag_package(p_organization_id uuid, p_product_id uuid, p_product_label text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_specs jsonb := jsonb_build_array(
    jsonb_build_object('event','pix_gerado',          'name','PIX Gerado',          'color','#EAB308', 'lifecycle', true),
    jsonb_build_object('event','boleto_gerado',       'name','Boleto Gerado',       'color','#3B82F6', 'lifecycle', true),
    jsonb_build_object('event','pix_gerado',          'name','Aguardando Pagamento','color','#F97316', 'lifecycle', true, 'also_event','boleto_gerado'),
    jsonb_build_object('event','checkout_abandonado', 'name','Checkout Abandonado', 'color','#6B7280', 'lifecycle', true),
    jsonb_build_object('event','compra_aprovada',     'name','Cliente',             'color','#22C55E', 'lifecycle', false),
    jsonb_build_object('event','reembolso',           'name','Reembolso',           'color','#EF4444', 'lifecycle', false)
  );
  v_spec jsonb;
  v_tag_id uuid;
  v_full_name text;
  v_created jsonb := '[]'::jsonb;
BEGIN
  IF p_organization_id IS NULL OR p_product_id IS NULL OR p_product_label IS NULL THEN
    RAISE EXCEPTION 'organization_id, product_id e product_label são obrigatórios';
  END IF;

  FOR v_spec IN SELECT * FROM jsonb_array_elements(v_specs)
  LOOP
    v_full_name := (v_spec->>'name') || ' · ' || p_product_label;

    -- Tag (idempotente por nome+org)
    SELECT id INTO v_tag_id
    FROM lead_tags
    WHERE organization_id = p_organization_id AND name = v_full_name
    LIMIT 1;

    IF v_tag_id IS NULL THEN
      INSERT INTO lead_tags (organization_id, name, color, is_automatic, is_lifecycle_status)
      VALUES (
        p_organization_id,
        v_full_name,
        v_spec->>'color',
        true,
        (v_spec->>'lifecycle')::boolean
      )
      RETURNING id INTO v_tag_id;
    ELSE
      -- Garante que o flag de lifecycle esteja correto
      UPDATE lead_tags
      SET is_lifecycle_status = (v_spec->>'lifecycle')::boolean
      WHERE id = v_tag_id;
    END IF;

    -- Automação principal (idempotente por org+evento+produto+tag)
    INSERT INTO tag_automations (organization_id, product_id, event_type, tag_id_to_add, is_active)
    SELECT p_organization_id, p_product_id, v_spec->>'event', v_tag_id, true
    WHERE NOT EXISTS (
      SELECT 1 FROM tag_automations
      WHERE organization_id = p_organization_id
        AND product_id = p_product_id
        AND event_type = v_spec->>'event'
        AND tag_id_to_add = v_tag_id
    );

    -- Caso especial "Aguardando Pagamento": vincula também a boleto_gerado
    IF v_spec ? 'also_event' THEN
      INSERT INTO tag_automations (organization_id, product_id, event_type, tag_id_to_add, is_active)
      SELECT p_organization_id, p_product_id, v_spec->>'also_event', v_tag_id, true
      WHERE NOT EXISTS (
        SELECT 1 FROM tag_automations
        WHERE organization_id = p_organization_id
          AND product_id = p_product_id
          AND event_type = v_spec->>'also_event'
          AND tag_id_to_add = v_tag_id
      );
    END IF;

    v_created := v_created || jsonb_build_object('tag_id', v_tag_id, 'name', v_full_name);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'tags', v_created);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_product_safe(p_product_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- 1. Deletar atribuições de usuário ao produto
  DELETE FROM public.user_product_assignments WHERE product_id = p_product_id;

  -- 2. Nullify product_id em tabelas que aceitam NULL
  UPDATE public.leads SET product_id = NULL, current_stage_id = NULL WHERE product_id = p_product_id;
  UPDATE public.tasks SET product_id = NULL WHERE product_id = p_product_id;
  UPDATE public.calendar_events SET product_id = NULL WHERE product_id = p_product_id;
  UPDATE public.lead_queue SET product_id = NULL WHERE product_id = p_product_id;
  UPDATE public.sales_squads SET product_id = NULL WHERE product_id = p_product_id;
  UPDATE public.webchat_agent_configs SET product_id = NULL WHERE product_id = p_product_id;
  UPDATE public.agent_training_materials SET product_id = NULL WHERE product_id = p_product_id;
  UPDATE public.webhooks SET product_id = NULL WHERE product_id = p_product_id;
  UPDATE public.notifications SET product_id = NULL WHERE product_id = p_product_id;

  -- 3. Deletar o produto (as outras tabelas têm ON DELETE CASCADE)
  DELETE FROM public.products WHERE id = p_product_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_team_member(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.user_product_assignments WHERE user_id = p_user_id;
  DELETE FROM public.squad_members WHERE user_id = p_user_id;
  DELETE FROM public.user_roles WHERE user_id = p_user_id;

  UPDATE public.leads SET assigned_to = NULL WHERE assigned_to = p_user_id;
  UPDATE public.deals SET seller_id = NULL WHERE seller_id = p_user_id;

  DELETE FROM public.user_status WHERE user_id = p_user_id;
  DELETE FROM public.availability_overrides WHERE user_id = p_user_id;
  DELETE FROM public.notifications WHERE user_id = p_user_id;

  DELETE FROM public.profiles WHERE id = p_user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.distribute_lead(p_lead_id uuid, p_squad_id uuid, p_organization_id uuid, p_product_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_config RECORD;
  v_assigned_user_id uuid;
  v_members uuid[];
  v_idx integer;
BEGIN
  -- Get distribution config for this squad
  SELECT * INTO v_config
  FROM distribution_config
  WHERE squad_id = p_squad_id AND organization_id = p_organization_id;

  -- Default to round_robin if no config
  IF NOT FOUND THEN
    INSERT INTO distribution_config (organization_id, squad_id, method)
    VALUES (p_organization_id, p_squad_id, 'round_robin')
    RETURNING * INTO v_config;
  END IF;

  -- Get online members of this squad (SEM filtro de organization_id no user_status)
  -- O filtro por squad_id já garante que são membros da organização correta
  SELECT ARRAY_AGG(sm.user_id ORDER BY sm.user_id) INTO v_members
  FROM squad_members sm
  JOIN user_status us ON us.user_id = sm.user_id
  WHERE sm.squad_id = p_squad_id
    AND us.status = 'online';

  -- No online members? Queue the lead
  IF v_members IS NULL OR array_length(v_members, 1) IS NULL THEN
    INSERT INTO lead_queue (lead_id, organization_id, squad_id, product_id, status)
    VALUES (p_lead_id, p_organization_id, p_squad_id, p_product_id, 'pending')
    ON CONFLICT (lead_id) DO NOTHING;
    RETURN NULL;
  END IF;

  -- Apply distribution method
  IF v_config.method = 'round_robin' THEN
    v_idx := v_config.round_robin_index % array_length(v_members, 1);
    v_assigned_user_id := v_members[v_idx + 1];
    UPDATE distribution_config SET round_robin_index = v_config.round_robin_index + 1
    WHERE id = v_config.id;

  ELSIF v_config.method = 'least_busy' THEN
    SELECT us.user_id INTO v_assigned_user_id
    FROM user_status us
    WHERE us.user_id = ANY(v_members) AND us.status = 'online'
    ORDER BY us.active_leads_count ASC
    LIMIT 1;

  ELSE -- performance or fallback
    v_idx := v_config.round_robin_index % array_length(v_members, 1);
    v_assigned_user_id := v_members[v_idx + 1];
    UPDATE distribution_config SET round_robin_index = v_config.round_robin_index + 1
    WHERE id = v_config.id;
  END IF;

  -- Assign lead
  IF v_assigned_user_id IS NOT NULL THEN
    UPDATE leads SET assigned_to = v_assigned_user_id WHERE id = p_lead_id;
    -- Increment active leads count (trigger will also do it, so use GREATEST to avoid double)
    -- Actually the trigger handles it, so just update lead
    RETURN v_assigned_user_id;
  END IF;

  -- Fallback: queue
  INSERT INTO lead_queue (lead_id, organization_id, squad_id, product_id, status)
  VALUES (p_lead_id, p_organization_id, p_squad_id, p_product_id, 'pending')
  ON CONFLICT (lead_id) DO NOTHING;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_single_attendant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Humano definido (ou trocado) → IA sai
  IF NEW.assigned_user_id IS NOT NULL
     AND NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id THEN
    NEW.current_agent_id := NULL;
  -- IA definida (ou trocada) e humano não foi alterado nesta operação → humano sai
  ELSIF NEW.current_agent_id IS NOT NULL
     AND NEW.current_agent_id IS DISTINCT FROM OLD.current_agent_id THEN
    NEW.assigned_user_id := NULL;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_first_user_is_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  has_admin_in_org boolean;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.organization_id IS NOT DISTINCT FROM NEW.organization_id THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE p.organization_id = NEW.organization_id
      AND ur.role = 'admin'::app_role
      AND p.id <> NEW.id
  ) INTO has_admin_in_org;

  IF NOT has_admin_in_org THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_org_owner_is_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.owner_id, 'admin'::app_role)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.evaluate_routing_rules(p_organization_id uuid, p_lead_id uuid DEFAULT NULL::uuid, p_stage_id uuid DEFAULT NULL::uuid, p_tag_ids uuid[] DEFAULT NULL::uuid[], p_product_id uuid DEFAULT NULL::uuid, p_channel text DEFAULT NULL::text, p_event text DEFAULT NULL::text, p_deal_value numeric DEFAULT NULL::numeric)
 RETURNS TABLE(rule_id uuid, specialist_id uuid, agent_id uuid, role text, display_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    r.id AS rule_id,
    s.id AS specialist_id,
    s.agent_id,
    s.role,
    s.display_name
  FROM public.agent_routing_rules r
  JOIN public.agent_specialists s ON s.id = r.target_specialist_id
  WHERE r.organization_id = p_organization_id
    AND r.is_active = true
    AND s.is_active = true
    AND (r.match_stage_ids IS NULL OR p_stage_id = ANY(r.match_stage_ids))
    AND (r.match_tag_ids IS NULL OR r.match_tag_ids && COALESCE(p_tag_ids, ARRAY[]::UUID[]))
    AND (r.match_product_ids IS NULL OR p_product_id = ANY(r.match_product_ids))
    AND (r.match_channels IS NULL OR p_channel = ANY(r.match_channels))
    AND (r.match_events IS NULL OR p_event = ANY(r.match_events))
    AND (r.deal_value_min IS NULL OR COALESCE(p_deal_value, 0) >= r.deal_value_min)
    AND (r.deal_value_max IS NULL OR COALESCE(p_deal_value, 0) <= r.deal_value_max)
  ORDER BY r.priority ASC, s.priority ASC
  LIMIT 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fill_default_sector()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sec uuid;
BEGIN
  IF NEW.sector_id IS NULL AND NEW.organization_id IS NOT NULL THEN
    -- Tenta achar setor padrão da org (mais antigo)
    SELECT id INTO v_sec
    FROM public.sectors
    WHERE organization_id = NEW.organization_id
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_sec IS NOT NULL THEN
      NEW.sector_id := v_sec;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_booking_by_token(p_token text)
 RETURNS TABLE(id uuid, guest_name text, guest_email text, guest_phone text, start_time timestamp with time zone, end_time timestamp with time zone, timezone text, status text, confirmation_token text, additional_info jsonb, created_at timestamp with time zone, event_type_id uuid, host_user_id uuid, calendar_event_id uuid, organization_id uuid, cancellation_reason text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    br.id,
    br.guest_name,
    br.guest_email,
    br.guest_phone,
    br.start_time,
    br.end_time,
    br.timezone,
    br.status::text,
    br.confirmation_token,
    br.additional_info,
    br.created_at,
    br.event_type_id,
    br.host_user_id,
    br.calendar_event_id,
    br.organization_id,
    br.cancellation_reason
  FROM public.booking_requests br
  WHERE p_token IS NOT NULL
    AND length(p_token) >= 16
    AND br.confirmation_token = p_token
  LIMIT 1;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.get_product_performance(p_org_id uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH filtered AS (
    SELECT co.*
    FROM cakto_orders co
    WHERE co.organization_id = p_org_id
      AND (p_from IS NULL OR co.created_at_cakto >= p_from)
      AND (p_to IS NULL OR co.created_at_cakto <= p_to)
  ),
  by_product AS (
    SELECT
      f.product_id,
      p.name AS product_name,
      p.suite_id,
      COUNT(*) FILTER (WHERE f.status = 'paid') AS paid_count,
      COUNT(*) FILTER (WHERE f.status IN ('pending','waiting_payment')) AS pending_count,
      COUNT(*) FILTER (WHERE f.status = 'refunded') AS refunded_count,
      COALESCE(SUM(f.amount) FILTER (WHERE f.status = 'paid'), 0) AS revenue,
      COALESCE(AVG(f.amount) FILTER (WHERE f.status = 'paid'), 0) AS avg_ticket
    FROM filtered f
    LEFT JOIN products p ON p.id = f.product_id
    GROUP BY f.product_id, p.name, p.suite_id
  ),
  by_role AS (
    SELECT
      f.product_id,
      COALESCE(po.role, 'unmapped') AS role,
      COUNT(*) FILTER (WHERE f.status = 'paid') AS paid_count,
      COALESCE(SUM(f.amount) FILTER (WHERE f.status = 'paid'), 0) AS revenue
    FROM filtered f
    LEFT JOIN product_offers po ON po.id = f.offer_id
    GROUP BY f.product_id, COALESCE(po.role, 'unmapped')
  )
  SELECT jsonb_build_object(
    'products', COALESCE(jsonb_agg(
      jsonb_build_object(
        'product_id', bp.product_id,
        'product_name', bp.product_name,
        'suite_id', bp.suite_id,
        'paid_count', bp.paid_count,
        'pending_count', bp.pending_count,
        'refunded_count', bp.refunded_count,
        'revenue', bp.revenue,
        'avg_ticket', bp.avg_ticket,
        'roles', (
          SELECT jsonb_agg(jsonb_build_object('role', br.role, 'paid_count', br.paid_count, 'revenue', br.revenue))
          FROM by_role br WHERE br.product_id IS NOT DISTINCT FROM bp.product_id
        )
      )
    ), '[]'::jsonb),
    'totals', (
      SELECT jsonb_build_object(
        'revenue', COALESCE(SUM(amount) FILTER (WHERE status='paid'),0),
        'paid_count', COUNT(*) FILTER (WHERE status='paid'),
        'pending_count', COUNT(*) FILTER (WHERE status IN ('pending','waiting_payment')),
        'refunded_count', COUNT(*) FILTER (WHERE status='refunded'),
        'avg_ticket', COALESCE(AVG(amount) FILTER (WHERE status='paid'),0)
      )
      FROM filtered
    )
  ) INTO v_result
  FROM by_product bp;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_organization(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT organization_id
    FROM public.profiles
    WHERE id = _user_id
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'seller'::public.app_role)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
          AND role = _role
    )
$function$
;

CREATE OR REPLACE FUNCTION public.has_sector_access(_user_id uuid, _sector_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.sector_members
    WHERE sector_id = _sector_id AND user_id = _user_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.inbox_count_conversations(p_user_id uuid, p_product_ids uuid[] DEFAULT NULL::uuid[], p_include_no_product boolean DEFAULT false, p_sector_ids uuid[] DEFAULT NULL::uuid[], p_include_no_sector boolean DEFAULT false, p_assigned_user_ids uuid[] DEFAULT NULL::uuid[], p_include_unassigned boolean DEFAULT false, p_tag_ids uuid[] DEFAULT NULL::uuid[], p_channel text DEFAULT NULL::text, p_search text DEFAULT NULL::text)
 RETURNS TABLE(attending bigint, waiting bigint, resolved bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_is_super_admin boolean;
  v_is_admin boolean;
  v_perm_queue boolean := false;
  v_perm_other_users boolean := false;
  v_perm_other_queues boolean := false;
  v_perm_unassigned_sector boolean := false;
  v_user_sectors uuid[];
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  SELECT pr.organization_id INTO v_org_id FROM public.profiles pr WHERE pr.id = p_user_id;

  v_is_super_admin := EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_user_id AND ur.role = 'super_admin'::app_role
  );
  v_is_admin := v_is_super_admin OR EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_user_id AND ur.role = 'admin'::app_role
  );

  IF v_org_id IS NULL AND NOT v_is_super_admin THEN
    RAISE EXCEPTION 'User has no organization';
  END IF;

  IF NOT v_is_admin THEN
    SELECT
      COALESCE(up.view_queue_conversations, false),
      COALESCE(up.view_other_users_conversations, false),
      COALESCE(up.view_other_queues_conversations, false),
      COALESCE(up.view_unassigned_sector_tickets, false)
    INTO v_perm_queue, v_perm_other_users, v_perm_other_queues, v_perm_unassigned_sector
    FROM public.user_permissions up WHERE up.user_id = p_user_id LIMIT 1;

    SELECT COALESCE(array_agg(sm.sector_id), ARRAY[]::uuid[]) INTO v_user_sectors
    FROM public.sector_members sm WHERE sm.user_id = p_user_id;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT c.status, c.id
    FROM public.webchat_conversations c
    LEFT JOIN public.leads l           ON l.id = c.lead_id
    LEFT JOIN public.webchat_widgets w ON w.id = c.widget_id
    WHERE
      (v_org_id IS NULL OR c.organization_id = v_org_id)
      AND (p_channel IS NULL OR c.channel = p_channel)
      AND (
        v_is_admin
        OR c.assigned_user_id = p_user_id
        OR (c.sector_id IS NULL AND v_perm_unassigned_sector)
        OR (c.sector_id = ANY(v_user_sectors) AND c.assigned_user_id IS NULL AND v_perm_queue)
        OR (c.sector_id = ANY(v_user_sectors) AND c.assigned_user_id IS NOT NULL AND v_perm_other_users)
        OR (c.sector_id IS NOT NULL AND NOT (c.sector_id = ANY(v_user_sectors)) AND v_perm_other_queues)
      )
      AND (
        (p_product_ids IS NULL AND NOT p_include_no_product)
        OR (p_include_no_product AND COALESCE(c.product_id, l.product_id, w.product_id) IS NULL)
        OR (p_product_ids IS NOT NULL AND COALESCE(c.product_id, l.product_id, w.product_id) = ANY(p_product_ids))
      )
      AND (
        (p_sector_ids IS NULL AND NOT p_include_no_sector)
        OR (p_include_no_sector AND c.sector_id IS NULL)
        OR (p_sector_ids IS NOT NULL AND c.sector_id = ANY(p_sector_ids))
      )
      AND (
        (p_assigned_user_ids IS NULL AND NOT p_include_unassigned)
        OR (p_include_unassigned AND c.assigned_user_id IS NULL)
        OR (p_assigned_user_ids IS NOT NULL AND c.assigned_user_id = ANY(p_assigned_user_ids))
      )
      AND (
        p_tag_ids IS NULL
        OR EXISTS (
          SELECT 1 FROM public.lead_tag_assignments lta
          WHERE lta.lead_id = c.lead_id AND lta.tag_id = ANY(p_tag_ids)
        )
      )
      AND (
        p_search IS NULL OR p_search = ''
        OR c.visitor_name  ILIKE '%' || p_search || '%'
        OR c.visitor_email ILIKE '%' || p_search || '%'
        OR c.visitor_phone ILIKE '%' || p_search || '%'
        OR l.name          ILIKE '%' || p_search || '%'
        OR l.email         ILIKE '%' || p_search || '%'
        OR l.phone         ILIKE '%' || p_search || '%'
      )
  )
  SELECT
    COUNT(*) FILTER (WHERE status IN ('human_active','bot_active'))::bigint AS attending,
    COUNT(*) FILTER (WHERE status = 'waiting_human')::bigint AS waiting,
    COUNT(*) FILTER (WHERE status = 'closed')::bigint AS resolved
  FROM base;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.inbox_list_conversations(p_user_id uuid, p_tab text DEFAULT 'attending'::text, p_product_ids uuid[] DEFAULT NULL::uuid[], p_include_no_product boolean DEFAULT false, p_sector_ids uuid[] DEFAULT NULL::uuid[], p_include_no_sector boolean DEFAULT false, p_assigned_user_ids uuid[] DEFAULT NULL::uuid[], p_include_unassigned boolean DEFAULT false, p_tag_ids uuid[] DEFAULT NULL::uuid[], p_channel text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_cursor_last_message_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, organization_id uuid, widget_id uuid, visitor_id text, lead_id uuid, product_id uuid, effective_product_id uuid, effective_product_name text, assigned_user_id uuid, assigned_user_name text, assigned_user_avatar text, current_agent_id uuid, current_agent_name text, current_agent_avatar text, sector_id uuid, sector_name text, sector_color text, evolution_instance_id uuid, status text, channel text, needs_human boolean, last_message_at timestamp with time zone, unread_count_agents integer, created_at timestamp with time zone, updated_at timestamp with time zone, closed_at timestamp with time zone, visitor_name text, visitor_email text, visitor_phone text, visitor_avatar_url text, visitor_whatsapp text, accepted_at timestamp with time zone, accepted_by uuid, widget_name text, widget_primary_color text, widget_product_id uuid, lead_name text, lead_email text, lead_phone text, lead_product_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_is_super_admin boolean;
  v_is_admin boolean;
  v_perm_queue boolean := false;
  v_perm_other_users boolean := false;
  v_perm_other_queues boolean := false;
  v_perm_unassigned_sector boolean := false;
  v_user_sectors uuid[];
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  SELECT pr.organization_id INTO v_org_id
  FROM public.profiles pr WHERE pr.id = p_user_id;

  v_is_super_admin := EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_user_id AND ur.role = 'super_admin'::app_role
  );
  v_is_admin := v_is_super_admin OR EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_user_id AND ur.role = 'admin'::app_role
  );

  IF v_org_id IS NULL AND NOT v_is_super_admin THEN
    RAISE EXCEPTION 'User has no organization';
  END IF;

  IF NOT v_is_admin THEN
    SELECT
      COALESCE(up.view_queue_conversations, false),
      COALESCE(up.view_other_users_conversations, false),
      COALESCE(up.view_other_queues_conversations, false),
      COALESCE(up.view_unassigned_sector_tickets, false)
    INTO v_perm_queue, v_perm_other_users, v_perm_other_queues, v_perm_unassigned_sector
    FROM public.user_permissions up
    WHERE up.user_id = p_user_id
    LIMIT 1;

    SELECT COALESCE(array_agg(sm.sector_id), ARRAY[]::uuid[]) INTO v_user_sectors
    FROM public.sector_members sm WHERE sm.user_id = p_user_id;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      c.id, c.organization_id, c.widget_id, c.visitor_id, c.lead_id, c.product_id,
      c.assigned_user_id, c.current_agent_id, c.sector_id, c.evolution_instance_id,
      c.status, c.channel, c.needs_human, c.last_message_at, c.unread_count_agents,
      c.created_at, c.updated_at, c.closed_at,
      c.visitor_name, c.visitor_email, c.visitor_phone, c.visitor_avatar_url, c.visitor_whatsapp,
      c.accepted_at, c.accepted_by,
      COALESCE(c.product_id, l.product_id, w.product_id) AS eff_product_id,
      l.name  AS l_name,
      l.email AS l_email,
      l.phone AS l_phone,
      l.product_id AS l_product_id,
      w.name AS w_name,
      w.primary_color AS w_primary_color,
      w.product_id AS w_product_id,
      pa.full_name AS au_name,
      pa.avatar_url AS au_avatar,
      ag.name AS ag_name,
      ag.avatar_url AS ag_avatar,
      sec.name AS sec_name,
      sec.color AS sec_color,
      prd.name AS prd_name
    FROM public.webchat_conversations c
    LEFT JOIN public.leads l            ON l.id = c.lead_id
    LEFT JOIN public.webchat_widgets w  ON w.id = c.widget_id
    LEFT JOIN public.profiles pa        ON pa.id = c.assigned_user_id
    LEFT JOIN public.product_agents ag  ON ag.id = c.current_agent_id
    LEFT JOIN public.sectors sec        ON sec.id = c.sector_id
    LEFT JOIN public.products prd       ON prd.id = COALESCE(c.product_id, l.product_id, w.product_id)
    WHERE
      (v_org_id IS NULL OR c.organization_id = v_org_id)
      AND (
        p_tab = 'all'
        OR (p_tab = 'attending' AND c.status IN ('human_active','bot_active'))
        OR (p_tab = 'waiting'   AND c.status = 'waiting_human')
        OR (p_tab = 'resolved'  AND c.status = 'closed')
      )
      AND (p_channel IS NULL OR c.channel = p_channel)
      AND (p_cursor_last_message_at IS NULL OR c.last_message_at < p_cursor_last_message_at)
      AND (
        v_is_admin
        OR c.assigned_user_id = p_user_id
        OR (c.sector_id IS NULL AND v_perm_unassigned_sector)
        OR (c.sector_id = ANY(v_user_sectors) AND c.assigned_user_id IS NULL AND v_perm_queue)
        OR (c.sector_id = ANY(v_user_sectors) AND c.assigned_user_id IS NOT NULL AND v_perm_other_users)
        OR (c.sector_id IS NOT NULL AND NOT (c.sector_id = ANY(v_user_sectors)) AND v_perm_other_queues)
      )
      AND (
        (p_product_ids IS NULL AND NOT p_include_no_product)
        OR (p_include_no_product AND COALESCE(c.product_id, l.product_id, w.product_id) IS NULL)
        OR (p_product_ids IS NOT NULL AND COALESCE(c.product_id, l.product_id, w.product_id) = ANY(p_product_ids))
      )
      AND (
        (p_sector_ids IS NULL AND NOT p_include_no_sector)
        OR (p_include_no_sector AND c.sector_id IS NULL)
        OR (p_sector_ids IS NOT NULL AND c.sector_id = ANY(p_sector_ids))
      )
      AND (
        (p_assigned_user_ids IS NULL AND NOT p_include_unassigned)
        OR (p_include_unassigned AND c.assigned_user_id IS NULL)
        OR (p_assigned_user_ids IS NOT NULL AND c.assigned_user_id = ANY(p_assigned_user_ids))
      )
      AND (
        p_tag_ids IS NULL
        OR EXISTS (
          SELECT 1 FROM public.lead_tag_assignments lta
          WHERE lta.lead_id = c.lead_id AND lta.tag_id = ANY(p_tag_ids)
        )
      )
      AND (
        p_search IS NULL OR p_search = ''
        OR c.visitor_name  ILIKE '%' || p_search || '%'
        OR c.visitor_email ILIKE '%' || p_search || '%'
        OR c.visitor_phone ILIKE '%' || p_search || '%'
        OR l.name          ILIKE '%' || p_search || '%'
        OR l.email         ILIKE '%' || p_search || '%'
        OR l.phone         ILIKE '%' || p_search || '%'
      )
  )
  SELECT
    b.id, b.organization_id, b.widget_id,
    b.visitor_id::text, b.lead_id, b.product_id,
    b.eff_product_id AS effective_product_id,
    b.prd_name::text AS effective_product_name,
    b.assigned_user_id,
    b.au_name::text AS assigned_user_name,
    b.au_avatar::text AS assigned_user_avatar,
    b.current_agent_id,
    b.ag_name::text AS current_agent_name,
    b.ag_avatar::text AS current_agent_avatar,
    b.sector_id,
    b.sec_name::text AS sector_name,
    b.sec_color::text AS sector_color,
    b.evolution_instance_id,
    b.status::text,
    b.channel::text,
    b.needs_human,
    b.last_message_at, b.unread_count_agents,
    b.created_at, b.updated_at, b.closed_at,
    b.visitor_name::text, b.visitor_email::text, b.visitor_phone::text,
    b.visitor_avatar_url::text, b.visitor_whatsapp::text,
    b.accepted_at, b.accepted_by,
    b.w_name::text AS widget_name,
    b.w_primary_color::text AS widget_primary_color,
    b.w_product_id AS widget_product_id,
    b.l_name::text AS lead_name,
    b.l_email::text AS lead_email,
    b.l_phone::text AS lead_phone,
    b.l_product_id AS lead_product_id
  FROM base b
  ORDER BY b.last_message_at DESC NULLS LAST, b.id DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_form_submissions_count(p_form_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE forms SET submissions_count = submissions_count + 1 WHERE id = p_form_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_form_views(p_form_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE forms SET views_count = views_count + 1 WHERE id = p_form_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_funnel_leads(p_funnel_id uuid, p_channel text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Atualiza contador agregado no funil
  UPDATE capture_funnels SET total_leads = total_leads + 1 WHERE id = p_funnel_id;
  
  -- Insere ou atualiza analytics por canal/dia
  INSERT INTO funnel_analytics (funnel_id, channel, date, leads_created, completions)
  VALUES (p_funnel_id, p_channel, CURRENT_DATE, 1, 1)
  ON CONFLICT (funnel_id, channel, date)
  DO UPDATE SET 
    leads_created = funnel_analytics.leads_created + 1,
    completions = funnel_analytics.completions + 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_funnel_views(p_funnel_id uuid, p_channel text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Atualiza contador agregado no funil
  UPDATE capture_funnels SET total_views = total_views + 1 WHERE id = p_funnel_id;
  
  -- Insere ou atualiza analytics por canal/dia
  INSERT INTO funnel_analytics (funnel_id, channel, date, views)
  VALUES (p_funnel_id, p_channel, CURRENT_DATE, 1)
  ON CONFLICT (funnel_id, channel, date)
  DO UPDATE SET views = funnel_analytics.views + 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_webhook_requests(p_webhook_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE webhooks 
  SET 
    requests_count = requests_count + 1,
    requests_this_month = requests_this_month + 1,
    last_request_at = now()
  WHERE id = p_webhook_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.initialize_user_permissions(p_user_id uuid, p_organization_id uuid, p_role text DEFAULT 'seller'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_permissions (user_id, organization_id,
    view_queue_conversations, view_other_users_conversations, view_other_queues_conversations,
    allow_close_pending_tickets, view_all_contacts, allow_pipeline,
    allow_manage_client_portfolio, view_all_kanban_cards, view_all_schedules,
    allow_dashboard, allow_inbox_panel, allow_groups, allow_connection_actions,
    view_unassigned_sector_tickets, view_schedules_mode)
  VALUES (
    p_user_id, p_organization_id,
    -- view_queue_conversations: sellers also need this to pick up unassigned-sector tickets
    CASE WHEN p_role IN ('admin','manager') THEN true ELSE true END,
    CASE WHEN p_role IN ('admin','manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin','manager') THEN true ELSE false END,
    true,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    -- allow_inbox_panel: sellers need to see the inbox
    true,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role = 'admin' THEN true ELSE false END,
    -- view_unassigned_sector_tickets: sellers can see queue items without a sector
    true,
    CASE WHEN p_role IN ('admin', 'manager') THEN 'all' ELSE 'mine_only' END
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Initialize notification settings
  INSERT INTO public.user_notification_settings (user_id, organization_id)
  VALUES (p_user_id, p_organization_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_system_initialized()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin'::public.app_role)
$function$
;

CREATE OR REPLACE FUNCTION public.is_within_business_hours(p_org_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_config RECORD;
  v_now TIMESTAMPTZ := now();
  v_local_time TIME;
  v_local_date DATE;
  v_dow_key TEXT;
  v_blocks JSONB;
  v_block JSONB;
BEGIN
  SELECT * INTO v_config FROM public.business_hours WHERE organization_id = p_org_id;
  
  -- Sem configuração = sempre aberto
  IF NOT FOUND THEN
    RETURN TRUE;
  END IF;

  v_local_time := (v_now AT TIME ZONE v_config.timezone)::TIME;
  v_local_date := (v_now AT TIME ZONE v_config.timezone)::DATE;

  -- Feriado?
  IF EXISTS (
    SELECT 1 FROM public.business_holidays 
    WHERE organization_id = p_org_id AND date = v_local_date
  ) THEN
    RETURN FALSE;
  END IF;

  v_dow_key := CASE EXTRACT(DOW FROM v_local_date)::INT
    WHEN 0 THEN 'sun'
    WHEN 1 THEN 'mon'
    WHEN 2 THEN 'tue'
    WHEN 3 THEN 'wed'
    WHEN 4 THEN 'thu'
    WHEN 5 THEN 'fri'
    WHEN 6 THEN 'sat'
  END;

  v_blocks := v_config.schedule -> v_dow_key;

  IF v_blocks IS NULL OR jsonb_array_length(v_blocks) = 0 THEN
    RETURN FALSE;
  END IF;

  FOR v_block IN SELECT * FROM jsonb_array_elements(v_blocks) LOOP
    IF v_local_time >= (v_block->>'start')::TIME 
       AND v_local_time < (v_block->>'end')::TIME THEN
      RETURN TRUE;
    END IF;
  END LOOP;

  RETURN FALSE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_default_password_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Só age se for o admin padrão E a senha realmente mudou
  IF NEW.email = 'admin@vendus.com.br'
     AND OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password THEN
    UPDATE public.platform_settings
    SET default_password_changed = true,
        updated_at = now()
    WHERE default_password_changed = false;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_phone_br(p text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.pick_prompt_variant(p_experiment_id uuid, p_seed text)
 RETURNS TABLE(variant_id uuid, label text, prompt_override text, prompt_mode text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_weight INT;
  v_hash_pos INT;
  v_cumulative INT := 0;
  v_chosen RECORD;
BEGIN
  -- Soma pesos das variantes
  SELECT COALESCE(SUM(weight), 0) INTO v_total_weight
  FROM public.ai_prompt_variants
  WHERE experiment_id = p_experiment_id AND weight > 0;

  IF v_total_weight = 0 THEN
    RETURN;
  END IF;

  -- Hash determinístico do seed (lead_id) -> 0..total_weight-1
  v_hash_pos := abs(hashtext(COALESCE(p_seed, '') || p_experiment_id::text)) % v_total_weight;

  -- Itera variantes ordenadas e acha a faixa
  FOR v_chosen IN
    SELECT id, label, prompt_override, prompt_mode, weight
    FROM public.ai_prompt_variants
    WHERE experiment_id = p_experiment_id AND weight > 0
    ORDER BY created_at ASC, id ASC
  LOOP
    v_cumulative := v_cumulative + v_chosen.weight;
    IF v_hash_pos < v_cumulative THEN
      variant_id := v_chosen.id;
      label := v_chosen.label;
      prompt_override := v_chosen.prompt_override;
      prompt_mode := v_chosen.prompt_mode;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_pending_queue(p_user_id uuid)
 RETURNS TABLE(assigned_lead_id uuid, assigned_squad_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_queue_item RECORD;
  v_user_squads uuid[];
BEGIN
  -- Get user's squads
  SELECT ARRAY_AGG(squad_id) INTO v_user_squads
  FROM squad_members WHERE user_id = p_user_id;

  IF v_user_squads IS NULL THEN
    RETURN;
  END IF;

  -- Find oldest pending lead in user's squads
  SELECT * INTO v_queue_item
  FROM lead_queue lq
  WHERE lq.squad_id = ANY(v_user_squads)
    AND lq.status = 'pending'
  ORDER BY lq.priority DESC, lq.queued_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Assign the lead
  UPDATE leads SET assigned_to = p_user_id WHERE id = v_queue_item.lead_id;

  -- Update queue
  UPDATE lead_queue SET
    status = 'assigned',
    assigned_to = p_user_id,
    assigned_at = now()
  WHERE id = v_queue_item.id;

  -- Increment active leads
  UPDATE user_status SET active_leads_count = active_leads_count + 1
  WHERE user_id = p_user_id;

  assigned_lead_id := v_queue_item.lead_id;
  assigned_squad_id := v_queue_item.squad_id;
  RETURN NEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_booking_public_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Authenticated host/owner edits bypass this guard
  IF auth.uid() IS NOT NULL AND auth.uid() = OLD.host_user_id THEN
    RETURN NEW;
  END IF;

  -- Public/anon updates: keep identity columns immutable
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.event_type_id IS DISTINCT FROM OLD.event_type_id
     OR NEW.host_user_id IS DISTINCT FROM OLD.host_user_id
     OR NEW.confirmation_token IS DISTINCT FROM OLD.confirmation_token
     OR NEW.guest_email IS DISTINCT FROM OLD.guest_email
     OR NEW.guest_name IS DISTINCT FROM OLD.guest_name
     OR NEW.guest_phone IS DISTINCT FROM OLD.guest_phone
     OR NEW.lead_id IS DISTINCT FROM OLD.lead_id
     OR NEW.calendar_event_id IS DISTINCT FROM OLD.calendar_event_id THEN
    RAISE EXCEPTION 'Public updates may only change status, cancellation_reason, start_time, end_time and timezone';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_variant_impression(p_variant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.ai_prompt_variants
  SET impressions = impressions + 1
  WHERE id = p_variant_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_variant_score(p_variant_id uuid, p_score numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.ai_prompt_variants
  SET total_score = total_score + p_score,
      evaluations_count = evaluations_count + 1
  WHERE id = p_variant_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.remove_lifecycle_tags_on_event(p_lead_id uuid, p_event_type text, p_product_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(tag_id uuid, action text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid := p_organization_id;
  v_tag RECORD;
  v_tag_name text;
BEGIN
  IF v_org_id IS NULL THEN
    SELECT organization_id INTO v_org_id FROM leads WHERE id = p_lead_id;
    IF v_org_id IS NULL THEN RETURN; END IF;
  END IF;

  -- Remove TODAS as tags transitórias (is_lifecycle_status=true) atualmente atribuídas ao lead
  -- que pertencem a automações do MESMO produto (ou globais sem produto).
  -- NUNCA toca em tags permanentes (is_lifecycle_status=false).
  FOR v_tag IN
    SELECT DISTINCT lta.tag_id, lt.name AS tag_name
    FROM lead_tag_assignments lta
    JOIN lead_tags lt ON lt.id = lta.tag_id
    WHERE lta.lead_id = p_lead_id
      AND lt.organization_id = v_org_id
      AND lt.is_lifecycle_status = true
      AND EXISTS (
        SELECT 1 FROM tag_automations ta
        WHERE ta.tag_id_to_add = lta.tag_id
          AND ta.organization_id = v_org_id
          AND (
            ta.product_id = p_product_id
            OR (ta.product_id IS NULL AND p_product_id IS NULL)
          )
      )
  LOOP
    DELETE FROM lead_tag_assignments
    WHERE lead_id = p_lead_id AND lead_tag_assignments.tag_id = v_tag.tag_id;

    -- Auditoria
    INSERT INTO lead_notes (lead_id, organization_id, content, note_type, created_by)
    VALUES (
      p_lead_id,
      v_org_id,
      format('Etiqueta "%s" removida automaticamente (evento: %s)', v_tag.tag_name, p_event_type),
      'system',
      NULL
    );

    tag_id := v_tag.tag_id;
    action := 'removed';
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reset_monthly_webhook_requests()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE webhooks SET requests_this_month = 0;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_catalog_smart(p_organization_id uuid, p_product_id uuid DEFAULT NULL::uuid, p_query text DEFAULT NULL::text, p_price_min numeric DEFAULT NULL::numeric, p_price_max numeric DEFAULT NULL::numeric, p_tags text[] DEFAULT NULL::text[], p_attribute_filters jsonb DEFAULT NULL::jsonb, p_limit integer DEFAULT 5)
 RETURNS TABLE(id uuid, title text, description text, price numeric, currency text, url text, thumbnail_url text, images jsonb, videos jsonb, documents jsonb, attributes jsonb, tags text[], match_score real, match_strategy text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := GREATEST(LEAST(COALESCE(p_limit, 5), 20), 1);
  v_query_clean text := NULLIF(TRIM(COALESCE(p_query, '')), '');
  v_results_count integer;
BEGIN
  -- Camada 1: Full-text search (mais preciso) com filtros
  IF v_query_clean IS NOT NULL THEN
    RETURN QUERY
    SELECT
      pci.id, pci.title, pci.description, pci.price, pci.currency,
      pci.url, pci.thumbnail_url, pci.images, pci.videos, pci.documents,
      pci.attributes, pci.tags,
      ts_rank(pci.search_vector, websearch_to_tsquery('portuguese', v_query_clean))::real AS match_score,
      'fulltext'::text AS match_strategy
    FROM public.product_catalog_items pci
    WHERE pci.organization_id = p_organization_id
      AND pci.is_active = true
      AND (p_product_id IS NULL OR pci.product_id = p_product_id)
      AND (p_price_min IS NULL OR pci.price >= p_price_min)
      AND (p_price_max IS NULL OR pci.price <= p_price_max)
      AND (p_tags IS NULL OR pci.tags && p_tags)
      AND (p_attribute_filters IS NULL OR pci.attributes @> p_attribute_filters)
      AND pci.search_vector @@ websearch_to_tsquery('portuguese', v_query_clean)
    ORDER BY match_score DESC
    LIMIT v_limit;

    GET DIAGNOSTICS v_results_count = ROW_COUNT;
    IF v_results_count > 0 THEN RETURN; END IF;

    -- Camada 2: Trigram fuzzy (tolera erros de digitação)
    RETURN QUERY
    SELECT
      pci.id, pci.title, pci.description, pci.price, pci.currency,
      pci.url, pci.thumbnail_url, pci.images, pci.videos, pci.documents,
      pci.attributes, pci.tags,
      GREATEST(
        similarity(COALESCE(pci.title, ''), v_query_clean),
        similarity(COALESCE(pci.description, ''), v_query_clean) * 0.7
      )::real AS match_score,
      'fuzzy'::text AS match_strategy
    FROM public.product_catalog_items pci
    WHERE pci.organization_id = p_organization_id
      AND pci.is_active = true
      AND (p_product_id IS NULL OR pci.product_id = p_product_id)
      AND (p_price_min IS NULL OR pci.price >= p_price_min)
      AND (p_price_max IS NULL OR pci.price <= p_price_max)
      AND (p_tags IS NULL OR pci.tags && p_tags)
      AND (p_attribute_filters IS NULL OR pci.attributes @> p_attribute_filters)
      AND (
        COALESCE(pci.title, '') % v_query_clean
        OR COALESCE(pci.description, '') % v_query_clean
        OR COALESCE(pci.title, '') ILIKE '%' || v_query_clean || '%'
      )
    ORDER BY match_score DESC
    LIMIT v_limit;

    GET DIAGNOSTICS v_results_count = ROW_COUNT;
    IF v_results_count > 0 THEN RETURN; END IF;

    -- Camada 3: Fallback — alternativas próximas ignorando query (mantém só filtros estruturais)
    RETURN QUERY
    SELECT
      pci.id, pci.title, pci.description, pci.price, pci.currency,
      pci.url, pci.thumbnail_url, pci.images, pci.videos, pci.documents,
      pci.attributes, pci.tags,
      0.1::real AS match_score,
      'alternatives'::text AS match_strategy
    FROM public.product_catalog_items pci
    WHERE pci.organization_id = p_organization_id
      AND pci.is_active = true
      AND (p_product_id IS NULL OR pci.product_id = p_product_id)
      AND (p_price_min IS NULL OR pci.price >= p_price_min)
      AND (p_price_max IS NULL OR pci.price <= p_price_max)
    ORDER BY pci.created_at DESC
    LIMIT v_limit;
  ELSE
    -- Sem query: apenas filtros
    RETURN QUERY
    SELECT
      pci.id, pci.title, pci.description, pci.price, pci.currency,
      pci.url, pci.thumbnail_url, pci.images, pci.videos, pci.documents,
      pci.attributes, pci.tags,
      1.0::real AS match_score,
      'filter_only'::text AS match_strategy
    FROM public.product_catalog_items pci
    WHERE pci.organization_id = p_organization_id
      AND pci.is_active = true
      AND (p_product_id IS NULL OR pci.product_id = p_product_id)
      AND (p_price_min IS NULL OR pci.price >= p_price_min)
      AND (p_price_max IS NULL OR pci.price <= p_price_max)
      AND (p_tags IS NULL OR pci.tags && p_tags)
      AND (p_attribute_filters IS NULL OR pci.attributes @> p_attribute_filters)
    ORDER BY pci.created_at DESC
    LIMIT v_limit;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_lead_memory(p_lead_id uuid, p_query_embedding vector, p_match_count integer DEFAULT 8, p_min_similarity numeric DEFAULT 0.5)
 RETURNS TABLE(id uuid, content text, source text, role text, importance_score numeric, similarity numeric, metadata jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.content,
    m.source,
    m.role,
    m.importance_score,
    (1 - (m.embedding <=> p_query_embedding))::NUMERIC AS similarity,
    m.metadata,
    m.created_at
  FROM public.lead_semantic_memory m
  WHERE m.lead_id = p_lead_id
    AND m.embedding IS NOT NULL
    AND (1 - (m.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY 
    -- Combina similaridade + importância
    ((1 - (m.embedding <=> p_query_embedding)) * 0.7 + m.importance_score * 0.3) DESC,
    m.created_at DESC
  LIMIT p_match_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_active_leads_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Decrement old assignee's counter
  IF OLD.assigned_to IS NOT NULL AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    UPDATE user_status 
    SET active_leads_count = GREATEST(0, active_leads_count - 1)
    WHERE user_id = OLD.assigned_to;
  END IF;

  -- Increment new assignee's counter
  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    -- Ensure user_status record exists
    INSERT INTO user_status (user_id, organization_id, status, active_leads_count)
    SELECT NEW.assigned_to, NEW.organization_id, 'offline', 0
    WHERE NOT EXISTS (
      SELECT 1 FROM user_status WHERE user_id = NEW.assigned_to
    );
    
    UPDATE user_status 
    SET active_leads_count = active_leads_count + 1
    WHERE user_id = NEW.assigned_to;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_catalog_search_vector()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  attr_text TEXT := '';
BEGIN
  -- Concatena valores escalares do JSONB attributes para indexar
  IF NEW.attributes IS NOT NULL THEN
    SELECT string_agg(value::text, ' ')
    INTO attr_text
    FROM jsonb_each_text(NEW.attributes);
  END IF;

  NEW.search_vector :=
    setweight(to_tsvector('portuguese', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('portuguese', COALESCE(array_to_string(NEW.tags, ' '), '')), 'B') ||
    setweight(to_tsvector('portuguese', COALESCE(attr_text, '')), 'B') ||
    setweight(to_tsvector('portuguese', COALESCE(NEW.description, '')), 'C');

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_ticket_on_new_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.support_tickets
  SET 
    last_message_at = NEW.created_at,
    last_message_by_role = NEW.author_role,
    unread_for_admin = CASE WHEN NEW.author_role = 'super_admin' THEN true ELSE unread_for_admin END,
    unread_for_super_admin = CASE WHEN NEW.author_role = 'admin' THEN true ELSE unread_for_super_admin END,
    status = CASE 
      WHEN status = 'closed' AND NEW.author_role = 'admin' THEN 'open'::support_ticket_status
      ELSE status
    END,
    updated_at = now()
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.user_belongs_to_organization(_user_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = _user_id
          AND organization_id = _org_id
    )
$function$
;

CREATE OR REPLACE FUNCTION public.user_in_sector_organization(_user_id uuid, _sector_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.sectors s
    JOIN public.profiles p ON p.organization_id = s.organization_id
    WHERE s.id = _sector_id AND p.id = _user_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.user_sector_ids(_user_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT sector_id FROM public.sector_members WHERE user_id = _user_id;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_scheduled_message_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('pending', 'sent', 'cancelled', 'failed') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$function$
;

