-- Corrige 400 (22P02) em consultas authenticated a purchase_audit:
-- a policy antiga fazia (connection_id)::uuid, mas ~1.4k linhas têm
-- connection_id corrompido (JSON da instância inteira em vez de uuid),
-- e o cast explodia na avaliação do RLS. Compara como text, sem cast;
-- semântica idêntica para linhas válidas, e as corrompidas continuam
-- acessíveis pelo braço lead_id (100% das linhas têm lead_id).
DROP POLICY "Org members can view purchase audit" ON public.purchase_audit;

CREATE POLICY "Org members can view purchase audit"
  ON public.purchase_audit FOR SELECT
  TO authenticated
  USING (
    (
      connection_id IS NOT NULL
      AND connection_id IN (
        SELECT id::text FROM public.evolution_instances
        WHERE organization_id = get_user_organization(auth.uid())
      )
    )
    OR
    (
      lead_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = purchase_audit.lead_id
          AND l.organization_id = get_user_organization(auth.uid())
      )
    )
  );
