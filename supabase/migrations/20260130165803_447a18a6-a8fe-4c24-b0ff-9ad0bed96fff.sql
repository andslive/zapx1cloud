-- Tabela principal de webhooks
CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) NOT NULL,
  
  -- Identificação
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT false,
  is_test_mode BOOLEAN DEFAULT true,
  
  -- Segurança (opcional)
  secret_key TEXT,
  allowed_ips TEXT[],
  
  -- Produto vinculado (opcional)
  product_id UUID REFERENCES products(id),
  
  -- Configuração de ações (JSONB array)
  actions JSONB DEFAULT '[]'::jsonb,
  
  -- Mapeamento de campos de identificação
  identification_config JSONB DEFAULT '{}'::jsonb,
  
  -- Métricas
  requests_count INTEGER DEFAULT 0,
  requests_this_month INTEGER DEFAULT 0,
  last_request_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES profiles(id)
);

-- Índices para webhooks
CREATE UNIQUE INDEX idx_webhooks_org_slug ON webhooks(organization_id, slug);
CREATE INDEX idx_webhooks_org ON webhooks(organization_id);

-- RLS para webhooks
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view webhooks in their organization"
ON webhooks FOR SELECT
USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Admins and managers can insert webhooks"
ON webhooks FOR INSERT
WITH CHECK (
  organization_id = get_user_organization(auth.uid()) 
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
);

CREATE POLICY "Admins and managers can update webhooks"
ON webhooks FOR UPDATE
USING (
  organization_id = get_user_organization(auth.uid()) 
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
);

CREATE POLICY "Admins and managers can delete webhooks"
ON webhooks FOR DELETE
USING (
  organization_id = get_user_organization(auth.uid()) 
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
);

-- Tabela de logs de requisições
CREATE TABLE webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES webhooks(id) ON DELETE CASCADE NOT NULL,
  
  -- Dados da requisição
  request_method TEXT NOT NULL,
  request_headers JSONB,
  request_body JSONB,
  request_ip TEXT,
  
  -- Campos parseados
  parsed_fields JSONB,
  
  -- Resultado
  status TEXT DEFAULT 'pending',
  actions_executed JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  
  -- Entidades criadas/atualizadas
  lead_id UUID REFERENCES leads(id),
  
  -- Tempo de processamento
  processing_time_ms INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para logs
CREATE INDEX idx_webhook_logs_webhook ON webhook_logs(webhook_id);
CREATE INDEX idx_webhook_logs_created ON webhook_logs(created_at DESC);
CREATE INDEX idx_webhook_logs_status ON webhook_logs(status);

-- RLS para logs
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view logs for webhooks in their organization"
ON webhook_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM webhooks w
    WHERE w.id = webhook_logs.webhook_id
    AND w.organization_id = get_user_organization(auth.uid())
  )
);

CREATE POLICY "System can insert webhook logs"
ON webhook_logs FOR INSERT
WITH CHECK (true);

-- Tabela de requisições de exemplo
CREATE TABLE webhook_sample_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES webhooks(id) ON DELETE CASCADE NOT NULL,
  
  name TEXT,
  request_body JSONB NOT NULL,
  extracted_fields JSONB NOT NULL,
  
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para samples
CREATE INDEX idx_webhook_samples_webhook ON webhook_sample_requests(webhook_id);

-- RLS para samples
ALTER TABLE webhook_sample_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view samples for webhooks in their organization"
ON webhook_sample_requests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM webhooks w
    WHERE w.id = webhook_sample_requests.webhook_id
    AND w.organization_id = get_user_organization(auth.uid())
  )
);

CREATE POLICY "Users can manage samples for webhooks in their organization"
ON webhook_sample_requests FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM webhooks w
    WHERE w.id = webhook_sample_requests.webhook_id
    AND w.organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  )
);

-- Função para incrementar contadores de requisições
CREATE OR REPLACE FUNCTION increment_webhook_requests(p_webhook_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE webhooks 
  SET 
    requests_count = requests_count + 1,
    requests_this_month = requests_this_month + 1,
    last_request_at = now()
  WHERE id = p_webhook_id;
END;
$$;

-- Função para resetar contador mensal (pode ser chamada via cron)
CREATE OR REPLACE FUNCTION reset_monthly_webhook_requests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE webhooks SET requests_this_month = 0;
END;
$$;

-- Trigger para updated_at
CREATE TRIGGER update_webhooks_updated_at
BEFORE UPDATE ON webhooks
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();