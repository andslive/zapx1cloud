-- Função para preencher automaticamente os dados de atribuição no purchase_audit
CREATE OR REPLACE FUNCTION public.sync_purchase_attribution()
RETURNS TRIGGER AS $$
DECLARE
    lead_data RECORD;
BEGIN
    -- Busca dados do lead_tracking mais recente
    -- Nota: lead_tracking não possui offer_name e funnel_name diretamente, 
    -- mas possui campaign_name e ad_name que podem ser usados para inferir ou apenas registrar.
    SELECT 
        campaign_id, campaign_name, 
        adset_id, adset_name, 
        ad_id, ad_name
    INTO lead_data
    FROM public.lead_tracking
    WHERE lead_id = NEW.lead_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- Se encontrou dados no lead_tracking, preenche o purchase_audit
    IF lead_data.campaign_id IS NOT NULL THEN
        NEW.campaign_id := COALESCE(NEW.campaign_id, lead_data.campaign_id);
        NEW.campaign_name := COALESCE(NEW.campaign_name, lead_data.campaign_name);
        NEW.adset_id := COALESCE(NEW.adset_id, lead_data.adset_id);
        NEW.adset_name := COALESCE(NEW.adset_name, lead_data.adset_name);
        NEW.ad_id := COALESCE(NEW.ad_id, lead_data.ad_id);
        NEW.ad_name := COALESCE(NEW.ad_name, lead_data.ad_name);
    END IF;

    -- Fallback para leads (algumas colunas existem lá também)
    IF NEW.campaign_name IS NULL OR NEW.campaign_name = 'Direto / Sem Atribuição' THEN
        SELECT 
            campaign_name, ad_name, adset_name
        INTO lead_data
        FROM public.leads
        WHERE id = NEW.lead_id;

        IF lead_data.campaign_name IS NOT NULL THEN
            NEW.campaign_name := COALESCE(NEW.campaign_name, lead_data.campaign_name);
            NEW.ad_name := COALESCE(NEW.ad_name, lead_data.ad_name);
            NEW.adset_name := COALESCE(NEW.adset_name, lead_data.adset_name);
        END IF;
    END IF;

    -- Garante valores padrão se continuar nulo
    NEW.campaign_name := COALESCE(NEW.campaign_name, 'Direto / Sem Atribuição');
    NEW.offer_name := COALESCE(NEW.offer_name, 'N/A');
    NEW.funnel_name := COALESCE(NEW.funnel_name, 'N/A');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para executar antes de inserir no purchase_audit
DROP TRIGGER IF EXISTS tr_sync_purchase_attribution ON public.purchase_audit;
CREATE TRIGGER tr_sync_purchase_attribution
BEFORE INSERT ON public.purchase_audit
FOR EACH ROW EXECUTE FUNCTION public.sync_purchase_attribution();

-- Retroalimentação: Atualiza registros existentes que estão sem atribuição
UPDATE public.purchase_audit pa
SET 
    campaign_id = lt.campaign_id,
    campaign_name = COALESCE(lt.campaign_name, 'Direto / Sem Atribuição'),
    adset_id = lt.adset_id,
    adset_name = lt.adset_name,
    ad_id = lt.ad_id,
    ad_name = lt.ad_name
FROM public.lead_tracking lt
WHERE pa.lead_id = lt.lead_id
AND (pa.campaign_name IS NULL OR pa.campaign_name = 'Direto / Sem Atribuição');

GRANT ALL ON public.purchase_audit TO authenticated;
GRANT ALL ON public.purchase_audit TO service_role;
