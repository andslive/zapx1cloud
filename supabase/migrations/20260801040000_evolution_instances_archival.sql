-- Arquivamento de conexão como operação padrão (chip banido, sem
-- possibilidade de retorno) — distinto de exclusão física, que passa a ser
-- exceção. Aditivo, reversível, todas as colunas nullable, sem tocar em
-- webchat_conversations/leads/purchase_audit existentes.
ALTER TABLE public.evolution_instances
ADD COLUMN IF NOT EXISTS archived_at timestamptz,
ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS archive_reason text,
ADD COLUMN IF NOT EXISTS provider_deleted_at timestamptz;

-- Índice parcial para a listagem "Conexões arquivadas" (e para excluir
-- arquivadas da listagem operacional padrão) sem escanear a tabela toda.
CREATE INDEX IF NOT EXISTS idx_evolution_instances_archived_at
  ON public.evolution_instances (organization_id, archived_at)
  WHERE archived_at IS NOT NULL;

-- Contagem de impacto antes de excluir fisicamente uma conexão (usada pelo
-- diálogo de confirmação reforçada no frontend, e reconferida no backend
-- antes de qualquer exclusão física — nunca confiar só no número mostrado
-- ao usuário). Feito como RPC (não múltiplas queries do Edge Function) para
-- não precisar transferir milhares de IDs de conversa via PostgREST.
CREATE OR REPLACE FUNCTION public.get_connection_deletion_impact(_connection_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _conn public.evolution_instances%ROWTYPE;
  _conversations int;
  _leads int;
  _messages int;
  _purchases int;
  _notification_logs int;
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
    RAISE EXCEPTION 'Not authorized to inspect this connection';
  END IF;

  SELECT count(*) INTO _conversations FROM public.webchat_conversations WHERE connection_id = _connection_id;
  SELECT count(*) INTO _leads FROM public.leads WHERE connection_id = _connection_id;
  SELECT count(*) INTO _messages FROM public.webchat_messages
    WHERE conversation_id IN (SELECT id FROM public.webchat_conversations WHERE connection_id = _connection_id);
  SELECT count(*) INTO _purchases FROM public.purchase_audit WHERE connection_id = _connection_id::text;
  SELECT count(*) INTO _notification_logs FROM public.admin_notification_logs WHERE connection_id = _connection_id;

  RETURN jsonb_build_object(
    'connection_id', _connection_id,
    'name', _conn.name,
    'is_active', _conn.is_active,
    'archived_at', _conn.archived_at,
    'conversations', _conversations,
    'leads', _leads,
    'messages', _messages,
    'purchases', _purchases,
    'notification_logs', _notification_logs
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_connection_deletion_impact(uuid) TO authenticated;
