
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY lead_id, agent_id ORDER BY created_at DESC) AS rn
  FROM public.ai_outreach_queue
  WHERE status IN ('pending','sent')
    AND followup_enabled = true
    AND agent_id IS NOT NULL
)
UPDATE public.ai_outreach_queue q
SET status = 'completed',
    followup_enabled = false,
    next_followup_at = NULL
FROM ranked
WHERE q.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_outreach_active_per_lead_agent
  ON public.ai_outreach_queue (lead_id, agent_id)
  WHERE status IN ('pending','sent') AND followup_enabled = true AND agent_id IS NOT NULL;
