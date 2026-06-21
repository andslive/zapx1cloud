
-- ============= TEAM INVITATIONS =============
-- Restringe listagem autenticada por empresa; mantém acesso público por token.
DROP POLICY IF EXISTS "Admins and managers can manage invitations" ON public.team_invitations;

CREATE POLICY "Admins and managers can view invitations in their org"
ON public.team_invitations
FOR SELECT
TO authenticated
USING (
  organization_id = public.get_user_organization(auth.uid())
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
);

CREATE POLICY "Admins and managers can insert invitations in their org"
ON public.team_invitations
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = public.get_user_organization(auth.uid())
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
);

CREATE POLICY "Admins and managers can update invitations in their org"
ON public.team_invitations
FOR UPDATE
TO authenticated
USING (
  organization_id = public.get_user_organization(auth.uid())
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
)
WITH CHECK (
  organization_id = public.get_user_organization(auth.uid())
);

CREATE POLICY "Admins and managers can delete invitations in their org"
ON public.team_invitations
FOR DELETE
TO authenticated
USING (
  organization_id = public.get_user_organization(auth.uid())
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
);

-- ============= USER PRODUCT ASSIGNMENTS =============
-- A policy atual ("Admins and managers can manage assignments") não checa
-- organização — admin de uma empresa podia atribuir/ver produtos de outra.
-- Restringimos ao casamento entre a empresa do admin e a do usuário-alvo + produto.

DROP POLICY IF EXISTS "Admins and managers can manage assignments" ON public.user_product_assignments;
DROP POLICY IF EXISTS "Users can view their own assignments" ON public.user_product_assignments;

-- Vê: próprio usuário, ou admin/manager da MESMA empresa do usuário-alvo.
CREATE POLICY "View assignments scoped to org"
ON public.user_product_assignments
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_super_admin(auth.uid())
  OR (
    (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_product_assignments.user_id
        AND p.organization_id = public.get_user_organization(auth.uid())
    )
  )
);

CREATE POLICY "Admins/managers can insert assignments in their org"
ON public.user_product_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_product_assignments.user_id
      AND p.organization_id = public.get_user_organization(auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM public.products pr
    WHERE pr.id = user_product_assignments.product_id
      AND pr.organization_id = public.get_user_organization(auth.uid())
  )
);

CREATE POLICY "Admins/managers can update assignments in their org"
ON public.user_product_assignments
FOR UPDATE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_product_assignments.user_id
      AND p.organization_id = public.get_user_organization(auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_product_assignments.user_id
      AND p.organization_id = public.get_user_organization(auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM public.products pr
    WHERE pr.id = user_product_assignments.product_id
      AND pr.organization_id = public.get_user_organization(auth.uid())
  )
);

CREATE POLICY "Admins/managers can delete assignments in their org"
ON public.user_product_assignments
FOR DELETE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_product_assignments.user_id
      AND p.organization_id = public.get_user_organization(auth.uid())
  )
);
