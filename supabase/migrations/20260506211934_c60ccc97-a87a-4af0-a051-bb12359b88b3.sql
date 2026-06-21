
-- 1) Colunas de trava permanente
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS super_admin_bootstrapped boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS super_admin_bootstrapped_at timestamptz;

-- 2) Garante registro inicial (idempotente — só insere se a tabela estiver vazia)
INSERT INTO public.platform_settings (default_password_changed, remix_setup_completed, super_admin_bootstrapped)
SELECT false, false, false
WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings);

-- 3) Trigger anti-reset: impede UPDATE que volte super_admin_bootstrapped de true para false
CREATE OR REPLACE FUNCTION public.prevent_super_admin_lock_reset()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.super_admin_bootstrapped = true AND NEW.super_admin_bootstrapped = false THEN
    RAISE EXCEPTION 'super_admin_bootstrapped lock cannot be reset';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_super_admin_lock_reset ON public.platform_settings;
CREATE TRIGGER trg_prevent_super_admin_lock_reset
BEFORE UPDATE ON public.platform_settings
FOR EACH ROW
EXECUTE FUNCTION public.prevent_super_admin_lock_reset();
