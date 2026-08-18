-- 10_import_antiretrigger.sql
-- Import IDEMPOTENTE do estado anti-retrigger (leads reais + histórico de funil concluído)
-- do projeto antigo para o NOVO. NÃO cria conversas/mensagens, NÃO dispara Edge Functions.
-- Rodar com:  psql "$NEW_DATABASE_URL" -f scripts/migration/10_import_antiretrigger.sql
-- (a partir de /opt/x1zap/zapx1cloud, pois os \copy usam caminho relativo data-export/)
--
-- Fonte: data-export/leads_antiretrigger.csv  e  lead_funnel_history_antiretrigger.csv
--   Delimitador ';'  | funnels_completed em formato JSON  ["uuid", ...]
--
-- Regras atendidas:
--  - UPSERT em leads por (organization_id, phone_normalized) [índice leads_org_phone_unique].
--  - Em conflito: SÓ mescla (merge/union) funnels_completed. NÃO sobrescreve name/datas/source
--    (preserva o dado do novo, que pode ser mais recente).
--  - funnels_completed é filtrado para conter apenas funis que EXISTEM no novo (5 ids do
--    antigo não foram migrados -> inertes; removidos para manter o array limpo).
--  - lead_funnel_history religado ao lead NOVO por (organization_id, phone_normalized) — NUNCA
--    usa old_lead_id como chave final — e inserido com idempotência via NOT EXISTS.
--  - Tudo em transação. Termina em ROLLBACK (troque por COMMIT após revisar as contagens).

\set ON_ERROR_STOP on
BEGIN;

-- Staging TEMP (some ao fim da sessão; colunas na MESMA ORDEM do header do CSV).
CREATE TEMP TABLE stg_leads (
  created_at text, first_message_at text, funnels_completed text, last_contact_at text,
  name text, old_lead_id text, organization_id text, phone text, phone_normalized text,
  source text, updated_at text
) ON COMMIT DROP;

CREATE TEMP TABLE stg_hist (
  capture_funnel_id text, completed_at text, created_at text, old_lead_id text,
  organization_id text, phone_normalized text, started_at text, status text
) ON COMMIT DROP;

\copy stg_leads FROM 'data-export/leads_antiretrigger.csv' WITH (FORMAT csv, HEADER true, DELIMITER ';')
\copy stg_hist  FROM 'data-export/lead_funnel_history_antiretrigger.csv' WITH (FORMAT csv, HEADER true, DELIMITER ';')

-- ============================================================
-- 1) LEADS: upsert por (organization_id, phone_normalized)
-- ============================================================
-- Obs.: phone_normalized é coluna GERADA (normalize_phone_br(phone)) — NÃO se insere;
-- é derivada de phone automaticamente (verificado: bate 1:1 com o phone_normalized do CSV).
INSERT INTO public.leads
  (organization_id, phone, name, source,
   first_message_at, last_contact_at, created_at, updated_at, funnels_completed)
SELECT
  s.organization_id::uuid,
  NULLIF(s.phone,''),
  COALESCE(NULLIF(s.name,''), s.phone_normalized),         -- name é NOT NULL
  NULLIF(s.source,''),
  NULLIF(s.first_message_at,'')::timestamptz,
  NULLIF(s.last_contact_at,'')::timestamptz,
  NULLIF(s.created_at,'')::timestamptz,
  NULLIF(s.updated_at,'')::timestamptz,
  -- parse JSON -> uuid[], mantendo só funis que existem no novo
  COALESCE((
    SELECT array_agg(DISTINCT x::uuid)
    FROM jsonb_array_elements_text(NULLIF(s.funnels_completed,'')::jsonb) t(x)
    WHERE EXISTS (SELECT 1 FROM public.capture_funnels cf WHERE cf.id = x::uuid)
  ), '{}'::uuid[])
FROM stg_leads s
WHERE s.phone_normalized IS NOT NULL AND s.phone_normalized <> ''
ON CONFLICT (organization_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL AND phone_normalized <> ''
DO UPDATE SET
  -- SÓ mescla funnels_completed (union sem duplicar). Nada mais é sobrescrito.
  funnels_completed = (
    SELECT array(SELECT DISTINCT e FROM unnest(
      COALESCE(public.leads.funnels_completed, '{}'::uuid[]) || EXCLUDED.funnels_completed
    ) e)
  );

-- ============================================================
-- 2) LEAD_FUNNEL_HISTORY: religa por (org, phone_normalized) -> lead NOVO
-- ============================================================
INSERT INTO public.lead_funnel_history
  (lead_id, funnel_id, status, started_at, completed_at, created_at)
SELECT
  l.id,
  h.capture_funnel_id::uuid,
  NULLIF(h.status,''),
  NULLIF(h.started_at,'')::timestamptz,
  NULLIF(h.completed_at,'')::timestamptz,
  NULLIF(h.created_at,'')::timestamptz
FROM stg_hist h
JOIN public.leads l
  ON l.organization_id = h.organization_id::uuid
 AND l.phone_normalized = h.phone_normalized
WHERE EXISTS (SELECT 1 FROM public.capture_funnels cf WHERE cf.id = h.capture_funnel_id::uuid)
  AND NOT EXISTS (   -- idempotência (não há unique natural nesta tabela)
    SELECT 1 FROM public.lead_funnel_history x
    WHERE x.lead_id = l.id
      AND x.funnel_id = h.capture_funnel_id::uuid
      AND x.status = NULLIF(h.status,'')
  );

-- ============================================================
-- Relatório de contagens (revisar antes de COMMIT)
-- ============================================================
SELECT
  (SELECT count(*) FROM stg_leads) AS csv_leads,
  (SELECT count(*) FROM stg_hist)  AS csv_hist,
  (SELECT count(*) FROM public.leads WHERE organization_id='60639a08-4e91-42a9-83a8-8e95616eccb7') AS leads_org_total_pos,
  (SELECT count(*) FROM public.lead_funnel_history) AS history_total_pos;

-- Aplicado (opção A aprovada): triggers benignos + bump de updated_at nos 6 aceitos.
COMMIT;
