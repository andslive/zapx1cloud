-- Habilitar pg_cron se necessário
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Criar schema para logs de jobs se não existir
CREATE SCHEMA IF NOT EXISTS cron;

-- Agendar o runner para rodar a cada 10 segundos
-- Usamos cron.schedule para disparar um comando SQL que chama o endpoint via HTTP
-- Nota: O cron do Supabase roda no schema 'cron'.
SELECT cron.schedule(
  'funnel-job-runner-every-10s',
  '* * * * *', -- Cron padrão roda a cada minuto, mas podemos usar loops ou scripts de retry
  $$
  SELECT
    net.http_post(
      url:=(SELECT value FROM (SELECT decrypter(secret, 'SUPABASE_URL') as value FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') s) || '/functions/v1/funnel-job-runner',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || (SELECT value FROM (SELECT decrypter(secret, 'SUPABASE_SERVICE_ROLE_KEY') as value FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY') s) || '"}'::jsonb,
      body:='{}'::jsonb
    );
  $$
);

-- Como o cron.schedule nativo do Supabase tem resolução de 1 minuto, 
-- para simular "a cada 10s" costumamos agendar 6 vezes com delay ou confiar no trigger de polling.
-- Para esta auditoria, manteremos o agendamento de 1 minuto ou chamadas via webhook inbound.
