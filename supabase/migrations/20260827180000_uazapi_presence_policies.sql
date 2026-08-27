-- Política de presence (available/unavailable) por organização, reforçada
-- pelo uazapi-heartbeat. Decisão de produto (2026-08-27): modo explícito,
-- nunca booleano ambíguo — `desired_presence` é sempre 'available' ou
-- 'unavailable', nunca inferido. Ausência de linha OU `enabled=false` =
-- não gerenciado (heartbeat nunca altera presence para essa organização).
--
-- Mesmo desenho de `meta_cloud_feature_flags`/`conversation_isolation_feature_flags`
-- (já em produção): tabela dedicada, RLS restrita a super_admin para
-- escrita, leitura restrita à própria organização. Deliberadamente NÃO
-- usa `organizations.settings` (jsonb) — essa coluna é editável por admins
-- de organização via policy "Admins can update their organization"
-- (UPDATE, roles=authenticated), o que daria a um admin comum controle
-- sobre presence de conta do WhatsApp (afeta notificações/visto por
-- último) sem a mesma governança das outras flags operacionais deste
-- projeto. Também evita qualquer confusão com `organizations.presence_enabled`,
-- que é um conceito totalmente diferente (simulação de "digitando..." por
-- mensagem, ver _shared/presence.ts) — nomes e tabelas distintos.
--
-- Este arquivo NÃO usa CONCURRENTLY (tabela nova, vazia) — pode ter
-- múltiplos statements na mesma transação.

CREATE TABLE IF NOT EXISTS public.uazapi_presence_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  desired_presence text NOT NULL CHECK (desired_presence IN ('available', 'unavailable')),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);

ALTER TABLE public.uazapi_presence_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin manages all uazapi presence policies"
ON public.uazapi_presence_policies
FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Org admins can view their own uazapi presence policy"
ON public.uazapi_presence_policies
FOR SELECT
USING (
  public.user_belongs_to_organization(auth.uid(), organization_id)
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);
