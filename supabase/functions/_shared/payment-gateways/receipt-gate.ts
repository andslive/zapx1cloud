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
  /** Cobrança paga e ainda NÃO entregue do mesmo pedido (a 1ª que ficou pronta). */
  findDeliverableInOrder: (orderRef: string) => Promise<{ id: string; amount: string; paid_amount?: string | null } | null>;
  /** Consulta autenticada ao gateway e convergência (mesma rotina do webhook). */
  reconcile: (chargeId: string) => Promise<void>;
}

export async function evaluateReceiptGate(
  deps: ReceiptGateDeps,
  input: { chargeId: string | null | undefined; orderRef?: string | null; blockId: string; leadSentReceipt: boolean; paymentResume: boolean },
): Promise<ReceiptGateDecision> {
  if (!input.chargeId) return { decision: "none" };
  let c = await deps.loadCharge(input.chargeId);
  if (!c) return { decision: "none" }; // fail-safe: cobrança sumida não bloqueia o fluxo legado

  // Comprovante enviado (ou retomada): a confirmação depende SEMPRE do gateway.
  if (c.status !== "paid" && (input.leadSentReceipt || input.paymentResume)) {
    await deps.reconcile(c.id);
    c = (await deps.loadCharge(input.chargeId)) ?? c;
  }

  // Entrega UMA vez por pedido: qualquer cobrança paga do pedido (SPEI ou OXXO) serve, a 1ª que ainda não foi entregue.
  if (c.status === "paid" && !c.consumed_at) {
    if (await deps.consume(c.id, input.blockId)) return { decision: "success", chargeId: c.id, paidAmount: c.paid_amount ?? c.amount };
  }
  const mate = await deps.findDeliverableInOrder(input.orderRef ?? "");
  if (mate && await deps.consume(mate.id, input.blockId)) {
    return { decision: "success", chargeId: mate.id, paidAmount: mate.paid_amount ?? mate.amount };
  }
  if (c.status === "paid") {
    // Replay do mesmo bloco após consumo: idempotente; ou pedido já entregue por outra cobrança.
    return { decision: "pending", chargeId: c.id, status: c.consumed_block_id === input.blockId ? "paid_already_consumed" : "paid_elsewhere" };
  }
  return { decision: "pending", chargeId: c.id, status: c.status };
}
