-- Trigger para propagar dados do lead_tracking para o lead principal
CREATE OR REPLACE FUNCTION public.propagate_lead_attribution()
RETURNS TRIGGER AS $$
BEGIN
    -- Só atualiza se o novo valor não for nulo, preservando dados antigos se o tracking for incompleto
    UPDATE public.leads
    SET 
        fbclid = COALESCE(NEW.fbclid, fbclid),
        ctwa_clid = COALESCE(NEW.ctwa_clid, ctwa_clid),
        campaign_id = COALESCE(NEW.campaign_id, campaign_id),
        campaign_name = COALESCE(NEW.campaign_name, campaign_name),
        adset_id = COALESCE(NEW.adset_id, adset_id),
        adset_name = COALESCE(NEW.adset_name, adset_name),
        ad_id = COALESCE(NEW.ad_id, ad_id),
        ad_name = COALESCE(NEW.ad_name, ad_name),
        source = COALESCE(NEW.source, source),
        utm_source = COALESCE(NEW.utm_source, utm_source),
        utm_medium = COALESCE(NEW.utm_medium, utm_medium),
        utm_campaign = COALESCE(NEW.utm_campaign, utm_campaign)
    WHERE id = NEW.lead_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_propagate_lead_attribution ON public.lead_tracking;
CREATE TRIGGER tr_propagate_lead_attribution
AFTER INSERT ON public.lead_tracking
FOR EACH ROW EXECUTE FUNCTION public.propagate_lead_attribution();
