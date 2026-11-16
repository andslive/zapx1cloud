-- ═══════════════════════════════════════════════════════════════════════
-- Hardening do pipeline de Cobrança -- correções achadas na revisão de
-- 24/09/2026. Nada aqui é aplicado em produção nesta etapa.
--
-- 1) PROVIDER: a migration 20260923200354 criou evolution_instances.
--    provider_type -- DUPLICATA de evolution_instances.provider (já
--    existente desde 20260529155657, com CHECK 'uazapi'|'meta_cloud' em
--    20260810120000 e resolvida exclusivamente por
--    _shared/whatsapp-provider/resolve.ts). Duas fontes de verdade para o
--    mesmo fato. Removida; a checagem oficial passa a usar `provider`,
--    com a mesma regra do resolver: NULL/'' => uazapi, valor desconhecido
--    => falha fechada.
-- 2) API OFICIAL (validado em 24/09/2026 contra a documentação da Meta):
--    - janela de atendimento: aberta/renovada SÓ por mensagem ou ligação
--      do usuário; template nunca abre janela; por destinatário e pelo
--      número empresarial que ele contatou (aqui: por lead + conexão);
--    - categoria: a Meta pode recategorizar um template depois da
--      aprovação e o que vale é a categoria ATRIBUÍDA -- o CHECK que
--      amarrava propósito->categoria foi removido; guarda-se a categoria
--      solicitada e a atribuída (meta_assigned_category);
--    - utility exige vínculo com transação do usuário e zero conteúdo
--      promocional -- contribuição voluntária nunca solicita UTILITY;
--    - a partir de 01/10/2026 mensagens de serviço e utility dentro da
--      janela passam a ser cobradas por mensagem -- nenhum preço é
--      codificado aqui: tarifa vem de manual_charge_official_rate_card
--      (vazia por padrão => envio pago bloqueado); custo real confirmado
--      vem do objeto `pricing` dos webhooks de entrega (fora desta etapa).
-- 3) ORÇAMENTO: a checagem anterior só LIA o gasto -- dois envios
--    concorrentes podiam ambos passar. Agora há reserva atômica por
--    tentativa (manual_charge_official_reserve_budget) sob lock.
-- 4) FUSO/IDIOMA: o DDI sozinho resolvia fuso de países com vários fusos
--    (+1, +52...) e o agendador aceitava -- envio autorizado sob
--    incerteza. Agora: fuso por DDD brasileiro (determinístico por
--    estado, exceto DDD 97), por país de fuso único, ou explícito; do
--    contrário NULL => bloqueio. Idioma nunca vem do telefone -- só
--    explícito ou evidência da conversa. Proveniência e confiança de
--    idioma e de fuso agora são colunas separadas.
-- 5) PIPELINE DE CLASSIFICAÇÃO: fila idempotente por mensagem, decisão de
--    candidato única (usada pela prévia, pela carga e pelo classificador
--    LLM), ingestão contínua que também processa dispatches existentes e
--    reabre um dispatch 'sent' quando há nova data explícita.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1+2) Templates: categoria atribuída pela Meta, propósito de contribuição
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.manual_charge_templates
  DROP CONSTRAINT manual_charge_templates_check,
  DROP CONSTRAINT manual_charge_templates_check1,
  DROP CONSTRAINT manual_charge_templates_purpose_check;

ALTER TABLE public.manual_charge_templates
  ADD CONSTRAINT manual_charge_templates_purpose_check
    CHECK (purpose IN ('payment_reminder_transactional', 'voluntary_contribution_reminder', 'commercial_reengagement')),
  ADD COLUMN meta_assigned_category text
    CHECK (meta_assigned_category IS NULL OR meta_assigned_category IN ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  ADD COLUMN meta_template_id text,
  ADD COLUMN category_last_synced_at timestamptz,
  -- Contribuição voluntária não é transação existente -- nunca SOLICITA
  -- utility. (Se a Meta atribuir outra coisa, vale a atribuída.)
  ADD CONSTRAINT manual_charge_templates_voluntary_not_utility_check
    CHECK (purpose <> 'voluntary_contribution_reminder' OR category <> 'UTILITY'),
  -- Reengajamento comercial é sempre marketing na solicitação.
  ADD CONSTRAINT manual_charge_templates_reengagement_marketing_check
    CHECK (purpose <> 'commercial_reengagement' OR category = 'MARKETING'),
  -- Aprovado sem categoria atribuída conhecida não serve para envio.
  ADD CONSTRAINT manual_charge_templates_approved_needs_assigned_category_check
    CHECK (status <> 'approved' OR meta_assigned_category IS NOT NULL);

COMMENT ON COLUMN public.manual_charge_templates.category IS
  'Categoria SOLICITADA na submissão. Não é a categoria que vale para custo/elegibilidade -- ver meta_assigned_category (a Meta pode recategorizar após aprovação).';
COMMENT ON COLUMN public.manual_charge_templates.meta_assigned_category IS
  'Categoria efetivamente atribuída pela Meta (sincronizada da API). É a única usada para custo e elegibilidade. NULL => template não utilizável.';

-- ─────────────────────────────────────────────────────────────────────
-- 2) Tabela de tarifas -- nunca preço fixo em código
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE public.manual_charge_official_rate_card (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_ddi_prefix text NOT NULL CHECK (market_ddi_prefix ~ '^[0-9]{1,4}$'),
  category text NOT NULL CHECK (category IN ('MARKETING', 'UTILITY', 'AUTHENTICATION', 'SERVICE')),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  rate numeric NOT NULL CHECK (rate >= 0),
  effective_from date NOT NULL,
  effective_until date,
  source_url text NOT NULL CHECK (source_url ~ '^https://'),
  approved_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_ddi_prefix, category, effective_from),
  CHECK (effective_until IS NULL OR effective_until >= effective_from),
  CHECK ((approved_by IS NULL) = (approved_at IS NULL))
);

COMMENT ON TABLE public.manual_charge_official_rate_card IS
  'Tarifas da API oficial por mercado (DDI), categoria e vigência. Nasce VAZIA de propósito: nenhum preço é inventado ou codificado. SERVICE = texto livre dentro da janela (cobrado a partir de 01/10/2026 segundo a Meta). Só linhas aprovadas (approved_at) e na moeda do orçamento (USD) liberam envio pago. Estimativa; o custo confirmado vem do objeto pricing do webhook de entrega.';

REVOKE ALL ON public.manual_charge_official_rate_card FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.manual_charge_official_rate_card TO authenticated;
ALTER TABLE public.manual_charge_official_rate_card ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manual_charge_official_rate_card_read" ON public.manual_charge_official_rate_card
  FOR SELECT TO authenticated USING (true);

-- Livro-razão: reserva por tentativa, idempotente.
ALTER TABLE public.manual_charge_budget_ledger
  ADD COLUMN attempt_id uuid,
  ADD COLUMN rate_card_id uuid REFERENCES public.manual_charge_official_rate_card(id) ON DELETE RESTRICT,
  ADD COLUMN currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$');

CREATE UNIQUE INDEX manual_charge_budget_ledger_attempt_entry_uk
  ON public.manual_charge_budget_ledger (attempt_id, entry_type) WHERE attempt_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 1+2) Checagem oficial reescrita sobre `provider` (fonte única)
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.manual_charge_official_market_prefix(p_phone_normalized text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT cd.ddi_prefix
  FROM public.manual_charge_country_defaults cd
  WHERE p_phone_normalized LIKE cd.ddi_prefix || '%'
  ORDER BY length(cd.ddi_prefix) DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.manual_charge_official_api_prevalidate(p_dispatch_id uuid)
 RETURNS TABLE(ok boolean, reason text, estimated_cost_usd numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_dispatch RECORD;
  v_lead RECORD;
  v_connection RECORD;
  v_provider text;
  v_last_inbound_at timestamptz;
  v_within_window boolean;
  v_template RECORD;
  v_purpose text;
  v_category text;
  v_market text;
  v_rate RECORD;
  v_budget RECORD;
  v_spent_today numeric;
  -- Margem para a janela não expirar entre a checagem e o aceite do
  -- provider (a checagem roda imediatamente antes do envio, mas o
  -- envio em si leva segundos).
  v_window_safety interval := interval '10 minutes';
BEGIN
  SELECT * INTO v_dispatch FROM public.manual_charge_dispatches WHERE id = p_dispatch_id;
  IF v_dispatch IS NULL THEN
    RETURN QUERY SELECT false, 'dispatch_not_found'::text, NULL::numeric; RETURN;
  END IF;

  SELECT * INTO v_connection FROM public.evolution_instances WHERE id = v_dispatch.connection_id;
  IF v_connection IS NULL THEN
    RETURN QUERY SELECT false, 'connection_not_found'::text, NULL::numeric; RETURN;
  END IF;

  -- Mesma regra de _shared/whatsapp-provider/resolve.ts.
  v_provider := COALESCE(NULLIF(btrim(v_connection.provider), ''), 'uazapi');
  IF v_provider = 'uazapi' THEN
    -- UazAPI não é cobrada por mensagem pela Meta: sem checagens desta
    -- função. (Custo de infraestrutura não é modelado aqui.)
    RETURN QUERY SELECT true, NULL::text, 0::numeric; RETURN;
  ELSIF v_provider <> 'meta_cloud' THEN
    RETURN QUERY SELECT false, ('unknown_provider:' || v_provider)::text, NULL::numeric; RETURN;
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = v_dispatch.lead_id;

  IF v_lead.whatsapp_official_consent IS NOT TRUE THEN
    RETURN QUERY SELECT false, 'consent_not_captured'::text, NULL::numeric; RETURN;
  END IF;

  -- Janela: última mensagem DO LEAD (inbound/visitor) para ESTA conexão
  -- (número empresarial). Mensagens do negócio -- inclusive templates --
  -- nunca contam. Ordem pela hora nativa do provider quando existir.
  SELECT max(COALESCE(wm.provider_occurred_at, wm.created_at)) INTO v_last_inbound_at
  FROM public.webchat_conversations wc
  JOIN public.webchat_messages wm ON wm.conversation_id = wc.id
  WHERE wc.lead_id = v_dispatch.lead_id
    AND wc.organization_id = v_dispatch.organization_id
    AND wc.evolution_instance_id = v_dispatch.connection_id
    AND wm.direction = 'inbound' AND wm.sender_type = 'visitor';

  v_within_window := v_last_inbound_at IS NOT NULL
    AND v_last_inbound_at + interval '24 hours' > clock_timestamp() + v_window_safety;

  IF v_within_window THEN
    v_category := 'SERVICE';
  ELSE
    v_purpose := CASE v_dispatch.charge_kind
      WHEN 'voluntary_contribution_reminder' THEN 'voluntary_contribution_reminder'
      ELSE 'payment_reminder_transactional'
    END;

    SELECT * INTO v_template
    FROM public.manual_charge_templates t
    WHERE t.organization_id = v_dispatch.organization_id
      AND t.status = 'approved'
      AND t.meta_assigned_category IS NOT NULL
      AND t.purpose = v_purpose
      AND v_lead.preferred_locale IS NOT NULL
      AND (lower(replace(t.locale, '_', '-')) = lower(v_lead.preferred_locale)
           OR lower(replace(t.locale, '_', '-')) = lower(split_part(v_lead.preferred_locale, '-', 1)))
    ORDER BY (lower(replace(t.locale, '_', '-')) = lower(v_lead.preferred_locale)) DESC, t.updated_at DESC
    LIMIT 1;

    IF v_template IS NULL THEN
      RETURN QUERY SELECT false, 'no_compatible_approved_template'::text, NULL::numeric; RETURN;
    END IF;
    v_category := v_template.meta_assigned_category;
  END IF;

  v_market := public.manual_charge_official_market_prefix(v_lead.phone_normalized);
  SELECT * INTO v_rate
  FROM public.manual_charge_official_rate_card r
  WHERE r.market_ddi_prefix = v_market
    AND r.category = v_category
    AND r.currency = 'USD'
    AND r.approved_at IS NOT NULL
    AND r.effective_from <= current_date
    AND (r.effective_until IS NULL OR r.effective_until >= current_date)
  ORDER BY r.effective_from DESC
  LIMIT 1;

  IF v_rate IS NULL THEN
    RETURN QUERY SELECT false, ('no_approved_rate:' || COALESCE(v_market, '?') || ':' || v_category)::text, NULL::numeric; RETURN;
  END IF;

  SELECT * INTO v_budget FROM public.manual_charge_budget_config WHERE organization_id = v_dispatch.organization_id;
  IF v_budget IS NULL OR v_budget.approved IS NOT TRUE THEN
    RETURN QUERY SELECT false, 'budget_not_approved'::text, v_rate.rate; RETURN;
  END IF;

  SELECT COALESCE(sum(amount_usd), 0) INTO v_spent_today
  FROM public.manual_charge_budget_ledger
  WHERE organization_id = v_dispatch.organization_id AND created_at::date = current_date;

  IF v_spent_today + v_rate.rate > v_budget.daily_cap_usd THEN
    RETURN QUERY SELECT false, 'budget_exhausted_for_today'::text, v_rate.rate; RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text, v_rate.rate;
END;
$function$;

COMMENT ON FUNCTION public.manual_charge_official_api_prevalidate IS
  'CORRIGIDO 20260924002529: usa evolution_instances.provider (fonte única, mesma regra do resolver). Janela por lead+conexão, só mensagens do lead, margem de 10 min. Fora da janela: template aprovado com categoria ATRIBUÍDA pela Meta, propósito conforme charge_kind, idioma do lead. Tarifa vem da rate card aprovada (vazia => bloqueia). Só LÊ o orçamento -- a reserva atômica é manual_charge_official_reserve_budget.';

REVOKE ALL ON FUNCTION public.manual_charge_official_api_prevalidate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_official_api_prevalidate(uuid) TO service_role;

ALTER TABLE public.evolution_instances DROP COLUMN provider_type;

CREATE FUNCTION public.manual_charge_official_reserve_budget(
  p_dispatch_id uuid,
  p_attempt_id uuid
) RETURNS TABLE(ok boolean, reason text, amount_usd numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_dispatch RECORD;
  v_check RECORD;
  v_existing numeric;
  v_spent_today numeric;
  v_cap numeric;
BEGIN
  SELECT * INTO v_dispatch FROM public.manual_charge_dispatches WHERE id = p_dispatch_id;
  IF v_dispatch IS NULL THEN
    RETURN QUERY SELECT false, 'dispatch_not_found'::text, NULL::numeric; RETURN;
  END IF;

  -- Serializa TODA reserva da organização no dia -- duas tentativas
  -- concorrentes nunca somam acima do teto aprovado.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_dispatch.organization_id::text || ':budget:' || current_date::text, 0));

  SELECT l.amount_usd INTO v_existing FROM public.manual_charge_budget_ledger l
  WHERE l.attempt_id = p_attempt_id AND l.entry_type = 'estimate';
  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT true, 'already_reserved'::text, v_existing; RETURN;
  END IF;

  SELECT o.ok, o.reason, o.estimated_cost_usd INTO v_check
  FROM public.manual_charge_official_api_prevalidate(p_dispatch_id) o;
  IF v_check.ok IS NOT TRUE THEN
    RETURN QUERY SELECT false, v_check.reason, NULL::numeric; RETURN;
  END IF;
  IF COALESCE(v_check.estimated_cost_usd, 0) = 0 THEN
    -- Conexão não cobrada pela Meta (UazAPI) -- nada a reservar.
    RETURN QUERY SELECT true, 'no_charge'::text, 0::numeric; RETURN;
  END IF;

  -- Re-lê o gasto sob o lock (a checagem acima rodou antes do lock ser
  -- relevante para esta transação -- aqui é a leitura que vale).
  SELECT COALESCE(sum(l.amount_usd), 0) INTO v_spent_today
  FROM public.manual_charge_budget_ledger l
  WHERE l.organization_id = v_dispatch.organization_id AND l.created_at::date = current_date;
  SELECT b.daily_cap_usd INTO v_cap FROM public.manual_charge_budget_config b
  WHERE b.organization_id = v_dispatch.organization_id AND b.approved;

  IF v_cap IS NULL OR v_spent_today + v_check.estimated_cost_usd > v_cap THEN
    RETURN QUERY SELECT false, 'budget_exhausted_for_today'::text, NULL::numeric; RETURN;
  END IF;

  INSERT INTO public.manual_charge_budget_ledger
    (organization_id, dispatch_id, attempt_id, entry_type, amount_usd, currency, provider)
  VALUES (v_dispatch.organization_id, p_dispatch_id, p_attempt_id, 'estimate', v_check.estimated_cost_usd, 'USD', 'meta_cloud');

  RETURN QUERY SELECT true, 'reserved'::text, v_check.estimated_cost_usd;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_official_reserve_budget IS
  'Reserva ATÔMICA de orçamento por tentativa (lock por organização+dia; idempotente por attempt_id). Chamada pelo worker depois do claim e antes da fronteira do provider -- sem reserva, não há envio pago. entry_type=estimate; o confirmado vem do webhook de entrega (fora desta etapa).';

REVOKE ALL ON FUNCTION public.manual_charge_official_reserve_budget(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_official_reserve_budget(uuid, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 4) Fuso e idioma: proveniências separadas; telefone nunca decide
--    idioma; DDI sozinho nunca decide fuso de país com vários fusos.
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS locale_source text
    CHECK (locale_source IS NULL OR locale_source IN ('explicit', 'conversation_detected')),
  ADD COLUMN IF NOT EXISTS locale_confidence numeric
    CHECK (locale_confidence IS NULL OR (locale_confidence >= 0 AND locale_confidence <= 1));

ALTER TABLE public.leads DROP CONSTRAINT leads_timezone_source_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_timezone_source_check
  CHECK (timezone_source IS NULL OR timezone_source IN (
    'explicit', 'phone_area_code', 'country_single_timezone',
    -- legados (migration 20260923200304) -- tratados como INCERTOS:
    'conversation_detected', 'country_hint'
  ));

COMMENT ON COLUMN public.leads.timezone_source IS
  'Proveniência do FUSO: explicit (informado), phone_area_code (DDD brasileiro de estado com fuso único), country_single_timezone (país com um único fuso). conversation_detected/country_hint são valores legados de 20260923200304 e contam como incertos -- nunca liberam envio.';
COMMENT ON COLUMN public.leads.locale_source IS
  'Proveniência do IDIOMA: explicit ou conversation_detected. O telefone nunca define idioma.';

-- DDD -> fuso. Determinístico por estado (ANATEL/IANA). DDD 97 (oeste do
-- Amazonas) cobre áreas em UTC-4 e UTC-5 -> fica de fora de propósito
-- (sem linha => incerto => revisão). DDD 81 inclui Fernando de Noronha
-- (UTC-2) -> confiança 0.95 (acima do mínimo, abaixo de certeza).
CREATE TABLE public.manual_charge_br_ddd_timezones (
  ddd text PRIMARY KEY CHECK (ddd ~ '^[1-9][0-9]$'),
  timezone text NOT NULL,
  confidence numeric NOT NULL CHECK (confidence > 0 AND confidence <= 1),
  note text
);

INSERT INTO public.manual_charge_br_ddd_timezones (ddd, timezone, confidence, note)
SELECT d, tz, conf, note FROM (VALUES
  -- SP
  ('11','America/Sao_Paulo',1,NULL),('12','America/Sao_Paulo',1,NULL),('13','America/Sao_Paulo',1,NULL),('14','America/Sao_Paulo',1,NULL),
  ('15','America/Sao_Paulo',1,NULL),('16','America/Sao_Paulo',1,NULL),('17','America/Sao_Paulo',1,NULL),('18','America/Sao_Paulo',1,NULL),('19','America/Sao_Paulo',1,NULL),
  -- RJ / ES
  ('21','America/Sao_Paulo',1,NULL),('22','America/Sao_Paulo',1,NULL),('24','America/Sao_Paulo',1,NULL),('27','America/Sao_Paulo',1,NULL),('28','America/Sao_Paulo',1,NULL),
  -- MG
  ('31','America/Sao_Paulo',1,NULL),('32','America/Sao_Paulo',1,NULL),('33','America/Sao_Paulo',1,NULL),('34','America/Sao_Paulo',1,NULL),
  ('35','America/Sao_Paulo',1,NULL),('37','America/Sao_Paulo',1,NULL),('38','America/Sao_Paulo',1,NULL),
  -- PR / SC / RS
  ('41','America/Sao_Paulo',1,NULL),('42','America/Sao_Paulo',1,NULL),('43','America/Sao_Paulo',1,NULL),('44','America/Sao_Paulo',1,NULL),
  ('45','America/Sao_Paulo',1,NULL),('46','America/Sao_Paulo',1,NULL),('47','America/Sao_Paulo',1,NULL),('48','America/Sao_Paulo',1,NULL),('49','America/Sao_Paulo',1,NULL),
  ('51','America/Sao_Paulo',1,NULL),('53','America/Sao_Paulo',1,NULL),('54','America/Sao_Paulo',1,NULL),('55','America/Sao_Paulo',1,NULL),
  -- DF / GO / TO / MT / MS / AC / RO
  ('61','America/Sao_Paulo',1,NULL),('62','America/Sao_Paulo',1,NULL),('64','America/Sao_Paulo',1,NULL),('63','America/Araguaina',1,NULL),
  ('65','America/Cuiaba',1,NULL),('66','America/Cuiaba',1,NULL),('67','America/Campo_Grande',1,NULL),
  ('68','America/Rio_Branco',1,NULL),('69','America/Porto_Velho',1,NULL),
  -- BA / SE / PE / AL / PB / RN / CE / PI
  ('71','America/Bahia',1,NULL),('73','America/Bahia',1,NULL),('74','America/Bahia',1,NULL),('75','America/Bahia',1,NULL),('77','America/Bahia',1,NULL),
  ('79','America/Maceio',1,NULL),
  ('81','America/Recife',0.95,'inclui Fernando de Noronha (UTC-2)'),('87','America/Recife',1,NULL),
  ('82','America/Maceio',1,NULL),('83','America/Fortaleza',1,NULL),('84','America/Fortaleza',1,NULL),
  ('85','America/Fortaleza',1,NULL),('88','America/Fortaleza',1,NULL),('86','America/Fortaleza',1,NULL),('89','America/Fortaleza',1,NULL),
  -- PA / AM / RR / AP / MA
  ('91','America/Belem',1,NULL),('93','America/Santarem',1,NULL),('94','America/Belem',1,NULL),
  ('92','America/Manaus',1,NULL),('95','America/Boa_Vista',1,NULL),('96','America/Belem',1,NULL),
  ('98','America/Fortaleza',1,NULL),('99','America/Fortaleza',1,NULL)
) AS v(d, tz, conf, note);

COMMENT ON TABLE public.manual_charge_br_ddd_timezones IS
  'DDD brasileiro -> fuso IANA. DDD 97 ausente de propósito (dois fusos). Número portado entre estados mantém o DDD de origem -- limitação conhecida; a evidência explícita/da conversa sempre prevalece.';

REVOKE ALL ON public.manual_charge_br_ddd_timezones FROM PUBLIC, anon;
GRANT SELECT ON public.manual_charge_br_ddd_timezones TO authenticated, service_role;

ALTER TABLE public.manual_charge_country_defaults
  ADD COLUMN single_timezone boolean NOT NULL DEFAULT false;

UPDATE public.manual_charge_country_defaults SET single_timezone = true WHERE ddi_prefix IN ('54', '57', '51');
-- 55 (Brasil) resolvido por DDD; 1, 52, 56, 34 têm vários fusos -> nunca
-- resolvidos só pelo DDI.

COMMENT ON COLUMN public.manual_charge_country_defaults.default_locale IS
  'Só informativo. NUNCA aplicado ao lead -- o telefone não define idioma.';

CREATE OR REPLACE FUNCTION public.manual_charge_resolve_phone_timezone(p_phone_normalized text)
RETURNS TABLE(timezone text, source text, confidence numeric)
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_ddd text;
  v_row RECORD;
  v_country RECORD;
BEGIN
  IF p_phone_normalized IS NULL THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::numeric; RETURN;
  END IF;

  IF p_phone_normalized ~ '^55[1-9][0-9][0-9]{8,9}$' THEN
    v_ddd := substring(p_phone_normalized from 3 for 2);
    SELECT * INTO v_row FROM public.manual_charge_br_ddd_timezones WHERE ddd = v_ddd;
    -- FOUND, não "v_row IS NOT NULL": com `note` NULL o teste de record
    -- seria falso mesmo com linha encontrada.
    IF FOUND THEN
      RETURN QUERY SELECT v_row.timezone, 'phone_area_code'::text, v_row.confidence; RETURN;
    END IF;
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::numeric; RETURN;
  END IF;

  SELECT * INTO v_country FROM public.manual_charge_country_defaults
  WHERE p_phone_normalized LIKE ddi_prefix || '%'
  ORDER BY length(ddi_prefix) DESC LIMIT 1;

  IF FOUND AND v_country.single_timezone THEN
    RETURN QUERY SELECT v_country.default_timezone, 'country_single_timezone'::text, 0.9::numeric; RETURN;
  END IF;

  RETURN QUERY SELECT NULL::text, NULL::text, NULL::numeric;
END;
$$;

REVOKE ALL ON FUNCTION public.manual_charge_resolve_phone_timezone(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manual_charge_resolve_phone_timezone(text) TO authenticated, service_role;

-- Certeza exigida para ENVIAR (não só para exibir):
--   fuso: explícito, ou confiança >= 0.9 de fonte aceita;
--   idioma: explícito, ou detectado na conversa com confiança >= 0.7.
CREATE OR REPLACE FUNCTION public.manual_charge_lead_timezone_certain(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT COALESCE((
    SELECT l.preferred_timezone IS NOT NULL AND (
      l.timezone_source = 'explicit'
      OR (l.timezone_source IN ('phone_area_code', 'country_single_timezone') AND COALESCE(l.timezone_confidence, 0) >= 0.9)
    )
    FROM public.leads l WHERE l.id = p_lead_id
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.manual_charge_lead_locale_known(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT COALESCE((
    SELECT l.preferred_locale IS NOT NULL AND (
      l.locale_source = 'explicit'
      OR (l.locale_source = 'conversation_detected' AND COALESCE(l.locale_confidence, 0) >= 0.7)
    )
    FROM public.leads l WHERE l.id = p_lead_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public.manual_charge_lead_timezone_certain(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.manual_charge_lead_locale_known(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manual_charge_lead_timezone_certain(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manual_charge_lead_locale_known(uuid) TO authenticated, service_role;

-- Detector heurístico (20260923200304) corrigido: "pago", "vale", "ya" e
-- "puede ser" existem em português e marcavam "pago dia 30" como espanhol
-- com confiança 0.75 (acima do mínimo de envio). Agora: só marcadores
-- exclusivos de cada idioma, e UM marcador sozinho fica abaixo do mínimo
-- (0.6) -- a heurística só decide com dois marcadores; o caminho
-- principal é o idioma informado pelo classificador estruturado.
CREATE OR REPLACE FUNCTION public.manual_charge_detect_language_from_text(p_content text)
 RETURNS TABLE(locale text, confidence numeric)
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_lower text := lower(COALESCE(p_content, ''));
  v_pt_hits int := 0;
  v_es_hits int := 0;
BEGIN
  IF v_lower ~ '\y(obrigad[oa]|você|voce|não|então|também|beleza|tá bom)\y' THEN v_pt_hits := v_pt_hits + 1; END IF;
  IF v_lower ~ '\y(vou pagar|consigo|semana que vem|amanhã|dia\s+\d+)\y' THEN v_pt_hits := v_pt_hits + 1; END IF;

  IF v_lower ~ '\y(gracias|usted|entonces|también|mañana|vale la pena)\y' THEN v_es_hits := v_es_hits + 1; END IF;
  IF v_lower ~ '\y(voy a pagar|no puedo|está bien|la semana que viene|día\s+\d+)\y' THEN v_es_hits := v_es_hits + 1; END IF;

  IF v_pt_hits > 0 AND v_es_hits = 0 THEN
    RETURN QUERY SELECT 'pt-BR'::text, CASE WHEN v_pt_hits >= 2 THEN 0.85 ELSE 0.6 END::numeric; RETURN;
  ELSIF v_es_hits > 0 AND v_pt_hits = 0 THEN
    RETURN QUERY SELECT 'es'::text, CASE WHEN v_es_hits >= 2 THEN 0.85 ELSE 0.6 END::numeric; RETURN;
  END IF;

  RETURN QUERY SELECT NULL::text, 0::numeric;
END;
$function$;

-- Mesma assinatura/retorno de 20260923200304 -- CREATE OR REPLACE.
-- Retorno: status, locale, timezone, source (= timezone_source),
-- confidence (= timezone_confidence).
CREATE OR REPLACE FUNCTION public.manual_charge_update_lead_locale_timezone(p_lead_id uuid, p_source_message_content text DEFAULT NULL::text)
 RETURNS TABLE(status text, locale text, timezone text, source text, confidence numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_lead RECORD;
  v_detected_locale text;
  v_detected_confidence numeric;
  v_tz RECORD;
  v_status text := 'unchanged';
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF v_lead IS NULL THEN
    RETURN QUERY SELECT 'lead_not_found'::text, NULL::text, NULL::text, NULL::text, NULL::numeric; RETURN;
  END IF;

  -- IDIOMA: só explícito ou conversa. Explícito nunca é sobrescrito.
  IF p_source_message_content IS NOT NULL AND v_lead.locale_source IS DISTINCT FROM 'explicit' THEN
    SELECT d.locale, d.confidence INTO v_detected_locale, v_detected_confidence
    FROM public.manual_charge_detect_language_from_text(p_source_message_content) d;

    IF v_detected_locale IS NOT NULL AND v_detected_confidence >= 0.7 THEN
      UPDATE public.leads
      SET preferred_locale = v_detected_locale,
          locale_source = 'conversation_detected',
          locale_confidence = v_detected_confidence
      WHERE id = p_lead_id;
      v_status := 'locale_from_conversation';
    END IF;
  END IF;

  -- FUSO: explícito nunca é sobrescrito. Senão, só DDD brasileiro ou país
  -- de fuso único; do contrário limpa valores legados incertos
  -- (country_hint/conversation_detected) em vez de mantê-los como se
  -- fossem confiáveis.
  IF v_lead.timezone_source IS DISTINCT FROM 'explicit' THEN
    SELECT * INTO v_tz FROM public.manual_charge_resolve_phone_timezone(v_lead.phone_normalized);
    IF v_tz.timezone IS NOT NULL THEN
      UPDATE public.leads
      SET preferred_timezone = v_tz.timezone, timezone_source = v_tz.source, timezone_confidence = v_tz.confidence
      WHERE id = p_lead_id
        AND (preferred_timezone IS DISTINCT FROM v_tz.timezone OR timezone_source IS DISTINCT FROM v_tz.source);
      IF FOUND THEN v_status := v_status || '+timezone_from_phone'; END IF;
    ELSIF v_lead.timezone_source IN ('country_hint', 'conversation_detected') THEN
      UPDATE public.leads
      SET preferred_timezone = NULL, timezone_source = NULL, timezone_confidence = NULL
      WHERE id = p_lead_id;
      v_status := v_status || '+uncertain_timezone_cleared';
    END IF;
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  RETURN QUERY SELECT v_status, v_lead.preferred_locale, v_lead.preferred_timezone, v_lead.timezone_source, v_lead.timezone_confidence;
END;
$function$;

COMMENT ON FUNCTION public.manual_charge_update_lead_locale_timezone IS
  'CORRIGIDO 20260924002529: idioma só explícito ou da conversa (nunca do telefone); fuso só explícito, DDD brasileiro ou país de fuso único (DDI de país com vários fusos => NULL => revisão). Legados incertos são limpos, nunca mantidos como confiáveis.';

-- Idioma informado por um classificador estruturado (LLM) -- mesma regra:
-- explícito nunca sobrescrito, confiança mínima 0.7.
CREATE FUNCTION public.manual_charge_set_detected_locale(
  p_lead_id uuid, p_locale text, p_confidence numeric
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF p_locale IS NULL OR p_confidence IS NULL OR p_confidence < 0.7 THEN
    RETURN 'ignored_low_confidence';
  END IF;
  IF p_locale !~ '^[a-z]{2}(-[A-Z]{2})?$' THEN
    RETURN 'ignored_invalid_locale';
  END IF;
  UPDATE public.leads
  SET preferred_locale = p_locale, locale_source = 'conversation_detected', locale_confidence = p_confidence
  WHERE id = p_lead_id AND locale_source IS DISTINCT FROM 'explicit';
  RETURN CASE WHEN FOUND THEN 'updated' ELSE 'kept_explicit' END;
END;
$$;

REVOKE ALL ON FUNCTION public.manual_charge_set_detected_locale(uuid, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_set_detected_locale(uuid, text, numeric) TO service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 5) Agendamento e pré-validação: fuso incerto bloqueia; janela perdida
--    não vira envio atrasado; intervalo mínimo por conexão.
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.manual_charge_dispatches DROP CONSTRAINT manual_charge_dispatches_scheduling_status_check;
ALTER TABLE public.manual_charge_dispatches ADD CONSTRAINT manual_charge_dispatches_scheduling_status_check
  CHECK (scheduling_status IN (
    'unscheduled', 'scheduled', 'blocked_no_connection', 'blocked_no_timezone',
    'blocked_timezone_uncertain', 'blocked_capacity', 'blocked_overdue_promise_pending_rule',
    'blocked_ambiguous_order', 'blocked_missed_window'
  ));

-- Valores PROPOSTOS (não aprovados pelo negócio): 90 s entre envios da
-- mesma conexão; até 120 min de atraso tolerado após planned_send_at.
ALTER TABLE public.manual_charge_scheduling_config
  ADD COLUMN min_interval_seconds integer NOT NULL DEFAULT 90 CHECK (min_interval_seconds >= 0),
  ADD COLUMN max_lateness_minutes integer NOT NULL DEFAULT 120 CHECK (max_lateness_minutes > 0);

COMMENT ON COLUMN public.manual_charge_scheduling_config.min_interval_seconds IS
  'PROPOSTO (90 s), pendente de aprovação: intervalo mínimo entre tentativas na mesma conexão.';
COMMENT ON COLUMN public.manual_charge_scheduling_config.max_lateness_minutes IS
  'PROPOSTO (120 min), pendente de aprovação: além disso o envio não sai atrasado -- vira blocked_missed_window para decisão humana.';

CREATE OR REPLACE FUNCTION public.manual_charge_schedule_dispatch(p_dispatch_id uuid)
 RETURNS TABLE(status text, planned_send_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_dispatch RECORD;
  v_lead RECORD;
  v_config RECORD;
  v_global_floor timestamptz := '2026-09-29 09:00:00-03'::timestamptz;
  v_window_minutes integer;
  v_offset_minutes integer;
  v_candidate_date date;
  v_candidate_instant timestamptz;
  v_scheduled_count integer;
  v_days_tried integer := 0;
  v_max_days_lookahead_flexible constant integer := 13;
BEGIN
  SELECT * INTO v_dispatch FROM public.manual_charge_dispatches WHERE id = p_dispatch_id;
  IF v_dispatch IS NULL THEN
    RETURN QUERY SELECT 'dispatch_not_found'::text, NULL::timestamptz; RETURN;
  END IF;

  -- Bloqueio por fuso é sempre reavaliado (o fuso do lead pode ter
  -- mudado: informado, limpo ou incerto); as checagens abaixo bloqueiam
  -- de novo com o motivo atual, se for o caso.
  IF v_dispatch.scheduling_status IN ('blocked_no_timezone', 'blocked_timezone_uncertain') THEN
    UPDATE public.manual_charge_dispatches SET scheduling_status = 'unscheduled'
    WHERE id = p_dispatch_id AND scheduling_status = v_dispatch.scheduling_status;
    v_dispatch.scheduling_status := 'unscheduled';
  END IF;

  IF v_dispatch.scheduling_status <> 'unscheduled' THEN
    RETURN QUERY SELECT v_dispatch.scheduling_status, v_dispatch.planned_send_at; RETURN;
  END IF;

  IF v_dispatch.connection_id IS NULL THEN
    UPDATE public.manual_charge_dispatches SET scheduling_status = 'blocked_no_connection' WHERE id = p_dispatch_id;
    RETURN QUERY SELECT 'blocked_no_connection'::text, NULL::timestamptz; RETURN;
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = v_dispatch.lead_id;
  IF v_lead.preferred_timezone IS NULL THEN
    UPDATE public.manual_charge_dispatches SET scheduling_status = 'blocked_no_timezone' WHERE id = p_dispatch_id;
    RETURN QUERY SELECT 'blocked_no_timezone'::text, NULL::timestamptz; RETURN;
  END IF;

  IF NOT public.manual_charge_lead_timezone_certain(v_dispatch.lead_id) THEN
    UPDATE public.manual_charge_dispatches SET scheduling_status = 'blocked_timezone_uncertain' WHERE id = p_dispatch_id;
    RETURN QUERY SELECT 'blocked_timezone_uncertain'::text, NULL::timestamptz; RETURN;
  END IF;

  IF v_dispatch.agreed_date < '2026-09-29'::date THEN
    UPDATE public.manual_charge_dispatches SET scheduling_status = 'blocked_overdue_promise_pending_rule' WHERE id = p_dispatch_id;
    RETURN QUERY SELECT 'blocked_overdue_promise_pending_rule'::text, NULL::timestamptz; RETURN;
  END IF;

  SELECT * INTO v_config FROM public.manual_charge_scheduling_config WHERE organization_id = v_dispatch.organization_id;
  IF v_config IS NULL THEN
    INSERT INTO public.manual_charge_scheduling_config (organization_id) VALUES (v_dispatch.organization_id)
    ON CONFLICT (organization_id) DO NOTHING;
    SELECT * INTO v_config FROM public.manual_charge_scheduling_config WHERE organization_id = v_dispatch.organization_id;
  END IF;

  v_window_minutes := EXTRACT(EPOCH FROM (v_config.window_end_local - v_config.window_start_local))::integer / 60;
  v_offset_minutes := (('x' || substr(md5(p_dispatch_id::text), 1, 8))::bit(32)::bigint) % v_window_minutes;

  v_candidate_date := v_dispatch.agreed_date;

  LOOP
    v_candidate_instant := GREATEST(
      v_global_floor,
      ((v_candidate_date + v_config.window_start_local)::timestamp AT TIME ZONE v_lead.preferred_timezone)
        + make_interval(mins => v_offset_minutes)
    );

    PERFORM pg_advisory_xact_lock(hashtextextended(
      v_dispatch.connection_id::text || ':' || v_candidate_date::text, 0));

    SELECT count(*) INTO v_scheduled_count
    FROM public.manual_charge_dispatches d2
    WHERE d2.connection_id = v_dispatch.connection_id
      AND d2.scheduling_status = 'scheduled'
      AND (d2.planned_send_at AT TIME ZONE v_lead.preferred_timezone)::date = v_candidate_date;

    IF v_scheduled_count < v_config.daily_cap_per_connection THEN
      EXIT;
    END IF;

    IF COALESCE(v_dispatch.agreed_date_precision, 'exact') = 'exact' THEN
      UPDATE public.manual_charge_dispatches SET scheduling_status = 'blocked_capacity' WHERE id = p_dispatch_id;
      RETURN QUERY SELECT 'blocked_capacity'::text, NULL::timestamptz; RETURN;
    END IF;

    v_candidate_date := v_candidate_date + 1;
    v_days_tried := v_days_tried + 1;
    IF v_days_tried > v_max_days_lookahead_flexible THEN
      UPDATE public.manual_charge_dispatches SET scheduling_status = 'blocked_capacity' WHERE id = p_dispatch_id;
      RETURN QUERY SELECT 'blocked_capacity'::text, NULL::timestamptz; RETURN;
    END IF;
  END LOOP;

  UPDATE public.manual_charge_dispatches
  SET planned_send_at = v_candidate_instant, scheduling_status = 'scheduled'
  WHERE id = p_dispatch_id AND scheduling_status = 'unscheduled'
  RETURNING manual_charge_dispatches.planned_send_at INTO v_candidate_instant;

  IF v_candidate_instant IS NULL THEN
    SELECT d.scheduling_status, d.planned_send_at INTO v_dispatch.scheduling_status, v_candidate_instant
    FROM public.manual_charge_dispatches d WHERE d.id = p_dispatch_id;
    RETURN QUERY SELECT v_dispatch.scheduling_status, v_candidate_instant; RETURN;
  END IF;

  RETURN QUERY SELECT 'scheduled'::text, v_candidate_instant;
END;
$function$;

CREATE OR REPLACE FUNCTION public.manual_charge_prevalidate_send(p_dispatch_id uuid)
 RETURNS TABLE(ok boolean, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_dispatch RECORD;
  v_lead RECORD;
  v_connection RECORD;
  v_config RECORD;
  v_now_local time;
  v_official RECORD;
  v_last_attempt_at timestamptz;
BEGIN
  PERFORM public.manual_charge_evaluate(p_dispatch_id);

  SELECT * INTO v_dispatch FROM public.manual_charge_dispatches WHERE id = p_dispatch_id;
  IF v_dispatch IS NULL THEN
    RETURN QUERY SELECT false, 'dispatch_not_found'::text; RETURN;
  END IF;

  IF v_dispatch.status NOT IN ('eligible', 'reconciled_not_sent') THEN
    RETURN QUERY SELECT false, ('not_eligible:' || v_dispatch.status)::text; RETURN;
  END IF;

  IF v_dispatch.scheduling_status <> 'scheduled' OR v_dispatch.planned_send_at IS NULL THEN
    RETURN QUERY SELECT false, ('scheduling_incomplete:' || v_dispatch.scheduling_status)::text; RETURN;
  END IF;

  IF clock_timestamp() < v_dispatch.planned_send_at THEN
    RETURN QUERY SELECT false, 'before_planned_send_at'::text; RETURN;
  END IF;

  SELECT * INTO v_config FROM public.manual_charge_scheduling_config WHERE organization_id = v_dispatch.organization_id;
  IF v_config IS NULL THEN
    RETURN QUERY SELECT false, 'no_scheduling_config'::text; RETURN;
  END IF;

  -- Janela perdida (worker parado, conexão caída etc.): nunca envia com
  -- atraso grande. Sai da fila para decisão humana.
  IF clock_timestamp() > v_dispatch.planned_send_at + make_interval(mins => v_config.max_lateness_minutes) THEN
    UPDATE public.manual_charge_dispatches SET scheduling_status = 'blocked_missed_window'
    WHERE id = p_dispatch_id AND scheduling_status = 'scheduled';
    RETURN QUERY SELECT false, 'missed_window'::text; RETURN;
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = v_dispatch.lead_id;
  IF v_lead.preferred_timezone IS NULL THEN
    RETURN QUERY SELECT false, 'no_timezone'::text; RETURN;
  END IF;
  IF NOT public.manual_charge_lead_timezone_certain(v_dispatch.lead_id) THEN
    RETURN QUERY SELECT false, 'timezone_uncertain'::text; RETURN;
  END IF;
  IF NOT public.manual_charge_lead_locale_known(v_dispatch.lead_id) THEN
    RETURN QUERY SELECT false, 'locale_unknown'::text; RETURN;
  END IF;

  SELECT * INTO v_connection FROM public.evolution_instances WHERE id = v_dispatch.connection_id;
  IF v_connection IS NULL OR v_connection.status IS DISTINCT FROM 'connected' OR v_connection.is_active IS NOT TRUE THEN
    RETURN QUERY SELECT false, 'connection_unavailable'::text; RETURN;
  END IF;
  IF v_connection.organization_id IS DISTINCT FROM v_dispatch.organization_id THEN
    RETURN QUERY SELECT false, 'connection_organization_mismatch'::text; RETURN;
  END IF;

  v_now_local := (clock_timestamp() AT TIME ZONE v_lead.preferred_timezone)::time;
  IF v_now_local < v_config.window_start_local OR v_now_local > v_config.window_end_local THEN
    RETURN QUERY SELECT false, 'outside_local_window'::text; RETURN;
  END IF;

  SELECT max(a.claimed_at) INTO v_last_attempt_at
  FROM public.manual_charge_send_attempts a
  JOIN public.manual_charge_dispatches d ON d.id = a.dispatch_id
  WHERE d.connection_id = v_dispatch.connection_id;

  IF v_last_attempt_at IS NOT NULL
     AND v_last_attempt_at > clock_timestamp() - make_interval(secs => v_config.min_interval_seconds) THEN
    RETURN QUERY SELECT false, 'connection_rate_limited'::text; RETURN;
  END IF;

  SELECT o.ok, o.reason INTO v_official FROM public.manual_charge_official_api_prevalidate(p_dispatch_id) o;
  IF v_official.ok IS NOT TRUE THEN
    RETURN QUERY SELECT false, ('official_api:' || v_official.reason)::text; RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text;
END;
$function$;

COMMENT ON FUNCTION public.manual_charge_prevalidate_send(uuid) IS
  'Última barreira antes do claim. Além das regras anteriores: fuso precisa ser confiável, idioma conhecido, conexão da mesma organização, intervalo mínimo por conexão e atraso máximo (janela perdida sai da fila). O intervalo por conexão é checado aqui e reforçado pelo worker, que processa uma conexão por vez.';

-- ─────────────────────────────────────────────────────────────────────
-- 6) Roteador: recusa idempotente por mensagem; compromisso voluntário
--    como sinal próprio (mesma assinatura -- CREATE OR REPLACE).
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.manual_charge_record_classified_signal(p_dispatch_id uuid, p_lead_id uuid, p_conversation_id uuid, p_source_message_id uuid, p_signal_type text, p_promised_date date DEFAULT NULL::date, p_raw_excerpt text DEFAULT NULL::text, p_classifier_source text DEFAULT 'rule_v1'::text, p_classifier_version text DEFAULT '1'::text, p_supersedes_fact_id uuid DEFAULT NULL::uuid, p_date_precision text DEFAULT 'exact'::text)
 RETURNS TABLE(routed_to text, outcome text, reference_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_dispatch RECORD;
  v_claim RECORD;
  v_suppression_id uuid;
  v_commitment_id uuid;
  v_fact RECORD;
BEGIN
  SELECT * INTO v_dispatch FROM public.manual_charge_dispatches WHERE id = p_dispatch_id;
  IF v_dispatch IS NULL THEN
    RETURN QUERY SELECT NULL::text, 'dispatch_not_found'::text, NULL::uuid; RETURN;
  END IF;
  IF v_dispatch.lead_id IS DISTINCT FROM p_lead_id THEN
    RETURN QUERY SELECT NULL::text, 'lead_mismatch'::text, NULL::uuid; RETURN;
  END IF;

  IF p_signal_type = 'payment_claimed' THEN
    SELECT c.outcome, c.claim_event_id, c.review_id INTO v_claim
    FROM public.register_payment_claim(v_dispatch.organization_id, p_conversation_id, p_lead_id, p_source_message_id, p_classifier_source) c;
    RETURN QUERY SELECT 'payment_claim'::text, v_claim.outcome, COALESCE(v_claim.claim_event_id, v_claim.review_id);
    RETURN;
  END IF;

  IF p_signal_type = 'refused_contact' THEN
    -- Idempotente por mensagem de origem: reprocessar a mesma mensagem
    -- (reentrega, retry do classificador) nunca cria outro candidato.
    PERFORM pg_advisory_xact_lock(hashtextextended(
      v_dispatch.organization_id::text || ':suppression:' || p_source_message_id::text, 0));

    SELECT s.id INTO v_suppression_id FROM public.manual_charge_suppressions s
    WHERE s.organization_id = v_dispatch.organization_id
      AND s.source_message_id = p_source_message_id
      AND s.scope = 'all_contact'
    LIMIT 1;

    IF v_suppression_id IS NOT NULL THEN
      RETURN QUERY SELECT 'suppression'::text, 'candidate_already_exists'::text, v_suppression_id; RETURN;
    END IF;

    SELECT public.create_suppression_candidate(
      v_dispatch.organization_id, v_dispatch.phone_normalized, 'all_contact', 'stop_contact',
      NULL, NULL, p_conversation_id, p_source_message_id,
      p_classifier_source, NULL, NULL
    ) INTO v_suppression_id;

    RETURN QUERY SELECT 'suppression'::text, 'candidate_created'::text, v_suppression_id;
    RETURN;
  END IF;

  IF p_signal_type = 'voluntary_commitment' THEN
    INSERT INTO public.manual_charge_voluntary_commitments
      (organization_id, lead_id, conversation_id, source_message_id, committed_date, raw_excerpt)
    VALUES (v_dispatch.organization_id, p_lead_id, p_conversation_id, p_source_message_id, p_promised_date, left(p_raw_excerpt, 200))
    ON CONFLICT (organization_id, source_message_id) DO NOTHING
    RETURNING id INTO v_commitment_id;

    -- Com data explícita, a data também vira fato de agendamento -- a
    -- mesma mecânica da dívida. Sem data, nada é agendado (nunca
    -- inventamos data).
    IF p_promised_date IS NOT NULL THEN
      SELECT f.status, f.fact_id INTO v_fact
      FROM public.record_conversation_fact(
        p_dispatch_id, p_lead_id, p_conversation_id, p_source_message_id,
        'promised_date', p_promised_date, p_raw_excerpt, p_classifier_source, p_classifier_version,
        p_supersedes_fact_id, p_date_precision
      ) f;
      RETURN QUERY SELECT 'voluntary_commitment+conversation_fact'::text, v_fact.status, v_fact.fact_id; RETURN;
    END IF;

    RETURN QUERY SELECT 'voluntary_commitment'::text,
      CASE WHEN v_commitment_id IS NULL THEN 'already_recorded' ELSE 'recorded' END, v_commitment_id;
    RETURN;
  END IF;

  IF p_signal_type NOT IN ('promised_date', 'postponement_requested', 'ambiguous', 'no_signal') THEN
    RETURN QUERY SELECT NULL::text, 'unknown_signal_type'::text, NULL::uuid; RETURN;
  END IF;

  SELECT f.status, f.fact_id INTO v_fact
  FROM public.record_conversation_fact(
    p_dispatch_id, p_lead_id, p_conversation_id, p_source_message_id,
    p_signal_type, p_promised_date, p_raw_excerpt, p_classifier_source, p_classifier_version,
    p_supersedes_fact_id, p_date_precision
  ) f;

  RETURN QUERY SELECT 'conversation_fact'::text, v_fact.status, v_fact.fact_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- 7) Decisão de candidato -- função pura, usada igualmente pela prévia
--    (leitura) e pela ingestão (escrita). Nenhum sinal isolado de
--    pagamento/recusa/ambiguidade cria obrigação sem contexto de compra.
-- ─────────────────────────────────────────────────────────────────────

CREATE FUNCTION public.manual_charge_candidate_decision(
  p_has_promise boolean,
  p_has_payment_informed boolean,
  p_has_refused boolean,
  p_has_ambiguous boolean,
  p_has_voluntary boolean,
  p_has_purchase_context boolean,
  p_is_confirmed_paid boolean,
  p_has_existing_dispatch boolean
) RETURNS TABLE(decision text, charge_kind text)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT
    CASE
      WHEN p_has_existing_dispatch THEN 'attach_to_existing'
      WHEN p_is_confirmed_paid THEN 'already_paid_excluded'
      WHEN p_has_voluntary THEN 'create'
      WHEN p_has_promise THEN 'create'
      WHEN (p_has_payment_informed OR p_has_refused OR p_has_ambiguous) AND p_has_purchase_context THEN 'create'
      WHEN p_has_payment_informed OR p_has_refused OR p_has_ambiguous THEN 'skipped_no_obligation_evidence'
      ELSE 'no_signal'
    END,
    CASE
      WHEN p_has_existing_dispatch OR p_is_confirmed_paid THEN NULL
      -- Voluntário tem precedência mesmo quando traz data: "vou
      -- contribuir dia 30" é contribuição, nunca dívida.
      WHEN p_has_voluntary THEN 'voluntary_contribution_reminder'
      WHEN p_has_promise THEN 'debt_reminder'
      WHEN (p_has_payment_informed OR p_has_refused OR p_has_ambiguous) AND p_has_purchase_context THEN 'debt_reminder'
      ELSE NULL
    END;
$$;

COMMENT ON FUNCTION public.manual_charge_candidate_decision IS
  'Regra única de candidatura. existente -> anexa; pago confirmado (purchase_audit success/recognized) -> excluído; compromisso voluntário -> voluntary_contribution_reminder (mesmo com data); promessa explícita -> debt_reminder; pagamento/recusa/ambíguo só criam com contexto de compra; sinal isolado sem contexto -> skipped_no_obligation_evidence.';

GRANT EXECUTE ON FUNCTION public.manual_charge_candidate_decision(boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 8) Fila de classificação (ingestão contínua). Um job por mensagem
--    inbound e versão de classificador; resultado bruto guardado
--    (append-only); aplicação idempotente; ordem por lead garantida.
--    Integração real do projeto: pg_cron -> net.http_post -> Edge
--    Function (mesmo padrão de funnel-resume-cron / funnel-job-runner).
--    O agendamento pg_cron NÃO é criado aqui -- só no runbook.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE public.manual_charge_classification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  source_message_id uuid NOT NULL REFERENCES public.webchat_messages(id) ON DELETE CASCADE,
  message_occurred_at timestamptz NOT NULL,
  classifier_version text NOT NULL CHECK (classifier_version <> ''),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'done', 'failed', 'needs_review')),
  attempts integer NOT NULL DEFAULT 0,
  claim_token uuid,
  claimed_by text,
  claimed_at timestamptz,
  last_error text,
  result_id uuid,
  decision text,
  dispatch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manual_charge_classification_jobs_msg_version_uk
    UNIQUE (organization_id, source_message_id, classifier_version)
);

CREATE INDEX manual_charge_classification_jobs_queue_idx
  ON public.manual_charge_classification_jobs (classifier_version, status, message_occurred_at)
  WHERE status IN ('pending', 'claimed');
CREATE INDEX manual_charge_classification_jobs_lead_idx
  ON public.manual_charge_classification_jobs (lead_id, classifier_version, message_occurred_at);

CREATE TABLE public.manual_charge_classification_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.manual_charge_classification_jobs(id) ON DELETE CASCADE,
  classifier_version text NOT NULL,
  model text,
  prompt_version text,
  raw_output jsonb,
  signals jsonb,
  validation_status text NOT NULL CHECK (validation_status IN ('valid', 'invalid', 'provider_error')),
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX manual_charge_classification_results_job_idx ON public.manual_charge_classification_results (job_id);

CREATE FUNCTION public.manual_charge_classification_results_forbid_update()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  RAISE EXCEPTION 'manual_charge_classification_results is append-only' USING ERRCODE = 'P0014';
END;
$$;

CREATE TRIGGER manual_charge_classification_results_no_update
  BEFORE UPDATE ON public.manual_charge_classification_results
  FOR EACH ROW EXECUTE FUNCTION public.manual_charge_classification_results_forbid_update();

ALTER TABLE public.manual_charge_classification_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_charge_classification_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manual_charge_classification_jobs_org_read" ON public.manual_charge_classification_jobs
  FOR SELECT TO authenticated USING (public.manual_charge_actor_authorized(organization_id));
CREATE POLICY "manual_charge_classification_results_org_read" ON public.manual_charge_classification_results
  FOR SELECT TO authenticated USING (public.manual_charge_actor_authorized(organization_id));
REVOKE ALL ON public.manual_charge_classification_jobs, public.manual_charge_classification_results FROM PUBLIC, anon;
GRANT SELECT ON public.manual_charge_classification_jobs, public.manual_charge_classification_results TO authenticated;
GRANT ALL ON public.manual_charge_classification_jobs, public.manual_charge_classification_results TO service_role;

-- Enfileira mensagens inbound de texto do visitante desde p_since. Rodar
-- de novo só adiciona mensagens novas (UNIQUE por mensagem+versão).
CREATE FUNCTION public.manual_charge_enqueue_classification(
  p_organization_id uuid,
  p_since timestamptz,
  p_classifier_version text,
  p_limit integer DEFAULT 1000
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.manual_charge_classification_jobs
    (organization_id, lead_id, conversation_id, source_message_id, message_occurred_at, classifier_version)
  SELECT wc.organization_id, wc.lead_id, wc.id, wm.id, COALESCE(wm.provider_occurred_at, wm.created_at), p_classifier_version
  FROM public.webchat_conversations wc
  JOIN public.webchat_messages wm ON wm.conversation_id = wc.id
  JOIN public.leads l ON l.id = wc.lead_id AND l.organization_id = wc.organization_id
  WHERE wc.organization_id = p_organization_id
    AND wm.direction = 'inbound' AND wm.sender_type = 'visitor'
    AND COALESCE(wm.is_deleted, false) = false
    AND btrim(COALESCE(wm.content, '')) <> ''
    AND COALESCE(wm.provider_occurred_at, wm.created_at) >= p_since
    AND NOT EXISTS (
      SELECT 1 FROM public.manual_charge_classification_jobs j
      WHERE j.organization_id = p_organization_id AND j.source_message_id = wm.id
        AND j.classifier_version = p_classifier_version
    )
  ORDER BY COALESCE(wm.provider_occurred_at, wm.created_at), wm.id
  LIMIT p_limit
  ON CONFLICT ON CONSTRAINT manual_charge_classification_jobs_msg_version_uk DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Reivindica jobs: só o mais antigo pendente de cada lead, e nenhum lead
-- com job em andamento (ordem cronológica por lead, sem corrida entre
-- mensagens do mesmo lead). Lease expirado volta a ser reivindicável;
-- após 3 tentativas vira 'failed'.
CREATE FUNCTION public.manual_charge_claim_classification_jobs(
  p_classifier_version text,
  p_worker text,
  p_limit integer DEFAULT 20,
  p_lease_seconds integer DEFAULT 600,
  p_organization_id uuid DEFAULT NULL
) RETURNS TABLE(
  job_id uuid, claim_token uuid, organization_id uuid, lead_id uuid, conversation_id uuid,
  source_message_id uuid, message_occurred_at timestamptz, content text, context jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.manual_charge_classification_jobs j
  SET status = 'failed', last_error = COALESCE(j.last_error, 'lease_expired_after_max_attempts'), updated_at = clock_timestamp()
  WHERE j.classifier_version = p_classifier_version
    AND j.status = 'claimed' AND j.attempts >= 3
    AND j.claimed_at < clock_timestamp() - make_interval(secs => p_lease_seconds);

  RETURN QUERY
  WITH candidates AS (
    SELECT j.id
    FROM public.manual_charge_classification_jobs j
    WHERE j.classifier_version = p_classifier_version
      AND (p_organization_id IS NULL OR j.organization_id = p_organization_id)
      AND (j.status = 'pending'
           OR (j.status = 'claimed' AND j.claimed_at < clock_timestamp() - make_interval(secs => p_lease_seconds)))
      AND j.attempts < 3
      AND NOT EXISTS (
        SELECT 1 FROM public.manual_charge_classification_jobs j2
        WHERE j2.lead_id = j.lead_id AND j2.classifier_version = j.classifier_version AND j2.id <> j.id
          AND (
            (j2.status = 'claimed' AND j2.claimed_at >= clock_timestamp() - make_interval(secs => p_lease_seconds))
            OR (j2.status IN ('pending', 'claimed')
                AND (j2.message_occurred_at, j2.id) < (j.message_occurred_at, j.id))
          )
      )
    ORDER BY j.message_occurred_at, j.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.manual_charge_classification_jobs j
    SET status = 'claimed', claim_token = gen_random_uuid(), claimed_by = p_worker,
        claimed_at = clock_timestamp(), attempts = j.attempts + 1, updated_at = clock_timestamp()
    FROM candidates c
    WHERE j.id = c.id
    RETURNING j.*
  )
  SELECT c.id, c.claim_token, c.organization_id, c.lead_id, c.conversation_id,
         c.source_message_id, c.message_occurred_at, wm.content,
         (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'id', x.id, 'direction', x.direction, 'sender_type', x.sender_type,
                    'content', left(x.content, 1000), 'occurred_at', x.occurred_at
                  ) ORDER BY x.occurred_at, x.id), '[]'::jsonb)
          FROM (
            SELECT m.id, m.direction, m.sender_type, m.content,
                   COALESCE(m.provider_occurred_at, m.created_at) AS occurred_at
            FROM public.webchat_messages m
            WHERE m.conversation_id = c.conversation_id
              AND COALESCE(m.is_deleted, false) = false
              AND COALESCE(m.provider_occurred_at, m.created_at) <= c.message_occurred_at
              AND m.id <> c.source_message_id
            ORDER BY COALESCE(m.provider_occurred_at, m.created_at) DESC, m.id DESC
            LIMIT 8
          ) x)
  FROM claimed c
  JOIN public.webchat_messages wm ON wm.id = c.source_message_id;
END;
$$;

-- Falha de provedor (rede, timeout, 5xx): volta para a fila até 3
-- tentativas. Nunca aplica sinal nenhum.
CREATE FUNCTION public.manual_charge_fail_classification_job(
  p_job_id uuid, p_claim_token uuid, p_error text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_job RECORD;
BEGIN
  SELECT * INTO v_job FROM public.manual_charge_classification_jobs WHERE id = p_job_id FOR UPDATE;
  IF v_job IS NULL THEN RETURN 'job_not_found'; END IF;
  IF v_job.status <> 'claimed' OR v_job.claim_token IS DISTINCT FROM p_claim_token THEN RETURN 'claim_mismatch'; END IF;

  INSERT INTO public.manual_charge_classification_results
    (organization_id, job_id, classifier_version, validation_status, validation_errors)
  VALUES (v_job.organization_id, p_job_id, v_job.classifier_version, 'provider_error',
          jsonb_build_array(left(COALESCE(p_error, 'unknown'), 500)));

  UPDATE public.manual_charge_classification_jobs
  SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
      claim_token = NULL, claimed_by = NULL, claimed_at = NULL,
      last_error = left(COALESCE(p_error, 'unknown'), 500), updated_at = clock_timestamp()
  WHERE id = p_job_id;

  RETURN CASE WHEN v_job.attempts >= 3 THEN 'failed' ELSE 'requeued' END;
END;
$$;

-- Aplica a saída estruturada de um classificador a UM job.
-- Defesa em profundidade: mesmo validada no worker, a saída é revalidada
-- aqui (tipos permitidos, evidência literal na mensagem, datas, confiança).
-- Qualquer falha -> needs_review, nenhum sinal aplicado.
CREATE FUNCTION public.manual_charge_apply_classified_message(
  p_job_id uuid,
  p_claim_token uuid,
  p_signals jsonb,
  p_model text,
  p_prompt_version text,
  p_raw_output jsonb,
  p_validation_status text,
  p_validation_errors jsonb DEFAULT '[]'::jsonb,
  p_campaign_key text DEFAULT 'sept2026',
  p_detected_locale text DEFAULT NULL,
  p_locale_confidence numeric DEFAULT NULL
) RETURNS TABLE(status text, decision text, dispatch_id uuid, charge_kind text, detail jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_job RECORD;
  v_msg RECORD;
  v_lead RECORD;
  v_errors jsonb := COALESCE(p_validation_errors, '[]'::jsonb);
  v_sig jsonb;
  v_type text;
  v_evidence text;
  v_conf numeric;
  v_date date;
  v_precision text;
  v_norm_content text;
  v_result_id uuid;
  v_has_promise boolean := false;
  v_has_payment boolean := false;
  v_has_refused boolean := false;
  v_has_ambiguous boolean := false;
  v_has_voluntary boolean := false;
  v_has_purchase_context boolean;
  v_is_paid boolean;
  v_existing_id uuid;
  v_decision RECORD;
  v_create RECORD;
  v_dispatch_id uuid;
  v_dispatch RECORD;
  v_pa_id uuid;
  v_route RECORD;
  v_detail jsonb := '[]'::jsonb;
  v_needs_review boolean := false;
  v_reopen RECORD;
  v_capture text;
  v_final_status text;
BEGIN
  SELECT * INTO v_job FROM public.manual_charge_classification_jobs WHERE id = p_job_id FOR UPDATE;
  IF v_job IS NULL THEN
    RETURN QUERY SELECT 'job_not_found'::text, NULL::text, NULL::uuid, NULL::text, NULL::jsonb; RETURN;
  END IF;
  IF v_job.status IN ('done', 'needs_review', 'failed') THEN
    RETURN QUERY SELECT ('already_finalized:' || v_job.status)::text, v_job.decision, v_job.dispatch_id, NULL::text, NULL::jsonb; RETURN;
  END IF;
  IF v_job.status <> 'claimed' OR v_job.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN QUERY SELECT 'claim_mismatch'::text, NULL::text, NULL::uuid, NULL::text, NULL::jsonb; RETURN;
  END IF;

  SELECT wm.id, wm.content, wc.id AS conversation_id, wc.organization_id, wc.lead_id
  INTO v_msg
  FROM public.webchat_messages wm
  JOIN public.webchat_conversations wc ON wc.id = wm.conversation_id
  WHERE wm.id = v_job.source_message_id;

  IF v_msg IS NULL OR v_msg.organization_id IS DISTINCT FROM v_job.organization_id
     OR v_msg.lead_id IS DISTINCT FROM v_job.lead_id OR v_msg.conversation_id IS DISTINCT FROM v_job.conversation_id THEN
    v_errors := v_errors || jsonb_build_array('source_message_scope_mismatch');
  END IF;

  SELECT * INTO v_lead FROM public.leads l WHERE l.id = v_job.lead_id AND l.organization_id = v_job.organization_id;
  IF v_lead IS NULL THEN
    v_errors := v_errors || jsonb_build_array('lead_not_in_organization');
  END IF;

  IF jsonb_typeof(p_signals) IS DISTINCT FROM 'array' THEN
    v_errors := v_errors || jsonb_build_array('signals_not_array');
  ELSIF v_msg IS NOT NULL THEN
    v_norm_content := regexp_replace(lower(v_msg.content), '\s+', ' ', 'g');
    FOR v_sig IN SELECT * FROM jsonb_array_elements(p_signals) LOOP
      v_type := v_sig->>'type';
      v_evidence := v_sig->>'evidence';
      v_date := NULL;
      v_precision := v_sig->>'date_precision';

      IF v_type IS NULL OR v_type NOT IN ('promised_date', 'payment_informed', 'refused_contact',
          'voluntary_commitment', 'postponement_requested', 'ambiguous', 'no_signal') THEN
        v_errors := v_errors || jsonb_build_array('unknown_signal_type:' || COALESCE(v_type, 'null'));
        CONTINUE;
      END IF;

      IF v_type <> 'no_signal' THEN
        IF v_evidence IS NULL OR btrim(v_evidence) = ''
           OR position(regexp_replace(lower(v_evidence), '\s+', ' ', 'g') IN v_norm_content) = 0 THEN
          v_errors := v_errors || jsonb_build_array('evidence_not_in_message:' || v_type);
        END IF;
      END IF;

      BEGIN
        v_conf := (v_sig->>'confidence')::numeric;
      EXCEPTION WHEN OTHERS THEN
        v_conf := NULL;
      END;
      IF v_conf IS NULL OR v_conf < 0 OR v_conf > 1 THEN
        v_errors := v_errors || jsonb_build_array('invalid_confidence:' || v_type);
      ELSIF v_type IN ('promised_date', 'payment_informed', 'refused_contact', 'voluntary_commitment') AND v_conf < 0.7 THEN
        v_errors := v_errors || jsonb_build_array('low_confidence_decisive_signal:' || v_type);
      END IF;

      IF v_sig ? 'promised_date' AND v_sig->>'promised_date' IS NOT NULL THEN
        BEGIN
          v_date := (v_sig->>'promised_date')::date;
        EXCEPTION WHEN OTHERS THEN
          v_errors := v_errors || jsonb_build_array('invalid_date:' || v_type);
        END;
        IF v_date IS NOT NULL AND (
             v_date < (v_job.message_occurred_at AT TIME ZONE 'UTC')::date - 45
          OR v_date > (v_job.message_occurred_at AT TIME ZONE 'UTC')::date + 366) THEN
          v_errors := v_errors || jsonb_build_array('date_out_of_range:' || v_type);
        END IF;
        IF v_type NOT IN ('promised_date', 'voluntary_commitment') THEN
          v_errors := v_errors || jsonb_build_array('date_not_allowed_for:' || v_type);
        END IF;
      END IF;

      IF v_type = 'promised_date' AND (v_sig->>'promised_date') IS NULL THEN
        v_errors := v_errors || jsonb_build_array('promised_date_missing_date');
      END IF;
      IF v_precision IS NOT NULL AND v_precision NOT IN ('exact', 'flexible_period_start') THEN
        v_errors := v_errors || jsonb_build_array('invalid_date_precision:' || v_type);
      END IF;

      v_has_promise := v_has_promise OR v_type = 'promised_date';
      v_has_payment := v_has_payment OR v_type = 'payment_informed';
      v_has_refused := v_has_refused OR v_type = 'refused_contact';
      v_has_ambiguous := v_has_ambiguous OR v_type IN ('ambiguous', 'postponement_requested');
      v_has_voluntary := v_has_voluntary OR v_type = 'voluntary_commitment';
    END LOOP;
  END IF;

  IF p_validation_status <> 'valid' OR jsonb_array_length(v_errors) > 0 THEN
    INSERT INTO public.manual_charge_classification_results
      (organization_id, job_id, classifier_version, model, prompt_version, raw_output, signals, validation_status, validation_errors)
    VALUES (v_job.organization_id, p_job_id, v_job.classifier_version, p_model, p_prompt_version, p_raw_output, p_signals, 'invalid', v_errors)
    RETURNING id INTO v_result_id;

    UPDATE public.manual_charge_classification_jobs
    SET status = 'needs_review', result_id = v_result_id, decision = 'invalid_classifier_output',
        claim_token = NULL, updated_at = clock_timestamp()
    WHERE id = p_job_id;

    RETURN QUERY SELECT 'needs_review'::text, 'invalid_classifier_output'::text, NULL::uuid, NULL::text, v_errors; RETURN;
  END IF;

  INSERT INTO public.manual_charge_classification_results
    (organization_id, job_id, classifier_version, model, prompt_version, raw_output, signals, validation_status, validation_errors)
  VALUES (v_job.organization_id, p_job_id, v_job.classifier_version, p_model, p_prompt_version, p_raw_output, p_signals, 'valid', '[]'::jsonb)
  RETURNING id INTO v_result_id;

  -- Idioma detectado pelo classificador (nunca sobrescreve explícito).
  IF p_detected_locale IS NOT NULL THEN
    PERFORM public.manual_charge_set_detected_locale(v_job.lead_id, p_detected_locale, p_locale_confidence);
  END IF;

  -- Serializa decisões do mesmo lead+campanha (dois jobs do mesmo lead já
  -- não rodam juntos pela fila; isto cobre chamadas manuais concorrentes).
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_job.organization_id::text || ':charge-candidate:' || v_lead.phone_normalized || ':' || p_campaign_key, 0));

  SELECT d.id INTO v_existing_id FROM public.manual_charge_dispatches d
  WHERE d.organization_id = v_job.organization_id AND d.phone_normalized = v_lead.phone_normalized
    AND d.campaign_key = p_campaign_key;

  SELECT EXISTS (SELECT 1 FROM public.purchase_audit pa WHERE pa.lead_id = v_job.lead_id) INTO v_has_purchase_context;
  SELECT EXISTS (SELECT 1 FROM public.purchase_audit pa WHERE pa.lead_id = v_job.lead_id
                 AND pa.purchase_status IN ('success', 'recognized')) INTO v_is_paid;

  SELECT * INTO v_decision FROM public.manual_charge_candidate_decision(
    v_has_promise, v_has_payment, v_has_refused, v_has_ambiguous, v_has_voluntary,
    v_has_purchase_context, v_is_paid, v_existing_id IS NOT NULL);

  IF v_decision.decision = 'attach_to_existing' THEN
    v_dispatch_id := v_existing_id;
  ELSIF v_decision.decision = 'create' THEN
    -- purchase_audit só entra como evidência de apoio quando foi ELE que
    -- justificou a criação (sinal sem promessa nem contribuição).
    IF NOT v_has_promise AND NOT v_has_voluntary THEN
      SELECT pa.id INTO v_pa_id FROM public.purchase_audit pa
      WHERE pa.lead_id = v_job.lead_id ORDER BY pa.created_at DESC LIMIT 1;
    END IF;
    SELECT * INTO v_create FROM public.manual_charge_create_dispatch_for_obligation(
      v_job.organization_id, v_job.lead_id, v_pa_id, p_campaign_key, v_decision.charge_kind);
    v_dispatch_id := v_create.dispatch_id;
    v_detail := v_detail || jsonb_build_array(jsonb_build_object('create', v_create.status));
  END IF;

  IF v_dispatch_id IS NULL THEN
    UPDATE public.manual_charge_classification_jobs
    SET status = 'done', result_id = v_result_id, decision = v_decision.decision,
        claim_token = NULL, updated_at = clock_timestamp()
    WHERE id = p_job_id;
    RETURN QUERY SELECT 'done'::text, v_decision.decision, NULL::uuid, NULL::text, v_detail; RETURN;
  END IF;

  FOR v_sig IN SELECT * FROM jsonb_array_elements(p_signals) LOOP
    v_type := v_sig->>'type';
    CONTINUE WHEN v_type = 'no_signal';

    SELECT r.routed_to, r.outcome, r.reference_id INTO v_route
    FROM public.manual_charge_record_classified_signal(
      v_dispatch_id, v_job.lead_id, v_job.conversation_id, v_job.source_message_id,
      CASE v_type WHEN 'payment_informed' THEN 'payment_claimed' ELSE v_type END,
      (v_sig->>'promised_date')::date,
      v_sig->>'evidence',
      'classifier:' || v_job.classifier_version,
      COALESCE(p_prompt_version, v_job.classifier_version),
      NULL,
      COALESCE(v_sig->>'date_precision', 'exact')
    ) r;

    v_detail := v_detail || jsonb_build_array(jsonb_build_object(
      'signal', v_type, 'routed_to', v_route.routed_to, 'outcome', v_route.outcome));

    IF v_route.outcome IN ('stale_supersedes_rejected', 'unknown_signal_type', 'source_message_not_found', 'lead_mismatch') THEN
      v_needs_review := true;
    END IF;
  END LOOP;

  -- Cobrança já enviada + NOVA data explícita depois do envio -> nova
  -- ocasião na mesma linha (a função exige fato de data posterior ao
  -- envio; "ok", emoji ou silêncio não reabrem).
  SELECT * INTO v_dispatch FROM public.manual_charge_dispatches WHERE id = v_dispatch_id;
  IF v_dispatch.status = 'sent' AND (v_has_promise OR v_has_voluntary) THEN
    SELECT * INTO v_reopen FROM public.manual_charge_reopen_dispatch_for_new_commitment(v_dispatch_id);
    v_detail := v_detail || jsonb_build_array(jsonb_build_object('reopen', v_reopen.status));
  END IF;

  SELECT c.status INTO v_capture FROM public.manual_charge_capture_scheduling_inputs(v_dispatch_id) c;
  IF v_capture IN ('inputs_captured', 'inputs_unchanged') THEN
    PERFORM public.manual_charge_schedule_dispatch(v_dispatch_id);
  END IF;
  PERFORM public.manual_charge_evaluate(v_dispatch_id);

  v_final_status := CASE WHEN v_needs_review THEN 'needs_review' ELSE 'done' END;
  UPDATE public.manual_charge_classification_jobs
  SET status = v_final_status, result_id = v_result_id, decision = v_decision.decision,
      dispatch_id = v_dispatch_id, claim_token = NULL, updated_at = clock_timestamp()
  WHERE id = p_job_id;

  SELECT * INTO v_dispatch FROM public.manual_charge_dispatches WHERE id = v_dispatch_id;
  RETURN QUERY SELECT v_final_status, v_decision.decision, v_dispatch_id, v_dispatch.charge_kind, v_detail;
END;
$$;

REVOKE ALL ON FUNCTION public.manual_charge_enqueue_classification(uuid, timestamptz, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.manual_charge_claim_classification_jobs(text, text, integer, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.manual_charge_fail_classification_job(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.manual_charge_apply_classified_message(uuid, uuid, jsonb, text, text, jsonb, text, jsonb, text, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_enqueue_classification(uuid, timestamptz, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.manual_charge_claim_classification_jobs(text, text, integer, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.manual_charge_fail_classification_job(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.manual_charge_apply_classified_message(uuid, uuid, jsonb, text, text, jsonb, text, jsonb, text, text, numeric) TO service_role;

-- Classificador determinístico (regex) no MESMO formato de saída do
-- classificador estruturado -- usado pela ingestão sem custo e pelos
-- testes. Evidência = trecho literal da própria mensagem.
CREATE FUNCTION public.manual_charge_rule_classifier_signals(p_content text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
DECLARE
  v_rule RECORD;
  v_evidence text := left(p_content, 200);
  v_voluntary boolean := lower(p_content) ~ '(quero contribuir|vou contribuir|posso contribuir|contribui[cç][aã]o)';
  v_signals jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_rule FROM public.manual_charge_september_2026_classify_message(p_content);

  IF v_voluntary THEN
    v_signals := v_signals || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'type', 'voluntary_commitment', 'evidence', v_evidence, 'confidence', 0.9,
      'promised_date', CASE WHEN v_rule.signal = 'promised_date' THEN v_rule.detected_date::text END,
      'date_precision', CASE WHEN v_rule.signal = 'promised_date' THEN v_rule.date_precision END)));
  END IF;

  IF v_rule.signal = 'payment_informed' THEN
    v_signals := v_signals || jsonb_build_array(jsonb_build_object('type', 'payment_informed', 'evidence', v_evidence, 'confidence', 0.9));
  ELSIF v_rule.signal = 'refused' THEN
    v_signals := v_signals || jsonb_build_array(jsonb_build_object('type', 'refused_contact', 'evidence', v_evidence, 'confidence', 0.9));
  ELSIF v_rule.signal = 'promised_date' AND NOT v_voluntary THEN
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'type', 'promised_date', 'evidence', v_evidence, 'confidence', 0.9,
      'promised_date', v_rule.detected_date::text, 'date_precision', v_rule.date_precision));
  ELSIF v_rule.signal = 'ambiguous' THEN
    v_signals := v_signals || jsonb_build_array(jsonb_build_object('type', 'ambiguous', 'evidence', v_evidence, 'confidence', 0.9));
  END IF;

  IF jsonb_array_length(v_signals) = 0 THEN
    v_signals := jsonb_build_array(jsonb_build_object('type', 'no_signal', 'confidence', 1));
  END IF;
  RETURN v_signals;
END;
$$;

GRANT EXECUTE ON FUNCTION public.manual_charge_rule_classifier_signals(text) TO authenticated, service_role;

-- Ingestão de setembro reescrita sobre a fila: mesmos jobs, mesma
-- aplicação, mesma decisão da prévia. Rodar de novo só processa
-- mensagens novas (contínua e idempotente).
DROP FUNCTION IF EXISTS public.manual_charge_september_2026_ingest(uuid, text);

CREATE FUNCTION public.manual_charge_september_2026_ingest(
  p_organization_id uuid,
  p_campaign_key text DEFAULT 'sept2026'
) RETURNS TABLE(job_id uuid, lead_id uuid, status text, decision text, dispatch_id uuid, charge_kind text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_job RECORD;
  v_applied RECORD;
  v_claimed integer;
BEGIN
  PERFORM public.manual_charge_enqueue_classification(p_organization_id, '2026-09-01 00:00:00+00'::timestamptz, 'rule_v1', 100000);

  LOOP
    v_claimed := 0;
    FOR v_job IN
      SELECT * FROM public.manual_charge_claim_classification_jobs('rule_v1', 'sept2026_ingest_rule', 500, 600, p_organization_id)
    LOOP
      v_claimed := v_claimed + 1;
      SELECT * INTO v_applied FROM public.manual_charge_apply_classified_message(
        v_job.job_id, v_job.claim_token,
        public.manual_charge_rule_classifier_signals(v_job.content),
        'rule_v1', 'sept2026_regex_v1',
        jsonb_build_object('rule', (SELECT to_jsonb(c) FROM public.manual_charge_september_2026_classify_message(v_job.content) c)),
        'valid', '[]'::jsonb, p_campaign_key);

      job_id := v_job.job_id; lead_id := v_job.lead_id; status := v_applied.status;
      decision := v_applied.decision; dispatch_id := v_applied.dispatch_id; charge_kind := v_applied.charge_kind;
      RETURN NEXT;
    END LOOP;
    EXIT WHEN v_claimed = 0;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_september_2026_ingest(uuid, text) IS
  'Ingestão pela fila (classifier_version rule_v1, sem custo). Mesma regra de candidatura da prévia (manual_charge_candidate_decision). Rodar de novo processa só mensagens novas; mensagem depois de envio com nova data reabre a ocasião. NÃO autorizada em produção.';

REVOKE ALL ON FUNCTION public.manual_charge_september_2026_ingest(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_september_2026_ingest(uuid, text) TO service_role;

-- Prévia SOMENTE LEITURA com a MESMA decisão por lead. Lista também os
-- descartados, com o motivo.
DROP FUNCTION IF EXISTS public.manual_charge_september_2026_dry_run_summary(uuid, numeric);
DROP FUNCTION IF EXISTS public.manual_charge_september_2026_dry_run_preview(uuid);

CREATE FUNCTION public.manual_charge_september_2026_dry_run_preview(
  p_organization_id uuid,
  p_campaign_key text DEFAULT 'sept2026'
) RETURNS TABLE(
  lead_id uuid,
  conversation_id uuid,
  connection_id uuid,
  phone_normalized text,
  decision text,
  bucket text,
  charge_kind text,
  detected_date date,
  source_message_id uuid,
  source_message_excerpt text,
  message_occurred_at timestamptz,
  inbound_message_count bigint
)
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_lead RECORD;
  v_msg RECORD;
  v_sig jsonb;
  v_type text;
  v_has_promise boolean; v_has_payment boolean; v_has_refused boolean;
  v_has_ambiguous boolean; v_has_voluntary boolean;
  v_date date; v_msg_id uuid; v_excerpt text; v_occurred timestamptz; v_count bigint;
  v_decision RECORD;
BEGIN
  FOR v_lead IN
    SELECT l.id AS lid, l.phone_normalized AS phone
    FROM public.leads l
    WHERE l.organization_id = p_organization_id
      AND EXISTS (
        SELECT 1 FROM public.webchat_conversations wc
        JOIN public.webchat_messages wm ON wm.conversation_id = wc.id
        WHERE wc.lead_id = l.id AND wc.organization_id = p_organization_id
          AND wm.direction = 'inbound' AND wm.sender_type = 'visitor'
          AND COALESCE(wm.provider_occurred_at, wm.created_at) >= '2026-09-01 00:00:00+00'::timestamptz
      )
  LOOP
    v_has_promise := false; v_has_payment := false; v_has_refused := false;
    v_has_ambiguous := false; v_has_voluntary := false;
    v_date := NULL; v_msg_id := NULL; v_excerpt := NULL; v_occurred := NULL; v_count := 0;

    FOR v_msg IN
      SELECT wm.id, wm.content, COALESCE(wm.provider_occurred_at, wm.created_at) AS occurred_at
      FROM public.webchat_conversations wc
      JOIN public.webchat_messages wm ON wm.conversation_id = wc.id
      WHERE wc.lead_id = v_lead.lid AND wc.organization_id = p_organization_id
        AND wm.direction = 'inbound' AND wm.sender_type = 'visitor'
        AND COALESCE(wm.is_deleted, false) = false
        AND btrim(COALESCE(wm.content, '')) <> ''
        AND COALESCE(wm.provider_occurred_at, wm.created_at) >= '2026-09-01 00:00:00+00'::timestamptz
      ORDER BY COALESCE(wm.provider_occurred_at, wm.created_at), wm.id
    LOOP
      v_count := v_count + 1;
      FOR v_sig IN SELECT * FROM jsonb_array_elements(public.manual_charge_rule_classifier_signals(v_msg.content)) LOOP
        v_type := v_sig->>'type';
        CONTINUE WHEN v_type = 'no_signal';
        v_has_promise := v_has_promise OR v_type = 'promised_date';
        v_has_payment := v_has_payment OR v_type = 'payment_informed';
        v_has_refused := v_has_refused OR v_type = 'refused_contact';
        v_has_ambiguous := v_has_ambiguous OR v_type IN ('ambiguous', 'postponement_requested');
        v_has_voluntary := v_has_voluntary OR v_type = 'voluntary_commitment';
        IF v_sig->>'promised_date' IS NOT NULL THEN
          v_date := (v_sig->>'promised_date')::date;
        END IF;
        v_msg_id := v_msg.id; v_excerpt := left(v_msg.content, 200); v_occurred := v_msg.occurred_at;
      END LOOP;
    END LOOP;

    SELECT * INTO v_decision FROM public.manual_charge_candidate_decision(
      v_has_promise, v_has_payment, v_has_refused, v_has_ambiguous, v_has_voluntary,
      EXISTS (SELECT 1 FROM public.purchase_audit pa WHERE pa.lead_id = v_lead.lid),
      EXISTS (SELECT 1 FROM public.purchase_audit pa WHERE pa.lead_id = v_lead.lid AND pa.purchase_status IN ('success', 'recognized')),
      EXISTS (SELECT 1 FROM public.manual_charge_dispatches d WHERE d.organization_id = p_organization_id
              AND d.phone_normalized = v_lead.phone AND d.campaign_key = p_campaign_key));

    lead_id := v_lead.lid;
    SELECT wc.id, wc.evolution_instance_id INTO conversation_id, connection_id
    FROM public.webchat_conversations wc
    WHERE wc.lead_id = v_lead.lid AND wc.organization_id = p_organization_id
    ORDER BY wc.updated_at DESC NULLS LAST, wc.created_at DESC LIMIT 1;
    phone_normalized := v_lead.phone;
    decision := v_decision.decision;
    charge_kind := v_decision.charge_kind;
    bucket := CASE
      WHEN v_decision.decision IN ('already_paid_excluded', 'skipped_no_obligation_evidence', 'no_signal', 'attach_to_existing') THEN v_decision.decision
      WHEN v_has_refused THEN 'refused'
      WHEN v_has_payment AND NOT v_has_promise AND NOT v_has_voluntary THEN 'payment_informed'
      WHEN v_has_voluntary THEN 'voluntary_commitment'
      WHEN v_has_promise AND v_date >= '2026-09-29'::date THEN 'eligible_future_date'
      WHEN v_has_promise THEN 'overdue_pending_rule'
      ELSE 'ambiguous'
    END;
    detected_date := v_date;
    source_message_id := v_msg_id;
    source_message_excerpt := v_excerpt;
    message_occurred_at := v_occurred;
    inbound_message_count := v_count;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_september_2026_dry_run_preview(uuid, text) IS
  'PRÉVIA SOMENTE LEITURA (nenhum INSERT/UPDATE). Mesma regra de candidatura da ingestão (manual_charge_candidate_decision), com o classificador determinístico. Inclui descartados com o motivo (decision). Rodar em produção exige autorização separada: lê conversas reais.';

REVOKE ALL ON FUNCTION public.manual_charge_september_2026_dry_run_preview(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manual_charge_september_2026_dry_run_preview(uuid, text) TO authenticated, service_role;

-- Resumo: sem preço fixo -- custo de classificação só aparece se o
-- operador informar uma estimativa explícita (NULL => sem estimativa).
CREATE FUNCTION public.manual_charge_september_2026_dry_run_summary(
  p_organization_id uuid,
  p_estimated_cost_per_message_usd numeric DEFAULT NULL
) RETURNS TABLE(bucket text, lead_count bigint, estimated_classification_messages bigint, estimated_classification_cost_usd numeric)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT p.bucket, count(*), COALESCE(sum(p.inbound_message_count), 0),
         CASE WHEN p_estimated_cost_per_message_usd IS NULL THEN NULL
              ELSE round(COALESCE(sum(p.inbound_message_count), 0) * p_estimated_cost_per_message_usd, 4) END
  FROM public.manual_charge_september_2026_dry_run_preview(p_organization_id) p
  GROUP BY p.bucket
  ORDER BY p.bucket;
$$;

REVOKE ALL ON FUNCTION public.manual_charge_september_2026_dry_run_summary(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manual_charge_september_2026_dry_run_summary(uuid, numeric) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 9) Worker de envio: seleção dos devidos (um por conexão por rodada) e
--    contexto de envio. O worker (Edge Function manual-charge-worker)
--    fica DESLIGADO por padrão; claim_charge_for_send continua exigindo
--    a flag manual_charge_dispatch_claim_enabled.
-- ─────────────────────────────────────────────────────────────────────

CREATE FUNCTION public.manual_charge_worker_due_dispatches(p_limit integer DEFAULT 20)
RETURNS TABLE(dispatch_id uuid, organization_id uuid, connection_id uuid, planned_send_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT x.id, x.organization_id, x.connection_id, x.planned_send_at
  FROM (
    SELECT DISTINCT ON (d.connection_id) d.id, d.organization_id, d.connection_id, d.planned_send_at
    FROM public.manual_charge_dispatches d
    WHERE d.status IN ('eligible', 'reconciled_not_sent')
      AND d.scheduling_status = 'scheduled'
      AND d.planned_send_at <= clock_timestamp()
      AND d.connection_id IS NOT NULL
    ORDER BY d.connection_id, d.planned_send_at, d.id
  ) x
  ORDER BY x.planned_send_at
  LIMIT p_limit;
$$;

CREATE FUNCTION public.manual_charge_worker_send_context(p_dispatch_id uuid)
RETURNS TABLE(
  dispatch_id uuid, organization_id uuid, connection_id uuid, provider text,
  phone_normalized text, lead_first_name text, locale text, charge_kind text,
  agreed_date date, template_name text, template_language text, within_service_window boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_d RECORD;
  v_l RECORD;
  v_c RECORD;
  v_last_inbound timestamptz;
  v_window boolean;
  -- Escalares (não RECORD): no caminho UazAPI nenhum template é lido, e
  -- um RECORD nunca atribuído falha ao ser acessado.
  v_template_name text;
  v_template_locale text;
BEGIN
  SELECT * INTO v_d FROM public.manual_charge_dispatches WHERE id = p_dispatch_id;
  IF v_d IS NULL THEN RETURN; END IF;
  SELECT * INTO v_l FROM public.leads WHERE id = v_d.lead_id;
  SELECT * INTO v_c FROM public.evolution_instances WHERE id = v_d.connection_id;

  SELECT max(COALESCE(wm.provider_occurred_at, wm.created_at)) INTO v_last_inbound
  FROM public.webchat_conversations wc
  JOIN public.webchat_messages wm ON wm.conversation_id = wc.id
  WHERE wc.lead_id = v_d.lead_id AND wc.organization_id = v_d.organization_id
    AND wc.evolution_instance_id = v_d.connection_id
    AND wm.direction = 'inbound' AND wm.sender_type = 'visitor';
  v_window := v_last_inbound IS NOT NULL AND v_last_inbound + interval '24 hours' > clock_timestamp() + interval '10 minutes';

  IF COALESCE(NULLIF(btrim(v_c.provider), ''), 'uazapi') = 'meta_cloud' AND NOT v_window THEN
    SELECT t.name, t.locale INTO v_template_name, v_template_locale FROM public.manual_charge_templates t
    WHERE t.organization_id = v_d.organization_id AND t.status = 'approved'
      AND t.meta_assigned_category IS NOT NULL
      AND t.purpose = CASE v_d.charge_kind WHEN 'voluntary_contribution_reminder' THEN 'voluntary_contribution_reminder'
                                           ELSE 'payment_reminder_transactional' END
      AND (replace(t.locale, '_', '-') = replace(v_l.preferred_locale, '_', '-')
           OR split_part(replace(t.locale, '_', '-'), '-', 1) = split_part(replace(v_l.preferred_locale, '_', '-'), '-', 1))
    ORDER BY (replace(t.locale, '_', '-') = replace(v_l.preferred_locale, '_', '-')) DESC
    LIMIT 1;
  END IF;

  dispatch_id := v_d.id; organization_id := v_d.organization_id; connection_id := v_d.connection_id;
  provider := COALESCE(NULLIF(btrim(v_c.provider), ''), 'uazapi');
  phone_normalized := v_d.phone_normalized;
  lead_first_name := NULLIF(split_part(btrim(COALESCE(v_l.name, '')), ' ', 1), '');
  locale := v_l.preferred_locale;
  charge_kind := v_d.charge_kind;
  agreed_date := v_d.agreed_date;
  template_name := v_template_name;
  template_language := v_template_locale;
  within_service_window := v_window;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.manual_charge_worker_due_dispatches(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.manual_charge_worker_send_context(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_worker_due_dispatches(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.manual_charge_worker_send_context(uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 10) Painel: expõe proveniência de idioma/fuso e reaberturas.
-- ─────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.manual_charge_dispatches_panel;

CREATE VIEW public.manual_charge_dispatches_panel
WITH (security_invoker = true) AS
SELECT
  d.id AS dispatch_id, d.organization_id, d.lead_id, l.name AS lead_name, d.phone_normalized,
  d.campaign_key, d.charge_kind, d.status, d.disposition_reason, d.claim_token, d.claimed_by,
  d.claimed_at, d.sent_at, d.agreed_date, d.planned_send_at, d.scheduling_status, d.connection_id,
  ei.name AS connection_name, ei.status AS connection_status,
  COALESCE(NULLIF(btrim(ei.provider), ''), 'uazapi') AS connection_provider,
  l.preferred_locale AS lead_preferred_locale, l.locale_source AS lead_locale_source,
  l.preferred_timezone AS lead_preferred_timezone, l.timezone_source AS lead_timezone_source,
  l.timezone_confidence AS lead_timezone_confidence,
  cf.effective_promised_date, cf.promised_date_occurred_at_source, cf.promised_date_precision,
  cf.has_pending_ambiguous_signal,
  st.is_refused, st.refused_reason, st.is_payment_claimed, st.payment_claim_status,
  EXISTS (SELECT 1 FROM public.purchase_audit pa
          WHERE pa.lead_id = d.lead_id AND pa.purchase_status IN ('success', 'recognized')) AS payment_confirmed,
  'pending_criteria_approval'::text AS attribution_status,
  (SELECT count(*) FROM public.manual_charge_dispatch_reopen_events re WHERE re.dispatch_id = d.id) AS reopen_count,
  d.created_at, d.updated_at
FROM public.manual_charge_dispatches d
JOIN public.leads l ON l.id = d.lead_id
LEFT JOIN public.evolution_instances ei ON ei.id = d.connection_id
LEFT JOIN LATERAL public.manual_charge_conversation_current_facts(d.id) cf ON true
LEFT JOIN LATERAL public.manual_charge_conversation_state(d.id) st ON true;

REVOKE ALL ON public.manual_charge_dispatches_panel FROM PUBLIC, anon;
GRANT SELECT ON public.manual_charge_dispatches_panel TO authenticated;
