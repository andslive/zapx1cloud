-- 09_export_antiretrigger_leads.sql
-- RODAR NO SQL EDITOR DO PROJETO ANTIGO (qagoydprfofyohrwntjv).
-- SOMENTE LEITURA: apenas SELECT. Não faz UPDATE/DELETE/INSERT.
-- Objetivo: exportar o mínimo para impedir REDISPARO de funil no projeto novo —
-- leads REAIS que já concluíram/pararam funil + o histórico de conclusão.
--
-- Fantasmas são excluídos por construção: exige phone_normalized válido E
-- (funnels_completed não vazio OU lead_funnel_history completed/stopped).
--
-- Compatibilidade de IDs: os funis foram migrados preservando UUID, então
-- funnels_completed / funnel_id do antigo já correspondem aos capture_funnels do novo
-- (não precisa remapear). Os IDs de LEAD, porém, NÃO são reusados no novo — por isso
-- exportamos phone_normalized para religar por (organization_id, phone_normalized) na import.
--
-- Como usar: rode cada SELECT no SQL Editor e clique em "Download CSV".
--   Query 1 -> salve como  leads_antiretrigger.csv
--   Query 2 -> salve como  lead_funnel_history_antiretrigger.csv
-- (Query 0 é só conferência de contagens — opcional.)

-- ============================================================
-- Query 0 (opcional) — conferência de volumes antes de exportar
-- ============================================================
SELECT
  (SELECT count(*) FROM public.leads) AS total_leads,
  (SELECT count(*) FROM public.leads l
     WHERE l.phone_normalized IS NOT NULL AND l.phone_normalized <> ''
       AND ( (l.funnels_completed IS NOT NULL AND array_length(l.funnels_completed,1) > 0)
             OR EXISTS (SELECT 1 FROM public.lead_funnel_history h
                        WHERE h.lead_id = l.id AND h.status IN ('completed','stopped')) )
  ) AS leads_reais_antiretrigger,
  (SELECT count(*) FROM public.lead_funnel_history WHERE status IN ('completed','stopped')) AS history_completed_stopped;

-- ============================================================
-- Query 1 — LEADS reais anti-retrigger  ->  leads_antiretrigger.csv
-- ============================================================
SELECT
  l.id                AS old_lead_id,
  l.organization_id,
  l.phone,
  l.phone_normalized,
  l.name,
  l.source,
  l.first_message_at,
  l.last_contact_at,
  l.funnels_completed,
  l.created_at,
  l.updated_at
FROM public.leads l
WHERE l.phone_normalized IS NOT NULL
  AND l.phone_normalized <> ''
  AND (
        (l.funnels_completed IS NOT NULL AND array_length(l.funnels_completed, 1) > 0)
     OR EXISTS (
          SELECT 1 FROM public.lead_funnel_history h
          WHERE h.lead_id = l.id
            AND h.status IN ('completed','stopped')
        )
      )
ORDER BY l.organization_id, l.phone_normalized;

-- ============================================================
-- Query 2 — HISTÓRICO mínimo (só completed/stopped)  ->  lead_funnel_history_antiretrigger.csv
--   (traz phone_normalized + organization_id via JOIN para religar no novo)
-- ============================================================
SELECT
  h.lead_id            AS old_lead_id,
  l.phone_normalized,
  l.organization_id,
  h.funnel_id          AS capture_funnel_id,
  h.status,
  h.started_at,
  h.completed_at,
  h.created_at
FROM public.lead_funnel_history h
JOIN public.leads l ON l.id = h.lead_id
WHERE h.status IN ('completed','stopped')
  AND l.phone_normalized IS NOT NULL
  AND l.phone_normalized <> ''
ORDER BY l.organization_id, l.phone_normalized, h.created_at;
