-- 1) Coluna needs_human (referenciada por várias edge functions sem existir)
ALTER TABLE public.webchat_conversations
  ADD COLUMN IF NOT EXISTS needs_human boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_webchat_conv_needs_human
  ON public.webchat_conversations(organization_id, needs_human)
  WHERE needs_human = true;

-- 2) Trigger: preencher sector_id padrão da organização quando criar conversa sem setor
CREATE OR REPLACE FUNCTION public.fill_default_sector()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sec uuid;
BEGIN
  IF NEW.sector_id IS NULL AND NEW.organization_id IS NOT NULL THEN
    -- Tenta achar setor padrão da org (mais antigo)
    SELECT id INTO v_sec
    FROM public.sectors
    WHERE organization_id = NEW.organization_id
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_sec IS NOT NULL THEN
      NEW.sector_id := v_sec;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_default_sector ON public.webchat_conversations;
CREATE TRIGGER trg_fill_default_sector
BEFORE INSERT ON public.webchat_conversations
FOR EACH ROW
EXECUTE FUNCTION public.fill_default_sector();

-- 3) Backfill: preencher sector_id em conversas existentes que estão sem
UPDATE public.webchat_conversations c
SET sector_id = (
  SELECT s.id FROM public.sectors s
  WHERE s.organization_id = c.organization_id
  ORDER BY s.created_at ASC LIMIT 1
)
WHERE c.sector_id IS NULL
  AND c.status IN ('bot_active','waiting_human','human_active');

-- 4) Destravar conversas paradas em bot_active há mais de 5 min
UPDATE public.webchat_conversations
SET status = 'waiting_human',
    needs_human = true,
    orchestrator_state = NULL,
    current_agent_id = NULL
WHERE status = 'bot_active'
  AND updated_at < now() - interval '5 minutes';