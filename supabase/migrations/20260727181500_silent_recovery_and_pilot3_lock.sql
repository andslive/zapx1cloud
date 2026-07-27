-- FASE 2.4 — modo silencioso de recuperação + trava permanente do 3º piloto.
-- Aditiva, forward-only. Não altera nem reverte a migration anterior
-- (20260727141449), que já está em produção e comprovadamente funcionando
-- (tráfego ao vivo saudável, duplicação estrutural fechada).

-- ─────────────────────────────────────────────────────────────────────────
-- 1) receipt_recovery_requests: novo status terminal + trava explícita
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.receipt_recovery_requests
  DROP CONSTRAINT IF EXISTS receipt_recovery_requests_status_check;

ALTER TABLE public.receipt_recovery_requests
  ADD CONSTRAINT receipt_recovery_requests_status_check
  CHECK (status IN ('pending', 'claimed', 'done', 'failed', 'skipped', 'completed_with_unexpected_outbound'));

ALTER TABLE public.receipt_recovery_requests
  ADD COLUMN IF NOT EXISTS retry_blocked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.receipt_recovery_requests.retry_blocked IS
  'FASE 2.4 — defesa em profundidade: mesmo que o status seja alterado por engano, a reivindicação atômica (UPDATE...WHERE status=''pending''...) em execute_recovery/execute_silent_recovery também exige retry_blocked=false.';

-- Marca o 3º piloto (comprovante real, R$15,00, aceito pela Meta,
-- fbtrace_id=AcjRlFNmN5QBIGbgjSMnLz1) como definitivamente encerrado —
-- venda válida, mas nunca mais reprocessável por este mecanismo.
UPDATE public.receipt_recovery_requests
SET status = 'completed_with_unexpected_outbound',
    retry_blocked = true
WHERE id = 'fae34a91-c4d3-49fa-9046-3f88ea1791d9';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Feature flag geral do modo silencioso — desligada por padrão.
--    execute_silent_recovery recusa operar se esta linha não existir ou
--    estiver 'false', mesmo que chamada com um recoveryId válido.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recovery_feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.recovery_feature_flags (key, enabled)
VALUES ('silent_purchase_recovery_enabled', false)
ON CONFLICT (key) DO NOTHING;

REVOKE ALL ON public.recovery_feature_flags FROM anon, authenticated;
ALTER TABLE public.recovery_feature_flags ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.recovery_feature_flags IS
  'FASE 2.4 — kill switch geral. silent_purchase_recovery_enabled precisa estar true para QUALQUER execute_silent_recovery funcionar, além da guarda por recoveryId específico.';

-- Habilitação por caso específico (defesa em profundidade além da flag
-- geral): só um recovery_id explicitamente marcado pode rodar em modo
-- silencioso, mesmo com a flag geral ligada.
ALTER TABLE public.receipt_recovery_requests
  ADD COLUMN IF NOT EXISTS silent_mode_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.receipt_recovery_requests.silent_mode_enabled IS
  'FASE 2.4 — precisa ser true (setado manualmente, por leitura, nunca aceito de payload) para este recovery específico rodar via execute_silent_recovery, além da flag geral recovery_feature_flags.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Auditoria de tentativas de outbound bloqueadas no modo silencioso.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.receipt_recovery_requests
  ADD COLUMN IF NOT EXISTS outbound_attempted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.receipt_recovery_requests.outbound_attempted IS
  'FASE 2.4 — setado true e o processamento é interrompido IMEDIATAMENTE se qualquer código no modo silencioso tentar enfileirar ou enviar uma mensagem. Nunca deve ficar true em uso normal — presença de true é sinal de bug ou regressão a ser investigado antes de qualquer novo piloto.';
