-- 1. Criar tabela de histórico de funis
CREATE TABLE public.lead_funnel_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    funnel_id UUID NOT NULL REFERENCES public.capture_funnels(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    status TEXT DEFAULT 'running', -- running, stopped, completed, cancelled
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Permissões
GRANT ALL ON public.lead_funnel_history TO service_role;
GRANT SELECT ON public.lead_funnel_history TO authenticated;

-- RLS
ALTER TABLE public.lead_funnel_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for service_role" ON public.lead_funnel_history FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Enable select for authenticated" ON public.lead_funnel_history FOR SELECT TO authenticated USING (true);

-- Índices
CREATE INDEX idx_lead_funnel_history_lead_funnel ON public.lead_funnel_history (lead_id, funnel_id);
CREATE INDEX idx_lead_funnel_history_status ON public.lead_funnel_history (status);

-- 2. Adicionar configuração de reentrada no funil
ALTER TABLE public.capture_funnels ADD COLUMN IF NOT EXISTS allow_reentry BOOLEAN DEFAULT false;

-- 3. Adicionar marcadores de conclusão rápida (opcional mas recomendado por performance)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS funnels_completed UUID[] DEFAULT '{}';
ALTER TABLE public.webchat_conversations ADD COLUMN IF NOT EXISTS flow_completed_at TIMESTAMPTZ;

-- 4. Função para marcar conclusão (pode ser chamada via RPC se necessário, mas faremos via Edge Function)
-- No entanto, vamos garantir que service_role tenha acesso total.
GRANT ALL ON public.capture_funnels TO service_role;
GRANT ALL ON public.leads TO service_role;
GRANT ALL ON public.webchat_conversations TO service_role;