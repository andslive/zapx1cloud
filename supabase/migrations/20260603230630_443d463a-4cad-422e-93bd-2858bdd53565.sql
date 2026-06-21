-- 1. Update default privileges for future functions
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- 2. Revoke execute from public/anon/authenticated on ALL existing functions in public schema
DO $$ 
DECLARE 
    func_record record;
BEGIN
    FOR func_record IN 
        SELECT p.proname, oidvectortypes(p.proargtypes) as args
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE n.nspname = 'public'
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', func_record.proname, func_record.args);
    END LOOP;
END $$;

-- 3. Re-grant execute to authenticated and service_role for most application functions
DO $$ 
DECLARE 
    func_record record;
BEGIN
    FOR func_record IN 
        SELECT p.proname, oidvectortypes(p.proargtypes) as args
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE n.nspname = 'public'
    LOOP
        -- Grant to service_role always
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', func_record.proname, func_record.args);
        
        -- Grant to authenticated for common app functions
        IF func_record.proname NOT IN ('delete_lead_cascade', 'delete_team_member', 'calculate_commission', 'distribute_lead', 'reset_monthly_webhook_requests') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', func_record.proname, func_record.args);
        END IF;
    END LOOP;
END $$;

-- 4. Re-grant execute to anon only for specific public entry points
DO $$ 
DECLARE 
    func_record record;
    public_funcs text[] := ARRAY[
        'is_within_business_hours',
        'get_booking_by_token',
        'increment_form_views',
        'increment_form_submissions_count',
        'increment_funnel_views',
        'increment_funnel_leads',
        'increment_webhook_requests',
        'record_variant_impression',
        'record_variant_score',
        'pick_prompt_variant'
    ];
BEGIN
    FOR func_record IN 
        SELECT p.proname, oidvectortypes(p.proargtypes) as args
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE n.nspname = 'public' AND p.proname = ANY(public_funcs)
    LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon', func_record.proname, func_record.args);
    END LOOP;
END $$;

-- 5. Fix Permissive RLS Policies
DROP POLICY IF EXISTS "Service role can insert webhook logs" ON public.funnel_webhook_logs;
CREATE POLICY "Service role can insert webhook logs" ON public.funnel_webhook_logs
    FOR INSERT TO service_role WITH CHECK (true);

-- 6. Set search_path for sensitive functions
DO $$ 
DECLARE 
    func_record record;
    sensitive_funcs text[] := ARRAY[
        'has_role',
        'is_super_admin',
        'delete_lead_cascade',
        'delete_team_member',
        'calculate_commission',
        'distribute_lead',
        'accept_invitation'
    ];
BEGIN
    FOR func_record IN 
        SELECT p.proname, oidvectortypes(p.proargtypes) as args
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE n.nspname = 'public' AND p.proname = ANY(sensitive_funcs)
    LOOP
        EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public', func_record.proname, func_record.args);
    END LOOP;
END $$;
