CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_funnel_history_one_running
  ON public.lead_funnel_history (lead_id, funnel_id)
  WHERE status = 'running';
