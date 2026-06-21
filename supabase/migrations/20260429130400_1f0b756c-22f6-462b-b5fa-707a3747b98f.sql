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
$function$;

-- Backfill existing sellers so they can see the inbox queue
UPDATE public.user_permissions up
SET view_queue_conversations = true,
    view_unassigned_sector_tickets = true,
    allow_inbox_panel = true
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = up.user_id AND ur.role = 'seller'
);