-- Tabela de configurações de notificações automáticas
CREATE TABLE public.auto_notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Lead parado
  stalled_lead_enabled BOOLEAN DEFAULT true,
  stalled_lead_days INTEGER DEFAULT 3,
  
  -- Meta atingida
  goal_achieved_enabled BOOLEAN DEFAULT true,
  
  -- Comissão aprovada
  commission_approved_enabled BOOLEAN DEFAULT true,
  
  -- Relatório diário com IA
  daily_report_enabled BOOLEAN DEFAULT true,
  daily_report_hour INTEGER DEFAULT 7,
  daily_report_send_email BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(organization_id)
);

-- Tabela de logs para evitar duplicações
CREATE TABLE public.notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  reference_id UUID,
  reference_date DATE DEFAULT CURRENT_DATE,
  sent_at TIMESTAMPTZ DEFAULT now(),
  
  -- Índice único para evitar duplicações no mesmo dia
  UNIQUE(user_id, notification_type, reference_id, reference_date)
);

-- Índices para performance
CREATE INDEX idx_notification_logs_user ON notification_logs(user_id);
CREATE INDEX idx_notification_logs_type ON notification_logs(notification_type);
CREATE INDEX idx_notification_logs_date ON notification_logs(reference_date);

-- Enable RLS
ALTER TABLE public.auto_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies para auto_notification_settings
CREATE POLICY "Admins can manage auto notification settings"
ON public.auto_notification_settings
FOR ALL
USING (
  organization_id = get_user_organization(auth.uid()) 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Users can view their org auto notification settings"
ON public.auto_notification_settings
FOR SELECT
USING (organization_id = get_user_organization(auth.uid()));

-- RLS policies para notification_logs
CREATE POLICY "System can insert notification logs"
ON public.notification_logs
FOR INSERT
WITH CHECK (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Users can view their notification logs"
ON public.notification_logs
FOR SELECT
USING (organization_id = get_user_organization(auth.uid()));

-- Trigger para updated_at
CREATE TRIGGER update_auto_notification_settings_updated_at
BEFORE UPDATE ON public.auto_notification_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();