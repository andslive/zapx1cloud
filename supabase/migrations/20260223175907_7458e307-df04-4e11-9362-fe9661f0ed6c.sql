
CREATE OR REPLACE FUNCTION public.delete_team_member(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Remove product assignments
  DELETE FROM public.user_product_assignments WHERE user_id = p_user_id;
  -- Remove squad memberships
  DELETE FROM public.squad_members WHERE user_id = p_user_id;
  -- Remove roles
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  -- Nullify references in leads
  UPDATE public.leads SET assigned_to = NULL WHERE assigned_to = p_user_id;
  -- Nullify references in deals
  UPDATE public.deals SET seller_id = p_user_id WHERE seller_id = p_user_id;
  -- Remove user_status
  DELETE FROM public.user_status WHERE user_id = p_user_id;
  -- Remove availability overrides
  DELETE FROM public.availability_overrides WHERE user_id = p_user_id;
  -- Remove notifications
  DELETE FROM public.notifications WHERE user_id = p_user_id;
  -- Delete profile
  DELETE FROM public.profiles WHERE id = p_user_id;
  -- Delete from auth.users (cascades everything else)
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;
