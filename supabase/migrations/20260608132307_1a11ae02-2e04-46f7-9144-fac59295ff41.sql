CREATE OR REPLACE FUNCTION public.check_webhook_health_discrepancies()
RETURNS TABLE (
    message_id TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        wh.message_id,
        wh.phone,
        wh.created_at,
        'STUCK'::TEXT as status
    FROM public.webhook_health wh
    WHERE wh.processed = FALSE
    AND wh.created_at < (NOW() - INTERVAL '5 minutes')
    AND wh.created_at >= CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.check_webhook_health_discrepancies() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_webhook_health_discrepancies() TO service_role;
