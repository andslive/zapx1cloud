import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateReceiptGate } from "./receipt-gate.ts";

function mk(status: string, extra: Record<string, unknown> = {}) {
  const st: any = { c: { id: "c1", status, amount: "250.00", paid_amount: null, consumed_at: null, consumed_block_id: null, ...extra }, reconciles: 0, consumes: 0, becomePaid: false };
  return Object.assign(st, {
    loadCharge: () => Promise.resolve(st.c),
    consume: () => { st.consumes++; if (st.c.consumed_at) return Promise.resolve(false); st.c.consumed_at = "t"; st.c.consumed_block_id = "blk"; return Promise.resolve(true); },
    reconcile: () => { st.reconciles++; if (st.becomePaid) { st.c.status = "paid"; st.c.paid_amount = "250.00"; } return Promise.resolve(); },
  });
}
const inp = (o: Partial<{ chargeId: string | null; leadSentReceipt: boolean; paymentResume: boolean }> = {}) => ({ chargeId: "c1", blockId: "blk", leadSentReceipt: false, paymentResume: false, ...o });

Deno.test("sem cobrança vinculada: caminho legado intocado (Bre-B)", async () => {
  const d = mk("pending");
  assertEquals((await evaluateReceiptGate(d, inp({ chargeId: null, leadSentReceipt: true }))).decision, "none");
  assertEquals(d.reconciles, 0);
});
Deno.test("pagamento sem comprovante: retomada confirma e sai por sucesso", async () => {
  const d = mk("paid", { paid_amount: "250.00" });
  const r = await evaluateReceiptGate(d, inp({ paymentResume: true }));
  assertEquals(r.decision, "success");
});
Deno.test("confirmação antecipada: ao chegar no bloco consome e avança, sem consultar", async () => {
  const d = mk("paid", { paid_amount: "250.00" });
  assertEquals((await evaluateReceiptGate(d, inp())).decision, "success"); assertEquals(d.reconciles, 0);
});
Deno.test("comprovante enviado mas gateway ainda pendente: atendimento segue, sem sucesso", async () => {
  const d = mk("pending");
  const r = await evaluateReceiptGate(d, inp({ leadSentReceipt: true }));
  assertEquals(r, { decision: "pending", chargeId: "c1", status: "pending" }); assertEquals(d.reconciles, 1); assertEquals(d.consumes, 0);
});
Deno.test("comprovante enviado e a consulta ao gateway confirma: sucesso", async () => {
  const d = mk("pending"); d.becomePaid = true;
  assertEquals((await evaluateReceiptGate(d, inp({ leadSentReceipt: true }))).decision, "success");
});
Deno.test("mensagem de texto comum não consulta o gateway (sem custo/ruído)", async () => {
  const d = mk("pending");
  await evaluateReceiptGate(d, inp()); assertEquals(d.reconciles, 0);
});
Deno.test("replay após sucesso não entrega de novo; 2º pagamento fica pendente de conferência", async () => {
  const d = mk("paid", { paid_amount: "250.00" });
  assertEquals((await evaluateReceiptGate(d, inp())).decision, "success");
  const again = await evaluateReceiptGate(d, inp());
  assertEquals(again.decision, "pending"); assertEquals(d.consumes, 2);
  const other = mk("paid", { consumed_at: "x", consumed_block_id: "second_payment" });
  assertEquals((await evaluateReceiptGate(other, inp())).decision, "pending");
});
Deno.test("cobrança vencida: expõe o estado, sem sucesso", async () => {
  const d = mk("expired");
  assertEquals((await evaluateReceiptGate(d, inp({ leadSentReceipt: true }))).decision, "pending");
});
Deno.test("cobrança inexistente: fail-safe para o caminho legado", async () => {
  const d = mk("pending"); d.loadCharge = () => Promise.resolve(null);
  assertEquals((await evaluateReceiptGate(d, inp())).decision, "none");
});
