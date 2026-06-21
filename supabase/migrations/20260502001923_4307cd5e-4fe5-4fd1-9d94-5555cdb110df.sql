
-- Fix: PostgreSQL exige tipo idêntico ao declarado em RETURNS TABLE.
-- product_agents.name é varchar(100) mas a função declara text → erro 42804
-- Solução: forçar ::text em TODAS as colunas que vêm de varchar, blindando a função.

CREATE OR REPLACE FUNCTION public.inbox_list_conversations(
  p_user_id          uuid,
  p_tab              text         DEFAULT 'attending',
  p_product_ids      uuid[]       DEFAULT NULL,
  p_include_no_product boolean    DEFAULT false,
  p_sector_ids       uuid[]       DEFAULT NULL,
  p_include_no_sector boolean     DEFAULT false,
  p_assigned_user_ids uuid[]      DEFAULT NULL,
  p_include_unassigned boolean    DEFAULT false,
  p_tag_ids          uuid[]       DEFAULT NULL,
  p_channel          text         DEFAULT NULL,
  p_search           text         DEFAULT NULL,
  p_cursor_last_message_at timestamptz DEFAULT NULL,
  p_limit            integer      DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  widget_id uuid,
  visitor_id text,
  lead_id uuid,
  product_id uuid,
  effective_product_id uuid,
  effective_product_name text,
  assigned_user_id uuid,
  assigned_user_name text,
  assigned_user_avatar text,
  current_agent_id uuid,
  current_agent_name text,
  current_agent_avatar text,
  sector_id uuid,
  sector_name text,
  sector_color text,
  evolution_instance_id uuid,
  status text,
  channel text,
  needs_human boolean,
  last_message_at timestamptz,
  unread_count_agents integer,
  created_at timestamptz,
  updated_at timestamptz,
  closed_at timestamptz,
  visitor_name text,
  visitor_email text,
  visitor_phone text,
  visitor_avatar_url text,
  visitor_whatsapp text,
  accepted_at timestamptz,
  accepted_by uuid,
  widget_name text,
  widget_primary_color text,
  widget_product_id uuid,
  lead_name text,
  lead_email text,
  lead_phone text,
  lead_product_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
$function$;
