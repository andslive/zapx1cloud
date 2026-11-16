-- Clave de rastreo lida do comprovante da lead, guardada para cruzar com `data.reference` de um evento
-- `payment.paid` validado do gateway (SPEI com CLABE fixa compartilhada). Aditiva e idempotente.
-- A liberação do pedido NUNCA depende desta tabela sozinha: ela só aponta qual evento já confirmado pela
-- LeonaPay deve ser vinculado a qual pedido; a confirmação continua sendo o evento do gateway.
CREATE TABLE IF NOT EXISTS public.payment_receipt_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  gateway_account_id uuid REFERENCES public.payment_gateway_accounts(id),
  conversation_id uuid NOT NULL REFERENCES public.webchat_conversations(id) ON DELETE CASCADE,
  order_ref text NOT NULL,
  clave text NOT NULL,                       -- clave de rastreo normalizada (maiúsculas, sem espaços)
  message_id text,                           -- id do provedor da mensagem do comprovante
  status text NOT NULL DEFAULT 'pending',    -- pending | bound | manual
  manual_reason text,                        -- ambiguous_events | conflicting_orders | partial_reference | bind_refused:<motivo>
  event_row_id uuid REFERENCES public.payment_gateway_events(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT payment_receipt_claims_status_chk CHECK (status IN ('pending','bound','manual')),
  CONSTRAINT payment_receipt_claims_unique UNIQUE (organization_id, clave, conversation_id)
);
CREATE INDEX IF NOT EXISTS idx_payment_receipt_claims_clave ON public.payment_receipt_claims (organization_id, clave);
CREATE INDEX IF NOT EXISTS idx_payment_receipt_claims_pending ON public.payment_receipt_claims (organization_id, status) WHERE status <> 'bound';

ALTER TABLE public.payment_receipt_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org admins view receipt claims" ON public.payment_receipt_claims FOR SELECT
USING (
  organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);
REVOKE ALL ON public.payment_receipt_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_receipt_claims TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payment_receipt_claims TO service_role;
