// Regra de comprovante com clave de rastreo PARCIAL (cortada/ilegível no fim) para SPEI de CLABE fixa.
// Complementa a igualdade exata de `receipt-match.ts`; é função pura (sem banco) para ser testável.
//
// Aprova automaticamente SOMENTE quando TODAS as condições valem:
//  - o trecho legível tem ao menos MIN_PARTIAL_LEN caracteres e é prefixo (ou sufixo) da referência;
//  - corresponde a UM único `payment.paid` SPEI confirmado e ainda sem vínculo (mesma conta de gateway),
//    e a nenhum evento já vinculado (senão o trecho não identifica a transação);
//  - o evento é em MXN e o valor lido no comprovante é IGUAL ao valor confirmado pela LeonaPay (doação de valor livre:
//    o valor da cobrança OXXO pendente do pedido NÃO é critério, pode ser outro);
//  - o destino lido no comprovante é compatível com o destino configurado (SPEI_DESTINATION_TAIL). Destino ilegível,
//    ausente ou sem configuração para comparar → revisão manual.
// Horário impresso x `paidAt`: evidência auxiliar, registrada, NUNCA bloqueia sozinha.
// Dois candidatos, divergência de valor/moeda/destino, destino sem verificação ou nenhum pagamento confirmado → manual (ou espera).

export const MIN_PARTIAL_LEN = 15;

export type PartialCandidate = { id: string; reference: string; amount: number | null; currency: string | null; paidAt: string | null };
export type PartialEvidence = {
  amount?: number | null; currency?: string | null; destinationTail?: string | null; printedAtIso?: string | null;
};
export type PartialDecision =
  | { decision: "approve"; candidate: PartialCandidate; evidence: Record<string, unknown> }
  | { decision: "wait" }
  | { decision: "manual"; reason: string; evidence: Record<string, unknown> };

const norm = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const refClave = (r: unknown) => norm(String(r ?? "").replace(/^\s*spei[-_ ]*/i, ""));

/** O trecho legível é prefixo ou sufixo (mas não igual) da clave completa? */
export function partialRelation(legible: string, full: string): "prefix" | "suffix" | null {
  const l = norm(legible), f = norm(full);
  if (!l || !f || l === f || l.length >= f.length) return null;
  if (f.startsWith(l)) return "prefix";
  if (f.endsWith(l)) return "suffix";
  return null;
}

/** Diferença em minutos entre o horário impresso (já convertido para ISO/UTC) e o `paidAt`. */
export function timeDeltaMinutes(printedAtIso: string | null | undefined, paidAt: string | null | undefined): number | null {
  const a = Date.parse(String(printedAtIso ?? "")), b = Date.parse(String(paidAt ?? ""));
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((a - b) / 60000) : null;
}

const MONTHS: Record<string, number> = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };

/** Extrai valor, destino e horário impresso do texto do comprovante (leitura da imagem/PDF). Tudo opcional. */
export function parseReceiptEvidence(text: unknown, utcOffsetMin = -360): PartialEvidence {
  const t = String(text ?? "");
  const out: PartialEvidence = {};
  const am = t.match(/(?:valor|monto|importe(?:\s+transferido)?)\s*(?:enviado)?\s*[:#]?\s*\$?\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?|[0-9]+(?:[.,][0-9]{1,2})?)/i);
  if (am) {
    let s = am[1];
    if (/[.,]\d{2}$/.test(s)) s = s.replace(/[.,](\d{2})$/, "#$1").replace(/[.,]/g, "").replace("#", ".");
    else s = s.replace(/[.,]/g, "");
    const n = Number(s);
    if (Number.isFinite(n) && n > 0) out.amount = n;
  }
  const dest = t.match(/(?:cuenta\s*(?:de\s*)?destino|clabe\s*(?:de\s*)?destino|destino|env[ií]o\s*a|beneficiario)\s*[:#]?[^0-9\n]{0,24}[•*xX.\s]*(\d{3,4})\b/i);
  if (dest) out.destinationTail = dest[1];
  const tm = t.match(/(\d{1,2})\s*(?:\/|-|de\s+)?\s*([a-zA-Záéíóú]+|\d{1,2})\s*(?:\/|-|de\s+)?\s*(\d{2,4})[\s,]*(?:a\s+las\s+)?(\d{1,2}):(\d{2})/i);
  if (tm) {
    const d = Number(tm[1]);
    const mon = /^\d+$/.test(tm[2]) ? Number(tm[2]) : (MONTHS[tm[2].toLowerCase()] ?? 0);
    let y = Number(tm[3]); if (y < 100) y += 2000;
    if (mon >= 1 && mon <= 12 && d >= 1 && d <= 31) {
      const ms = Date.UTC(y, mon - 1, d, Number(tm[4]), Number(tm[5])) - utcOffsetMin * 60000;
      out.printedAtIso = new Date(ms).toISOString();
    }
  }
  return out;
}

export function decidePartialMatch(i: {
  legible: string;
  candidates: PartialCandidate[];            // `payment.paid` SPEI sem vínculo, mesma conta de gateway
  boundWithSameFragment: number;             // eventos JÁ vinculados que também casam com o trecho
  expectedCurrency?: string | null;          // padrão MXN
  evidence: PartialEvidence;
  expectedDestinationTail?: string | null;
}): PartialDecision {
  const legible = norm(i.legible);
  const ev: Record<string, unknown> = { legible_len: legible.length };
  if (legible.length < MIN_PARTIAL_LEN) return { decision: "manual", reason: "partial_too_short", evidence: ev };
  const matches = i.candidates.filter((c) => partialRelation(legible, refClave(c.reference)) !== null);
  if (matches.length === 0) return i.boundWithSameFragment > 0
    ? { decision: "manual", reason: "fragment_matches_bound_event", evidence: ev }
    : { decision: "wait" };
  if (matches.length > 1 || i.boundWithSameFragment > 0) {
    return { decision: "manual", reason: "ambiguous_partial", evidence: { ...ev, candidates: matches.length, bound: i.boundWithSameFragment } };
  }
  const c = matches[0];
  ev.event_id = c.id;
  ev.relation = partialRelation(legible, refClave(c.reference));
  const cur = String(c.currency ?? "").toUpperCase();
  if (cur !== String(i.expectedCurrency ?? "MXN").toUpperCase()) return { decision: "manual", reason: "currency_mismatch", evidence: ev };
  // Valor livre: o comprovante precisa informar o valor e ele tem que ser o do pagamento confirmado.
  if (i.evidence.amount == null) return { decision: "manual", reason: "receipt_amount_missing", evidence: ev };
  if (c.amount == null || Math.abs(Number(i.evidence.amount) - Number(c.amount)) > 0.001) {
    return { decision: "manual", reason: "receipt_amount_mismatch", evidence: ev };
  }
  const want = i.expectedDestinationTail ? norm(i.expectedDestinationTail) : "";
  const got = i.evidence.destinationTail ? norm(i.evidence.destinationTail) : "";
  if (!want) return { decision: "manual", reason: "destination_not_configured", evidence: ev };
  if (!got) return { decision: "manual", reason: "destination_missing", evidence: ev };
  if (got.length < 3 || !(want.endsWith(got) || got.endsWith(want))) return { decision: "manual", reason: "destination_mismatch", evidence: ev };
  ev.destination = "match";
  const delta = timeDeltaMinutes(i.evidence.printedAtIso, c.paidAt);
  ev.time_delta_min = delta; // auxiliar: nunca bloqueia
  return { decision: "approve", candidate: c, evidence: ev };
}
