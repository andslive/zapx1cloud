-- FASE 20H — reforça `set_connection_default_funnel` (definida em
-- `20260731210000_evolution_instances_default_funnel.sql`) para nunca
-- definir/trocar o funil padrão de uma conexão já arquivada
-- (`archived_at IS NOT NULL`). Definir um funil padrão para uma conexão
-- arquivada não teria efeito prático hoje (o webhook inbound já falha
-- fechado para conexão arquivada, ver `uazapi-webhook/index.ts`, Fase
-- 20H), mas deixar a RPC aceitar a escrita silenciosamente seria uma
-- inconsistência de UI enganosa (o admin veria a mudança "salva" numa
-- conexão que não processa mais nada).
--
-- `CREATE OR REPLACE FUNCTION` com a MESMA assinatura, mesmo dono
-- implícito (SECURITY DEFINER), mesma auditoria em `platform_audit_logs` —
-- o único comportamento novo é a checagem adicional de `archived_at`
-- logo após localizar a conexão, antes de qualquer verificação de
-- autorização/organização (falha fechada o quanto antes).
--
-- NÃO APLICADA nesta fase — arquivo SQL só para revisão no Draft PR.

CREATE OR REPLACE FUNCTION public.set_connection_default_funnel(
  _connection_id uuid,
  _funnel_id uuid
)
RETURNS public.evolution_instances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _conn public.evolution_instances%ROWTYPE;
  _funnel_org uuid;
  _old_funnel_id uuid;
  _result public.evolution_instances%ROWTYPE;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _conn FROM public.evolution_instances WHERE id = _connection_id;
  IF _conn.id IS NULL THEN
    RAISE EXCEPTION 'Connection % not found', _connection_id;
  END IF;

  -- FASE 20H — único bloco novo desta migration.
  IF _conn.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Connection % is archived and cannot receive a default funnel', _connection_id;
  END IF;

  IF NOT (
    public.is_super_admin(_caller)
    OR (
      public.user_belongs_to_organization(_caller, _conn.organization_id)
      AND (public.has_role(_caller, 'admin'::public.app_role) OR public.has_role(_caller, 'manager'::public.app_role))
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to change the funnel of this connection';
  END IF;

  IF _funnel_id IS NOT NULL THEN
    SELECT organization_id INTO _funnel_org FROM public.capture_funnels WHERE id = _funnel_id;
    IF _funnel_org IS NULL THEN
      RAISE EXCEPTION 'Funnel % not found', _funnel_id;
    END IF;
    IF _funnel_org IS DISTINCT FROM _conn.organization_id THEN
      RAISE EXCEPTION 'Funnel % belongs to a different organization', _funnel_id;
    END IF;
  END IF;

  _old_funnel_id := _conn.default_funnel_id;

  UPDATE public.evolution_instances
  SET default_funnel_id = _funnel_id,
      updated_at = now()
  WHERE id = _connection_id
  RETURNING * INTO _result;

  INSERT INTO public.platform_audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    _caller,
    'connection.default_funnel_changed',
    'evolution_instance',
    _connection_id,
    jsonb_build_object(
      'connection_id', _connection_id,
      'old_funnel_id', _old_funnel_id,
      'new_funnel_id', _funnel_id
    )
  );

  RETURN _result;
END;
$function$;

-- ══════════════════════════════════════════════════════════════════════
-- ROLLBACK (documentado, NÃO executado):
--
-- Reverter significa restaurar a definição de
-- `20260731210000_evolution_instances_default_funnel.sql` (idêntica a
-- esta, menos o bloco de checagem de `archived_at`) via novo
-- `CREATE OR REPLACE FUNCTION` — nunca `DROP FUNCTION`, para não quebrar
-- o RPC que o frontend (`useSetConnectionDefaultFunnel`) já chama em
-- produção.
-- ══════════════════════════════════════════════════════════════════════
