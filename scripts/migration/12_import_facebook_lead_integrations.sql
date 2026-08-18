-- 12_import_facebook_lead_integrations.sql
-- Import IDEMPOTENTE do facebook_lead_integrations (config Meta pixel/CAPI) do projeto antigo.
-- Sem isso, o bloco Pixel/Purchase não encontra pixel_access_token e pula o envio ao Meta.
-- Rodar de /opt/x1zap/zapx1cloud:  psql "$NEW_DATABASE_URL" -f scripts/migration/12_import_facebook_lead_integrations.sql
-- Fonte: data-export/facebook_lead_integrations.csv  (delimitador ';')
--
-- Regras: só configs is_active com pixel_access_token; NOT EXISTS por (organization_id, pixel_id);
-- não sobrescreve nada existente; transação; TOKEN NUNCA impresso/versionado (fica só no CSV,
-- que está sob data-export/ no .gitignore). Termina em ROLLBACK (trocar por COMMIT após revisar).

\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE stg_fli (
  app_secret text, assigned_squad_id text, assigned_user_id text, created_at text,
  default_tags text, default_temperature text, distribution_rule text, field_mapping text,
  id text, is_active text, last_lead_received_at text, leads_count text, organization_id text,
  page_access_token text, page_id text, page_name text, pixel_access_token text, pixel_id text,
  pixel_name text, product_id text, updated_at text, verify_token text
) ON COMMIT DROP;

\copy stg_fli FROM 'data-export/facebook_lead_integrations.csv' WITH (FORMAT csv, HEADER true, DELIMITER ';')

INSERT INTO public.facebook_lead_integrations
  (id, organization_id, product_id, page_id, page_name, page_access_token, app_secret,
   verify_token, field_mapping, distribution_rule, assigned_user_id, assigned_squad_id,
   default_temperature, default_tags, is_active, last_lead_received_at, leads_count,
   created_at, updated_at, pixel_name, pixel_id, pixel_access_token)
SELECT
  s.id::uuid,
  s.organization_id::uuid,
  s.product_id::uuid,
  s.page_id,
  NULLIF(s.page_name,''),
  s.page_access_token,
  NULLIF(s.app_secret,''),
  s.verify_token,
  NULLIF(s.field_mapping,'')::jsonb,
  NULLIF(s.distribution_rule,''),
  NULLIF(s.assigned_user_id,'')::uuid,
  NULLIF(s.assigned_squad_id,'')::uuid,
  NULLIF(s.default_temperature,''),
  CASE WHEN coalesce(s.default_tags,'') IN ('','[]','{}') THEN '{}'::text[]
       ELSE (SELECT array_agg(x) FROM jsonb_array_elements_text(s.default_tags::jsonb) x) END,
  (s.is_active = 'true'),
  NULLIF(s.last_lead_received_at,'')::timestamptz,
  NULLIF(s.leads_count,'')::int,
  NULLIF(s.created_at,'')::timestamptz,
  NULLIF(s.updated_at,'')::timestamptz,
  NULLIF(s.pixel_name,''),
  NULLIF(s.pixel_id,''),
  NULLIF(s.pixel_access_token,'')
FROM stg_fli s
WHERE s.is_active = 'true'
  AND coalesce(s.pixel_access_token,'') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.facebook_lead_integrations f
    WHERE f.organization_id = s.organization_id::uuid
      AND f.pixel_id = NULLIF(s.pixel_id,'')
  );

-- Validação (NÃO imprime token):
SELECT
  (SELECT count(*) FROM stg_fli) AS csv_linhas,
  (SELECT count(*) FROM public.facebook_lead_integrations) AS total_pos,
  (SELECT count(*) FROM public.facebook_lead_integrations
     WHERE pixel_id='3339769916196814' AND is_active AND coalesce(pixel_access_token,'')<>'') AS pixel_alvo_ok;

-- Aplicado (aprovado): total_pos=1, pixel_alvo_ok=1.
COMMIT;
