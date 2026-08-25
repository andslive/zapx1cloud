-- FASE 20H — reconciliação de schema, NÃO uma coluna nova.
--
-- Contexto (achado desta fase, confirmado por leitura direta do Cloud
-- linkado, `information_schema.columns`/`pg_constraint`/`pg_indexes` contra
-- `public.evolution_instances`, em 2026-08-24): as colunas abaixo, o FK e o
-- índice parcial JÁ EXISTEM em produção — provavelmente adicionados fora
-- deste repositório (era comum antes da migração para fora da Lovable
-- Cloud, ver `CLAUDE.md`) — mas NENHUMA migration deste repositório os
-- declara, e NENHUM código (frontend ou Edge Function) os lê ou escreve
-- hoje. São, na prática, um mecanismo de arquivamento já projetado e
-- pronto, porém órfão e não usado por nenhuma tela.
--
-- Confirmado por leitura (2026-08-24, produção `ydunpoqdhijhnrarohiz`):
--   evolution_instances.archived_at         timestamptz NULL
--   evolution_instances.archived_by         uuid NULL
--     FK: archived_by REFERENCES profiles(id)          (evolution_instances_archived_by_fkey)
--   evolution_instances.archive_reason      text NULL
--   evolution_instances.provider_deleted_at timestamptz NULL
--   índice parcial: idx_evolution_instances_archived_at
--     ON evolution_instances (organization_id, archived_at) WHERE archived_at IS NOT NULL
--   0 linhas com archived_at preenchido em produção hoje.
--
-- Decisão desta fase (Parte 3 do plano): REAPROVEITAR este mecanismo em vez
-- de criar `is_archived`/coluna redundante. Semântica canônica adotada em
-- todo o código desta fase: conexão operacional ⇔ `archived_at IS NULL`;
-- conexão arquivada ⇔ `archived_at IS NOT NULL` (timestamp de quando foi
-- retirada da operação). `archived_by` referencia o perfil que arquivou
-- (auditoria); `archive_reason` é texto livre opcional; `provider_deleted_at`
-- fica reservado para uma fase FUTURA e SEPARADA em que a instância também
-- for removida do lado da UazAPI (nunca preenchido pela ação desta fase,
-- que nunca chama a UazAPI — ver `archive_instance` em
-- `supabase/functions/whatsapp-proxy/index.ts`).
--
-- Esta migration só existe para trazer o REPOSITÓRIO (histórico de
-- migrations rastreável em git) para o mesmo estado que a PRODUÇÃO já tem
-- — nunca para alterar produção, que já está neste estado. Por isso é
-- 100% idempotente (`IF NOT EXISTS` em toda cláusula) e não faz nenhum
-- backfill, nenhum DROP, nenhuma mudança de RLS/GRANT, nenhum trigger.
--
-- NÃO APLICADA nesta fase — arquivo SQL só para revisão no Draft PR. Se/
-- quando for aplicada (fase futura, autorização separada), o resultado
-- esperado é NENHUMA mudança observável em produção (todas as cláusulas já
-- são verdade lá), servindo só para sincronizar o histórico de migrations
-- do repositório com a realidade do banco.

ALTER TABLE public.evolution_instances
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS archived_by uuid NULL,
  ADD COLUMN IF NOT EXISTS archive_reason text NULL,
  ADD COLUMN IF NOT EXISTS provider_deleted_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'evolution_instances_archived_by_fkey'
      AND conrelid = 'public.evolution_instances'::regclass
  ) THEN
    ALTER TABLE public.evolution_instances
      ADD CONSTRAINT evolution_instances_archived_by_fkey
      FOREIGN KEY (archived_by) REFERENCES public.profiles(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_evolution_instances_archived_at
  ON public.evolution_instances (organization_id, archived_at)
  WHERE archived_at IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════
-- ROLLBACK (documentado, NÃO executado):
--
-- Reverter esta migration reverteria o REPOSITÓRIO para não rastrear um
-- estado que a produção já tem de qualquer forma — não removeria nada de
-- produção por si só. Se algum dia for necessário desfazer de verdade
-- (produção incluída), isso exigiria antes confirmar 0 linhas com
-- archived_at preenchido (senão o DROP COLUMN apagaria o histórico de
-- arquivamento real) e autorização humana explícita, fora do escopo desta
-- fase:
--
-- DROP INDEX IF EXISTS public.idx_evolution_instances_archived_at;
-- ALTER TABLE public.evolution_instances DROP CONSTRAINT IF EXISTS evolution_instances_archived_by_fkey;
-- ALTER TABLE public.evolution_instances
--   DROP COLUMN IF EXISTS provider_deleted_at,
--   DROP COLUMN IF EXISTS archive_reason,
--   DROP COLUMN IF EXISTS archived_by,
--   DROP COLUMN IF EXISTS archived_at;
-- ══════════════════════════════════════════════════════════════════════
