
-- Criar função para exclusão segura de produto (cascata manual nas tabelas com NO ACTION)
CREATE OR REPLACE FUNCTION public.delete_product_safe(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- 1. Nullify product_id em tabelas que usam SET NULL (delete_rule: n)
  -- leads - SET NULL no product_id
  UPDATE public.leads SET product_id = NULL, current_stage_id = NULL WHERE product_id = p_product_id;
  
  -- tasks - SET NULL no product_id  
  UPDATE public.tasks SET product_id = NULL WHERE product_id = p_product_id;
  
  -- calendar_events - SET NULL no product_id
  UPDATE public.calendar_events SET product_id = NULL WHERE product_id = p_product_id;
  
  -- lead_queue - SET NULL no product_id
  UPDATE public.lead_queue SET product_id = NULL WHERE product_id = p_product_id;
  
  -- sales_squads - SET NULL no product_id
  UPDATE public.sales_squads SET product_id = NULL WHERE product_id = p_product_id;
  
  -- webchat_agent_configs - SET NULL no product_id
  UPDATE public.webchat_agent_configs SET product_id = NULL WHERE product_id = p_product_id;
  
  -- agent_training_materials - SET NULL
  UPDATE public.agent_training_materials SET product_id = NULL WHERE product_id = p_product_id;
  
  -- webhooks - SET NULL
  UPDATE public.webhooks SET product_id = NULL WHERE product_id = p_product_id;
  
  -- notifications - SET NULL
  UPDATE public.notifications SET product_id = NULL WHERE product_id = p_product_id;
  
  -- 2. Agora deletar o produto (as outras tabelas têm ON DELETE CASCADE)
  DELETE FROM public.products WHERE id = p_product_id;
END;
$function$;
