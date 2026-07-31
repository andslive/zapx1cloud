-- Funil padrão por conexão/instância WhatsApp.
-- Aditivo e reversível: coluna nullable, sem tocar em webchat_conversations/leads
-- existentes. Enquanto NULL, o roteamento continua usando a regra legada de
-- Funil > Canais (capture_funnels.channels->'whatsapp').
ALTER TABLE public.evolution_instances
ADD COLUMN IF NOT EXISTS default_funnel_id uuid REFERENCES public.capture_funnels(id);

CREATE INDEX IF NOT EXISTS idx_evolution_instances_default_funnel_id
  ON public.evolution_instances (default_funnel_id)
  WHERE default_funnel_id IS NOT NULL;

-- Não existe FK composta viável aqui (evolution_instances.organization_id é
-- nullable e capture_funnels não tem UNIQUE(id, organization_id) hoje), então
-- a integridade "conexão e funil pertencem à mesma organização" é garantida
-- por trigger, que consulta capture_funnels diretamente no momento da escrita.
CREATE OR REPLACE FUNCTION public.validate_evolution_instance_default_funnel_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _funnel_org uuid;
BEGIN
  IF NEW.default_funnel_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT organization_id INTO _funnel_org
  FROM public.capture_funnels
  WHERE id = NEW.default_funnel_id;

  IF _funnel_org IS NULL THEN
    RAISE EXCEPTION 'default_funnel_id % does not reference an existing capture_funnels row', NEW.default_funnel_id;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM _funnel_org THEN
    RAISE EXCEPTION 'default_funnel_id % belongs to organization %, but evolution_instances.organization_id is %',
      NEW.default_funnel_id, _funnel_org, NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_evolution_instance_default_funnel_org ON public.evolution_instances;
CREATE TRIGGER trg_validate_evolution_instance_default_funnel_org
  BEFORE INSERT OR UPDATE OF default_funnel_id ON public.evolution_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_evolution_instance_default_funnel_org();

-- RPC usada pelo frontend para trocar o funil padrão de uma conexão.
-- Reaproveita o padrão de auditoria já existente (platform_audit_logs, usado
-- em super-admin-manage-user/create-organization-admin/delete-organization)
-- em vez de criar um mecanismo paralelo. A escrita em platform_audit_logs só
-- é permitida hoje para super_admin via RLS ("Super admins can manage audit
-- logs"), então a função roda SECURITY DEFINER e faz a checagem de
-- autorização (mesma organização + admin/manager, ou super_admin) no corpo,
-- preservando isolamento multitenant no backend — não só no frontend.
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
      'organization_id', _conn.organization_id,
      'old_funnel_id', _old_funnel_id,
      'new_funnel_id', _funnel_id
    )
  );

  RETURN _result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_connection_default_funnel(uuid, uuid) TO authenticated;
