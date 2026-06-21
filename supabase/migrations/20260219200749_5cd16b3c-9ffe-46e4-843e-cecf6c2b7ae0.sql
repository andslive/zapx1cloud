
-- Corrigir políticas RLS da tabela leads

-- 1. Remover política restritiva de UPDATE que impede atualizar leads do squad sem assigned_to
DROP POLICY IF EXISTS "Users can update their assigned leads" ON public.leads;

-- 2. Nova política de UPDATE: permite atualizar leads da organização se:
--    - É admin/manager, OU
--    - É o vendedor atribuído, OU
--    - É membro do squad do lead (para movimentações no kanban)
CREATE POLICY "Users can update leads in their org"
  ON public.leads
  FOR UPDATE
  TO authenticated
  USING (
    organization_id = get_user_organization(auth.uid())
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'manager'::app_role)
      OR assigned_to = auth.uid()
      OR (
        squad_id IS NOT NULL
        AND squad_id IN (
          SELECT squad_members.squad_id
          FROM squad_members
          WHERE squad_members.user_id = auth.uid()
        )
      )
    )
  );

-- 3. Corrigir política de INSERT em lead_stage_history para também permitir membros do squad
DROP POLICY IF EXISTS "Users can insert lead history" ON public.lead_stage_history;

CREATE POLICY "Users can insert lead history"
  ON public.lead_stage_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = lead_stage_history.lead_id
        AND l.organization_id = get_user_organization(auth.uid())
        AND (
          l.assigned_to = auth.uid()
          OR has_role(auth.uid(), 'admin'::app_role)
          OR has_role(auth.uid(), 'manager'::app_role)
          OR (
            l.squad_id IS NOT NULL
            AND l.squad_id IN (
              SELECT squad_members.squad_id
              FROM squad_members
              WHERE squad_members.user_id = auth.uid()
            )
          )
        )
    )
  );

-- 4. Garantir que a política de SELECT para leads atribuídos ao squad usa role authenticated (não public)
DROP POLICY IF EXISTS "Squad members can view squad leads" ON public.leads;

CREATE POLICY "Squad members can view squad leads"
  ON public.leads
  FOR SELECT
  TO authenticated
  USING (
    organization_id = get_user_organization(auth.uid())
    AND squad_id IN (
      SELECT squad_members.squad_id
      FROM squad_members
      WHERE squad_members.user_id = auth.uid()
    )
  );
