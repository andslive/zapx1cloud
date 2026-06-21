-- ============================================================
-- ETIQUETAS (TAGS)
-- ============================================================

CREATE TABLE public.lead_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  description TEXT,
  is_automatic BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX idx_lead_tags_org ON public.lead_tags(organization_id);

ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tags visiveis para a organizacao"
  ON public.lead_tags FOR SELECT
  USING (
    public.is_super_admin(auth.uid())
    OR public.user_belongs_to_organization(auth.uid(), organization_id)
  );

CREATE POLICY "Admins gerenciam tags"
  ON public.lead_tags FOR ALL
  USING (
    public.is_super_admin(auth.uid())
    OR (public.user_belongs_to_organization(auth.uid(), organization_id)
        AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (public.user_belongs_to_organization(auth.uid(), organization_id)
        AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')))
  );

CREATE TRIGGER update_lead_tags_updated_at
  BEFORE UPDATE ON public.lead_tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Atribuição de tags a leads
CREATE TABLE public.lead_tag_assignments (
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.lead_tags(id) ON DELETE CASCADE,
  applied_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','flow','ai_agent','automation','webhook')),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, tag_id)
);

CREATE INDEX idx_lead_tag_assignments_tag ON public.lead_tag_assignments(tag_id);
CREATE INDEX idx_lead_tag_assignments_lead ON public.lead_tag_assignments(lead_id);

ALTER TABLE public.lead_tag_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Atribuicoes visiveis por organizacao"
  ON public.lead_tag_assignments FOR SELECT
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id
        AND public.user_belongs_to_organization(auth.uid(), l.organization_id)
    )
  );

CREATE POLICY "Membros da organizacao podem atribuir tags"
  ON public.lead_tag_assignments FOR ALL
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id
        AND public.user_belongs_to_organization(auth.uid(), l.organization_id)
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id
        AND public.user_belongs_to_organization(auth.uid(), l.organization_id)
    )
  );

-- Automações de tags por evento
CREATE TABLE public.tag_automations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'compra_aprovada','pix_gerado','boleto_gerado',
    'checkout_abandonado','reembolso','chargeback','assinatura_cancelada'
  )),
  tag_id_to_add UUID NOT NULL REFERENCES public.lead_tags(id) ON DELETE CASCADE,
  tag_id_to_remove UUID REFERENCES public.lead_tags(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tag_automations_org_event ON public.tag_automations(organization_id, event_type) WHERE is_active = true;

ALTER TABLE public.tag_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Automacoes visiveis por organizacao"
  ON public.tag_automations FOR SELECT
  USING (
    public.is_super_admin(auth.uid())
    OR public.user_belongs_to_organization(auth.uid(), organization_id)
  );

CREATE POLICY "Admins gerenciam automacoes de tag"
  ON public.tag_automations FOR ALL
  USING (
    public.is_super_admin(auth.uid())
    OR (public.user_belongs_to_organization(auth.uid(), organization_id)
        AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (public.user_belongs_to_organization(auth.uid(), organization_id)
        AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')))
  );

CREATE TRIGGER update_tag_automations_updated_at
  BEFORE UPDATE ON public.tag_automations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- HORÁRIOS DE FUNCIONAMENTO
-- ============================================================

CREATE TABLE public.business_hours (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  schedule JSONB NOT NULL DEFAULT jsonb_build_object(
    'mon', jsonb_build_array(jsonb_build_object('start','09:00','end','18:00')),
    'tue', jsonb_build_array(jsonb_build_object('start','09:00','end','18:00')),
    'wed', jsonb_build_array(jsonb_build_object('start','09:00','end','18:00')),
    'thu', jsonb_build_array(jsonb_build_object('start','09:00','end','18:00')),
    'fri', jsonb_build_array(jsonb_build_object('start','09:00','end','18:00')),
    'sat', jsonb_build_array(),
    'sun', jsonb_build_array()
  ),
  out_of_hours_message TEXT NOT NULL DEFAULT 'Olá! No momento estamos fora do horário de atendimento. Retornaremos em breve.',
  out_of_hours_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Horarios visiveis por organizacao"
  ON public.business_hours FOR SELECT
  USING (
    public.is_super_admin(auth.uid())
    OR public.user_belongs_to_organization(auth.uid(), organization_id)
  );

CREATE POLICY "Admins gerenciam horarios"
  ON public.business_hours FOR ALL
  USING (
    public.is_super_admin(auth.uid())
    OR (public.user_belongs_to_organization(auth.uid(), organization_id)
        AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (public.user_belongs_to_organization(auth.uid(), organization_id)
        AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')))
  );

CREATE TRIGGER update_business_hours_updated_at
  BEFORE UPDATE ON public.business_hours
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.business_holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, date)
);

CREATE INDEX idx_business_holidays_org_date ON public.business_holidays(organization_id, date);

ALTER TABLE public.business_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Feriados visiveis por organizacao"
  ON public.business_holidays FOR SELECT
  USING (
    public.is_super_admin(auth.uid())
    OR public.user_belongs_to_organization(auth.uid(), organization_id)
  );

CREATE POLICY "Admins gerenciam feriados"
  ON public.business_holidays FOR ALL
  USING (
    public.is_super_admin(auth.uid())
    OR (public.user_belongs_to_organization(auth.uid(), organization_id)
        AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (public.user_belongs_to_organization(auth.uid(), organization_id)
        AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')))
  );

-- Função para checar se está em horário comercial
CREATE OR REPLACE FUNCTION public.is_within_business_hours(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config RECORD;
  v_now TIMESTAMPTZ := now();
  v_local_time TIME;
  v_local_date DATE;
  v_dow_key TEXT;
  v_blocks JSONB;
  v_block JSONB;
BEGIN
  SELECT * INTO v_config FROM public.business_hours WHERE organization_id = p_org_id;
  
  -- Sem configuração = sempre aberto
  IF NOT FOUND THEN
    RETURN TRUE;
  END IF;

  v_local_time := (v_now AT TIME ZONE v_config.timezone)::TIME;
  v_local_date := (v_now AT TIME ZONE v_config.timezone)::DATE;

  -- Feriado?
  IF EXISTS (
    SELECT 1 FROM public.business_holidays 
    WHERE organization_id = p_org_id AND date = v_local_date
  ) THEN
    RETURN FALSE;
  END IF;

  v_dow_key := CASE EXTRACT(DOW FROM v_local_date)::INT
    WHEN 0 THEN 'sun'
    WHEN 1 THEN 'mon'
    WHEN 2 THEN 'tue'
    WHEN 3 THEN 'wed'
    WHEN 4 THEN 'thu'
    WHEN 5 THEN 'fri'
    WHEN 6 THEN 'sat'
  END;

  v_blocks := v_config.schedule -> v_dow_key;

  IF v_blocks IS NULL OR jsonb_array_length(v_blocks) = 0 THEN
    RETURN FALSE;
  END IF;

  FOR v_block IN SELECT * FROM jsonb_array_elements(v_blocks) LOOP
    IF v_local_time >= (v_block->>'start')::TIME 
       AND v_local_time < (v_block->>'end')::TIME THEN
      RETURN TRUE;
    END IF;
  END LOOP;

  RETURN FALSE;
END;
$$;

-- ============================================================
-- SUPORTE
-- ============================================================

CREATE TYPE public.support_ticket_status AS ENUM ('open','in_progress','resolved','closed');
CREATE TYPE public.support_ticket_priority AS ENUM ('low','normal','high','urgent');

CREATE TABLE public.support_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  category TEXT,
  status public.support_ticket_status NOT NULL DEFAULT 'open',
  priority public.support_ticket_priority NOT NULL DEFAULT 'normal',
  assigned_super_admin UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_by_role TEXT NOT NULL DEFAULT 'admin',
  unread_for_admin BOOLEAN NOT NULL DEFAULT false,
  unread_for_super_admin BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_tickets_org ON public.support_tickets(organization_id);
CREATE INDEX idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX idx_support_tickets_unread_sa ON public.support_tickets(unread_for_super_admin) WHERE unread_for_super_admin = true;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tickets visiveis para a organizacao ou super admin"
  ON public.support_tickets FOR SELECT
  USING (
    public.is_super_admin(auth.uid())
    OR public.user_belongs_to_organization(auth.uid(), organization_id)
  );

CREATE POLICY "Membros podem criar tickets"
  ON public.support_tickets FOR INSERT
  WITH CHECK (
    public.user_belongs_to_organization(auth.uid(), organization_id)
    AND created_by = auth.uid()
  );

CREATE POLICY "Tickets editaveis por dono ou super admin"
  ON public.support_tickets FOR UPDATE
  USING (
    public.is_super_admin(auth.uid())
    OR public.user_belongs_to_organization(auth.uid(), organization_id)
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.user_belongs_to_organization(auth.uid(), organization_id)
  );

CREATE POLICY "Super admins podem deletar tickets"
  ON public.support_tickets FOR DELETE
  USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.support_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_role TEXT NOT NULL CHECK (author_role IN ('admin','super_admin')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_messages_ticket ON public.support_messages(ticket_id, created_at);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mensagens visiveis para envolvidos"
  ON public.support_messages FOR SELECT
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND public.user_belongs_to_organization(auth.uid(), t.organization_id)
    )
  );

CREATE POLICY "Mensagens podem ser criadas por envolvidos"
  ON public.support_messages FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND (
      public.is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = ticket_id
          AND public.user_belongs_to_organization(auth.uid(), t.organization_id)
      )
    )
  );

-- Trigger para atualizar last_message no ticket
CREATE OR REPLACE FUNCTION public.update_ticket_on_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_tickets
  SET 
    last_message_at = NEW.created_at,
    last_message_by_role = NEW.author_role,
    unread_for_admin = CASE WHEN NEW.author_role = 'super_admin' THEN true ELSE unread_for_admin END,
    unread_for_super_admin = CASE WHEN NEW.author_role = 'admin' THEN true ELSE unread_for_super_admin END,
    status = CASE 
      WHEN status = 'closed' AND NEW.author_role = 'admin' THEN 'open'::support_ticket_status
      ELSE status
    END,
    updated_at = now()
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_support_message_updates_ticket
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_ticket_on_new_message();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_tag_assignments;