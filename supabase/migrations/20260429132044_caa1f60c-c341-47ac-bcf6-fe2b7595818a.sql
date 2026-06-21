-- Trigger 1: garantir que owner da organização vire admin
CREATE OR REPLACE FUNCTION public.ensure_org_owner_is_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.owner_id, 'admin'::app_role)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_org_owner_is_admin ON public.organizations;
CREATE TRIGGER trg_ensure_org_owner_is_admin
  AFTER INSERT OR UPDATE OF owner_id ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_org_owner_is_admin();

-- Trigger 2: primeiro usuário de uma org vira admin automaticamente
CREATE OR REPLACE FUNCTION public.ensure_first_user_is_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_admin_in_org boolean;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.organization_id IS NOT DISTINCT FROM NEW.organization_id THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE p.organization_id = NEW.organization_id
      AND ur.role = 'admin'::app_role
      AND p.id <> NEW.id
  ) INTO has_admin_in_org;

  IF NOT has_admin_in_org THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_first_user_is_admin ON public.profiles;
CREATE TRIGGER trg_ensure_first_user_is_admin
  AFTER INSERT OR UPDATE OF organization_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_first_user_is_admin();
