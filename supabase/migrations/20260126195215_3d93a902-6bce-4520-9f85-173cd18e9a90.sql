-- Tabela de tipos de evento para agendamento público
CREATE TABLE public.booking_event_types (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    location_type TEXT NOT NULL DEFAULT 'google_meet',
    location_details TEXT,
    color TEXT DEFAULT '#3b82f6',
    is_active BOOLEAN DEFAULT false,
    buffer_before INTEGER DEFAULT 0,
    buffer_after INTEGER DEFAULT 0,
    min_notice_hours INTEGER DEFAULT 24,
    max_days_ahead INTEGER DEFAULT 60,
    questions JSONB DEFAULT '[]'::jsonb,
    confirmation_message TEXT,
    create_meet BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id, slug)
);

-- Índices
CREATE INDEX idx_booking_event_types_user ON public.booking_event_types(user_id);
CREATE INDEX idx_booking_event_types_org ON public.booking_event_types(organization_id);
CREATE INDEX idx_booking_event_types_slug ON public.booking_event_types(slug);

-- Tabela de disponibilidade semanal
CREATE TABLE public.user_availability (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id, day_of_week, start_time)
);

CREATE INDEX idx_user_availability_user ON public.user_availability(user_id);

-- Tabela de exceções de disponibilidade (férias, bloqueios, etc)
CREATE TABLE public.availability_overrides (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    is_available BOOLEAN DEFAULT false,
    start_time TIME,
    end_time TIME,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id, date)
);

CREATE INDEX idx_availability_overrides_user_date ON public.availability_overrides(user_id, date);

-- Tabela de agendamentos públicos
CREATE TABLE public.booking_requests (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    event_type_id UUID NOT NULL REFERENCES public.booking_event_types(id) ON DELETE CASCADE,
    host_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    calendar_event_id UUID REFERENCES public.calendar_events(id) ON DELETE SET NULL,
    guest_name TEXT NOT NULL,
    guest_email TEXT NOT NULL,
    guest_phone TEXT,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    timezone TEXT DEFAULT 'America/Sao_Paulo',
    status TEXT DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
    additional_info JSONB DEFAULT '{}'::jsonb,
    cancellation_reason TEXT,
    confirmation_token TEXT DEFAULT encode(gen_random_bytes(16), 'hex'),
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    tracking JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_booking_requests_host ON public.booking_requests(host_user_id);
CREATE INDEX idx_booking_requests_event_type ON public.booking_requests(event_type_id);
CREATE INDEX idx_booking_requests_start_time ON public.booking_requests(start_time);
CREATE INDEX idx_booking_requests_token ON public.booking_requests(confirmation_token);

-- Adicionar slug ao profiles para URL pública
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS booking_slug TEXT UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS booking_bio TEXT;

-- Trigger para updated_at
CREATE TRIGGER update_booking_event_types_updated_at
    BEFORE UPDATE ON public.booking_event_types
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.booking_event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies para booking_event_types
CREATE POLICY "Anyone can view active event types"
ON public.booking_event_types FOR SELECT
USING (is_active = true);

CREATE POLICY "Users can manage own event types"
ON public.booking_event_types FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Org members can view all event types"
ON public.booking_event_types FOR SELECT
TO authenticated
USING (public.user_belongs_to_organization(auth.uid(), organization_id));

-- RLS Policies para user_availability
CREATE POLICY "Anyone can view user availability"
ON public.user_availability FOR SELECT
USING (true);

CREATE POLICY "Users can manage own availability"
ON public.user_availability FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- RLS Policies para availability_overrides
CREATE POLICY "Anyone can view availability overrides"
ON public.availability_overrides FOR SELECT
USING (true);

CREATE POLICY "Users can manage own overrides"
ON public.availability_overrides FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- RLS Policies para booking_requests
CREATE POLICY "Anyone can create booking requests"
ON public.booking_requests FOR INSERT
WITH CHECK (true);

CREATE POLICY "Hosts can view and manage their bookings"
ON public.booking_requests FOR ALL
TO authenticated
USING (host_user_id = auth.uid());

CREATE POLICY "Anyone can view booking by token"
ON public.booking_requests FOR SELECT
USING (true);

CREATE POLICY "Anyone can cancel booking by token"
ON public.booking_requests FOR UPDATE
USING (true)
WITH CHECK (true);