
CREATE TABLE public.sales_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company_size TEXT,
  segment TEXT,
  current_tools TEXT,
  main_challenge TEXT,
  message TEXT,
  status TEXT DEFAULT 'new',
  notes TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert sales leads"
ON public.sales_leads FOR INSERT WITH CHECK (true);

CREATE POLICY "Super admins manage sales leads"
ON public.sales_leads FOR ALL
USING (public.is_super_admin(auth.uid()));
