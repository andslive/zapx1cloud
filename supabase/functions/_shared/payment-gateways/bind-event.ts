// Vincula um pagamento confirmado que chegou SEM cobrança (`unknown_charge`) a um pedido, por decisão
// explícita de um operador que conferiu o identificador nos dois lados (a "clave de rastreo" do SPEI:
// `data.reference` do evento = "spei-<clave>" e a clave impressa no comprovante da lead).
// NUNCA atribui por valor/horário. Reaproveita o fluxo de confirmação existente: cria a cobrança SPEI
// vinculada ao `order_ref` da execução, confirma pelo mesmo caminho do webhook (`payment_charge_mark_paid`)
// e retoma UMA vez (`payment_charge_claim_resume` dentro de `resumeLinkedExecution`).
import { interpretLeonaEvent } from "./leonapay.ts";
import { settleChargeState, type SettleDeps, type SettleOutcome } from "./settle.ts";

export type BindResult =
  | { ok: true; chargeId: string; outcome: SettleOutcome; created: boolean }
  | { ok: false; reason: string };

const MIN_SUFFIX = 6;

/** Compara o sufixo informado com a referência do evento ("spei-MBAN0100…386775"), ignorando caixa/máscara. */
export function referenceMatches(eventReference: unknown, suffix: unknown): boolean {
  const ref = String(eventReference ?? "").trim().toUpperCase();
  const s = String(suffix ?? "").trim().toUpperCase();
  if (s.length < MIN_SUFFIX || !/^[A-Z0-9]+$/.test(s)) return false;
  return ref.endsWith(s);
}

export async function bindUnmatchedEvent(
  deps: SettleDeps,
  input: { eventRowId: string; conversationId: string; referenceSuffix: string; operator: string },
): Promise<BindResult> {
  const sb = deps.supabase;
  const { data: ev } = await sb.from("payment_gateway_events").select("*").eq("id", input.eventRowId).maybeSingle();
  if (!ev) return { ok: false, reason: "event_not_found" };
  if (ev.charge_id) return { ok: false, reason: "event_already_linked" };
  if (ev.outcome !== "unknown_charge") return { ok: false, reason: "event_not_unmatched" };
  if (ev.provider !== "leonapay") return { ok: false, reason: "provider_not_supported" };

  const parsed = interpretLeonaEvent(ev.payload);
  if (parsed.kind !== "payment" || parsed.state.status !== "paid") return { ok: false, reason: "event_not_paid" };
  const d = ev.payload?.data ?? {};
  if (String(d.method ?? "").toUpperCase() !== "SPEI") return { ok: false, reason: "event_not_spei" };
  if (!referenceMatches(d.reference, input.referenceSuffix)) return { ok: false, reason: "reference_mismatch" };
  const amount = parsed.state.amount;
  if (!amount || Number(amount) <= 0) return { ok: false, reason: "invalid_amount" };

  const { data: conv } = await sb.from("webchat_conversations")
    .select("id, organization_id, lead_id, current_flow_id, flow_variables").eq("id", input.conversationId).maybeSingle();
  if (!conv) return { ok: false, reason: "conversation_not_found" };
  const gw = conv.flow_variables?.__gateway;
  if (!gw?.order_ref || !gw?.charge_id) return { ok: false, reason: "conversation_without_order" };
  const { data: linked } = await sb.from("payment_charges").select("id, organization_id, flow_id, block_id").eq("id", gw.charge_id).maybeSingle();
  if (!linked || linked.organization_id !== ev.organization_id) return { ok: false, reason: "order_organization_mismatch" };

  const { data: account } = await sb.from("payment_gateway_accounts")
    .select("id, organization_id, provider").eq("id", ev.gateway_account_id).maybeSingle();
  if (!account || account.organization_id !== ev.organization_id) return { ok: false, reason: "account_mismatch" };

  // Cobrança SPEI vinculada ao pedido (idempotente pelo external_id único da transação).
  const ext = parsed.state.externalId;
  let { data: ch } = await sb.from("payment_charges").select("*").eq("gateway_account_id", account.id).eq("external_id", ext).maybeSingle();
  let created = false;
  if (!ch) {
    const ins = await sb.from("payment_charges").insert({
      organization_id: ev.organization_id, gateway_account_id: account.id, provider: "leonapay", method: "SPEI",
      currency: "MXN", amount, status: "pending",
      conversation_id: conv.id, lead_id: conv.lead_id, flow_id: linked.flow_id ?? conv.current_flow_id, block_id: linked.block_id,
      execution_key: `${conv.id}:fixed-clabe:${ext}`, order_ref: gw.order_ref,
      request_fingerprint: `bind-event:${ev.id}`, external_id: ext,
    }).select("*").single();
    if (ins.error) return { ok: false, reason: "charge_insert_failed" };
    ch = ins.data;
    created = true;
  } else if (ch.order_ref !== gw.order_ref) {
    return { ok: false, reason: "charge_belongs_to_other_order" };
  }

  const r = await settleChargeState(deps, {
    account, eventType: "bind_event", payload: { source: "bind_event", event_row: ev.id }, state: parsed.state,
    lookup: {}, source: "webhook",
  });
  await sb.from("payment_gateway_events").update({
    charge_id: ch.id, outcome: r.outcome, outcome_detail: `bind_event:${String(input.operator).slice(0, 60)}`,
  }).eq("id", ev.id).is("charge_id", null);
  return { ok: true, chargeId: ch.id, outcome: r.outcome, created };
}
