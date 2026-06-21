-- 1. Adiciona coluna is_default em sectors
ALTER TABLE public.sectors ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- Garante no máximo 1 default por organização
CREATE UNIQUE INDEX IF NOT EXISTS sectors_one_default_per_org
  ON public.sectors (organization_id) WHERE is_default = true;

-- 2. Cria "Sem Setor" para cada organização que ainda não tem um default
INSERT INTO public.sectors (organization_id, name, color, icon, is_default, is_active, description)
SELECT o.id, 'Sem Setor', '#94A3B8', 'Inbox', true, true, 'Setor padrão para conversas e leads sem categorização'
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.sectors s WHERE s.organization_id = o.id AND s.is_default = true
);

-- 3. Backfill: conversas sem setor recebem o setor padrão da organização
UPDATE public.webchat_conversations wc
SET sector_id = s.id
FROM public.webchat_widgets ww, public.sectors s
WHERE wc.widget_id = ww.id
  AND wc.sector_id IS NULL
  AND s.organization_id = ww.organization_id
  AND s.is_default = true;

-- Backfill leads sem setor
UPDATE public.leads l
SET sector_id = s.id
FROM public.sectors s
WHERE l.sector_id IS NULL
  AND s.organization_id = l.organization_id
  AND s.is_default = true;

-- 4. Remove produto Poupe Já do widget "Estamos online"
UPDATE public.webchat_widgets
SET product_id = NULL
WHERE id = 'acfdb669-60ea-4c7c-9941-2a7c7de52bfa';

-- 5. Limpa product_id das conversas que vieram desse widget
UPDATE public.webchat_conversations
SET product_id = NULL
WHERE widget_id = 'acfdb669-60ea-4c7c-9941-2a7c7de52bfa'
  AND product_id = 'aa2cffcd-4df3-4eac-8c29-a66f45712cec';

-- 6. Limpa product_id dos leads que vieram por esse widget
UPDATE public.leads
SET product_id = NULL
WHERE product_id = 'aa2cffcd-4df3-4eac-8c29-a66f45712cec'
  AND id IN (
    SELECT lead_id FROM public.webchat_conversations
    WHERE widget_id = 'acfdb669-60ea-4c7c-9941-2a7c7de52bfa' AND lead_id IS NOT NULL
  );