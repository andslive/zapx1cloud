-- Habilita a extensão pg_net se não estiver habilitada
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Função que chama o runner via Edge Function
CREATE OR REPLACE FUNCTION public.trigger_funnel_runner_on_job()
RETURNS TRIGGER AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Tenta obter as credenciais do vault ou de variáveis de ambiente do postgres
  -- Em Lovable Cloud, preferimos usar vault se disponível, ou fallback para config
  SELECT value INTO supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL';
  SELECT value INTO service_role_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY';

  IF supabase_url IS NOT NULL AND service_role_key IS NOT NULL THEN
    PERFORM
      net.http_post(
        url := supabase_url || '/functions/v1/funnel-job-runner',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_role_key
        ),
        body := '{}'::jsonb
      );
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Evita que falhas na chamada do webhook travem a transação de inserção
  RAISE WARNING 'Erro ao disparar funnel-job-runner: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para execução imediata
DROP TRIGGER IF EXISTS trigger_funnel_runner_after_insert ON public.funnel_execution_jobs;
CREATE TRIGGER trigger_funnel_runner_after_insert
AFTER INSERT ON public.funnel_execution_jobs
FOR EACH STATEMENT
EXECUTE FUNCTION public.trigger_funnel_runner_on_job();

-- GRANT necessário para o trigger acessar o vault
GRANT USAGE ON SCHEMA vault TO postgres;
GRANT SELECT ON vault.decrypted_secrets TO postgres;
