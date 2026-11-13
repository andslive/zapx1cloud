import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runChargeBlock } from "./charge-block.ts";
const T: Record<string, any[]> = {
  webchat_conversations: [{ id: "c1", organization_id: "org1" }],
  payment_gateway_accounts: [
    { id: "colo", organization_id: "org1", provider: "colocapay", environment: "production", enabled: true },
    { id: "leona", organization_id: "org1", provider: "leonapay", environment: "production", enabled: true }],
  leads: [],
  payment_charges: [{ id: "old", organization_id: "org1", gateway_account_id: "colo", provider: "colocapay", method: "SPEI", currency: "MXN", amount: 100, status: "pending", payment_code: "710969", payment_qrcode: null, external_id: "x", execution_key: "c1:blk:1", order_ref: "c1:f1", expires_at: null, bank_name: null, beneficiary: null, error_code: null, payment_link: null }],
};
function q(t: string) {
  const f: any[] = []; let op = "select"; let patch: any = null;
  const run = () => {
    let rows = T[t].filter((r) => f.every((fn) => fn(r)));
    if (op === "insert") { const row = { ...patch, id: crypto.randomUUID(), internal_reference: crypto.randomUUID() }; T[t].push(row); return { data: row, error: null }; }
    if (op === "update") { rows.forEach((r) => Object.assign(r, patch)); return { data: null, error: null }; }
    return { data: rows, error: null };
  };
  const b: any = {
    select: () => b, eq: (k: string, v: any) => (f.push((r: any) => r[k] === v), b), in: (k: string, v: any[]) => (f.push((r: any) => v.includes(r[k])), b),
    insert: (p: any) => (op = "insert", patch = p, b), update: (p: any) => (op = "update", patch = p, b),
    maybeSingle: () => { const r = run(); return Promise.resolve({ error: null, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data }); },
    single: () => Promise.resolve(run()),
    then: (res: any) => res(run()),
  };
  return b;
}
const sb: any = { from: q, rpc: () => Promise.resolve({ data: "KEY", error: null }) };

const fetchStub = (u: string) => { return Promise.resolve(new Response(JSON.stringify({ success: true, data: { id: "p", status: "PENDING", amount: 100, nextAction: { type: "CASH_VOUCHER", reference: "0093", barcodeUrl: "https://x/v.png", expiresAt: "2026-11-15T15:00:00Z" } } }), { status: 201 })); };
const mk = (fv: any) => ({ sb, fetch: fetchStub as any, blockId: "blk", blockData: { gateway_account_id: "leona", method: "OXXO", amount: "100", payer_email_mode: "ask" }, conversationId: "c1", flowId: "f1", organizationId: "org1", leadId: null, whatsappDisplayName: "Anderson", flowVariables: fv, replaceVars: (x: any) => String(x ?? "") });

Deno.test("funil reiniciado na mesma conversa: cobrança aberta de outra conta/meio não é devolvida no lugar da nova", async () => {
  const fv: any = {};
  let r: any = await runChargeBlock(mk(fv));
  assertEquals(r.kind, "need_input");
  fv.__charge_asked_email = "a@b.com";
  r = await runChargeBlock(mk(fv));
  assertEquals(r.kind, "advance");
  assertEquals(r.vars.provider, "leonapay");
  assertEquals(r.vars.method, "OXXO");
  assertEquals(r.vars.payment_code, "0093");
  assertEquals(T.payment_charges.map((c) => [c.provider, c.method, c.execution_key]), [["colocapay", "SPEI", "c1:blk:1"], ["leonapay", "OXXO", "c1:blk:2"]]);
});
