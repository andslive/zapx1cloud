-- Function to cancel updates if no columns have changed
CREATE OR REPLACE FUNCTION public.cancel_redundant_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If all columns (excluding updated_at if you wish, but usually we want to skip that too) are identical, return NULL to cancel
  IF (NEW IS NOT DISTINCT FROM OLD) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to leads
DROP TRIGGER IF EXISTS trigger_leads_cancel_redundant_update ON public.leads;
CREATE TRIGGER trigger_leads_cancel_redundant_update
BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.cancel_redundant_update();

-- Apply to webchat_conversations
DROP TRIGGER IF EXISTS trigger_webchat_conv_cancel_redundant_update ON public.webchat_conversations;
CREATE TRIGGER trigger_webchat_conv_cancel_redundant_update
BEFORE UPDATE ON public.webchat_conversations
FOR EACH ROW EXECUTE FUNCTION public.cancel_redundant_update();

-- Also apply to evolution_instances as it has many updates
DROP TRIGGER IF EXISTS trigger_evolution_instances_cancel_redundant_update ON public.evolution_instances;
CREATE TRIGGER trigger_evolution_instances_cancel_redundant_update
BEFORE UPDATE ON public.evolution_instances
FOR EACH ROW EXECUTE FUNCTION public.cancel_redundant_update();
