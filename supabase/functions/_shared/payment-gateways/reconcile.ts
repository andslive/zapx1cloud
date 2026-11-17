// Consulta autenticada ao gateway: reconcilia pendências quando o webhook atrasa ou falha.
import { getPayin } from "./colocapay.ts";
import { getTransaction } from "./leonapay.ts";
import { settleChargeState, type SettleDeps, type SettleOutcome } from "./settle.ts";
import type { FetchFn } from "./types.ts";

export async function reconcileCharge(
  deps: SettleDeps & { fetch: FetchFn },
  chargeId: string,
): Promise<{ outcome: SettleOutcome | "no_charge" | "no_key" | "gateway_error"; status?: string }> {
  const sb = deps.supabase;
  const { data: charge } = await sb.from("payment_charges").select("*").eq("id", chargeId).maybeSingle();
  if (!charge || !charge.external_id) return { outcome: "no_charge" };
  if (charge.status === "paid") return { outcome: "already_paid", status: "paid" };
  const { data: account } = await sb.from("payment_gateway_accounts")
    .select("id, organization_id, provider, environment").eq("id", charge.gateway_account_id).maybeSingle();
  if (!account || account.organization_id !== charge.organization_id) return { outcome: "no_charge" };
  const { data: apiKey, error } = await sb.rpc("get_payment_gateway_secret", {
    p_account_id: account.id, p_organization_id: account.organization_id, p_secret_kind: "api_key",
  });
  if (error || typeof apiKey !== "string") return { outcome: "no_key" };
  try {
    const state = account.provider === "colocapay"
      ? await getPayin(deps.fetch, apiKey, account.environment, charge.external_id)
      : await getTransaction(deps.fetch, apiKey, account.environment, charge.external_id);
    const r = await settleChargeState(deps, {
      account, eventType: "poll", payload: { source: "poll" }, state, lookup: { reference: charge.internal_reference }, source: "poll",
    });
    return { outcome: r.outcome, status: state.status };
  } catch {
    return { outcome: "gateway_error" };
  }
}
