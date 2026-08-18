-- FASE 2 — deduplicação de comprovante bancário (caso real: lead
-- cb525181-..., chip19, 06/08/2026 09:09/09:18 UTC, e mais 6 casos
-- históricos idênticos, 2026-07-12 a 2026-08-06). Ver relatório de
-- auditoria (Fase 1) em docs/reports/.
--
-- Causa-raiz (código, não banco): a dedup de curto prazo em
-- uazapi-webhook/index.ts (bloco "ai_receipt") usa hash do texto bruto
-- concatenado da mensagem, não uma identidade canônica da transação; e o
-- buffer __pending_receipt_media não era limpo quando um reenvio era
-- corretamente bloqueado, permitindo que uma mensagem de texto NÃO
-- relacionada, chegando depois, reaproveitasse o OCR antigo e gerasse uma
-- segunda venda com um segundo evento Purchase real enviado à Meta.
--
-- Esta migration é ADITIVA: novas colunas nullable em purchase_audit, uma
-- tabela nova, duas funções novas. Nenhuma coluna/constraint/trigger
-- existente é alterada ou removida. Reversível com tráfego ativo (ver DROP
-- ao final, comentado).
--
-- A trava de concorrência REAL contra duas aprovações simultâneas do mesmo
-- comprovante é a UNIQUE (organization_id, receipt_fingerprint) abaixo,
-- usada via INSERT ... ON CONFLICT DO NOTHING em claim_receipt_fingerprint
-- — chamada pelo código ANTES do envio do Purchase à Meta (não depois).

-- ═══════════════════════════════════════════════════════════════════════
-- 1) purchase_audit — colunas novas para identidade canônica + rastro de
--    duplicidade. Todas nullable / com default seguro: não quebra nenhum
--    INSERT existente (record_purchase_result e os dois caminhos diretos
--    de "duplicate"/"failed" em uazapi-webhook/index.ts).
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE public.purchase_audit
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bank_transaction_id text,
  ADD COLUMN IF NOT EXISTS transaction_fingerprint text,
  ADD COLUMN IF NOT EXISTS receipt_fingerprint text,
  ADD COLUMN IF NOT EXISTS fingerprint_version smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fingerprint_strength text
    CHECK (fingerprint_strength IS NULL OR fingerprint_strength IN ('strong', 'weak')),
  ADD COLUMN IF NOT EXISTS receipt_transaction_at timestamptz,
  ADD COLUMN IF NOT EXISTS duplicate_of_purchase_audit_id uuid REFERENCES public.purchase_audit(id),
  ADD COLUMN IF NOT EXISTS duplicate_reason text;

COMMENT ON COLUMN public.purchase_audit.organization_id IS
  'FASE 2 — denormalizado a partir de leads.organization_id, só para viabilizar a constraint de unicidade de comprovante por organização sem join. Nunca é a fonte de verdade de organização (essa continua sendo leads.organization_id via lead_id).';
COMMENT ON COLUMN public.purchase_audit.transaction_fingerprint IS
  'FASE 2 — assinatura canônica legível da transação (ex.: v1|amount=30.00|payer=erminio mendes da silva|transaction_at=2026-08-06T06:08:27, ou v1|bank_id=<E2E/NSU>). Ver supabase/functions/_shared/receipt-fingerprint.ts.';
COMMENT ON COLUMN public.purchase_audit.receipt_fingerprint IS
  'FASE 2 — SHA-256 hex de transaction_fingerprint. Chave compacta usada na constraint única de purchase_receipt_fingerprint_claims.';
COMMENT ON COLUMN public.purchase_audit.fingerprint_strength IS
  'FASE 2 — "strong" (bank_transaction_id, ou valor+pagador+data/hora completos) participa da constraint de bloqueio automático. "weak" nunca bloqueia sozinha — só auditoria.';
COMMENT ON COLUMN public.purchase_audit.duplicate_of_purchase_audit_id IS
  'FASE 2 — quando preenchido, esta linha é uma duplicata comprovada da linha canônica apontada. Nunca apagamos a linha duplicada; ela só sai da agregação do dashboard porque purchase_status passa a ser ''duplicate''.';

-- Backfill de organization_id para linhas existentes (só preenche NULL,
-- nunca sobrescreve). Aditivo e idempotente.
UPDATE public.purchase_audit pa
SET organization_id = l.organization_id
FROM public.leads l
WHERE pa.lead_id = l.id
  AND pa.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_audit_duplicate_of
  ON public.purchase_audit (duplicate_of_purchase_audit_id)
  WHERE duplicate_of_purchase_audit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_audit_org_fingerprint
  ON public.purchase_audit (organization_id, receipt_fingerprint)
  WHERE receipt_fingerprint IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 2) Tabela de claims — a trava de concorrência real. Um comprovante forte
--    só pode ser "reivindicado" uma vez por organização; a segunda
--    tentativa (reenvio, ou duas execuções concorrentes do mesmo webhook)
--    recebe ON CONFLICT DO NOTHING e sabe, de forma atômica, que perdeu.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.purchase_receipt_fingerprint_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  receipt_fingerprint text NOT NULL,
  fingerprint_version smallint NOT NULL DEFAULT 1,
  purchase_audit_id uuid REFERENCES public.purchase_audit(id) ON DELETE SET NULL,
  lead_id uuid,
  conversation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, receipt_fingerprint)
);

COMMENT ON TABLE public.purchase_receipt_fingerprint_claims IS
  'FASE 2 — trava atômica de deduplicação de comprovante. A exclusividade vem da UNIQUE (organization_id, receipt_fingerprint): duas tentativas concorrentes de INSERT para o mesmo comprovante — uma sempre falha/perde no ON CONFLICT DO NOTHING dentro de claim_receipt_fingerprint(), sempre chamada ANTES do envio do Purchase à Meta. purchase_audit_id começa NULL e é preenchido por link_receipt_fingerprint_claim() logo após o INSERT canônico em purchase_audit (2 passos, mas o passo que decide duplicidade é só o primeiro).';

ALTER TABLE public.purchase_receipt_fingerprint_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_receipt_fingerprint_claims_org_read"
  ON public.purchase_receipt_fingerprint_claims
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (SELECT profiles.organization_id FROM public.profiles WHERE profiles.id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "purchase_receipt_fingerprint_claims_service_all"
  ON public.purchase_receipt_fingerprint_claims
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════
-- 3) claim_receipt_fingerprint — chamada pelo bloco "pixel" em
--    uazapi-webhook/index.ts ANTES de sendFacebookConversion(). Só
--    service_role chama (mesmo padrão de record_purchase_result).
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.claim_receipt_fingerprint(
  p_organization_id uuid,
  p_receipt_fingerprint text,
  p_fingerprint_version smallint,
  p_lead_id uuid DEFAULT NULL,
  p_conversation_id uuid DEFAULT NULL
) RETURNS TABLE(claimed boolean, claim_id uuid, existing_purchase_audit_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_claim_id uuid;
  v_existing RECORD;
BEGIN
  IF p_organization_id IS NULL OR p_receipt_fingerprint IS NULL OR p_receipt_fingerprint = '' THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.purchase_receipt_fingerprint_claims (
    organization_id, receipt_fingerprint, fingerprint_version, lead_id, conversation_id
  ) VALUES (
    p_organization_id, p_receipt_fingerprint, COALESCE(p_fingerprint_version, 1), p_lead_id, p_conversation_id
  )
  ON CONFLICT (organization_id, receipt_fingerprint) DO NOTHING
  RETURNING id INTO v_claim_id;

  IF v_claim_id IS NOT NULL THEN
    RETURN QUERY SELECT true, v_claim_id, NULL::uuid;
    RETURN;
  END IF;

  SELECT id, purchase_audit_id INTO v_existing
    FROM public.purchase_receipt_fingerprint_claims
    WHERE organization_id = p_organization_id AND receipt_fingerprint = p_receipt_fingerprint;

  RETURN QUERY SELECT false, v_existing.id, v_existing.purchase_audit_id;
END;
$$;

COMMENT ON FUNCTION public.claim_receipt_fingerprint IS
  'FASE 2 — tentativa atômica de reivindicar um comprovante. claimed=true: primeira vez, siga o fluxo normal (Meta + record_purchase_result). claimed=false: comprovante repetido esperado (mesma organização), NÃO envie Purchase à Meta; existing_purchase_audit_id pode ainda ser NULL se a linha canônica ainda não foi linkada (corrida rara entre claim e link) — nesse caso trate como duplicata mesmo sem o id resolvido.';

REVOKE ALL ON FUNCTION public.claim_receipt_fingerprint FROM anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 4) link_receipt_fingerprint_claim — chamada logo após o INSERT canônico
--    em purchase_audit (via record_purchase_result), para que duplicatas
--    futuras encontrem o id correto mesmo que o claim tenha sido criado
--    alguns milissegundos antes da linha existir.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.link_receipt_fingerprint_claim(
  p_claim_id uuid,
  p_purchase_audit_id uuid
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.purchase_receipt_fingerprint_claims
  SET purchase_audit_id = p_purchase_audit_id
  WHERE id = p_claim_id AND purchase_audit_id IS NULL;
$$;

COMMENT ON FUNCTION public.link_receipt_fingerprint_claim IS
  'FASE 2 — vincula o claim (já garantidamente único) ao purchase_audit.id canônico recém-criado. Idempotente (WHERE purchase_audit_id IS NULL).';

REVOKE ALL ON FUNCTION public.link_receipt_fingerprint_claim FROM anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 5) record_purchase_result — CREATE OR REPLACE aditivo: só acrescenta
--    parâmetros novos com DEFAULT NULL ao final da assinatura (nenhum
--    parâmetro existente muda de posição/tipo/nome), e só acrescenta
--    colunas ao INSERT. O outro call site existente (execute_silent_recovery,
--    uazapi-webhook/index.ts ~linha 2900) continua funcionando sem alteração
--    — não passa os novos parâmetros, eles ficam NULL, comportamento
--    idêntico ao de hoje para esse caminho.
--
--    CREATE OR REPLACE não substitui a função antiga aqui porque a lista de
--    parâmetros mudou (Postgres trata isso como sobrecarga, não
--    substituição) — por isso o DROP explícito da assinatura antiga abaixo,
--    seguido do CREATE da assinatura nova (que é estritamente a antiga +
--    parâmetros novos no final, todos com DEFAULT NULL).
-- ═══════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.record_purchase_result(
  uuid, uuid, text, text, text, text, timestamptz, boolean, text, numeric, text, text,
  text, text, text, text, text, text, text, text, text, text, text, uuid, text, text,
  jsonb, jsonb, jsonb
);

CREATE OR REPLACE FUNCTION public.record_purchase_result(
  p_conversation_id uuid,
  p_lead_id uuid,
  p_pixel_block_id text,
  p_pixel_id text,
  p_event_name text,
  p_event_id text,
  p_event_occurred_at timestamptz,
  p_meta_success boolean,
  p_fbtrace_id text,
  p_purchase_value numeric,
  p_currency text,
  p_action_source text,
  p_campaign_id text DEFAULT NULL,
  p_campaign_name text DEFAULT NULL,
  p_adset_id text DEFAULT NULL,
  p_adset_name text DEFAULT NULL,
  p_ad_id text DEFAULT NULL,
  p_ad_name text DEFAULT NULL,
  p_ctwa_clid text DEFAULT NULL,
  p_ad_source_id text DEFAULT NULL,
  p_ad_source_type text DEFAULT NULL,
  p_entry_point_conversion_source text DEFAULT NULL,
  p_connection_id text DEFAULT NULL,
  p_flow_execution_id uuid DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_raw_payload jsonb DEFAULT NULL,
  p_raw_response jsonb DEFAULT NULL,
  p_recovery_metadata jsonb DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_bank_transaction_id text DEFAULT NULL,
  p_transaction_fingerprint text DEFAULT NULL,
  p_receipt_fingerprint text DEFAULT NULL,
  p_fingerprint_version smallint DEFAULT NULL,
  p_fingerprint_strength text DEFAULT NULL,
  p_receipt_transaction_at timestamptz DEFAULT NULL
) RETURNS public.purchase_audit
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_meta_status text := CASE WHEN p_meta_success THEN 'success' ELSE 'failed' END;
  v_row public.purchase_audit;
  v_tracking RECORD;
BEGIN
  IF p_event_name IS DISTINCT FROM 'Purchase' THEN
    RETURN NULL;
  END IF;

  SELECT campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name
    INTO v_tracking
    FROM public.lead_tracking
    WHERE lead_id = p_lead_id
    ORDER BY created_at DESC LIMIT 1;

  INSERT INTO public.purchase_audit (
    conversation_id, lead_id, pixel_block_id, pixel_id, event_id, event_occurred_at,
    meta_status, purchase_status, fbtrace_id, purchase_value, currency, action_source,
    campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, ctwa_clid,
    ad_source_id, ad_source_type, entry_point_conversion_source,
    connection_id, flow_execution_id, phone, customer_name,
    purchase_source, raw_payload, raw_response, error_details, recovery_metadata,
    organization_id, bank_transaction_id, transaction_fingerprint, receipt_fingerprint,
    fingerprint_version, fingerprint_strength, receipt_transaction_at
  ) VALUES (
    p_conversation_id, p_lead_id, p_pixel_block_id, p_pixel_id, p_event_id, p_event_occurred_at,
    v_meta_status, v_meta_status, p_fbtrace_id, p_purchase_value, p_currency, p_action_source,
    COALESCE(p_campaign_id, v_tracking.campaign_id),
    COALESCE(p_campaign_name, v_tracking.campaign_name),
    COALESCE(p_adset_id, v_tracking.adset_id),
    COALESCE(p_adset_name, v_tracking.adset_name),
    COALESCE(p_ad_id, v_tracking.ad_id),
    COALESCE(p_ad_name, v_tracking.ad_name),
    p_ctwa_clid, p_ad_source_id, p_ad_source_type, p_entry_point_conversion_source,
    p_connection_id, p_flow_execution_id, p_phone, p_customer_name,
    'webhook', p_raw_payload, p_raw_response,
    CASE WHEN p_meta_success THEN NULL ELSE p_raw_response END,
    p_recovery_metadata,
    p_organization_id, p_bank_transaction_id, p_transaction_fingerprint, p_receipt_fingerprint,
    COALESCE(p_fingerprint_version, 1), p_fingerprint_strength, p_receipt_transaction_at
  )
  ON CONFLICT (event_id) WHERE (event_id IS NOT NULL AND event_id <> 'N/A' AND meta_status IS NOT NULL)
  DO UPDATE SET
    meta_status = CASE WHEN public.purchase_audit.meta_status = 'success'
                        THEN public.purchase_audit.meta_status ELSE EXCLUDED.meta_status END,
    purchase_status = CASE WHEN public.purchase_audit.purchase_status = 'success'
                        THEN public.purchase_audit.purchase_status ELSE EXCLUDED.purchase_status END,
    fbtrace_id = CASE WHEN public.purchase_audit.meta_status = 'success'
                        THEN public.purchase_audit.fbtrace_id ELSE EXCLUDED.fbtrace_id END,
    raw_response = CASE WHEN public.purchase_audit.meta_status = 'success'
                        THEN public.purchase_audit.raw_response ELSE EXCLUDED.raw_response END,
    error_details = CASE WHEN public.purchase_audit.meta_status = 'success'
                        THEN NULL ELSE EXCLUDED.error_details END,
    event_occurred_at = COALESCE(public.purchase_audit.event_occurred_at, EXCLUDED.event_occurred_at),
    organization_id = COALESCE(public.purchase_audit.organization_id, EXCLUDED.organization_id),
    bank_transaction_id = COALESCE(public.purchase_audit.bank_transaction_id, EXCLUDED.bank_transaction_id),
    transaction_fingerprint = COALESCE(public.purchase_audit.transaction_fingerprint, EXCLUDED.transaction_fingerprint),
    receipt_fingerprint = COALESCE(public.purchase_audit.receipt_fingerprint, EXCLUDED.receipt_fingerprint),
    fingerprint_strength = COALESCE(public.purchase_audit.fingerprint_strength, EXCLUDED.fingerprint_strength),
    receipt_transaction_at = COALESCE(public.purchase_audit.receipt_transaction_at, EXCLUDED.receipt_transaction_at)
  RETURNING * INTO v_row;

  INSERT INTO public.pixel_event_logs (
    conversation_id, lead_id, block_id, event_name, pixel_id, payload, response, success,
    event_occurred_at, recovery_metadata, purchase_audit_id
  ) VALUES (
    p_conversation_id, p_lead_id, p_pixel_block_id, p_event_name, p_pixel_id, p_raw_payload, p_raw_response, p_meta_success,
    p_event_occurred_at, p_recovery_metadata, v_row.id
  )
  ON CONFLICT (conversation_id, block_id, event_name) DO UPDATE SET
    payload = EXCLUDED.payload,
    response = EXCLUDED.response,
    success = EXCLUDED.success,
    event_occurred_at = EXCLUDED.event_occurred_at,
    recovery_metadata = EXCLUDED.recovery_metadata,
    purchase_audit_id = EXCLUDED.purchase_audit_id;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.record_purchase_result IS
  'FASE 2.1/2 — única operação canônica de escrita de Purchase. FASE 2 acrescentou os parâmetros de fingerprint de comprovante (todos opcionais) ao final da assinatura — a decisão de duplicidade em si NÃO acontece aqui (acontece antes, em claim_receipt_fingerprint, chamado pelo bloco pixel antes do envio à Meta); esta função só persiste os campos para auditoria/consulta na linha canônica.';

REVOKE ALL ON FUNCTION public.record_purchase_result FROM anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (não executado por esta migration — referência para reversão
-- manual controlada, caso necessário):
--
--   DROP FUNCTION IF EXISTS public.record_purchase_result(uuid, uuid, text,
--     text, text, text, timestamptz, boolean, text, numeric, text, text,
--     text, text, text, text, text, text, text, text, text, text, text,
--     uuid, text, text, jsonb, jsonb, jsonb, uuid, text, text, text,
--     smallint, text, timestamptz);
--   -- e reaplicar o CREATE OR REPLACE FUNCTION record_purchase_result
--   -- original de supabase/migrations/20260727141449_receipt_recovery_infra.sql
--   -- (restaura a assinatura de 29 parâmetros usada pelo caminho de
--   -- recuperação administrativa);
--   DROP FUNCTION IF EXISTS public.link_receipt_fingerprint_claim(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.claim_receipt_fingerprint(uuid, text, smallint, uuid, uuid);
--   DROP TABLE IF EXISTS public.purchase_receipt_fingerprint_claims;
--   DROP INDEX IF EXISTS idx_purchase_audit_org_fingerprint;
--   DROP INDEX IF EXISTS idx_purchase_audit_duplicate_of;
--   ALTER TABLE public.purchase_audit
--     DROP COLUMN IF EXISTS duplicate_reason,
--     DROP COLUMN IF EXISTS duplicate_of_purchase_audit_id,
--     DROP COLUMN IF EXISTS receipt_transaction_at,
--     DROP COLUMN IF EXISTS fingerprint_strength,
--     DROP COLUMN IF EXISTS fingerprint_version,
--     DROP COLUMN IF EXISTS receipt_fingerprint,
--     DROP COLUMN IF EXISTS transaction_fingerprint,
--     DROP COLUMN IF EXISTS bank_transaction_id,
--     DROP COLUMN IF EXISTS organization_id;
--
-- Seguro com tráfego ativo em ambas as direções: nenhuma coluna/tabela
-- pré-existente é tocada; código antigo (sem os campos novos) continua
-- funcionando normalmente antes do deploy da function, e mesmo depois de
-- um rollback do schema (os campos somem, mas nada os exige NOT NULL).
