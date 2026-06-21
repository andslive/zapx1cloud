
-- ============================================================
-- CORREÇÃO DEFINITIVA E IDEMPOTENTE - Squad Distribution Fix
-- ============================================================

-- 1. Adicionar squad_id à tabela webhooks (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'webhooks' 
    AND column_name = 'squad_id'
  ) THEN
    ALTER TABLE public.webhooks 
    ADD COLUMN squad_id uuid REFERENCES public.sales_squads(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Corrigir 138 leads com current_stage_id = NULL
-- Atribui o primeiro estágio do pipeline do produto
UPDATE public.leads l
SET current_stage_id = (
  SELECT ps.id FROM public.pipeline_stages ps
  WHERE ps.product_id = l.product_id
  ORDER BY ps.order_index ASC
  LIMIT 1
)
WHERE l.current_stage_id IS NULL
  AND l.product_id IS NOT NULL;

-- 3. Criar user_status para todos os profiles que não têm registro
INSERT INTO public.user_status (user_id, organization_id, status, active_leads_count)
SELECT DISTINCT p.id, p.organization_id, 'offline', 0
FROM public.profiles p
WHERE p.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_status us WHERE us.user_id = p.id
  )
ON CONFLICT (user_id) DO NOTHING;

-- 4. Corrigir função distribute_lead - remover filtro redundante de organization_id
-- que impede encontrar membros do squad quando o user_status.organization_id não bate
CREATE OR REPLACE FUNCTION public.distribute_lead(
  p_lead_id uuid, 
  p_squad_id uuid, 
  p_organization_id uuid, 
  p_product_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_config RECORD;
  v_assigned_user_id uuid;
  v_members uuid[];
  v_idx integer;
BEGIN
  -- Get distribution config for this squad
  SELECT * INTO v_config
  FROM distribution_config
  WHERE squad_id = p_squad_id AND organization_id = p_organization_id;

  -- Default to round_robin if no config
  IF NOT FOUND THEN
    INSERT INTO distribution_config (organization_id, squad_id, method)
    VALUES (p_organization_id, p_squad_id, 'round_robin')
    RETURNING * INTO v_config;
  END IF;

  -- Get online members of this squad (SEM filtro de organization_id no user_status)
  -- O filtro por squad_id já garante que são membros da organização correta
  SELECT ARRAY_AGG(sm.user_id ORDER BY sm.user_id) INTO v_members
  FROM squad_members sm
  JOIN user_status us ON us.user_id = sm.user_id
  WHERE sm.squad_id = p_squad_id
    AND us.status = 'online';

  -- No online members? Queue the lead
  IF v_members IS NULL OR array_length(v_members, 1) IS NULL THEN
    INSERT INTO lead_queue (lead_id, organization_id, squad_id, product_id, status)
    VALUES (p_lead_id, p_organization_id, p_squad_id, p_product_id, 'pending')
    ON CONFLICT (lead_id) DO NOTHING;
    RETURN NULL;
  END IF;

  -- Apply distribution method
  IF v_config.method = 'round_robin' THEN
    v_idx := v_config.round_robin_index % array_length(v_members, 1);
    v_assigned_user_id := v_members[v_idx + 1];
    UPDATE distribution_config SET round_robin_index = v_config.round_robin_index + 1
    WHERE id = v_config.id;

  ELSIF v_config.method = 'least_busy' THEN
    SELECT us.user_id INTO v_assigned_user_id
    FROM user_status us
    WHERE us.user_id = ANY(v_members) AND us.status = 'online'
    ORDER BY us.active_leads_count ASC
    LIMIT 1;

  ELSE -- performance or fallback
    v_idx := v_config.round_robin_index % array_length(v_members, 1);
    v_assigned_user_id := v_members[v_idx + 1];
    UPDATE distribution_config SET round_robin_index = v_config.round_robin_index + 1
    WHERE id = v_config.id;
  END IF;

  -- Assign lead
  IF v_assigned_user_id IS NOT NULL THEN
    UPDATE leads SET assigned_to = v_assigned_user_id WHERE id = p_lead_id;
    -- Increment active leads count (trigger will also do it, so use GREATEST to avoid double)
    -- Actually the trigger handles it, so just update lead
    RETURN v_assigned_user_id;
  END IF;

  -- Fallback: queue
  INSERT INTO lead_queue (lead_id, organization_id, squad_id, product_id, status)
  VALUES (p_lead_id, p_organization_id, p_squad_id, p_product_id, 'pending')
  ON CONFLICT (lead_id) DO NOTHING;
  RETURN NULL;
END;
$function$;

-- 5. Garantir que a função sync_active_leads_count existe (CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION public.sync_active_leads_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Decrement old assignee's counter
  IF OLD.assigned_to IS NOT NULL AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    UPDATE user_status 
    SET active_leads_count = GREATEST(0, active_leads_count - 1)
    WHERE user_id = OLD.assigned_to;
  END IF;

  -- Increment new assignee's counter
  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    -- Ensure user_status record exists
    INSERT INTO user_status (user_id, organization_id, status, active_leads_count)
    SELECT NEW.assigned_to, NEW.organization_id, 'offline', 0
    WHERE NOT EXISTS (
      SELECT 1 FROM user_status WHERE user_id = NEW.assigned_to
    );
    
    UPDATE user_status 
    SET active_leads_count = active_leads_count + 1
    WHERE user_id = NEW.assigned_to;
  END IF;

  RETURN NEW;
END;
$function$;

-- 6. Criar triggers de sincronização de contadores (idempotente)
DROP TRIGGER IF EXISTS leads_assignee_change ON public.leads;
CREATE TRIGGER leads_assignee_change
  AFTER UPDATE OF assigned_to ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_active_leads_count();

DROP TRIGGER IF EXISTS leads_assignee_insert ON public.leads;
CREATE TRIGGER leads_assignee_insert
  AFTER INSERT ON public.leads
  FOR EACH ROW
  WHEN (NEW.assigned_to IS NOT NULL)
  EXECUTE FUNCTION public.sync_active_leads_count();

-- 7. RLS para leads: membros do squad veem leads do squad (mesmo sem assigned_to)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'leads' 
    AND policyname = 'Squad members can view squad leads'
  ) THEN
    CREATE POLICY "Squad members can view squad leads"
    ON public.leads
    FOR SELECT
    TO authenticated
    USING (
      organization_id = get_user_organization(auth.uid())
      AND squad_id IN (
        SELECT squad_id FROM public.squad_members WHERE user_id = auth.uid()
      )
    );
  END IF;
END $$;

-- 8. Notificar o schema cache do PostgREST para reconhecer novas colunas
NOTIFY pgrst, 'reload schema';
