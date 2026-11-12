-- ═══════════════════════════════════════════════════════════════════════
-- Seção 9 -- detecção de idioma/fuso: preferência explícita e evidência
-- de conversa sempre têm prioridade sobre o DDI. O telefone é só um
-- palpite fraco (country_hint), nunca decisivo sozinho -- quando não há
-- nada melhor, o fuso/idioma ficam NULL (nunca um padrão silencioso),
-- o que já bloqueia o agendamento para revisão
-- (manual_charge_schedule_dispatch -> blocked_no_timezone, já existente).
--
-- ESCOPO: heurística de teste (rule-based), como toda classificação
-- nesta fase -- NÃO é IA real. Estrutura extensível para outros idiomas
-- além de pt-BR/es-* (novas linhas na tabela de defaults + novos padrões
-- de palavra-chave), documentado como pendência para produção real.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.manual_charge_country_defaults (
  ddi_prefix text PRIMARY KEY,
  country_name text NOT NULL,
  default_locale text NOT NULL,
  default_timezone text NOT NULL
);

INSERT INTO public.manual_charge_country_defaults (ddi_prefix, country_name, default_locale, default_timezone) VALUES
  ('55', 'Brasil', 'pt-BR', 'America/Sao_Paulo'),
  ('52', 'México', 'es-MX', 'America/Mexico_City'),
  ('54', 'Argentina', 'es-AR', 'America/Argentina/Buenos_Aires'),
  ('57', 'Colômbia', 'es-CO', 'America/Bogota'),
  ('56', 'Chile', 'es-CL', 'America/Santiago'),
  ('51', 'Peru', 'es-PE', 'America/Lima'),
  ('34', 'Espanha', 'es-ES', 'Europe/Madrid'),
  ('1', 'EUA/Canadá', 'en-US', 'America/New_York');

COMMENT ON TABLE public.manual_charge_country_defaults IS
  'Palpite FRACO por DDI -- nunca decisivo sozinho (Seção 9). Estrutura extensível: novos países/idiomas são só novas linhas. Confiança desta fonte é sempre baixa (ver manual_charge_detect_lead_locale_timezone).';

REVOKE ALL ON public.manual_charge_country_defaults FROM PUBLIC, anon;
GRANT SELECT ON public.manual_charge_country_defaults TO authenticated, service_role;

-- ── Detecção de idioma por palavras-chave do texto (pt-BR vs es-*) --
-- extensível: novos idiomas exigem só um novo bloco de padrões. ──
CREATE FUNCTION public.manual_charge_detect_language_from_text(
  p_content text
) RETURNS TABLE(locale text, confidence numeric)
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
DECLARE
  v_lower text := lower(p_content);
  v_pt_hits int := 0;
  v_es_hits int := 0;
BEGIN
  -- pt-BR: palavras/estruturas que não existem (ou são raras) em espanhol
  IF v_lower ~ '\y(obrigad[oa]|você|pagamento|não|então|também|já|dia\s+\d)\y' THEN v_pt_hits := v_pt_hits + 1; END IF;
  IF v_lower ~ '\y(vou pagar|tá bom|beleza|pode ser)\y' THEN v_pt_hits := v_pt_hits + 1; END IF;

  -- es-*: palavras/estruturas que não existem (ou são raras) em pt-BR
  IF v_lower ~ '\y(gracias|usted|pago|no puedo|entonces|también|ya|día\s+\d)\y' THEN v_es_hits := v_es_hits + 1; END IF;
  IF v_lower ~ '\y(voy a pagar|está bien|vale|puede ser)\y' THEN v_es_hits := v_es_hits + 1; END IF;

  IF v_pt_hits > 0 AND v_es_hits = 0 THEN
    RETURN QUERY SELECT 'pt-BR'::text, LEAST(0.5 + 0.25 * v_pt_hits, 0.95)::numeric; RETURN;
  ELSIF v_es_hits > 0 AND v_pt_hits = 0 THEN
    RETURN QUERY SELECT 'es'::text, LEAST(0.5 + 0.25 * v_es_hits, 0.95)::numeric; RETURN;
  END IF;

  -- Ambíguo (ou nenhum sinal) -- nunca escolhe um idioma por padrão.
  RETURN QUERY SELECT NULL::text, 0::numeric;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_detect_language_from_text IS
  'Heurística de teste (palavras-chave pt-BR vs es-*). Retorna locale=NULL/confidence=0 quando ambíguo -- nunca escolhe um idioma por suposição. Produção real precisa de um classificador melhor (fora do escopo desta fase).';

-- ═══════════════════════════════════════════════════════════════════════
-- manual_charge_update_lead_locale_timezone -- ÚNICA via de atualização.
-- Prioridade: (1) explicit (já setado por essa fonte, nunca
-- sobrescrito por inferência) > (2) conversation_detected (confiança
-- >= 0.7) > (3) country_hint (só quando não há NADA melhor, confiança
-- baixa fixa em 0.3). Abaixo de qualquer limiar de confiança aceitável,
-- fica NULL -- nunca um palpite fraco vira decisão silenciosa.
-- ═══════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.manual_charge_update_lead_locale_timezone(
  p_lead_id uuid,
  p_source_message_content text DEFAULT NULL
) RETURNS TABLE(status text, locale text, timezone text, source text, confidence numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_lead RECORD;
  v_country RECORD;
  v_detected_locale text;
  v_detected_confidence numeric;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF v_lead IS NULL THEN
    RETURN QUERY SELECT 'lead_not_found'::text, NULL::text, NULL::text, NULL::text, NULL::numeric; RETURN;
  END IF;

  -- Preferência explícita nunca é sobrescrita por inferência.
  IF v_lead.timezone_source = 'explicit' THEN
    RETURN QUERY SELECT 'kept_explicit'::text, v_lead.preferred_locale, v_lead.preferred_timezone, v_lead.timezone_source, v_lead.timezone_confidence;
    RETURN;
  END IF;

  -- Evidência de conversa tem prioridade sobre o DDI.
  IF p_source_message_content IS NOT NULL THEN
    SELECT d.locale, d.confidence INTO v_detected_locale, v_detected_confidence
    FROM public.manual_charge_detect_language_from_text(p_source_message_content) d;

    IF v_detected_locale IS NOT NULL AND v_detected_confidence >= 0.7 THEN
      UPDATE public.leads
      SET preferred_locale = v_detected_locale,
          timezone_source = 'conversation_detected',
          timezone_confidence = v_detected_confidence
          -- fuso: a evidência textual só confirma IDIOMA, não fuso
          -- horário -- fuso continua vindo do DDI (mais confiável para
          -- isso) quando disponível, nunca inventado a partir do idioma.
      WHERE id = p_lead_id;

      -- Maior prefixo primeiro (DDIs têm comprimentos diferentes -- ex.:
      -- '52' do México não pode perder para uma tentativa fixa de 3
      -- dígitos que nunca bate com nada na tabela).
      SELECT * INTO v_country FROM public.manual_charge_country_defaults
      WHERE v_lead.phone_normalized LIKE ddi_prefix || '%'
      ORDER BY length(ddi_prefix) DESC LIMIT 1;
      IF v_country IS NOT NULL AND v_lead.preferred_timezone IS NULL THEN
        UPDATE public.leads SET preferred_timezone = v_country.default_timezone WHERE id = p_lead_id;
      END IF;

      RETURN QUERY SELECT 'updated_from_conversation'::text, v_detected_locale, COALESCE(v_country.default_timezone, v_lead.preferred_timezone), 'conversation_detected'::text, v_detected_confidence;
      RETURN;
    END IF;
  END IF;

  -- Sem preferência explícita, sem evidência de conversa suficiente --
  -- só o palpite fraco do DDI, e SÓ se nada melhor já existir. Nunca
  -- promovido a 'explicit'/'conversation_detected' -- fica sempre
  -- 'country_hint', confiança baixa, sinalizando que é revisável.
  IF v_lead.preferred_locale IS NULL AND v_lead.preferred_timezone IS NULL THEN
    SELECT * INTO v_country FROM public.manual_charge_country_defaults
    WHERE v_lead.phone_normalized LIKE ddi_prefix || '%'
    ORDER BY length(ddi_prefix) DESC LIMIT 1;
    IF v_country IS NOT NULL THEN
      UPDATE public.leads
      SET preferred_locale = v_country.default_locale,
          preferred_timezone = v_country.default_timezone,
          timezone_source = 'country_hint',
          timezone_confidence = 0.3
      WHERE id = p_lead_id;
      RETURN QUERY SELECT 'updated_from_country_hint'::text, v_country.default_locale, v_country.default_timezone, 'country_hint'::text, 0.3::numeric;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT 'unchanged'::text, v_lead.preferred_locale, v_lead.preferred_timezone, v_lead.timezone_source, v_lead.timezone_confidence;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_update_lead_locale_timezone IS
  'Única via de atualização de idioma/fuso do lead. Prioridade: explicit (nunca sobrescrito) > conversation_detected (confiança >=0.7, texto decide idioma, DDI só completa fuso se ausente) > country_hint (DDI sozinho, confiança 0.3, só quando não há nada melhor). Casos incertos ficam NULL -- isso já bloqueia o agendamento (blocked_no_timezone) para revisão, nunca um padrão silencioso.';

REVOKE ALL ON FUNCTION public.manual_charge_update_lead_locale_timezone(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_update_lead_locale_timezone(uuid, text) TO service_role;
