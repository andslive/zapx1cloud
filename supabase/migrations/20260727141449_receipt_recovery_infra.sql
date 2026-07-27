-- FASE 2 / 2.1 — infraestrutura de recuperação segura de comprovantes
-- (incidente de crédito OpenAI 2026-07-26/27).
--
-- ESTA MIGRATION É PREPARADA, NÃO FOI APLICADA EM PRODUÇÃO.
-- Reescrita completa da versão FASE 2 original: a versão anterior mantinha
-- DOIS caminhos de escrita concorrentes em purchase_audit (insert direto +
-- trigger) e usava bot_locked_until como única defesa de concorrência —
-- ambos apontados como insuficientes na revisão FASE 2.1. Como esta
-- migration nunca foi aplicada, reescrever em vez de empilhar uma correção
-- por cima é seguro (não é uma migration "forward-only sobre produção").
--
-- Preflight executado em produção (somente leitura, sem gravação) ANTES de
-- desenhar o índice único abaixo:
--   select event_id, count(*) from purchase_audit
--   where event_id is not null and event_id <> 'N/A' and meta_status is not null
--   group by event_id having count(*) > 1;
--   → 0 linhas. 5540 linhas totais cobertas pelo predicado do índice.
--   Ou seja: o índice é criável hoje sem conflito. Isto substitui a
--   afirmação anterior (não verificada) de que "não afeta dados
--   anteriores" — agora é uma afirmação comprovada por consulta, não uma
--   suposição sobre CREATE UNIQUE INDEX.

-- ═══════════════════════════════════════════════════════════════════════
-- 1) LEASE COMPARTILHADO POR CONVERSA — mecanismo único de exclusão mútua
--    usado por: funnel-resume-cron, resume_funnel manual, execute_recovery.
--    NÃO cobre o processamento inbound ao vivo (mensagem real do cliente
--    chegando) — ver nota de escopo no final do arquivo e no relatório
--    FASE 2.1, seção de riscos residuais.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.conversation_processing_leases (
  conversation_id uuid PRIMARY KEY REFERENCES public.webchat_conversations(id),
  owner text NOT NULL, -- 'cron' | 'recovery' | 'manual_resume'
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

COMMENT ON TABLE public.conversation_processing_leases IS
  'FASE 2.1 — lease atômico por conversa. A exclusividade vem da PRIMARY KEY (conversation_id): duas tentativas concorrentes de INSERT para a mesma conversa — uma sempre falha com unique_violation, capturado em acquire_conversation_lease(). Mais forte que bot_locked_until, que não impede duas leituras concorrentes de "ainda expirado".';

-- Aquisição atômica: DELETE de leases expirados (idempotente, não é o ponto
-- de atomicidade) seguido de INSERT (ESTE é o ponto de atomicidade — a
-- PRIMARY KEY garante que, mesmo se duas chamadas concorrentes passarem
-- pelo DELETE ao mesmo tempo, só uma consegue INSERIR).
CREATE OR REPLACE FUNCTION public.acquire_conversation_lease(
  p_conversation_id uuid,
  p_owner text,
  p_lease_seconds int DEFAULT 600
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token uuid := gen_random_uuid();
BEGIN
  DELETE FROM public.conversation_processing_leases
    WHERE conversation_id = p_conversation_id AND expires_at < now();

  INSERT INTO public.conversation_processing_leases (conversation_id, owner, token, expires_at)
  VALUES (p_conversation_id, p_owner, v_token, now() + make_interval(secs => p_lease_seconds));

  RETURN v_token;
EXCEPTION WHEN unique_violation THEN
  RETURN NULL; -- outra execução já detém um lease ativo para esta conversa
END;
$$;

COMMENT ON FUNCTION public.acquire_conversation_lease IS
  'FASE 2.1 — retorna um token se conseguiu o lease, NULL se outra execução já o detém. Chamado por funnel-resume-cron, resume_funnel manual e execute_recovery — os três agora contendem pelo MESMO recurso, não por bot_locked_until separadamente.';

CREATE OR REPLACE FUNCTION public.release_conversation_lease(
  p_conversation_id uuid,
  p_token uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.conversation_processing_leases
    WHERE conversation_id = p_conversation_id AND token = p_token;
  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.release_conversation_lease IS
  'FASE 2.1 — libera o lease antes do TTL expirar (ex.: ao final de execute_recovery). Se o processo cair antes de chamar isto, o lease expira sozinho em expires_at (recuperação segura após crash — não fica travado para sempre).';

REVOKE ALL ON public.conversation_processing_leases FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.acquire_conversation_lease(uuid, text, int) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.release_conversation_lease(uuid, uuid) FROM anon, authenticated;
ALTER TABLE public.conversation_processing_leases ENABLE ROW LEVEL SECURITY;
-- Nenhuma política criada de propósito: RLS habilitada + sem policy = nega
-- tudo por padrão para roles não-service_role. service_role (usado pelas
-- Edge Functions) ignora RLS por definição do Supabase.

-- ═══════════════════════════════════════════════════════════════════════
-- 2) FILA DE RECUPERAÇÃO — fonte de verdade da identidade original,
--    carregada do banco, nunca aceita cegamente do payload externo.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.receipt_recovery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_message_id text NOT NULL,
  original_message_created_at timestamptz NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.webchat_conversations(id),
  organization_id uuid,
  lead_id uuid,
  expected_block_id text NOT NULL,
  media_url text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('image', 'document')),
  media_mime text,
  media_sha256 text,
  -- Reaproveitamento de event_id para os 3 casos de "Purchase ausente"
  -- (item 9/10): quando preenchido, execute_recovery DEVE usar este
  -- event_id em vez de derivar um novo — nunca gera um novo event_id para
  -- uma tentativa que já existiu.
  reuse_event_id text,
  incident_tag text NOT NULL DEFAULT 'openai_credit_incident_20260726',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'done', 'failed', 'skipped')),
  skip_reason text,
  execution_token uuid NOT NULL DEFAULT gen_random_uuid(),
  claimed_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (original_message_id, incident_tag)
);

CREATE INDEX IF NOT EXISTS idx_receipt_recovery_requests_status
  ON public.receipt_recovery_requests (status, created_at);

COMMENT ON TABLE public.receipt_recovery_requests IS
  'FASE 2 — fila de recuperação controlada. Não usada pelo tráfego normal. A reivindicação atômica (UPDATE...WHERE status=''pending''...RETURNING) protege contra 2 chamadas de execute_recovery para o MESMO recovery_id; o lease de conversation_processing_leases protege contra colisão com o cron/resume manual, que não conhecem esta tabela.';

REVOKE ALL ON public.receipt_recovery_requests FROM anon, authenticated;
ALTER TABLE public.receipt_recovery_requests ENABLE ROW LEVEL SECURITY;
-- Idem: RLS habilitada, sem policy → nega tudo exceto service_role.
-- execute_recovery só pode ser chamado com a service_role key (nunca com
-- anon/authenticated), e a Edge Function nunca aceita nada além de
-- `recoveryId` no payload — sem policy pública, um UUID vazado sozinho não
-- basta: quem chama a Edge Function via HTTP precisa também do header
-- Authorization com a service_role key (já exigido por verify_jwt do
-- uazapi-webhook hoje) ou ser uma chamada server-to-server (pg_cron).

-- ═══════════════════════════════════════════════════════════════════════
-- 3) purchase_audit / pixel_event_logs — writer único via RPC
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE public.purchase_audit
  ADD COLUMN IF NOT EXISTS event_occurred_at timestamptz;

UPDATE public.purchase_audit
  SET event_occurred_at = created_at
  WHERE event_occurred_at IS NULL;

ALTER TABLE public.purchase_audit
  ALTER COLUMN event_occurred_at SET DEFAULT now();

COMMENT ON COLUMN public.purchase_audit.event_occurred_at IS
  'FASE 2 — horário real da venda/aprovação. created_at continua sendo o horário técnico de INSERT. Backfill não destrutivo para todo o histórico pré-FASE 2 (= created_at, comportamento idêntico ao anterior).';

ALTER TABLE public.purchase_audit
  ADD COLUMN IF NOT EXISTS recovery_metadata jsonb;

COMMENT ON COLUMN public.purchase_audit.recovery_metadata IS
  'FASE 2 — {recovery_id, source_message_id, recovered_from_openai_credit_incident}. Uso interno; NUNCA lido por sendFacebookConversion nem enviado à Meta (grep confirma: a função só lê userData/customData/options).';

ALTER TABLE public.ai_receipt_audits
  ADD COLUMN IF NOT EXISTS recovery_metadata jsonb;

ALTER TABLE public.pixel_event_logs
  ADD COLUMN IF NOT EXISTS event_occurred_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.pixel_event_logs
  ADD COLUMN IF NOT EXISTS recovery_metadata jsonb;

ALTER TABLE public.pixel_event_logs
  ADD COLUMN IF NOT EXISTS purchase_audit_id uuid REFERENCES public.purchase_audit(id);

COMMENT ON COLUMN public.pixel_event_logs.purchase_audit_id IS
  'FASE 2.1 — link explícito para a linha canônica. pixel_event_logs guarda TODAS as tentativas (outbox de histórico); purchase_audit guarda 1 linha por event_id (o resultado lógico).';

-- Índice único parcial: 1 event_id = no máximo 1 linha CANÔNICA
-- (meta_status preenchido). Comprovado sem conflito pelo preflight acima.
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_audit_event_id_canonical
  ON public.purchase_audit (event_id)
  WHERE event_id IS NOT NULL AND event_id <> 'N/A' AND meta_status IS NOT NULL;

-- Remove o trigger antigo (causava a duplicação estrutural). A partir de
-- agora, purchase_audit e pixel_event_logs só são escritos através de
-- record_purchase_result() — chamado 1x pelo código, tráfego normal e
-- recuperação usam a MESMA função.
DROP TRIGGER IF EXISTS trigger_sync_pixel_to_purchase_audit ON public.pixel_event_logs;

-- ─────────────────────────────────────────────────────────────────────────
-- record_purchase_result: única operação canônica de escrita de Purchase.
--   - Sucesso nunca regride para falha (CASE WHEN existing.meta_status =
--     'success' THEN mantém).
--   - Falha pode virar sucesso em retry (quando a linha existente NÃO é
--     success, o UPDATE aplica o novo resultado).
--   - pixel_event_logs recebe uma linha por TENTATIVA (histórico completo,
--     nunca deduplicado) — é o "outbox"; purchase_audit é a venda lógica.
-- ─────────────────────────────────────────────────────────────────────────
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
  p_recovery_metadata jsonb DEFAULT NULL
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
    purchase_source, raw_payload, raw_response, error_details, recovery_metadata
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
    p_recovery_metadata
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
    event_occurred_at = COALESCE(public.purchase_audit.event_occurred_at, EXCLUDED.event_occurred_at)
  RETURNING * INTO v_row;

  -- FASE 2.1 (corrigido após teste real em branch descartável): existe uma
  -- constraint única PRÉ-EXISTENTE (migration 20260604005959,
  -- idx_pixel_event_idempotency) em (conversation_id, block_id, event_name)
  -- — NÃO por event_id. Ou seja: pixel_event_logs neste schema real é "1
  -- slot por bloco/conversa", atualizado a cada tentativa, NÃO um outbox de
  -- histórico completo por tentativa como eu tinha assumido antes de testar
  -- contra Postgres real (um INSERT puro quebrava em qualquer 2ª tentativa
  -- do mesmo bloco — bug pego só pelo teste real, não pela revisão
  -- estática). Corrigido para UPSERT respeitando essa constraint existente.
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
  'FASE 2.1 — única operação canônica de escrita de Purchase. Chamada tanto pelo tráfego normal quanto pela recuperação (mesmo código, mesma função). Sucesso nunca regride para falha. purchase_audit guarda 1 linha por event_id (ON CONFLICT). pixel_event_logs guarda o estado da ÚLTIMA tentativa por conversation_id+block_id+event_name (upsert, respeitando a constraint pré-existente idx_pixel_event_idempotency, migration 20260604005959) — não é histórico completo de todas as tentativas.';

REVOKE ALL ON FUNCTION public.record_purchase_result FROM anon, authenticated;

-- NOTA DE ESCOPO (não implementada nesta migration nem no código local):
-- o lease de conversation_processing_leases cobre cron + resume manual +
-- recovery. NÃO cobre o processamento de uma mensagem inbound real
-- chegando ao vivo no meio de uma recuperação — decisão deliberada (ver
-- relatório FASE 2.1): tráfego inbound genuíno do cliente é exatamente o
-- que a recuperação tenta emular, e adicionar uma trava aí tocaria o
-- caminho de maior risco do sistema (todo processamento de mensagem) só
-- para proteger uma janela de recuperação administrativa. execute_recovery
-- já reverifica o estado da conversa (bloco esperado, ausência de decisão
-- terminal/Purchase novo) no momento da reivindicação — se uma mensagem
-- real chegou entre a criação da linha de recovery e a execução, a
-- reverificação detecta e pula o caso (skip_reason =
-- 'conversation_advanced_since_snapshot' ou equivalente).
