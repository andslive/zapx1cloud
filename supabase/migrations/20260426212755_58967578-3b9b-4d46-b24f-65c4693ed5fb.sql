ALTER TABLE public.product_agents
  ADD COLUMN IF NOT EXISTS default_schedule_user_id uuid,
  ADD COLUMN IF NOT EXISTS allowed_event_type_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS booking_notification_user_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS booking_notify_org_admins boolean DEFAULT false;

COMMENT ON COLUMN public.product_agents.default_schedule_user_id IS 'Vendedor anfitrião padrão usado pela IA para consultar agenda e criar reuniões.';
COMMENT ON COLUMN public.product_agents.allowed_event_type_ids IS 'Tipos de evento (booking_event_types) que esse agente pode oferecer. Vazio = não pode agendar.';
COMMENT ON COLUMN public.product_agents.booking_notification_user_ids IS 'Usuários que recebem notificação interna quando a IA confirma uma reunião.';
COMMENT ON COLUMN public.product_agents.booking_notify_org_admins IS 'Se true, notifica todos os administradores da organização ao confirmar uma reunião.';