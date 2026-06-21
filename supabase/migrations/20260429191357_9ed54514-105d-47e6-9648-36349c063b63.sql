CREATE OR REPLACE FUNCTION public.enforce_single_attendant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Humano definido (ou trocado) → IA sai
  IF NEW.assigned_user_id IS NOT NULL
     AND NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id THEN
    NEW.current_agent_id := NULL;
  -- IA definida (ou trocada) e humano não foi alterado nesta operação → humano sai
  ELSIF NEW.current_agent_id IS NOT NULL
     AND NEW.current_agent_id IS DISTINCT FROM OLD.current_agent_id THEN
    NEW.assigned_user_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_attendant ON public.webchat_conversations;
CREATE TRIGGER trg_enforce_single_attendant
  BEFORE UPDATE OF assigned_user_id, current_agent_id ON public.webchat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_single_attendant();

-- Backfill: humano vence em conversas abertas mistas
UPDATE public.webchat_conversations
SET current_agent_id = NULL
WHERE assigned_user_id IS NOT NULL
  AND current_agent_id IS NOT NULL
  AND status::text NOT IN ('closed', 'resolved');