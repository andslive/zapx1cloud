-- Tabela para base de conhecimento da IA por produto
CREATE TABLE public.ai_knowledge_base (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    tags TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_ai_knowledge_base_product ON public.ai_knowledge_base(product_id);
CREATE INDEX idx_ai_knowledge_base_category ON public.ai_knowledge_base(category);

-- Habilitar RLS
ALTER TABLE public.ai_knowledge_base ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view knowledge base of their org products"
ON public.ai_knowledge_base
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM products p
        WHERE p.id = ai_knowledge_base.product_id
        AND p.organization_id = get_user_organization(auth.uid())
    )
);

CREATE POLICY "Admins and managers can manage knowledge base"
ON public.ai_knowledge_base
FOR ALL
USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
);

-- Trigger para updated_at
CREATE TRIGGER update_ai_knowledge_base_updated_at
    BEFORE UPDATE ON public.ai_knowledge_base
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();