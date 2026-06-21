-- =============================================
-- WEBCHAT MODULE: Tables for Site Chat Widget
-- =============================================

-- Enum for conversation status
CREATE TYPE webchat_conversation_status AS ENUM (
  'bot_active',
  'waiting_human', 
  'human_active',
  'closed'
);

-- =============================================
-- Table: webchat_widgets
-- Configuration for embeddable chat widgets
-- =============================================
CREATE TABLE public.webchat_widgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Widget Principal',
  is_active BOOLEAN DEFAULT true,
  
  -- Appearance
  primary_color TEXT DEFAULT '#14B8A6',
  secondary_color TEXT DEFAULT '#0F172A',
  welcome_message TEXT DEFAULT 'Olá! Como posso ajudar?',
  placeholder_text TEXT DEFAULT 'Digite sua mensagem...',
  position TEXT DEFAULT 'bottom-right' CHECK (position IN ('bottom-right', 'bottom-left')),
  avatar_url TEXT,
  
  -- Behavior
  auto_open_delay INTEGER, -- seconds to auto-open, null = disabled
  business_hours JSONB DEFAULT '{"enabled": false}',
  offline_message TEXT DEFAULT 'Estamos offline no momento. Deixe sua mensagem!',
  collect_email BOOLEAN DEFAULT false,
  collect_phone BOOLEAN DEFAULT false,
  collect_name BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =============================================
-- Table: webchat_agent_configs
-- AI agent configuration and training
-- =============================================
CREATE TABLE public.webchat_agent_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  widget_id UUID NOT NULL REFERENCES public.webchat_widgets(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  
  -- Agent identity
  agent_name TEXT DEFAULT 'Assistente Virtual',
  agent_avatar_url TEXT,
  
  -- AI Configuration
  system_prompt TEXT DEFAULT 'Você é um assistente virtual prestativo e amigável. Responda de forma clara e objetiva.',
  knowledge_base TEXT, -- Free-form knowledge text
  faq JSONB DEFAULT '[]', -- Array of {question, answer}
  
  -- Handoff configuration
  handoff_triggers TEXT[] DEFAULT ARRAY['falar com atendente', 'falar com humano', 'atendente', 'quero comprar', 'preço', 'valor'],
  auto_handoff_enabled BOOLEAN DEFAULT true,
  
  -- Messages
  greeting_message TEXT DEFAULT 'Olá! Sou o assistente virtual. Como posso ajudar você hoje?',
  fallback_message TEXT DEFAULT 'Desculpe, não entendi. Posso transferir você para um atendente?',
  handoff_message TEXT DEFAULT 'Certo! Estou transferindo você para um atendente. Aguarde um momento.',
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =============================================
-- Table: webchat_conversations
-- Chat conversations with visitors
-- =============================================
CREATE TABLE public.webchat_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  widget_id UUID NOT NULL REFERENCES public.webchat_widgets(id) ON DELETE CASCADE,
  
  -- Channel (prepared for WhatsApp, etc.)
  channel TEXT NOT NULL DEFAULT 'web_chat',
  
  -- Status
  status webchat_conversation_status NOT NULL DEFAULT 'bot_active',
  
  -- Visitor info
  visitor_id TEXT NOT NULL, -- Generated in browser localStorage
  visitor_name TEXT,
  visitor_email TEXT,
  visitor_phone TEXT,
  visitor_ip TEXT,
  visitor_user_agent TEXT,
  
  -- Assignment
  assigned_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- CRM Integration
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Tracking
  current_page_url TEXT,
  referrer_url TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  
  -- Metrics
  last_message_at TIMESTAMP WITH TIME ZONE,
  unread_count_agents INTEGER DEFAULT 0,
  first_response_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  closed_at TIMESTAMP WITH TIME ZONE,
  
  -- Unique constraint for visitor session
  CONSTRAINT unique_visitor_session UNIQUE (widget_id, visitor_id)
);

-- =============================================
-- Table: webchat_messages
-- Individual messages in conversations
-- =============================================
CREATE TABLE public.webchat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.webchat_conversations(id) ON DELETE CASCADE,
  
  -- Direction and sender
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('visitor', 'bot', 'agent')),
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Only for agents
  
  -- Content
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'file', 'audio')),
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =============================================
-- Table: webchat_assignment_events
-- Audit trail for conversation assignments
-- =============================================
CREATE TABLE public.webchat_assignment_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.webchat_conversations(id) ON DELETE CASCADE,
  
  from_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  action TEXT NOT NULL CHECK (action IN ('assigned', 'unassigned', 'transferred', 'auto_assigned')),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =============================================
-- Indexes for performance
-- =============================================
CREATE INDEX idx_webchat_widgets_org ON public.webchat_widgets(organization_id);
CREATE INDEX idx_webchat_agent_configs_widget ON public.webchat_agent_configs(widget_id);
CREATE INDEX idx_webchat_agent_configs_org ON public.webchat_agent_configs(organization_id);
CREATE INDEX idx_webchat_conversations_org ON public.webchat_conversations(organization_id);
CREATE INDEX idx_webchat_conversations_widget ON public.webchat_conversations(widget_id);
CREATE INDEX idx_webchat_conversations_status ON public.webchat_conversations(status);
CREATE INDEX idx_webchat_conversations_visitor ON public.webchat_conversations(visitor_id);
CREATE INDEX idx_webchat_conversations_assigned ON public.webchat_conversations(assigned_user_id);
CREATE INDEX idx_webchat_conversations_lead ON public.webchat_conversations(lead_id);
CREATE INDEX idx_webchat_messages_conversation ON public.webchat_messages(conversation_id);
CREATE INDEX idx_webchat_messages_created ON public.webchat_messages(created_at);

-- =============================================
-- Enable Realtime for conversations and messages
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.webchat_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.webchat_messages;

-- =============================================
-- RLS Policies
-- =============================================

-- Enable RLS
ALTER TABLE public.webchat_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webchat_agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webchat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webchat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webchat_assignment_events ENABLE ROW LEVEL SECURITY;

-- Widgets: Admins and managers can manage
CREATE POLICY "Admins and managers can manage webchat widgets"
  ON public.webchat_widgets FOR ALL
  USING (
    organization_id = get_user_organization(auth.uid()) 
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  );

CREATE POLICY "Users can view their org webchat widgets"
  ON public.webchat_widgets FOR SELECT
  USING (organization_id = get_user_organization(auth.uid()));

-- Agent configs: Admins and managers can manage
CREATE POLICY "Admins and managers can manage agent configs"
  ON public.webchat_agent_configs FOR ALL
  USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  );

CREATE POLICY "Users can view their org agent configs"
  ON public.webchat_agent_configs FOR SELECT
  USING (organization_id = get_user_organization(auth.uid()));

-- Conversations: Org members can view and update
CREATE POLICY "Users can view their org conversations"
  ON public.webchat_conversations FOR SELECT
  USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Users can update their org conversations"
  ON public.webchat_conversations FOR UPDATE
  USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "System can insert conversations"
  ON public.webchat_conversations FOR INSERT
  WITH CHECK (true); -- Edge function handles validation

-- Messages: Org members can view and insert
CREATE POLICY "Users can view messages from their org conversations"
  ON public.webchat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.webchat_conversations c
      WHERE c.id = webchat_messages.conversation_id
      AND c.organization_id = get_user_organization(auth.uid())
    )
  );

CREATE POLICY "Users can insert messages to their org conversations"
  ON public.webchat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.webchat_conversations c
      WHERE c.id = webchat_messages.conversation_id
      AND c.organization_id = get_user_organization(auth.uid())
    )
    OR sender_type IN ('visitor', 'bot') -- Allow anon inserts via edge function
  );

-- Assignment events: Org members can view and insert
CREATE POLICY "Users can view assignment events from their org"
  ON public.webchat_assignment_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.webchat_conversations c
      WHERE c.id = webchat_assignment_events.conversation_id
      AND c.organization_id = get_user_organization(auth.uid())
    )
  );

CREATE POLICY "Users can insert assignment events for their org"
  ON public.webchat_assignment_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.webchat_conversations c
      WHERE c.id = webchat_assignment_events.conversation_id
      AND c.organization_id = get_user_organization(auth.uid())
    )
  );

-- =============================================
-- Triggers for updated_at
-- =============================================
CREATE TRIGGER update_webchat_widgets_updated_at
  BEFORE UPDATE ON public.webchat_widgets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_webchat_agent_configs_updated_at
  BEFORE UPDATE ON public.webchat_agent_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_webchat_conversations_updated_at
  BEFORE UPDATE ON public.webchat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();