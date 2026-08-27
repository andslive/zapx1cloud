-- Feature flag de rollout gradual para a Parte A (conversa separada por
-- conexão) + Parte B (gate atômico de funil por lead_id+funnel_id).
-- Mesmo desenho de `meta_cloud_feature_flags` (migration 20260810120000),
-- já em produção: desligada por padrão, escopo global ou por organização,
-- linha de organização tem prioridade sobre a global.
--
-- Propósito: eliminar a janela de proteção reduzida entre o DROP do índice
-- webchat_conv_open_phone_unique e o deploy do código novo. Enquanto uma
-- organização estiver com a flag desligada, o código novo se comporta
-- exatamente como o legado (be3116b) para ela — nenhuma organização perde
-- a proteção do índice antigo antes de estar migrada para o novo.
--
-- Este arquivo NÃO usa CONCURRENTLY (tabela nova, vazia, sem lock relevante
-- em tabela existente) — pode ter múltiplos statements na mesma transação,
-- diferente das migrations 20260827150000/150100/150200.

CREATE TABLE IF NOT EXISTS public.conversation_isolation_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global', 'organization')),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id),
  CHECK (
    (scope = 'global' AND organization_id IS NULL)
    OR (scope = 'organization' AND organization_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_isolation_feature_flags_global
  ON public.conversation_isolation_feature_flags (scope)
  WHERE scope = 'global';

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_isolation_feature_flags_org
  ON public.conversation_isolation_feature_flags (organization_id)
  WHERE scope = 'organization';

ALTER TABLE public.conversation_isolation_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin manages all conversation isolation feature flags"
ON public.conversation_isolation_feature_flags
FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Org admins can view their own conversation isolation feature flag"
ON public.conversation_isolation_feature_flags
FOR SELECT
USING (
  scope = 'organization'
  AND public.user_belongs_to_organization(auth.uid(), organization_id)
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);
