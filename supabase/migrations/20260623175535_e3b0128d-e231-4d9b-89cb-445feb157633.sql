-- Fase D.1 — Tabela isolada para cópia shadow dos webhooks UazAPI gravada pela VPS2.
-- Nenhuma trigger, nenhuma FK para tabelas oficiais. Rollback = ENABLE_SUPABASE_WRITE=false na VPS2.

CREATE TABLE IF NOT EXISTS public.vps_shadow_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  source text,
  origin text,
  event text,
  instance_id text,
  instance_name text,
  message_id text,
  chat_id text,
  remote_jid text,
  from_me boolean,
  message_type text,
  payload_hash text UNIQUE,
  raw_file_path text,
  payload_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vps_shadow_webhook_logs_received_at
  ON public.vps_shadow_webhook_logs (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_vps_shadow_webhook_logs_event
  ON public.vps_shadow_webhook_logs (event);
CREATE INDEX IF NOT EXISTS idx_vps_shadow_webhook_logs_instance_id
  ON public.vps_shadow_webhook_logs (instance_id);

-- Grants: tabela usada apenas por service_role (VPS2 edge-mini) e leituras admin.
GRANT ALL ON public.vps_shadow_webhook_logs TO service_role;
GRANT SELECT ON public.vps_shadow_webhook_logs TO authenticated;

ALTER TABLE public.vps_shadow_webhook_logs ENABLE ROW LEVEL SECURITY;

-- Somente super admins leem da UI; service_role bypassa RLS.
CREATE POLICY "Super admins can view vps shadow logs"
  ON public.vps_shadow_webhook_logs
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));
