-- Corrigir delete_product_safe para também deletar user_product_assignments
CREATE OR REPLACE FUNCTION public.delete_product_safe(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- 1. Deletar atribuições de usuário ao produto
  DELETE FROM public.user_product_assignments WHERE product_id = p_product_id;

  -- 2. Nullify product_id em tabelas que aceitam NULL
  UPDATE public.leads SET product_id = NULL, current_stage_id = NULL WHERE product_id = p_product_id;
  UPDATE public.tasks SET product_id = NULL WHERE product_id = p_product_id;
  UPDATE public.calendar_events SET product_id = NULL WHERE product_id = p_product_id;
  UPDATE public.lead_queue SET product_id = NULL WHERE product_id = p_product_id;
  UPDATE public.sales_squads SET product_id = NULL WHERE product_id = p_product_id;
  UPDATE public.webchat_agent_configs SET product_id = NULL WHERE product_id = p_product_id;
  UPDATE public.agent_training_materials SET product_id = NULL WHERE product_id = p_product_id;
  UPDATE public.webhooks SET product_id = NULL WHERE product_id = p_product_id;
  UPDATE public.notifications SET product_id = NULL WHERE product_id = p_product_id;

  -- 3. Deletar o produto (as outras tabelas têm ON DELETE CASCADE)
  DELETE FROM public.products WHERE id = p_product_id;
END;
$function$;

-- Limpar atribuições órfãs de produtos já deletados
DELETE FROM public.user_product_assignments
WHERE product_id NOT IN (SELECT id FROM public.products);