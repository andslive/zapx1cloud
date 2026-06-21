CREATE OR REPLACE FUNCTION public.mark_funnel_completed_on_lead(p_lead_id UUID, p_funnel_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.leads
    SET funnels_completed = array_append(COALESCE(funnels_completed, '{}'), p_funnel_id)
    WHERE id = p_lead_id
    AND NOT (p_funnel_id = ANY(COALESCE(funnels_completed, '{}')));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.mark_funnel_completed_on_lead TO service_role;