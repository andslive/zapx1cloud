-- Create calendar_events table
CREATE TABLE public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  -- Event Data
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  event_type TEXT DEFAULT 'meeting',
  
  -- Dates and Times
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN DEFAULT FALSE,
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  
  -- Recurrence
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_rule TEXT,
  recurrence_end_date DATE,
  parent_event_id UUID REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  
  -- Links
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  
  -- Attendees
  attendees JSONB DEFAULT '[]',
  
  -- Status and Reminders
  status TEXT DEFAULT 'confirmed',
  reminder_minutes INTEGER[] DEFAULT ARRAY[15, 60],
  
  -- Google Calendar Integration
  google_event_id TEXT,
  google_calendar_id TEXT,
  last_synced_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'local_only',
  
  -- Metadata
  color TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID
);

-- Create google_calendar_connections table
CREATE TABLE public.google_calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- OAuth2 Tokens
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  
  -- Settings
  calendar_id TEXT DEFAULT 'primary',
  sync_enabled BOOLEAN DEFAULT TRUE,
  sync_direction TEXT DEFAULT 'both',
  last_sync_at TIMESTAMPTZ,
  sync_error TEXT,
  
  -- Timestamps
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_calendar_events_user_id ON public.calendar_events(user_id);
CREATE INDEX idx_calendar_events_org_id ON public.calendar_events(organization_id);
CREATE INDEX idx_calendar_events_start_time ON public.calendar_events(start_time);
CREATE INDEX idx_calendar_events_lead_id ON public.calendar_events(lead_id);
CREATE INDEX idx_calendar_events_google_id ON public.calendar_events(google_event_id);

-- Enable RLS
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for calendar_events
CREATE POLICY "Users can view own events" ON public.calendar_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all org events" ON public.calendar_events
  FOR SELECT USING (
    organization_id = public.get_user_organization(auth.uid()) AND
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Managers can view all org events" ON public.calendar_events
  FOR SELECT USING (
    organization_id = public.get_user_organization(auth.uid()) AND
    public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Users can create own events" ON public.calendar_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own events" ON public.calendar_events
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can update all org events" ON public.calendar_events
  FOR UPDATE USING (
    organization_id = public.get_user_organization(auth.uid()) AND
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can delete own events" ON public.calendar_events
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can delete all org events" ON public.calendar_events
  FOR DELETE USING (
    organization_id = public.get_user_organization(auth.uid()) AND
    public.has_role(auth.uid(), 'admin')
  );

-- RLS Policies for google_calendar_connections
CREATE POLICY "Users can manage own connection" ON public.google_calendar_connections
  FOR ALL USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_google_calendar_connections_updated_at
  BEFORE UPDATE ON public.google_calendar_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();