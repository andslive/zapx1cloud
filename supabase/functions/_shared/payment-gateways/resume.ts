// Retoma a execução do funil vinculada à cobrança — somente se ainda estiver apta.
import type { ChargeRow } from "./charge.ts";

/**
 * Apta = a conversa ainda roda o MESMO funil, está com o bot ativo, não concluiu e carrega esta
 * cobrança nas variáveis da execução. Execução interrompida ou trocada: o pagamento fica
 * registrado na cobrança original e nada é retomado.
 */
export async function resumeLinkedExecution(
  supabase: any,
  charge: Pick<ChargeRow, "id" | "conversation_id" | "flow_id" | "block_id">,
  reason: "paid" | "instructions",
): Promise<{ resumed: boolean; why: string }> {
  if (!charge.conversation_id) return { resumed: false, why: "no_conversation" };
  const { data: conv } = await supabase.from("webchat_conversations")
    .select("id, status, current_flow_id, current_block_id, flow_completed, flow_variables")
    .eq("id", charge.conversation_id).maybeSingle();
  if (!conv) return { resumed: false, why: "conversation_missing" };
  if (conv.status !== "bot_active" || conv.flow_completed) return { resumed: false, why: "execution_not_active" };
  if (conv.current_flow_id !== charge.flow_id) return { resumed: false, why: "funnel_changed" };
  if (conv.flow_variables?.__gateway?.charge_id !== charge.id) return { resumed: false, why: "other_execution" };

  if (reason === "instructions") {
    // O bloco Cobrança está parado aguardando o voucher completo.
    if (conv.current_block_id !== charge.block_id) return { resumed: false, why: "not_waiting_instructions" };
  } else {
    const { data: funnel } = await supabase.from("capture_funnels").select("flow_blocks").eq("id", charge.flow_id).maybeSingle();
    const cur = (funnel?.flow_blocks ?? []).find((b: any) => b.id === conv.current_block_id);
    // Confirmação antecipada (ainda antes do Reconhecer comprovante): nada a retomar; o bloco consome ao chegar.
    if (cur?.type !== "ai_receipt") return { resumed: false, why: "not_at_receipt_block" };
    const { data: won } = await supabase.rpc("payment_charge_claim_resume", { p_charge_id: charge.id });
    if (won !== true) return { resumed: false, why: "already_claimed" };
  }
  const { error } = await supabase.functions.invoke("uazapi-webhook", {
    body: { action: "resume_funnel", conversationId: conv.id, paymentResume: true, chargeId: charge.id },
  });
  return error ? { resumed: false, why: "invoke_failed" } : { resumed: true, why: reason };
}
