-- Corrige valores de deals salvos incorretamente devido a bug no parser do DealModal
-- Valores como 2.497 (dois reais) deveriam ser 2497 (dois mil reais)
UPDATE public.deals
SET deal_value = deal_value * 1000
WHERE deal_value > 0 AND deal_value < 100;

-- Recalcula comissões para os deals corrigidos
UPDATE public.commissions c
SET amount = (c.percentage_applied / 100.0) * d.deal_value
FROM public.deals d
WHERE c.deal_id = d.id
  AND c.percentage_applied IS NOT NULL
  AND c.percentage_applied > 0;