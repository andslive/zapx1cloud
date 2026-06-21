
-- 1) user_roles: bloquear escalonamento para super_admin via INSERT por admin comum
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert non-super roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'super_admin'::app_role
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_roles.user_id
      AND p.organization_id = get_user_organization(auth.uid())
  )
);

-- Garantir também que admins não possam fazer UPDATE para super_admin
-- (hoje só super_admin tem UPDATE, mas reforçamos com policy negativa explícita não é necessária;
-- apenas confirmamos que não existe policy de UPDATE para admins comuns).

-- 2) webhook_logs: remover INSERT público/anon
DROP POLICY IF EXISTS "Enable insert for all" ON public.webhook_logs;
-- Service role já tem "Enable all for service_role" (FOR ALL com check true), webhooks continuam gravando.

-- 3) search_path fix em SECURITY DEFINER functions
ALTER FUNCTION public.check_webhook_health_discrepancies() SET search_path = public;
ALTER FUNCTION public.cleanup_old_logs() SET search_path = public;
ALTER FUNCTION public.mark_funnel_completed_on_lead(p_lead_id uuid, p_funnel_id uuid) SET search_path = public;
ALTER FUNCTION public.on_instance_status_change_notify_admin() SET search_path = public;
ALTER FUNCTION public.sync_pixel_to_purchase_audit() SET search_path = public;
ALTER FUNCTION public.trigger_funnel_runner_on_job() SET search_path = public;
