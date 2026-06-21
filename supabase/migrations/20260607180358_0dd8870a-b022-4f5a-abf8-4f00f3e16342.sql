-- Fase 1: Enriquecimento da tabela leads
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS fbclid TEXT,
ADD COLUMN IF NOT EXISTS ctwa_clid TEXT,
ADD COLUMN IF NOT EXISTS campaign_id TEXT,
ADD COLUMN IF NOT EXISTS campaign_name TEXT,
ADD COLUMN IF NOT EXISTS adset_id TEXT,
ADD COLUMN IF NOT EXISTS adset_name TEXT,
ADD COLUMN IF NOT EXISTS ad_id TEXT,
ADD COLUMN IF NOT EXISTS ad_name TEXT,
ADD COLUMN IF NOT EXISTS placement TEXT,
ADD COLUMN IF NOT EXISTS utm_source TEXT,
ADD COLUMN IF NOT EXISTS utm_medium TEXT,
ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
ADD COLUMN IF NOT EXISTS utm_term TEXT,
ADD COLUMN IF NOT EXISTS utm_content TEXT;

-- Fase 2: Tabela de Auditoria de Purchase
CREATE TABLE IF NOT EXISTS public.purchase_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES public.webchat_conversations(id) ON DELETE SET NULL,
    flow_id UUID, -- Opcional, dependendo da estrutura
    flow_execution_id UUID, -- Referência à execução do funil
    connection_id TEXT, -- ID da conexão WhatsApp
    phone TEXT,
    customer_name TEXT,
    purchase_value NUMERIC(10,2),
    currency TEXT DEFAULT 'BRL',
    campaign_id TEXT,
    campaign_name TEXT,
    adset_id TEXT,
    adset_name TEXT,
    ad_id TEXT,
    ad_name TEXT,
    pixel_id TEXT,
    event_id TEXT,
    fbtrace_id TEXT,
    meta_status TEXT,
    purchase_source TEXT, -- 'webhook', 'manual', 'api'
    purchase_status TEXT, -- 'success', 'failed', 'duplicate', 'waiting'
    receipt_block_id TEXT,
    pixel_block_id TEXT,
    error_details JSONB,
    raw_payload JSONB,
    raw_response JSONB
);

-- Garantir permissões
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_audit TO authenticated;
GRANT ALL ON public.purchase_audit TO service_role;

-- Ativar RLS
ALTER TABLE public.purchase_audit ENABLE ROW LEVEL SECURITY;

-- Política simples: usuários autenticados podem ver todos os dados de sua org (se houver organization_id)
-- Por agora, permitir acesso geral para autenticados para simplificar a auditoria
CREATE POLICY "Enable all for authenticated users" ON public.purchase_audit FOR ALL TO authenticated USING (true);
