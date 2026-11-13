-- Cobranças (tentativas), eventos de gateway e confirmação única de pagamento.
-- 100% aditiva. NÃO APLICAR em produção sem autorização; validada em Postgres local.
-- Depende de 20261113000000_payment_gateway_accounts.sql.

CREATE TABLE IF NOT EXISTS public.payment_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  gateway_account_id uuid NOT NULL REFERENCES public.payment_gateway_accounts(id),
  provider text NOT NULL CHECK (provider IN ('colocapay', 'leonapay')),
  method text NOT NULL CHECK (method IN ('SPEI', 'OXXO')),
  currency text NOT NULL CHECK (currency = 'MXN'),
  amount numeric(18, 2) NOT NULL CHECK (amount > 0),
  -- creating: persistida antes da chamada; pending: instrução pronta (ou aguardando voucher);
  -- paid/failed/expired: estados finais do gateway.
  status text NOT NULL DEFAULT 'creating'
    CHECK (status IN ('creating', 'awaiting_instructions', 'pending', 'paid', 'failed', 'expired')),
  -- Vínculo com a execução do funil e com o pedido.
  conversation_id uuid,
  lead_id uuid,
  flow_id uuid,
  block_id text,
  execution_key text NOT NULL,       -- conversa + bloco + rodada: identifica UMA execução
  order_ref text NOT NULL,           -- pedido: um pedido só entrega uma vez, mesmo com 2 cobranças
  -- Idempotência: mesma chave e mesmo payload em todo retry desta tentativa.
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
  request_fingerprint text NOT NULL,
  internal_reference text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  -- Dados do pagador (e-mail: origem registrada; alias persistido ANTES da chamada).
  payer_name text,
  payer_email text,
  payer_email_source text CHECK (payer_email_source IN ('lead', 'asked', 'alias')),
  -- Retorno do gateway.
  external_id text,
  payment_code text,
  payment_qrcode text,
  payment_link text,
  bank_name text,
  beneficiary text,
  expires_at timestamptz,
  error_code text,
  paid_amount numeric(18, 2),
  paid_at timestamptz,
  paid_source text CHECK (paid_source IN ('webhook', 'poll')),
  -- Consumo único: retomada do funil e entrega.
  resume_claimed_at timestamptz,
  consumed_at timestamptz,
  consumed_block_id text,
  superseded_by uuid REFERENCES public.payment_charges(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_charges_idem_unique UNIQUE (organization_id, idempotency_key),
  CONSTRAINT payment_charges_ref_unique UNIQUE (internal_reference)
);

-- Uma cobrança em aberto por execução (retry/replay reaproveita a mesma tentativa).
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_charges_open_per_execution
  ON public.payment_charges (organization_id, execution_key)
  WHERE status IN ('creating', 'awaiting_instructions', 'pending') AND superseded_by IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_charges_external
  ON public.payment_charges (gateway_account_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_charges_conversation ON public.payment_charges (conversation_id);
CREATE INDEX IF NOT EXISTS idx_payment_charges_order ON public.payment_charges (organization_id, order_ref);

CREATE TABLE IF NOT EXISTS public.payment_gateway_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  gateway_account_id uuid NOT NULL REFERENCES public.payment_gateway_accounts(id),
  provider text NOT NULL,
  event_id text NOT NULL,            -- id do envelope (Coloca) / x-leonapay-event-id (Leona)
  event_type text NOT NULL,
  charge_id uuid REFERENCES public.payment_charges(id),
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  outcome text,                       -- applied | duplicate | mismatch | unknown_charge | ignored | second_payment
  outcome_detail text,
  CONSTRAINT payment_gateway_events_dedup UNIQUE (gateway_account_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_payment_gateway_events_charge ON public.payment_gateway_events (charge_id);

ALTER TABLE public.payment_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_gateway_events ENABLE ROW LEVEL SECURITY;

-- Leitura administrativa (admin/manager da própria organização); escrita só service_role.
CREATE POLICY "Org admins view payment charges" ON public.payment_charges FOR SELECT
USING (
  organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);
CREATE POLICY "Org admins view payment events" ON public.payment_gateway_events FOR SELECT
USING (
  organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);
REVOKE ALL ON public.payment_charges, public.payment_gateway_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_charges, public.payment_gateway_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payment_charges, public.payment_gateway_events TO service_role;

-- ─── Confirmação atômica: só a PRIMEIRA transição para 'paid' devolve first_time = true ───
-- Valor/método/moeda/organização/conta são conferidos aqui, no banco, junto da transição.
CREATE OR REPLACE FUNCTION public.payment_charge_mark_paid(
  p_charge_id uuid,
  p_organization_id uuid,
  p_gateway_account_id uuid,
  p_paid_amount numeric,
  p_currency text,
  p_method text,
  p_source text
) RETURNS TABLE (outcome text, first_time boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  c public.payment_charges%ROWTYPE;
  v_order_paid boolean;
BEGIN
  SELECT * INTO c FROM public.payment_charges WHERE id = p_charge_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unknown_charge'::text, false; RETURN; END IF;
  IF c.organization_id <> p_organization_id OR c.gateway_account_id <> p_gateway_account_id
     OR c.currency <> p_currency OR c.method <> p_method THEN
    RETURN QUERY SELECT 'mismatch'::text, false; RETURN;
  END IF;
  IF p_paid_amount IS NULL OR p_paid_amount <> c.amount THEN
    RETURN QUERY SELECT 'amount_mismatch'::text, false; RETURN;
  END IF;
  IF c.status = 'paid' THEN RETURN QUERY SELECT 'already_paid'::text, false; RETURN; END IF;

  -- Mesmo pedido já pago por OUTRA cobrança (ex.: SPEI e OXXO): registra e NÃO entrega de novo.
  SELECT EXISTS (
    SELECT 1 FROM public.payment_charges o
     WHERE o.organization_id = c.organization_id AND o.order_ref = c.order_ref
       AND o.id <> c.id AND o.status = 'paid'
  ) INTO v_order_paid;

  UPDATE public.payment_charges
     SET status = 'paid', paid_amount = p_paid_amount, paid_at = now(), paid_source = p_source,
         -- consumo já marcado se o pedido foi entregue por outra cobrança
         consumed_at = CASE WHEN v_order_paid THEN now() ELSE consumed_at END,
         consumed_block_id = CASE WHEN v_order_paid THEN 'second_payment' ELSE consumed_block_id END,
         updated_at = now()
   WHERE id = c.id;

  IF v_order_paid THEN
    RETURN QUERY SELECT 'second_payment'::text, false;
  ELSE
    RETURN QUERY SELECT 'applied'::text, true;
  END IF;
END;
$$;

-- Reivindica a retomada do funil: exatamente uma vez por cobrança paga.
CREATE OR REPLACE FUNCTION public.payment_charge_claim_resume(p_charge_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE v_rows int;
BEGIN
  UPDATE public.payment_charges
     SET resume_claimed_at = now(), updated_at = now()
   WHERE id = p_charge_id AND status = 'paid' AND resume_claimed_at IS NULL AND consumed_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

-- Consumo da confirmação pelo bloco Reconhecer comprovante (confirmação antecipada ou retomada).
CREATE OR REPLACE FUNCTION public.payment_charge_consume(p_charge_id uuid, p_block_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE v_rows int;
BEGIN
  UPDATE public.payment_charges
     SET consumed_at = now(), consumed_block_id = p_block_id, updated_at = now()
   WHERE id = p_charge_id AND status = 'paid' AND consumed_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.payment_charge_mark_paid(uuid, uuid, uuid, numeric, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payment_charge_claim_resume(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payment_charge_consume(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_charge_mark_paid(uuid, uuid, uuid, numeric, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_charge_claim_resume(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_charge_consume(uuid, text) TO service_role;
