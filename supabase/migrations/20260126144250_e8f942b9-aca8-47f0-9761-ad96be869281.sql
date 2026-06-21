-- Permitir Super Admins gerenciarem convites de todas as organizações
CREATE POLICY "Super admins can manage all invitations" 
ON public.team_invitations 
FOR ALL 
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));