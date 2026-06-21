-- 1. Adicionar campos em auto_notification_settings
ALTER TABLE public.auto_notification_settings
  ADD COLUMN IF NOT EXISTS admin_agent_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_whatsapp_number text,
  ADD COLUMN IF NOT EXISTS admin_user_id uuid,
  ADD COLUMN IF NOT EXISTS daily_summary_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS daily_summary_hour integer DEFAULT 8,
  ADD COLUMN IF NOT EXISTS weekly_report_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS weekly_report_dow integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS weekly_report_hour integer DEFAULT 8,
  ADD COLUMN IF NOT EXISTS realtime_alerts_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS alert_high_value_threshold numeric DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS alert_unattended_minutes integer DEFAULT 15,
  ADD COLUMN IF NOT EXISTS alert_offline_minutes integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS alert_agent_error_threshold integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS alert_meeting_changes boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS alert_goal_achieved boolean DEFAULT true;

-- 2. Tabela de mensagens do agente admin
CREATE TABLE IF NOT EXISTS public.admin_agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('outbound','inbound')),
  message_type text NOT NULL CHECK (message_type IN ('daily_summary','weekly_report','realtime_alert','reactive','test')),
  alert_kind text,
  reference_id uuid,
  content text NOT NULL,
  whatsapp_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_agent_messages_org_type_ref
  ON public.admin_agent_messages(organization_id, message_type, reference_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_agent_messages_org_created
  ON public.admin_agent_messages(organization_id, created_at DESC);

-- 3. RLS
ALTER TABLE public.admin_agent_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view their org admin agent messages" ON public.admin_agent_messages;
CREATE POLICY "Admins can view their org admin agent messages"
  ON public.admin_agent_messages FOR SELECT
  TO authenticated
  USING (
    public.user_belongs_to_organization(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.is_super_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Service role can insert admin agent messages" ON public.admin_agent_messages;
CREATE POLICY "Service role can insert admin agent messages"
  ON public.admin_agent_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_belongs_to_organization(auth.uid(), organization_id)
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );