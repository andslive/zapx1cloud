// Conciliação automática SPEI (CLABE fixa compartilhada) pela "clave de rastreo" do comprovante.
// Regras (todas obrigatórias):
//  - a liberação depende de um evento `payment.paid` JÁ validado pela LeonaPay (assinatura, conta, organização);
//  - o cruzamento é por IGUALDADE EXATA entre a clave do comprovante e `data.reference` sem o prefixo "spei-";
//  - referência parcial, divergência, mais de um candidato ou a mesma clave em outro pedido → conciliação manual;
//  - valor, nome e horário NUNCA atribuem pagamento; a conferência de valor/moeda é feita no banco (mark_paid).
import { bindUnmatchedEvent } from "./bind-event.ts";
import type { SettleDeps } from "./settle.ts";

const MIN_LEN = 8;
const MAX_LEN = 30;

/** Normaliza: maiúsculas, só alfanumérico. */
export function normalizeClave(v: unknown): string {
  return String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** `data.reference` da LeonaPay ("spei-<clave>") → clave normalizada. */
export function referenceClave(reference: unknown): string {
  return normalizeClave(String(reference ?? "").replace(/^\s*spei[-_ ]*/i, ""));
}

const LABEL = /(?:clave\s*(?:de\s*)?rastreo|cve\.?\s*(?:de\s*)?rastreo|rastreo)\s*[:#.\-]?\s*([A-Za-z0-9][A-Za-z0-9 \-]{6,40})/gi;

/**
 * Extrai candidatos a clave de rastreo do texto do comprovante (texto do PDF ou leitura da imagem).
 * Exige 8–30 caracteres alfanuméricos e ao menos um dígito (evita capturar a palavra seguinte do layout).
 */
export function extractClavesRastreo(text: unknown): string[] {
  const t = String(text ?? "");
  const out = new Set<string>();
  for (const m of t.matchAll(LABEL)) {
    // Pega o 1º "token" (a clave não tem espaço): cortes de linha/colunas viram separadores.
    const token = normalizeClave(String(m[1]).trim().split(/\s{2,}|\s(?=[A-Za-z]{3,}\b)/)[0]);
    if (token.length >= MIN_LEN && token.length <= MAX_LEN && /\d/.test(token)) out.add(token);
  }
  return [...out];
}

export type ReceiptMatchResult =
  | { status: "no_clave" }
  | { status: "no_order" }
  | { status: "awaiting_payment" }                       // comprovante primeiro: clave guardada até o webhook chegar
  | { status: "bound"; chargeId: string; outcome: string }
  | { status: "already_handled" }                        // outro caminho (webhook/operador) já vinculou
  | { status: "manual"; reason: string };

type Sb = any;

async function markClaims(sb: Sb, org: string, clave: string, patch: Record<string, unknown>, onlyConversation?: string) {
  let q = sb.from("payment_receipt_claims").update({ ...patch, resolved_at: new Date().toISOString() })
    .eq("organization_id", org).eq("clave", clave).neq("status", "bound");
  if (onlyConversation) q = q.eq("conversation_id", onlyConversation);
  await q;
}

async function distinctClaimants(sb: Sb, org: string, clave: string): Promise<string[]> {
  const { data } = await sb.from("payment_receipt_claims").select("conversation_id").eq("organization_id", org).eq("clave", clave);
  return [...new Set<string>((data ?? []).map((r: any) => String(r.conversation_id)))];
}

async function unmatchedPaidSpeiEvents(sb: Sb, org: string, gatewayAccountId: string | null) {
  let q = sb.from("payment_gateway_events").select("id, gateway_account_id, payload")
    .eq("organization_id", org).eq("event_type", "payment.paid").eq("outcome", "unknown_charge").is("charge_id", null)
    .order("received_at", { ascending: false }).limit(500);
  if (gatewayAccountId) q = q.eq("gateway_account_id", gatewayAccountId);
  const { data } = await q;
  return (data ?? []).filter((e: any) => String(e.payload?.data?.method ?? "").toUpperCase() === "SPEI");
}

function classify(events: any[], clave: string) {
  const exact: any[] = [];
  let partial = false;
  for (const e of events) {
    const r = referenceClave(e.payload?.data?.reference);
    if (!r) continue;
    if (r === clave) exact.push(e);
    else if (clave.length >= MIN_LEN && r.length >= MIN_LEN && (r.endsWith(clave) || clave.endsWith(r))) partial = true;
  }
  return { exact, partial };
}

async function bindExact(deps: SettleDeps, ev: any, conversationId: string, clave: string, org: string): Promise<ReceiptMatchResult> {
  const r = await bindUnmatchedEvent(deps, { eventRowId: ev.id, conversationId, referenceSuffix: clave, operator: "auto-receipt" });
  if (r.ok) {
    await deps.supabase.from("payment_receipt_claims").update({ status: "bound", event_row_id: ev.id, resolved_at: new Date().toISOString() })
      .eq("organization_id", org).eq("clave", clave).eq("conversation_id", conversationId);
    return { status: "bound", chargeId: r.chargeId, outcome: r.outcome };
  }
  // Outro caminho (webhook/operador/réplica) venceu a corrida: nada a fazer.
  if (["event_already_linked", "event_not_unmatched", "charge_insert_failed"].includes(r.reason)) return { status: "already_handled" };
  await markClaims(deps.supabase, org, clave, { status: "manual", manual_reason: `bind_refused:${r.reason}` }, conversationId);
  return { status: "manual", reason: `bind_refused:${r.reason}` };
}

/**
 * Comprovante recebido: guarda a clave e, se o evento pago já chegou (webhook antes do comprovante),
 * vincula. Se o evento ainda não chegou, a clave fica pendente até `matchEventToClaims` (comprovante antes do webhook).
 */
export async function matchReceiptToPayment(
  deps: SettleDeps,
  input: { conversationId: string; claves: string[]; messageId?: string | null },
): Promise<ReceiptMatchResult> {
  const sb = deps.supabase;
  const claves = [...new Set(input.claves.map(normalizeClave).filter((c) => c.length >= MIN_LEN && c.length <= MAX_LEN))];
  if (claves.length === 0) return { status: "no_clave" };

  const { data: conv } = await sb.from("webchat_conversations").select("id, organization_id, flow_variables").eq("id", input.conversationId).maybeSingle();
  const gw = conv?.flow_variables?.__gateway;
  if (!conv || !gw?.order_ref || !gw?.charge_id) return { status: "no_order" };
  const { data: linked } = await sb.from("payment_charges").select("organization_id, gateway_account_id").eq("id", gw.charge_id).maybeSingle();
  if (!linked || linked.organization_id !== conv.organization_id) return { status: "no_order" };
  const org: string = conv.organization_id;

  let result: ReceiptMatchResult = { status: "awaiting_payment" };
  for (const clave of claves) {
    await sb.from("payment_receipt_claims").upsert({
      organization_id: org, gateway_account_id: linked.gateway_account_id ?? null, conversation_id: conv.id,
      order_ref: gw.order_ref, clave, message_id: input.messageId ?? null,
    }, { onConflict: "organization_id,clave,conversation_id", ignoreDuplicates: true });

    // A mesma clave em outro pedido: não decide sozinho.
    if ((await distinctClaimants(sb, org, clave)).length > 1) {
      await markClaims(sb, org, clave, { status: "manual", manual_reason: "conflicting_orders" });
      result = { status: "manual", reason: "conflicting_orders" };
      continue;
    }
    const { exact, partial } = classify(await unmatchedPaidSpeiEvents(sb, org, linked.gateway_account_id ?? null), clave);
    if (exact.length > 1) {
      await markClaims(sb, org, clave, { status: "manual", manual_reason: "ambiguous_events" }, conv.id);
      result = { status: "manual", reason: "ambiguous_events" };
      continue;
    }
    if (exact.length === 0) {
      if (partial) {
        await markClaims(sb, org, clave, { status: "manual", manual_reason: "partial_reference" }, conv.id);
        result = { status: "manual", reason: "partial_reference" };
      }
      continue; // sem evento ainda: aguarda o webhook
    }
    const r = await bindExact(deps, exact[0], conv.id, clave, org);
    if (r.status === "bound") return r;
    result = r;
  }
  return result;
}

/**
 * Evento `payment.paid` SPEI sem cobrança acabou de chegar (comprovante antes do webhook): procura comprovante
 * pendente com a MESMA clave (igualdade exata) e vincula, retomando a execução uma única vez.
 */
export async function matchEventToClaims(deps: SettleDeps, ev: { id: string; organization_id: string; gateway_account_id: string; payload: any }): Promise<ReceiptMatchResult> {
  const sb = deps.supabase;
  if (String(ev.payload?.data?.method ?? "").toUpperCase() !== "SPEI") return { status: "no_clave" };
  const clave = referenceClave(ev.payload?.data?.reference);
  if (clave.length < MIN_LEN) return { status: "no_clave" };
  const { data: claims } = await sb.from("payment_receipt_claims").select("conversation_id, gateway_account_id, status")
    .eq("organization_id", ev.organization_id).eq("clave", clave);
  const usable = (claims ?? []).filter((c: any) => !c.gateway_account_id || c.gateway_account_id === ev.gateway_account_id);
  const convs = [...new Set<string>(usable.map((c: any) => String(c.conversation_id)))];
  if (convs.length === 0) return { status: "awaiting_payment" };
  if (convs.length > 1) {
    await markClaims(sb, ev.organization_id, clave, { status: "manual", manual_reason: "conflicting_orders" });
    return { status: "manual", reason: "conflicting_orders" };
  }
  // Dois eventos com a mesma referência (duplicidade do gateway): não decide sozinho.
  const { exact } = classify(await unmatchedPaidSpeiEvents(sb, ev.organization_id, ev.gateway_account_id), clave);
  if (exact.length > 1) {
    await markClaims(sb, ev.organization_id, clave, { status: "manual", manual_reason: "ambiguous_events" });
    return { status: "manual", reason: "ambiguous_events" };
  }
  return await bindExact(deps, ev, convs[0], clave, ev.organization_id);
}
