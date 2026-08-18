-- 08_restore_cron_jobs.sql
-- Restaura os pg_cron do projeto antigo (qagoydprfofyohrwntjv) no projeto novo
-- (ydunpoqdhijhnrarohiz). Idempotente: pode rodar mais de uma vez.
--
-- FONTE: reconstruído a partir das migrations locais (supabase/migrations/*), que são a
-- fonte de verdade dos crons no fluxo Lovable. NÃO foi possível ler o cron.job VIVO do
-- projeto antigo (sem conn string dele) — se houver jobs criados manualmente pelo dashboard
-- que não estejam em migration, eles não aparecem aqui.
--
-- Estado final dos crons (após aplicar todas as migrations, na ordem):
--   1. resume-funnels-every-minute   '* * * * *'   -> funnel-resume-cron
--   2. uazapi-heartbeat-cron          '* * * * *'   -> uazapi-heartbeat
--   3. funnel-job-runner-v2           '* * * * *'   -> funnel-job-runner
--   4. daily-log-cleanup              '0 0 * * *'    -> public.cleanup_old_logs()
-- (funnel-job-runner-every-10s e versões antigas do heartbeat foram SUBSTITUÍDAS e não
--  fazem parte do estado final.)
--
-- ⚠️ DESVIO INTENCIONAL DE AUTH (necessário — os mecanismos antigos NÃO funcionam aqui):
--   - vault.decrypted_secrets estava VAZIO no projeto novo;
--   - app.settings.service_role_key NÃO estava definido;
--   - o heartbeat antigo usava um token UazAPI HARDCODED (inseguro e inválido como JWT).
--   Padronizamos os 3 crons HTTP para autenticar com o SERVICE_ROLE_KEY do Supabase lido do
--   VAULT (as functions alvo são verify_jwt=true; o service role é um JWT válido). Nenhum
--   segredo fica neste arquivo.
--
-- ────────────────────────────────────────────────────────────────────────────────────────
-- PRÉ-REQUISITO (rodar UMA vez, fora deste arquivo, sem commitar segredo):
--   Semear o vault com a URL e a service role key do projeto novo. Ex.:
--
--     source /root/new_db_url.env
--     SRK="<SUPABASE_SERVICE_ROLE_KEY do projeto novo>"
--     psql "$NEW_DATABASE_URL" \
--       -v url="https://ydunpoqdhijhnrarohiz.supabase.co" -v srk="$SRK" <<'SQL'
--     select vault.create_secret(:'url', 'SUPABASE_URL')            where not exists (select 1 from vault.secrets where name='SUPABASE_URL');
--     select vault.create_secret(:'srk', 'SUPABASE_SERVICE_ROLE_KEY') where not exists (select 1 from vault.secrets where name='SUPABASE_SERVICE_ROLE_KEY');
--     SQL
--
--   (Sem isso, os crons HTTP são criados mas falham em runtime por falta de URL/JWT.)
-- ────────────────────────────────────────────────────────────────────────────────────────

\set ON_ERROR_STOP on

BEGIN;

-- Extensões necessárias.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Trava: exige que o vault esteja semeado (senão os crons HTTP nasceriam quebrados).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name='SUPABASE_URL')
     OR NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name='SUPABASE_SERVICE_ROLE_KEY') THEN
    RAISE EXCEPTION 'vault sem SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — rode o PRÉ-REQUISITO antes (ver cabeçalho).';
  END IF;
END $$;

-- Garante que a função do cleanup existe (idempotente).
CREATE OR REPLACE FUNCTION public.cleanup_old_logs()
RETURNS void AS $fn$
BEGIN
  DELETE FROM public.webhook_logs             WHERE created_at < NOW() - INTERVAL '7 days';
  DELETE FROM public.processed_messages        WHERE created_at < NOW() - INTERVAL '7 days';
  DELETE FROM public.admin_notification_logs   WHERE created_at < NOW() - INTERVAL '7 days';
  DELETE FROM public.webhook_health            WHERE created_at < NOW() - INTERVAL '7 days';
  DELETE FROM public.connection_health         WHERE created_at < NOW() - INTERVAL '7 days';
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.cleanup_old_logs() TO service_role;

-- Idempotência: remove quaisquer jobs pré-existentes com esses nomes (inclui os SUBSTITUÍDOS),
-- para poder recriar do zero sem duplicar.
DO $$
DECLARE j text;
BEGIN
  FOREACH j IN ARRAY ARRAY[
    'resume-funnels-every-minute',
    'uazapi-heartbeat-cron',
    'funnel-job-runner-v2',
    'daily-log-cleanup',
    'funnel-job-runner-every-10s'   -- legado substituído
  ] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
    END IF;
  END LOOP;
END $$;

-- 1. funnel-resume-cron (retoma funis pausados/agendados) — a cada minuto.
SELECT cron.schedule('resume-funnels-every-minute', '* * * * *', $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='SUPABASE_URL') || '/functions/v1/funnel-resume-cron',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='SUPABASE_SERVICE_ROLE_KEY')
    ),
    body := '{}'::jsonb
  );
$job$);

-- 2. uazapi-heartbeat (sincroniza status real das instâncias WhatsApp) — a cada minuto.
SELECT cron.schedule('uazapi-heartbeat-cron', '* * * * *', $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='SUPABASE_URL') || '/functions/v1/uazapi-heartbeat',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='SUPABASE_SERVICE_ROLE_KEY')
    ),
    body := '{}'::jsonb
  );
$job$);

-- 3. funnel-job-runner (processa a fila funnel_execution_jobs) — a cada minuto.
SELECT cron.schedule('funnel-job-runner-v2', '* * * * *', $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='SUPABASE_URL') || '/functions/v1/funnel-job-runner',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='SUPABASE_SERVICE_ROLE_KEY')
    ),
    body := '{}'::jsonb
  );
$job$);

-- 4. daily-log-cleanup (purga logs > 7 dias) — meia-noite.
SELECT cron.schedule('daily-log-cleanup', '0 0 * * *', $job$
  SELECT public.cleanup_old_logs();
$job$);

-- Validação:
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;

-- Aplicado: 4 jobs recriados após vault semeado e functions-alvo deployadas.
COMMIT;
