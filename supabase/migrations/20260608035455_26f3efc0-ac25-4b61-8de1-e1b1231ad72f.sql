CREATE OR REPLACE FUNCTION public.propagate_lead_attribution()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.leads
    SET 
        fbclid = COALESCE(NEW.fbclid, leads.fbclid),
        ctwa_clid = COALESCE(NEW.referral_ctwa_clid, leads.ctwa_clid),
        campaign_id = COALESCE(NEW.campaign_id, leads.campaign_id),
        campaign_name = COALESCE(NEW.campaign_name, leads.campaign_name),
        adset_id = COALESCE(NEW.adset_id, leads.adset_id),
        adset_name = COALESCE(NEW.adset_name, leads.adset_name),
        ad_id = COALESCE(NEW.ad_id, leads.ad_id),
        ad_name = COALESCE(NEW.ad_name, leads.ad_name),
        source = COALESCE(NEW.source, leads.source),
        utm_source = COALESCE(NEW.utm_source, leads.utm_source),
        utm_medium = COALESCE(NEW.utm_medium, leads.utm_medium),
        utm_campaign = COALESCE(NEW.utm_campaign, leads.utm_campaign)
    WHERE id = NEW.lead_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;