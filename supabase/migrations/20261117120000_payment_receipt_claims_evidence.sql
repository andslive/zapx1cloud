-- Evidência do comprovante guardada na claim, usada só pela regra de clave PARCIAL (aprovação automática quando o
-- trecho legível identifica um único SPEI pago e o valor/destino do comprovante conferem). Aditiva e idempotente:
-- depende de 20261116120000_payment_receipt_claims.sql já aplicada; a regra de clave completa não usa estas colunas.
ALTER TABLE public.payment_receipt_claims
  ADD COLUMN IF NOT EXISTS receipt_amount numeric,
  ADD COLUMN IF NOT EXISTS receipt_destination_tail text,
  ADD COLUMN IF NOT EXISTS receipt_printed_at timestamptz;
COMMENT ON COLUMN public.payment_receipt_claims.receipt_amount IS 'Valor lido no comprovante (evidência da clave parcial).';
COMMENT ON COLUMN public.payment_receipt_claims.receipt_destination_tail IS 'Finais da conta/CLABE de destino lidos no comprovante.';
COMMENT ON COLUMN public.payment_receipt_claims.receipt_printed_at IS 'Data/hora impressas no comprovante (auxiliar; nunca bloqueia).';
