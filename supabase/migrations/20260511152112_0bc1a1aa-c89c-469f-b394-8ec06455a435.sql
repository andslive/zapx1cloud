
-- ============================================================
-- 1. Extender booking_requests com novos campos e status
-- ============================================================
ALTER TABLE public.booking_requests
  DROP CONSTRAINT IF EXISTS booking_requests_status_check;

ALTER TABLE public.booking_requests
  ADD CONSTRAINT booking_requests_status_check CHECK (
    status = ANY (ARRAY[
      'pending','confirmed','cancelled','completed',
      'agendado','confirmacao_enviada','confirmado','lembrete_enviado',
      'reagendamento_solicitado','cancelado','no_show','concluido'
    ])
  );

ALTER TABLE public.booking_requests
  ADD COLUMN IF NOT EXISTS whatsapp_message_id text,
  ADD COLUMN IF NOT EXISTS last_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reply_text text,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_booking_requests_phone ON public.booking_requests (guest_phone);
CREATE INDEX IF NOT EXISTS idx_booking_requests_status ON public.booking_requests (status);
CREATE INDEX IF NOT EXISTS idx_booking_requests_org ON public.booking_requests (organization_id);

-- Permite que o protected trigger não bloqueie updates de status feitos pelo service role
-- (o trigger atual já permite quando auth.uid() = host_user_id; service role bypass via security definer das edge functions)

-- ============================================================
-- 2. booking_notification_settings (1:1 com booking_event_types)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.booking_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type_id uuid NOT NULL UNIQUE REFERENCES public.booking_event_types(id) ON DELETE CASCADE,

  -- Canais de envio
  send_email boolean NOT NULL DEFAULT true,
  send_whatsapp boolean NOT NULL DEFAULT false,

  -- Instância WhatsApp para disparos
  whatsapp_instance_id uuid REFERENCES public.evolution_instances(id) ON DELETE SET NULL,

  -- Templates de confirmação
  confirmation_message_whatsapp text,
  confirmation_subject_email text,
  confirmation_html_email text,

  -- Notificações internas (vendedor)
  notify_seller_on_new boolean NOT NULL DEFAULT true,
  notify_seller_on_confirm boolean NOT NULL DEFAULT true,
  notify_seller_on_reschedule boolean NOT NULL DEFAULT true,
  notify_seller_on_cancel boolean NOT NULL DEFAULT true,
  internal_channel text NOT NULL DEFAULT 'both' CHECK (internal_channel IN ('whatsapp','email','both')),
  internal_message_template text,

  -- Recuperação de não confirmados
  recovery_enabled boolean NOT NULL DEFAULT false,
  recovery_offset_value integer NOT NULL DEFAULT 3,
  recovery_offset_unit text NOT NULL DEFAULT 'hours' CHECK (recovery_offset_unit IN ('minutes','hours','days')),
  recovery_message text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bns_org ON public.booking_notification_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_bns_event ON public.booking_notification_settings(event_type_id);

ALTER TABLE public.booking_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read notification settings"
  ON public.booking_notification_settings FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR user_belongs_to_organization(auth.uid(), organization_id));

CREATE POLICY "Org members write notification settings"
  ON public.booking_notification_settings FOR INSERT TO authenticated
  WITH CHECK (is_super_admin(auth.uid()) OR user_belongs_to_organization(auth.uid(), organization_id));

CREATE POLICY "Org members update notification settings"
  ON public.booking_notification_settings FOR UPDATE TO authenticated
  USING (is_super_admin(auth.uid()) OR user_belongs_to_organization(auth.uid(), organization_id));

CREATE POLICY "Org members delete notification settings"
  ON public.booking_notification_settings FOR DELETE TO authenticated
  USING (is_super_admin(auth.uid()) OR user_belongs_to_organization(auth.uid(), organization_id));

-- ============================================================
-- 3. booking_reminders (N por tipo de evento)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.booking_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type_id uuid NOT NULL REFERENCES public.booking_event_types(id) ON DELETE CASCADE,

  offset_value integer NOT NULL,
  offset_unit text NOT NULL CHECK (offset_unit IN ('minutes','hours','days')),
  channel text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','email','both')),
  message_template text NOT NULL,
  email_subject text,
  is_active boolean NOT NULL DEFAULT true,
  order_index integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_br_event ON public.booking_reminders(event_type_id);
CREATE INDEX IF NOT EXISTS idx_br_org ON public.booking_reminders(organization_id);

ALTER TABLE public.booking_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read reminders"
  ON public.booking_reminders FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR user_belongs_to_organization(auth.uid(), organization_id));

CREATE POLICY "Org members write reminders"
  ON public.booking_reminders FOR INSERT TO authenticated
  WITH CHECK (is_super_admin(auth.uid()) OR user_belongs_to_organization(auth.uid(), organization_id));

CREATE POLICY "Org members update reminders"
  ON public.booking_reminders FOR UPDATE TO authenticated
  USING (is_super_admin(auth.uid()) OR user_belongs_to_organization(auth.uid(), organization_id));

CREATE POLICY "Org members delete reminders"
  ON public.booking_reminders FOR DELETE TO authenticated
  USING (is_super_admin(auth.uid()) OR user_belongs_to_organization(auth.uid(), organization_id));

-- ============================================================
-- 4. booking_status_history
-- ============================================================
CREATE TABLE IF NOT EXISTS public.booking_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.booking_requests(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  source text NOT NULL DEFAULT 'system' CHECK (source IN ('system','lead_reply','seller','cron','admin')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bsh_booking ON public.booking_status_history(booking_id);
CREATE INDEX IF NOT EXISTS idx_bsh_org ON public.booking_status_history(organization_id);

ALTER TABLE public.booking_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read status history"
  ON public.booking_status_history FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR user_belongs_to_organization(auth.uid(), organization_id));

-- ============================================================
-- 5. booking_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.booking_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.booking_requests(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'confirmation_sent','reminder_sent','recovery_sent','reply_received',
    'notification_sent','send_failed','status_changed'
  )),
  channel text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bl_booking ON public.booking_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_bl_org ON public.booking_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_bl_created ON public.booking_logs(created_at DESC);

ALTER TABLE public.booking_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read booking logs"
  ON public.booking_logs FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR user_belongs_to_organization(auth.uid(), organization_id));

-- ============================================================
-- 6. booking_scheduled_jobs (fila durável)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.booking_scheduled_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.booking_requests(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reminder_id uuid REFERENCES public.booking_reminders(id) ON DELETE SET NULL,

  kind text NOT NULL CHECK (kind IN ('confirmation','reminder','recovery','internal_notification')),
  channel text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','email','both')),

  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_bsj_due ON public.booking_scheduled_jobs(status, scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_bsj_booking ON public.booking_scheduled_jobs(booking_id);
CREATE INDEX IF NOT EXISTS idx_bsj_org ON public.booking_scheduled_jobs(organization_id);

ALTER TABLE public.booking_scheduled_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read jobs"
  ON public.booking_scheduled_jobs FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR user_belongs_to_organization(auth.uid(), organization_id));

-- ============================================================
-- 7. seller_notification_settings
-- ============================================================
CREATE TABLE IF NOT EXISTS public.seller_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  notify_new_booking boolean NOT NULL DEFAULT true,
  notify_confirmed boolean NOT NULL DEFAULT true,
  notify_reschedule boolean NOT NULL DEFAULT true,
  notify_cancel boolean NOT NULL DEFAULT true,

  channel text NOT NULL DEFAULT 'both' CHECK (channel IN ('whatsapp','email','both')),
  whatsapp_number text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sns_org ON public.seller_notification_settings(organization_id);

ALTER TABLE public.seller_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers manage own notification settings"
  ON public.seller_notification_settings FOR ALL TO authenticated
  USING (user_id = auth.uid() OR is_super_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR is_super_admin(auth.uid()));

-- ============================================================
-- 8. Triggers updated_at
-- ============================================================
CREATE TRIGGER trg_bns_updated BEFORE UPDATE ON public.booking_notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_br_updated BEFORE UPDATE ON public.booking_reminders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_bsj_updated BEFORE UPDATE ON public.booking_scheduled_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_sns_updated BEFORE UPDATE ON public.seller_notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_br_req_updated BEFORE UPDATE ON public.booking_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 9. Trigger de status history
-- ============================================================
CREATE OR REPLACE FUNCTION public.booking_log_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.booking_status_history (booking_id, organization_id, from_status, to_status, source)
    VALUES (NEW.id, NEW.organization_id, NULL, NEW.status, 'system');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.booking_status_history (booking_id, organization_id, from_status, to_status, source)
    VALUES (NEW.id, NEW.organization_id, OLD.status, NEW.status, 'system');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_status_history ON public.booking_requests;
CREATE TRIGGER trg_booking_status_history
  AFTER INSERT OR UPDATE OF status ON public.booking_requests
  FOR EACH ROW EXECUTE FUNCTION public.booking_log_status_change();
