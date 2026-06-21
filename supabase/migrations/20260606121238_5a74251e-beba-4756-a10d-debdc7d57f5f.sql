
-- pixel_event_logs: replace permissive policy with org-scoped policies
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.pixel_event_logs;

CREATE POLICY "pixel_event_logs_select_own_org" ON public.pixel_event_logs
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.webchat_conversations c
    WHERE c.id = pixel_event_logs.conversation_id
      AND c.organization_id = public.get_user_organization(auth.uid()))
);

CREATE POLICY "pixel_event_logs_insert_own_org" ON public.pixel_event_logs
FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.webchat_conversations c
    WHERE c.id = pixel_event_logs.conversation_id
      AND c.organization_id = public.get_user_organization(auth.uid()))
);

CREATE POLICY "pixel_event_logs_update_own_org" ON public.pixel_event_logs
FOR UPDATE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.webchat_conversations c
    WHERE c.id = pixel_event_logs.conversation_id
      AND c.organization_id = public.get_user_organization(auth.uid()))
);

CREATE POLICY "pixel_event_logs_delete_own_org" ON public.pixel_event_logs
FOR DELETE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.webchat_conversations c
    WHERE c.id = pixel_event_logs.conversation_id
      AND c.organization_id = public.get_user_organization(auth.uid()))
);

-- funnel-assets bucket: drop unscoped legacy policies
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete" ON storage.objects;

-- squad-icons: add org scope to write policies
DROP POLICY IF EXISTS "Admins and managers can upload squad icons" ON storage.objects;
DROP POLICY IF EXISTS "Admins and managers can update squad icons" ON storage.objects;
DROP POLICY IF EXISTS "Admins and managers can delete squad icons" ON storage.objects;

CREATE POLICY "Admins and managers can upload squad icons" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'squad-icons'
  AND (storage.foldername(name))[1] = public.get_user_organization(auth.uid())::text
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
);

CREATE POLICY "Admins and managers can update squad icons" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'squad-icons'
  AND (storage.foldername(name))[1] = public.get_user_organization(auth.uid())::text
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
)
WITH CHECK (
  bucket_id = 'squad-icons'
  AND (storage.foldername(name))[1] = public.get_user_organization(auth.uid())::text
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
);

CREATE POLICY "Admins and managers can delete squad icons" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'squad-icons'
  AND (storage.foldername(name))[1] = public.get_user_organization(auth.uid())::text
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
);
