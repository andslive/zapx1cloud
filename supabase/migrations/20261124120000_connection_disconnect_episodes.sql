-- Alerta de desconexão confirmada (substitui o alerta imediato por mudança de status).
-- Uma ocorrência ATIVA por conexão (índice único parcial): evento/webhook repetido não cria outra nem reinicia o prazo.
-- Estado persistente: o heartbeat (pg_cron, 1/min) só empurra os episódios vencidos; nada fica esperando em requisição.
-- Aditiva. NÃO altera evolution_instances (o status do painel continua sendo atualizado como antes).

CREATE TABLE IF NOT EXISTS public.connection_disconnect_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.evolution_instances(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'pending',
  source text NOT NULL DEFAULT 'heartbeat',
  suspected_at timestamptz NOT NULL DEFAULT now(),
  next_check_at timestamptz NOT NULL,
  confirm_count integer NOT NULL DEFAULT 0,
  last_valid_disconnect_at timestamptz,
  inconclusive_streak integer NOT NULL DEFAULT 0,
  check_count integer NOT NULL DEFAULT 0,
  last_check_at timestamptz,
  last_check_result text,
  alert_status text,
  alert_claimed_at timestamptz,
  alert_sent_at timestamptz,
  alert_attempts integer NOT NULL DEFAULT 0,
  recovered_since timestamptz,
  last_connected_at timestamptz,
  close_reason text,
  closed_at timestamptz,
  version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connection_disconnect_episodes_state_chk CHECK (state IN ('pending', 'alerted', 'closed')),
  CONSTRAINT connection_disconnect_episodes_alert_status_chk
    CHECK (alert_status IS NULL OR alert_status IN ('claiming', 'sent', 'unknown', 'skipped', 'failed'))
);

-- no máximo UM episódio ativo por conexão
CREATE UNIQUE INDEX IF NOT EXISTS connection_disconnect_episodes_one_active
  ON public.connection_disconnect_episodes (connection_id) WHERE state <> 'closed';
CREATE INDEX IF NOT EXISTS connection_disconnect_episodes_due
  ON public.connection_disconnect_episodes (next_check_at) WHERE state <> 'closed';

ALTER TABLE public.connection_disconnect_episodes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.connection_disconnect_episodes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.connection_disconnect_episodes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.connection_disconnect_episodes TO service_role;
DROP POLICY IF EXISTS "Admins read own org disconnect episodes" ON public.connection_disconnect_episodes;
CREATE POLICY "Admins read own org disconnect episodes" ON public.connection_disconnect_episodes
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Fonte de alerta imediato por mudança de status (insere admin_status_alerts 'pending' a cada mudança de
-- evolution_instances.status). Substituída pelo episódio confirmado acima; sem isto o alerta imediato continuaria.
DROP TRIGGER IF EXISTS trigger_instance_status_change ON public.evolution_instances;
