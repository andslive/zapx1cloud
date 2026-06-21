
-- =====================================================
-- BUG 1: Add squad_id to webhooks table
-- =====================================================
ALTER TABLE public.webhooks 
ADD COLUMN IF NOT EXISTS squad_id uuid REFERENCES public.sales_squads(id) ON DELETE SET NULL;

-- =====================================================
-- BUG 3: Fix RLS on leads — squad members can see squad leads
-- =====================================================
-- Add policy so sellers see unassigned leads belonging to their squad
CREATE POLICY "Squad members can view squad leads"
ON public.leads
FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid())
  AND squad_id IN (
    SELECT squad_id FROM public.squad_members WHERE user_id = auth.uid()
  )
);

-- =====================================================
-- BUG 3b: Fix RLS on lead_queue — squad members can see their squad's queue
-- =====================================================
CREATE POLICY "Squad members can view their squad queue"
ON public.lead_queue
FOR SELECT
USING (
  squad_id IN (
    SELECT squad_id FROM public.squad_members WHERE user_id = auth.uid()
  )
);

-- =====================================================
-- BUG 5: Trigger to auto-sync active_leads_count when assigned_to changes
-- =====================================================
CREATE OR REPLACE FUNCTION public.sync_active_leads_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Decrement old assignee's counter (only if was assigned and now changed)
  IF OLD.assigned_to IS NOT NULL AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    UPDATE user_status 
    SET active_leads_count = GREATEST(0, active_leads_count - 1)
    WHERE user_id = OLD.assigned_to;
  END IF;

  -- Increment new assignee's counter (only if newly assigned)
  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    -- Ensure user_status record exists first
    INSERT INTO user_status (user_id, organization_id, status, active_leads_count)
    SELECT NEW.assigned_to, NEW.organization_id, 'offline', 0
    WHERE NOT EXISTS (
      SELECT 1 FROM user_status WHERE user_id = NEW.assigned_to
    );

    UPDATE user_status 
    SET active_leads_count = active_leads_count + 1
    WHERE user_id = NEW.assigned_to;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER leads_assignee_change
  AFTER UPDATE OF assigned_to ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_active_leads_count();

-- Also handle INSERT (new lead directly assigned)
CREATE TRIGGER leads_assignee_insert
  AFTER INSERT ON public.leads
  FOR EACH ROW
  WHEN (NEW.assigned_to IS NOT NULL)
  EXECUTE FUNCTION public.sync_active_leads_count();

-- =====================================================
-- Ensure user_status has INSERT policy for new records
-- =====================================================
-- Check and add insert policy if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_status' AND policyname = 'Users can insert own status'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users can insert own status"
      ON public.user_status FOR INSERT
      WITH CHECK (user_id = auth.uid())
    $policy$;
  END IF;
END;
$$;

-- Enable realtime for lead_queue so sellers get live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_queue;
