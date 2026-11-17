import { assertEquals } from "jsr:@std/assert@1";
import { decidePartialMatch, MIN_PARTIAL_LEN, parseReceiptEvidence, partialRelation, timeDeltaMinutes } from "./partial-match.ts";

const EV = { id: "e1", reference: "spei-MBAN01002611170080680961", amount: 100, currency: "MXN", paidAt: "2026-11-17T01:37:28.090Z" };
const OTHER = { id: "e2", reference: "spei-MBAN01002611170076386775", amount: 100, currency: "MXN", paidAt: "2026-11-16T14:00:10.339Z" };
const OK_EV = { amount: 100, destinationTail: "2715" };
const DEST = "734180009458642715";
const base = { legible: "MBAN010026111700806", candidates: [EV], boundWithSameFragment: 0, expectedCurrency: "MXN", evidence: OK_EV as any, expectedDestinationTail: DEST as string | null };

Deno.test("parcial: único SPEI sem vínculo + valor/moeda do pedido → aprova", () => {
  const r = decidePartialMatch(base);
  assertEquals(r.decision, "approve");
});

Deno.test("parcial: só uma parte dos eventos casa com o trecho (o outro BBVA diverge) → aprova o certo", () => {
  const r = decidePartialMatch({ ...base, candidates: [OTHER, EV] });
  assertEquals(r.decision === "approve" && r.candidate.id, "e1");
});

Deno.test("parcial: dois candidatos com o mesmo trecho → manual (ambíguo)", () => {
  const dup = { ...EV, id: "e3", reference: "spei-MBAN01002611170080699999" };
  const r = decidePartialMatch({ ...base, candidates: [EV, dup] });
  assertEquals(r.decision, "manual"); assertEquals((r as any).reason, "ambiguous_partial");
});

Deno.test("parcial: trecho também casa com evento JÁ vinculado → manual (comprovante repetido/outra transação)", () => {
  const r = decidePartialMatch({ ...base, boundWithSameFragment: 1 });
  assertEquals((r as any).reason, "ambiguous_partial");
  // evento já vinculado e nenhum pendente: não reabre, não aprova
  const r2 = decidePartialMatch({ ...base, candidates: [], boundWithSameFragment: 1 });
  assertEquals((r2 as any).reason, "fragment_matches_bound_event");
});

Deno.test("parcial: nenhum pagamento confirmado casa → espera (nada de liberar)", () => {
  assertEquals(decidePartialMatch({ ...base, candidates: [OTHER] }).decision, "wait");
  assertEquals(decidePartialMatch({ ...base, candidates: [] }).decision, "wait");
});

Deno.test("parcial: valor do comprovante diferente do pagamento, comprovante sem valor ou moeda diferente → manual", () => {
  assertEquals((decidePartialMatch({ ...base, evidence: { ...OK_EV, amount: 300 } }) as any).reason, "receipt_amount_mismatch");
  assertEquals((decidePartialMatch({ ...base, evidence: { destinationTail: "2715" } }) as any).reason, "receipt_amount_missing");
  assertEquals((decidePartialMatch({ ...base, candidates: [{ ...EV, currency: "COP" }] }) as any).reason, "currency_mismatch");
});

Deno.test("valor livre: pagamento de 300 com comprovante de 300 aprova (a OXXO pendente de 100 do pedido não é critério)", () => {
  const ev300 = { ...EV, amount: 300 };
  const r = decidePartialMatch({ ...base, candidates: [ev300], evidence: { amount: 300, destinationTail: "2715" } });
  assertEquals(r.decision, "approve");
  // comprovante de 100 para um pagamento de 300 → manual
  assertEquals((decidePartialMatch({ ...base, candidates: [ev300], evidence: { amount: 100, destinationTail: "2715" } }) as any).reason, "receipt_amount_mismatch");
});

Deno.test("destino: ausente, ilegível, divergente ou sem configuração → manual; compatível → aprova", () => {
  assertEquals((decidePartialMatch({ ...base, evidence: { amount: 100 } }) as any).reason, "destination_missing");
  assertEquals((decidePartialMatch({ ...base, evidence: { amount: 100, destinationTail: "" } }) as any).reason, "destination_missing");
  assertEquals((decidePartialMatch({ ...base, evidence: { amount: 100, destinationTail: "9999" } }) as any).reason, "destination_mismatch");
  assertEquals((decidePartialMatch({ ...base, evidence: { amount: 100, destinationTail: "15" } }) as any).reason, "destination_mismatch");
  assertEquals((decidePartialMatch({ ...base, expectedDestinationTail: null }) as any).reason, "destination_not_configured");
  assertEquals((decidePartialMatch({ ...base, expectedDestinationTail: "" }) as any).reason, "destination_not_configured");
  const ok = decidePartialMatch(base);
  assertEquals(ok.decision, "approve"); assertEquals((ok as any).evidence.destination, "match");
  // final de 3 dígitos também serve ("***715")
  assertEquals(decidePartialMatch({ ...base, evidence: { amount: 100, destinationTail: "715" } }).decision, "approve");
});

Deno.test("parcial: divergência de horário, sozinha, NÃO bloqueia (registra a diferença)", () => {
  const r = decidePartialMatch({ ...base, evidence: { ...OK_EV, printedAtIso: "2026-11-18T00:36:00.000Z" } });
  assertEquals(r.decision, "approve");
  assertEquals(typeof (r as any).evidence.time_delta_min, "number");
});

Deno.test("parcial: trecho curto demais → manual", () => {
  assertEquals((decidePartialMatch({ ...base, legible: "MBAN0100261117" }) as any).reason, "partial_too_short");
  assertEquals(MIN_PARTIAL_LEN, 15);
});

Deno.test("partialRelation: prefixo, sufixo, igual e divergente", () => {
  assertEquals(partialRelation("MBAN0100", "MBAN01002611170080680961"), "prefix");
  assertEquals(partialRelation("80680961", "MBAN01002611170080680961"), "suffix");
  assertEquals(partialRelation("MBAN01002611170080680961", "MBAN01002611170080680961"), null);
  assertEquals(partialRelation("MBAN010026111700763", "MBAN01002611170080680961"), null);
});

Deno.test("parseReceiptEvidence: comprovantes reais (9444 e 7478), fuso do México", () => {
  const a = parseReceiptEvidence("1. Valor: 100.00  \n2. Nome do Pagador: X  \n3. Data e Hora: 16/11/26 13:26");
  assertEquals(a.amount, 100); assertEquals(a.printedAtIso, "2026-11-16T19:26:00.000Z");
  const b = parseReceiptEvidence("Importe transferido $ 100.00\nFecha 17 noviembre 2026\nHora 18:36 h\nCuenta de destino •2715\nData e Hora: 17 novembro 2026, 18:36 h");
  assertEquals(b.amount, 100); assertEquals(b.destinationTail, "2715");
  assertEquals(parseReceiptEvidence("Monto enviado: $1,250.50").amount, 1250.5);
  assertEquals(parseReceiptEvidence("nada").amount, undefined);
  assertEquals(parseReceiptEvidence("Cuenta destino: 2715\nMonto: 100.00").destinationTail, "2715");
  assertEquals(parseReceiptEvidence("Envío a: ***************715").destinationTail, "715");
  assertEquals(parseReceiptEvidence("sin dados de destino").destinationTail, undefined);
});

Deno.test("timeDeltaMinutes", () => {
  assertEquals(timeDeltaMinutes("2026-11-16T19:26:00Z", "2026-11-16T19:27:11Z"), -1);
  assertEquals(timeDeltaMinutes(null, "x"), null);
});
