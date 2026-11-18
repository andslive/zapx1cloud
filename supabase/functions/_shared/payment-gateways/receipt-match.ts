// Conciliação automática SPEI (CLABE fixa compartilhada) pela "clave de rastreo" do comprovante.
// Regras (todas obrigatórias):
//  - a liberação depende de um evento `payment.paid` JÁ validado pela LeonaPay (assinatura, conta, organização);
//  - o cruzamento é por IGUALDADE EXATA entre a clave do comprovante e `data.reference` sem o prefixo "spei-";
//  - referência parcial, divergência, mais de um candidato ou a mesma clave em outro pedido → conciliação manual;
//  - valor, nome e horário NUNCA atribuem pagamento; a conferência de valor/moeda é feita no banco (mark_paid).
import { bindUnmatchedEvent } from "./bind-event.ts";
import type { SettleDeps } from "./settle.ts";
import { decidePartialMatch, MIN_PARTIAL_LEN, parseReceiptEvidence, partialRelation, type PartialCandidate } from "./partial-match.ts";

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
  | { status: "bound"; chargeId: string; outcome: string; partial?: Record<string, unknown> }
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

async function bindExact(deps: SettleDeps, ev: any, conversationId: string, clave: string, org: string, opts?: { bindClave?: string; operator?: string }): Promise<ReceiptMatchResult> {
  const r = await bindUnmatchedEvent(deps, { eventRowId: ev.id, conversationId, referenceSuffix: opts?.bindClave ?? clave, operator: opts?.operator ?? "auto-receipt" });
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
  input: { conversationId: string; claves: string[]; messageId?: string | null; receiptText?: string | null; expectedDestinationTail?: string | null },
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

  const evidence = parseReceiptEvidence(input.receiptText ?? "");
  let result: ReceiptMatchResult = { status: "awaiting_payment" };
  for (const clave of claves) {
    await sb.from("payment_receipt_claims").upsert({
      organization_id: org, gateway_account_id: linked.gateway_account_id ?? null, conversation_id: conv.id,
      order_ref: gw.order_ref, clave, message_id: input.messageId ?? null,
      receipt_amount: evidence.amount ?? null, receipt_destination_tail: evidence.destinationTail ?? null, receipt_printed_at: evidence.printedAtIso ?? null,
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
      if (partial && clave.length < MIN_PARTIAL_LEN) {
        await markClaims(sb, org, clave, { status: "manual", manual_reason: "partial_reference" }, conv.id);
        result = { status: "manual", reason: "partial_reference" };
        continue;
      }
      // Clave cortada no comprovante: um único SPEI pago e sem vínculo que case com o trecho legível,
      // com valor/moeda do pedido, pode ser aprovado (ver partial-match.ts). Qualquer dúvida → manual.
      const events = await unmatchedPaidSpeiEvents(sb, org, linked.gateway_account_id ?? null);
      const candidates: PartialCandidate[] = events.map((e: any) => ({
        id: e.id, reference: String(e.payload?.data?.reference ?? ""), amount: e.payload?.data?.amount != null ? Number(e.payload.data.amount) : null,
        currency: e.payload?.data?.currency ?? null, paidAt: e.payload?.data?.paidAt ?? null,
      }));
      const { data: boundEvs } = await sb.from("payment_gateway_events").select("payload")
        .eq("organization_id", org).eq("event_type", "payment.paid").not("charge_id", "is", null)
        .eq("payload->data->>method", "SPEI").order("received_at", { ascending: false }).limit(1000);
      const boundWith = (boundEvs ?? []).filter((e: any) => partialRelation(clave, referenceClave(e.payload?.data?.reference)) !== null).length;
      const dec = decidePartialMatch({
        legible: clave, candidates, boundWithSameFragment: boundWith,
        evidence, expectedDestinationTail: input.expectedDestinationTail ?? null,
      });
      if (dec.decision === "wait") continue; // nenhum SPEI pago casa ainda: aguarda o webhook
      if (dec.decision === "manual") {
        await markClaims(sb, org, clave, { status: "manual", manual_reason: dec.reason }, conv.id);
        result = { status: "manual", reason: dec.reason };
        continue;
      }
      const rp = await bindExact(deps, { id: dec.candidate.id }, conv.id, clave, org, {
        bindClave: referenceClave(dec.candidate.reference), operator: "auto-receipt-partial",
      });
      if (rp.status === "bound") return { ...rp, partial: dec.evidence };
      result = rp;
      continue;
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
export async function matchEventToClaims(deps: SettleDeps, ev: { id: string; organization_id: string; gateway_account_id: string; payload: any }, opts?: { expectedDestinationTail?: string | null }): Promise<ReceiptMatchResult> {
  const sb = deps.supabase;
  if (String(ev.payload?.data?.method ?? "").toUpperCase() !== "SPEI") return { status: "no_clave" };
  const clave = referenceClave(ev.payload?.data?.reference);
  if (clave.length < MIN_LEN) return { status: "no_clave" };
  const { data: claims } = await sb.from("payment_receipt_claims").select("conversation_id, gateway_account_id, status")
    .eq("organization_id", ev.organization_id).eq("clave", clave);
  const usable = (claims ?? []).filter((c: any) => !c.gateway_account_id || c.gateway_account_id === ev.gateway_account_id);
  const convs = [...new Set<string>(usable.map((c: any) => String(c.conversation_id)))];
  if (convs.length === 0) return await matchEventToPartialClaims(deps, ev, clave, opts?.expectedDestinationTail ?? null);
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

/**
 * Comprovante com clave cortada chegou ANTES do pagamento: a claim guarda o trecho legível. Quando o evento chega,
 * aprova se o trecho identifica só este evento (e nenhuma outra claim de outro pedido), com valor/moeda do pedido.
 */
async function matchEventToPartialClaims(deps: SettleDeps, ev: { id: string; organization_id: string; gateway_account_id: string; payload: any }, fullClave: string, expectedDestinationTail: string | null): Promise<ReceiptMatchResult> {
  const sb = deps.supabase;
  const { data: pend } = await sb.from("payment_receipt_claims").select("conversation_id, clave, gateway_account_id, receipt_amount, receipt_destination_tail, receipt_printed_at")
    .eq("organization_id", ev.organization_id).eq("status", "pending").limit(500);
  const mine = (pend ?? []).filter((c: any) => (!c.gateway_account_id || c.gateway_account_id === ev.gateway_account_id) && partialRelation(c.clave, fullClave) !== null);
  const convs = [...new Set<string>(mine.map((c: any) => String(c.conversation_id)))];
  if (convs.length === 0) return { status: "awaiting_payment" };
  const frag: string = mine[0].clave;
  if (convs.length > 1) {
    await markClaims(sb, ev.organization_id, frag, { status: "manual", manual_reason: "conflicting_orders" });
    return { status: "manual", reason: "conflicting_orders" };
  }
  const events = await unmatchedPaidSpeiEvents(sb, ev.organization_id, ev.gateway_account_id);
  const candidates: PartialCandidate[] = events.map((e: any) => ({
    id: e.id, reference: String(e.payload?.data?.reference ?? ""), amount: e.payload?.data?.amount != null ? Number(e.payload.data.amount) : null,
    currency: e.payload?.data?.currency ?? null, paidAt: e.payload?.data?.paidAt ?? null,
  }));
  const { data: boundEvs } = await sb.from("payment_gateway_events").select("payload")
    .eq("organization_id", ev.organization_id).eq("event_type", "payment.paid").not("charge_id", "is", null)
    .eq("payload->data->>method", "SPEI").order("received_at", { ascending: false }).limit(1000);
  const boundWith = (boundEvs ?? []).filter((e: any) => partialRelation(frag, referenceClave(e.payload?.data?.reference)) !== null).length;
  const dec = decidePartialMatch({
    legible: frag, candidates, boundWithSameFragment: boundWith, expectedDestinationTail,
    evidence: {
      amount: mine[0].receipt_amount != null ? Number(mine[0].receipt_amount) : null, destinationTail: mine[0].receipt_destination_tail ?? null,
      printedAtIso: mine[0].receipt_printed_at ?? null,
    },
  });
  if (dec.decision === "wait") return { status: "awaiting_payment" };
  if (dec.decision === "manual") {
    await markClaims(sb, ev.organization_id, frag, { status: "manual", manual_reason: dec.reason }, convs[0]);
    return { status: "manual", reason: dec.reason };
  }
  if (dec.candidate.id !== ev.id) return { status: "awaiting_payment" };
  const r = await bindExact(deps, ev, convs[0], frag, ev.organization_id, { bindClave: fullClave, operator: "auto-receipt-partial" });
  return r.status === "bound" ? { ...r, partial: dec.evidence } : r;
}
