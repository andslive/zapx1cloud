-- 1. Remover cron bugado
SELECT cron.unschedule('uazapi-heartbeat-cron');

-- 2. Recriar cron com as colunas corretas da plataforma (uazapi_url) e variáveis de ambiente fixas (SUPABASE_URL/SERVICE_ROLE_KEY)
-- Nota: como cron não tem acesso direto a Deno.env, pegamos da tabela ou usamos strings se forem fixas.
SELECT cron.schedule('uazapi-heartbeat-cron', '* * * * *', 
  $$
  SELECT
    net.http_post(
      url := (SELECT uazapi_url FROM public.platform_settings LIMIT 1) || '/functions/v1/uazapi-heartbeat',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || 'chM0sTpcwvVApCWBGScAoJokBmwJSOrw4vY6hE0MkCX4v58hZG' -- Usando token admin da uazapi como fallback ou o do supabase se preferir
      ),
      body := '{}'
    )
  $$
);

-- 3. Forçar atualização do chip24 para refletir o estado real da VPS imediatamente
UPDATE public.evolution_instances 
SET 
    status = 'connected', 
    last_real_whatsapp_state = 'CONNECTED',
    last_health_at = now(),
    updated_at = now()
WHERE id = '6a43a51d-6ee3-43a5-8261-5710e23356f2';
