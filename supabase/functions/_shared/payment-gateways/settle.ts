// Webhook e consulta convergem aqui: persiste o evento ANTES do 2xx, deduplica, confere
// organização/conta/cobrança/método/moeda/valor e garante UMA retomada e UMA entrega por pedido.
import type { GatewayChargeState } from "./types.ts";

export interface SettleDeps {
  supabase: any;
  /** Retoma a execução vinculada (se ainda apta). Chamado só na 1ª confirmação ou 1ª instrução. */
  resume: (charge: any, reason: "paid" | "instructions") => Promise<void>;
}

export interface SettleArgs {
  account: { id: string; organization_id: string; provider: string };
  eventId?: string | null; // ausente na consulta (poll)
  eventType: string;
  payload: unknown;
  state: GatewayChargeState;
  lookup: { reference?: string | null };
  source: "webhook" | "poll";
}

export type SettleOutcome =
  | "applied" | "already_paid" | "second_payment" | "duplicate" | "unknown_charge"
  | "mismatch" | "amount_mismatch" | "status_updated" | "instructions_ready" | "ignored";

async function findCharge(sb: any, a: SettleArgs) {
  if (a.state.externalId) {
    const { data } = await sb.from("payment_charges").select("*")
      .eq("gateway_account_id", a.account.id).eq("external_id", a.state.externalId).maybeSingle();
    if (data) return data;
  }
  if (a.lookup.reference) {
    const { data } = await sb.from("payment_charges").select("*")
      .eq("gateway_account_id", a.account.id).eq("internal_reference", a.lookup.reference).maybeSingle();
    // Cobrança criada mas cuja resposta se perdeu: o evento revela o external_id.
    if (data && !data.external_id && a.state.externalId) {
      await sb.from("payment_charges").update({ external_id: a.state.externalId, updated_at: new Date().toISOString() }).eq("id", data.id);
      return { ...data, external_id: a.state.externalId };
    }
    if (data) return data;
  }
  return null;
}

export async function settleChargeState(deps: SettleDeps, a: SettleArgs): Promise<{ outcome: SettleOutcome; chargeId: string | null }> {
  const sb = deps.supabase;
  let eventRowId: string | null = null;

  // 1) Persistir o evento antes de qualquer efeito (e antes do 2xx).
  if (a.eventId) {
    const ins = await sb.from("payment_gateway_events").insert({
      organization_id: a.account.organization_id, gateway_account_id: a.account.id, provider: a.account.provider,
      event_id: a.eventId, event_type: a.eventType, payload: a.payload,
    }).select("id").single();
    if (ins.error) {
      if (ins.error.code !== "23505") throw new Error("event_persist_failed");
      const { data: prev } = await sb.from("payment_gateway_events").select("id, processed_at")
        .eq("gateway_account_id", a.account.id).eq("event_id", a.eventId).single();
      if (prev?.processed_at) return { outcome: "duplicate", chargeId: null }; // já tratado
      eventRowId = prev?.id ?? null; // chegou antes e a execução caiu: reprocessa
    } else {
      eventRowId = ins.data.id;
    }
  }
  const finish = async (outcome: SettleOutcome, chargeId: string | null, detail?: string) => {
    if (eventRowId) {
      await sb.from("payment_gateway_events").update({
        charge_id: chargeId, processed_at: new Date().toISOString(), outcome, outcome_detail: detail ?? null,
      }).eq("id", eventRowId);
    }
    return { outcome, chargeId };
  };

  // 2) Localizar a cobrança (organização e conta fazem parte da busca).
  const charge = await findCharge(sb, a);
  if (!charge || charge.organization_id !== a.account.organization_id) return await finish("unknown_charge", null);

  const now = new Date().toISOString();
  if (a.state.status === "paid") {
    // 3) Confirmação: conferência e transição atômicas no banco.
    const { data, error } = await sb.rpc("payment_charge_mark_paid", {
      p_charge_id: charge.id, p_organization_id: a.account.organization_id, p_gateway_account_id: a.account.id,
      p_paid_amount: a.state.amount ? Number(a.state.amount) : null, p_currency: "MXN", p_method: charge.method, p_source: a.source,
    });
    if (error) throw new Error("mark_paid_failed");
    const row = Array.isArray(data) ? data[0] : data;
    const outcome = row.outcome as SettleOutcome;
    if (row.first_time) await deps.resume({ ...charge, status: "paid" }, "paid"); // única retomada
    return await finish(outcome, charge.id);
  }

  if (a.state.status === "failed" || a.state.status === "expired") {
    await sb.from("payment_charges").update({ status: a.state.status, error_code: a.state.errorCode, updated_at: now })
      .eq("id", charge.id).in("status", ["creating", "awaiting_instructions", "pending"]);
    return await finish("status_updated", charge.id, a.state.status);
  }

  // pending: se o voucher ficou completo e a cobrança aguardava instruções, libera a mensagem (1x).
  if (a.state.paymentCode && a.state.paymentQrcode !== undefined && charge.status === "awaiting_instructions" &&
      (charge.provider !== "leonapay" || a.state.paymentQrcode)) {
    const { data: upd } = await sb.from("payment_charges").update({
      status: "pending", payment_code: a.state.paymentCode, payment_qrcode: a.state.paymentQrcode,
      payment_link: a.state.paymentLink, expires_at: a.state.expiresAt, updated_at: now,
    }).eq("id", charge.id).eq("status", "awaiting_instructions").select("*");
    if (upd && upd.length === 1) {
      await deps.resume(upd[0], "instructions");
      return await finish("instructions_ready", charge.id);
    }
  }
  return await finish("ignored", charge.id);
}
