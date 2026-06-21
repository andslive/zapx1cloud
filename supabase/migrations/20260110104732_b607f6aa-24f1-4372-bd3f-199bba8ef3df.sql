-- Add tracking fields to leads table
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS utm_source text,
ADD COLUMN IF NOT EXISTS utm_medium text,
ADD COLUMN IF NOT EXISTS utm_campaign text,
ADD COLUMN IF NOT EXISTS utm_term text,
ADD COLUMN IF NOT EXISTS utm_content text,
ADD COLUMN IF NOT EXISTS lead_origin text,
ADD COLUMN IF NOT EXISTS lead_channel text,
ADD COLUMN IF NOT EXISTS referrer_url text,
ADD COLUMN IF NOT EXISTS landing_page text,
ADD COLUMN IF NOT EXISTS squad_id uuid REFERENCES public.sales_squads(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS previous_assigned_to uuid,
ADD COLUMN IF NOT EXISTS transferred_at timestamptz,
ADD COLUMN IF NOT EXISTS transferred_by uuid,
ADD COLUMN IF NOT EXISTS transfer_reason text;

-- Create lead_transfer_history table
CREATE TABLE IF NOT EXISTS public.lead_transfer_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_user_id uuid REFERENCES public.profiles(id),
  to_user_id uuid REFERENCES public.profiles(id),
  from_squad_id uuid REFERENCES public.sales_squads(id),
  to_squad_id uuid REFERENCES public.sales_squads(id),
  reason text,
  transferred_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on lead_transfer_history
ALTER TABLE public.lead_transfer_history ENABLE ROW LEVEL SECURITY;

-- Create policies for lead_transfer_history
CREATE POLICY "Users can view transfer history for leads in their org"
ON public.lead_transfer_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.profiles p ON p.organization_id = l.organization_id
    WHERE l.id = lead_transfer_history.lead_id
    AND p.id = auth.uid()
  )
);

CREATE POLICY "Users can create transfer history"
ON public.lead_transfer_history
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.profiles p ON p.organization_id = l.organization_id
    WHERE l.id = lead_transfer_history.lead_id
    AND p.id = auth.uid()
  )
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_leads_squad_id ON public.leads(squad_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON public.leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_lead_transfer_history_lead_id ON public.lead_transfer_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_utm_source ON public.leads(utm_source);
CREATE INDEX IF NOT EXISTS idx_leads_lead_origin ON public.leads(lead_origin);