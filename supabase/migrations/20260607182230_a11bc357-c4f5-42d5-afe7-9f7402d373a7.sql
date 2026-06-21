ALTER TABLE public.purchase_audit ADD COLUMN IF NOT EXISTS offer_name TEXT;
ALTER TABLE public.purchase_audit ADD COLUMN IF NOT EXISTS funnel_name TEXT;

-- Atualizar trigger para incluir essas colunas
CREATE OR REPLACE FUNCTION public.sync_pixel_to_purchase_audit()
RETURNS TRIGGER AS $$
DECLARE
    v_lead_name TEXT;
    v_phone TEXT;
    v_tracking RECORD;
    v_first_data JSONB;
BEGIN
    -- Só processar se for Purchase
    IF NEW.event_name != 'Purchase' THEN
        RETURN NEW;
    END IF;

    -- Buscar dados do Lead
    SELECT name, phone INTO v_lead_name, v_phone FROM public.leads WHERE id = NEW.lead_id;
    
    -- Buscar dados de Rastreamento (mais recente)
    SELECT campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, utm_content, page_name
    INTO v_tracking
    FROM public.lead_tracking 
    WHERE lead_id = NEW.lead_id 
    ORDER BY created_at DESC LIMIT 1;

    v_first_data := NEW.payload->'data'->0;

    -- Inserir ou atualizar na purchase_audit
    INSERT INTO public.purchase_audit (
        pixel_event_log_id,
        created_at,
        lead_id,
        conversation_id,
        pixel_block_id,
        pixel_id,
        customer_name,
        phone,
        purchase_value,
        currency,
        event_id,
        fbtrace_id,
        purchase_status,
        campaign_id,
        campaign_name,
        adset_id,
        adset_name,
        ad_id,
        ad_name,
        offer_name,
        funnel_name,
        raw_payload,
        raw_response
    ) VALUES (
        NEW.id,
        NEW.created_at,
        NEW.lead_id,
        NEW.conversation_id,
        NEW.block_id,
        NEW.pixel_id,
        v_lead_name,
        v_phone,
        COALESCE((v_first_data->'custom_data'->>'value')::NUMERIC, 0),
        COALESCE(v_first_data->'custom_data'->>'currency', 'BRL'),
        COALESCE(v_first_data->>'event_id', 'N/A'),
        COALESCE(NEW.response->>'fbtrace_id', 'N/A'),
        CASE WHEN NEW.success THEN 'success' ELSE 'failed' END,
        v_tracking.campaign_id,
        v_tracking.campaign_name,
        v_tracking.adset_id,
        v_tracking.adset_name,
        v_tracking.ad_id,
        v_tracking.ad_name,
        v_tracking.utm_content,
        v_tracking.page_name,
        NEW.payload,
        NEW.response
    )
    ON CONFLICT (pixel_event_log_id) DO UPDATE SET
        purchase_status = EXCLUDED.purchase_status,
        fbtrace_id = EXCLUDED.fbtrace_id,
        raw_response = EXCLUDED.raw_response,
        offer_name = EXCLUDED.offer_name,
        funnel_name = EXCLUDED.funnel_name;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Disparar backfill novamente para popular novas colunas
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT id FROM public.pixel_event_logs WHERE event_name = 'Purchase') LOOP
        UPDATE public.pixel_event_logs SET id = id WHERE id = r.id;
    END LOOP;
END;
$$;
