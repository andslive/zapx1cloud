// Gate do bloco Reconhecer comprovante para execuções com cobrança vinculada.
// Sem cobrança vinculada → decision "none": o comportamento atual (Bre-B fixo, OCR/IA) fica intacto.
export type ReceiptGateDecision =
  | { decision: "none" }                                   // sem cobrança: caminho legado
  | { decision: "success"; chargeId: string; paidAmount: string } // gateway confirmou: saída de sucesso
  | { decision: "pending"; chargeId: string; status: string };    // pendente/vencida/já entregue: atendimento segue

export interface ReceiptGateDeps {
  loadCharge: (id: string) => Promise<{ id: string; status: string; amount: string; paid_amount?: string | null; consumed_at?: string | null; consumed_block_id?: string | null } | null>;
  /** true apenas na PRIMEIRA consumição (consumo atômico no banco). */
  consume: (chargeId: string, blockId: string) => Promise<boolean>;
  /** Consulta autenticada ao gateway e convergência (mesma rotina do webhook). */
  reconcile: (chargeId: string) => Promise<void>;
}

export async function evaluateReceiptGate(
  deps: ReceiptGateDeps,
  input: { chargeId: string | null | undefined; blockId: string; leadSentReceipt: boolean; paymentResume: boolean },
): Promise<ReceiptGateDecision> {
  if (!input.chargeId) return { decision: "none" };
  let c = await deps.loadCharge(input.chargeId);
  if (!c) return { decision: "none" }; // fail-safe: cobrança sumida não bloqueia o fluxo legado

  // Comprovante enviado (ou retomada): a confirmação depende SEMPRE do gateway.
  if (c.status !== "paid" && (input.leadSentReceipt || input.paymentResume)) {
    await deps.reconcile(c.id);
    c = (await deps.loadCharge(input.chargeId)) ?? c;
  }

  if (c.status === "paid") {
    if (await deps.consume(c.id, input.blockId)) return { decision: "success", chargeId: c.id, paidAmount: c.paid_amount ?? c.amount };
    // Replay do mesmo bloco após consumo: idempotente, nada é entregue de novo.
    if (c.consumed_block_id === input.blockId) return { decision: "pending", chargeId: c.id, status: "paid_already_consumed" };
    return { decision: "pending", chargeId: c.id, status: "paid_elsewhere" }; // 2º pagamento / já entregue
  }
  return { decision: "pending", chargeId: c.id, status: c.status };
}
