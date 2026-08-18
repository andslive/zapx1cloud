-- 07_fix_whatsapp_provider.sql
-- Corrige platform_settings.whatsapp_provider para 'uazapi'.
--
-- Causa: platform_settings não foi migrado (é UPDATE manual por design). Assim a coluna
-- whatsapp_provider ficou no DEFAULT 'evolution'. A Edge Function whatsapp-proxy lê esse
-- valor (provider: settings.whatsapp_provider || 'uazapi') e, com 'evolution', envia o
-- token no header errado (apikey em vez de adminToken) -> a UazAPI responde 401 Unauthorized
-- ao criar instância. Evidência nos logs:
--   [waFetch] POST .../instance/create (provider: evolution, isAdmin: true)
--   [waFetch] Response 401: {"error":"Unauthorized"}
-- Evolution é legado/bloqueado; o provedor correto do sistema é 'uazapi'.
--
-- SEGURANÇA: só a coluna whatsapp_provider da linha singleton é tocada. Nenhum outro
-- dado é alterado. whatsapp-proxy lê o valor em tempo real, então não há redeploy.
-- Idempotente: reaplicar não tem efeito colateral.

\set ON_ERROR_STOP on

BEGIN;

-- Trava de segurança: aborta se a linha singleton esperada não existir.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.platform_settings
    WHERE id = 'c29da4b6-1dc2-44a5-8537-1c3be360cfb0'
  ) THEN
    RAISE EXCEPTION 'platform_settings singleton (id c29da4b6-…) não encontrado — verifique antes de aplicar.';
  END IF;
END $$;

UPDATE public.platform_settings
SET whatsapp_provider = 'uazapi'
WHERE id = 'c29da4b6-1dc2-44a5-8537-1c3be360cfb0';

-- Validação pós-update:
SELECT
  whatsapp_provider AS whatsapp_provider_atual,
  CASE WHEN whatsapp_provider = 'uazapi' THEN 'ok' ELSE 'FALHA' END AS resultado
FROM public.platform_settings
WHERE id = 'c29da4b6-1dc2-44a5-8537-1c3be360cfb0';

-- Aplicado: valor validado (uazapi | ok) e gravado.
COMMIT;
