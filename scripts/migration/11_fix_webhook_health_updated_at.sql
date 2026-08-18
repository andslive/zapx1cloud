-- 11_fix_webhook_health_updated_at.sql
-- Corrige o erro recorrente nos logs: uazapi-webhook faz upsert em webhook_health
-- gravando updated_at, mas a coluna não existe -> PostgREST:
--   "Could not find the 'updated_at' column of 'webhook_health' in the schema cache"
-- Correção mínima: adicionar a coluna. Trigger para manter updated_at no caminho de UPDATE
-- (updateWebhookHealth) — segue o mesmo padrão das demais tabelas (update_updated_at_column).
-- Idempotente. Não toca leads/conversas/funis nem qualquer dado de negócio.

\set ON_ERROR_STOP on
BEGIN;

ALTER TABLE public.webhook_health
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DROP TRIGGER IF EXISTS update_webhook_health_updated_at ON public.webhook_health;
CREATE TRIGGER update_webhook_health_updated_at
  BEFORE UPDATE ON public.webhook_health
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validação:
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema='public' AND table_name='webhook_health' AND column_name='updated_at') AS coluna_ok,
  (SELECT count(*) FROM pg_trigger
     WHERE tgrelid='public.webhook_health'::regclass AND tgname='update_webhook_health_updated_at') AS trigger_ok;

-- Dry-run OK (coluna_ok=1, trigger_ok=1) -> aplicado.
COMMIT;
