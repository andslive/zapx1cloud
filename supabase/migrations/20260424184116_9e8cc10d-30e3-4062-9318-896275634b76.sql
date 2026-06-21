
-- ============================================================
-- 1. SECTORS TABLE
-- ============================================================
CREATE TYPE public.sector_rotation_strategy AS ENUM ('round_robin', 'least_busy', 'random');

CREATE TABLE public.sectors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3B82F6',
  description TEXT,
  bot_order INTEGER DEFAULT 0,
  greeting_message TEXT,
  farewell_message TEXT,
  auto_close_ticket BOOLEAN DEFAULT false,
  enable_scheduling BOOLEAN DEFAULT false,
  rotation_enabled BOOLEAN DEFAULT false,
  rotation_strategy public.sector_rotation_strategy DEFAULT 'round_robin',
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX idx_sectors_org ON public.sectors(organization_id);
CREATE INDEX idx_sectors_active ON public.sectors(organization_id, is_active);

ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. SECTOR_MEMBERS TABLE
-- ============================================================
CREATE TABLE public.sector_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sector_id UUID NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sector_id, user_id)
);

CREATE INDEX idx_sector_members_sector ON public.sector_members(sector_id);
CREATE INDEX idx_sector_members_user ON public.sector_members(user_id);

ALTER TABLE public.sector_members ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. SECURITY DEFINER HELPER FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_sector_access(_user_id uuid, _sector_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sector_members
    WHERE sector_id = _sector_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.user_in_sector_organization(_user_id uuid, _sector_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sectors s
    JOIN public.profiles p ON p.organization_id = s.organization_id
    WHERE s.id = _sector_id AND p.id = _user_id
  );
$$;

-- ============================================================
-- 4. RLS POLICIES — sectors
-- ============================================================
CREATE POLICY "Org members can view their sectors"
  ON public.sectors FOR SELECT
  USING (
    organization_id = public.get_user_organization(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Admins/managers can insert sectors"
  ON public.sectors FOR INSERT
  WITH CHECK (
    organization_id = public.get_user_organization(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.is_super_admin(auth.uid())
    )
  );

CREATE POLICY "Admins/managers can update sectors"
  ON public.sectors FOR UPDATE
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.is_super_admin(auth.uid())
    )
  );

CREATE POLICY "Admins can delete sectors"
  ON public.sectors FOR DELETE
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.is_super_admin(auth.uid())
    )
  );

-- ============================================================
-- 5. RLS POLICIES — sector_members
-- ============================================================
CREATE POLICY "View sector members in same org"
  ON public.sector_members FOR SELECT
  USING (
    public.user_in_sector_organization(auth.uid(), sector_id)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Admins/managers manage sector members - insert"
  ON public.sector_members FOR INSERT
  WITH CHECK (
    public.user_in_sector_organization(auth.uid(), sector_id)
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.is_super_admin(auth.uid())
    )
  );

CREATE POLICY "Admins/managers manage sector members - delete"
  ON public.sector_members FOR DELETE
  USING (
    public.user_in_sector_organization(auth.uid(), sector_id)
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.is_super_admin(auth.uid())
    )
  );

-- ============================================================
-- 6. ADD sector_id TO RELATED TABLES (nullable)
-- ============================================================
ALTER TABLE public.webchat_conversations
  ADD COLUMN IF NOT EXISTS sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_webchat_conversations_sector ON public.webchat_conversations(sector_id);

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_sector ON public.leads(sector_id);

-- ============================================================
-- 7. EXPAND profiles WITH NEW FIELDS
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS recovery_whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS work_start_time TIME DEFAULT '00:00',
  ADD COLUMN IF NOT EXISTS work_end_time TIME DEFAULT '23:59',
  ADD COLUMN IF NOT EXISTS farewell_message TEXT,
  ADD COLUMN IF NOT EXISTS default_theme TEXT DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS default_menu_state TEXT DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS default_connection_id UUID;

-- ============================================================
-- 8. EXPAND user_permissions
-- ============================================================
ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS view_unassigned_sector_tickets BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS view_schedules_mode TEXT DEFAULT 'mine_only';

-- ============================================================
-- 9. USER NOTIFICATION SETTINGS
-- ============================================================
CREATE TABLE public.user_notification_settings (
  user_id UUID NOT NULL PRIMARY KEY,
  organization_id UUID,
  notify_new_tickets BOOLEAN DEFAULT true,
  notify_status_change BOOLEAN DEFAULT true,
  notify_new_messages BOOLEAN DEFAULT true,
  notify_groups BOOLEAN DEFAULT false,
  notify_unassigned_sector_tickets BOOLEAN DEFAULT false,
  notify_appointments BOOLEAN DEFAULT true,
  push_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their notification settings"
  ON public.user_notification_settings FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      organization_id = public.get_user_organization(auth.uid())
      AND (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'manager')
        OR public.is_super_admin(auth.uid())
      )
    )
  );

CREATE POLICY "Users insert their notification settings"
  ON public.user_notification_settings FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR (
      organization_id = public.get_user_organization(auth.uid())
      AND (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'manager')
        OR public.is_super_admin(auth.uid())
      )
    )
  );

CREATE POLICY "Users update their notification settings"
  ON public.user_notification_settings FOR UPDATE
  USING (
    user_id = auth.uid()
    OR (
      organization_id = public.get_user_organization(auth.uid())
      AND (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'manager')
        OR public.is_super_admin(auth.uid())
      )
    )
  );

CREATE POLICY "Users delete their notification settings"
  ON public.user_notification_settings FOR DELETE
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

-- ============================================================
-- 10. TRIGGERS FOR updated_at
-- ============================================================
CREATE TRIGGER update_sectors_updated_at
  BEFORE UPDATE ON public.sectors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_notification_settings_updated_at
  BEFORE UPDATE ON public.user_notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 11. UPDATE initialize_user_permissions TO INCLUDE NEW FIELDS
-- ============================================================
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
    CASE WHEN p_role IN ('admin') THEN true WHEN p_role = 'manager' THEN true ELSE false END,
    CASE WHEN p_role IN ('admin') THEN true WHEN p_role = 'manager' THEN true ELSE false END,
    CASE WHEN p_role IN ('admin') THEN true WHEN p_role = 'manager' THEN true ELSE false END,
    true,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role = 'admin' THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN true ELSE false END,
    CASE WHEN p_role IN ('admin', 'manager') THEN 'all' ELSE 'mine_only' END
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Initialize notification settings
  INSERT INTO public.user_notification_settings (user_id, organization_id)
  VALUES (p_user_id, p_organization_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$function$;

-- ============================================================
-- 12. SEED DEFAULT SECTORS PER ORGANIZATION
-- ============================================================
DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT DISTINCT organization_id FROM public.profiles WHERE organization_id IS NOT NULL LOOP
    INSERT INTO public.sectors (organization_id, name, color, bot_order, greeting_message)
    VALUES
      (org.organization_id, 'Comercial',           '#3B82F6', 1, 'Olá! Você está sendo atendido pelo time Comercial.'),
      (org.organization_id, 'Vendas',              '#10B981', 2, 'Olá! Bem-vindo(a) ao time de Vendas.'),
      (org.organization_id, 'Suporte',             '#EF4444', 3, 'Olá! Você está no canal de Suporte. Como podemos ajudar?'),
      (org.organization_id, 'Financeiro',          '#F59E0B', 4, 'Olá! Você foi direcionado(a) ao Financeiro.'),
      (org.organization_id, 'Sucesso do Cliente',  '#8B5CF6', 5, 'Olá! Aqui é o time de Sucesso do Cliente.')
    ON CONFLICT (organization_id, name) DO NOTHING;
  END LOOP;
END $$;
