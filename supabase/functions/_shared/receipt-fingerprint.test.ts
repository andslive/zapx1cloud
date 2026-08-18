// deno test --allow-import receipt-fingerprint.test.ts
//
// Testa apenas as funções puras de receipt-fingerprint.ts. Nenhum teste aqui
// toca banco/rede. Cobre os cenários pedidos no runbook de deduplicação de
// comprovante (Fase 2, caso lead cb525181-.../chip19).

import {
  buildTransactionFingerprint,
  decideReceiptDuplicateGate,
  extractBankTransactionId,
  extractTransactionDateTime,
  hashFingerprint,
  normalizeAmount,
  normalizeBankTransactionId,
  normalizePayerName,
} from "./receipt-fingerprint.ts";
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

// OCR real do caso auditado (lead cb525181-..., chip19, 06/08/2026).
const OCR_ORIGINAL =
  "🖼️ Imagem: 1. Valor: 30.00\n2. Nome do Pagador: Erminio Mendes da Silva\n3. Data e Hora: 06/08/2026 às 06:08:27";
// Mesmo comprovante reenviado no bloco de upsell — OCR idêntico.
const OCR_RESEND_UPSELL = OCR_ORIGINAL;
// Mesmo comprovante, mas o texto que chega ao extrator ganhou uma legenda do
// lead colada ao lado (foi exatamente isso que furou a dedup antiga baseada
// em hash do texto bruto concatenado).
const OCR_WITH_CAPTION = `${OCR_ORIGINAL}\nEu já tinha te mandado`;

// ── normalizePayerName ──────────────────────────────────────────────────

Deno.test("normalizePayerName remove acento/pontuacao mas preserva separacao de palavras", () => {
  assertEquals(normalizePayerName("Erminio Mendes da Silva"), "erminio mendes da silva");
  assertEquals(normalizePayerName("ÉRMÍNIO   MENDES-DA SILVA!!"), "erminio mendes da silva");
});

Deno.test("normalizePayerName nunca funde duas palavras em uma (nao remove todos os espacos)", () => {
  const a = normalizePayerName("Ana Maria");
  const b = normalizePayerName("Anamaria");
  assertNotEquals(a, b);
  assertEquals(a, "ana maria");
  assertEquals(b, "anamaria");
});

// ── normalizeAmount ──────────────────────────────────────────────────────

Deno.test("normalizeAmount aceita numero e string com virgula", () => {
  assertEquals(normalizeAmount(30), "30.00");
  assertEquals(normalizeAmount("30,00"), "30.00");
  assertEquals(normalizeAmount("30.5"), "30.50");
});

Deno.test("normalizeAmount rejeita zero/negativo/invalido", () => {
  assertEquals(normalizeAmount(0), null);
  assertEquals(normalizeAmount(-5), null);
  assertEquals(normalizeAmount("abc"), null);
  assertEquals(normalizeAmount(null), null);
});

// ── extractTransactionDateTime ──────────────────────────────────────────

Deno.test("extractTransactionDateTime extrai data/hora completa do caso real", () => {
  assertEquals(extractTransactionDateTime(OCR_ORIGINAL), "2026-08-06T06:08:27");
});

Deno.test("extractTransactionDateTime retorna null sem segundos (nao e considerado completo)", () => {
  assertEquals(extractTransactionDateTime("Data e Hora: 06/08/2026 às 06:08"), null);
});

Deno.test("extractTransactionDateTime retorna null quando o campo nao existe (cenario 9)", () => {
  assertEquals(extractTransactionDateTime("Valor: 30.00\nNome do Pagador: Fulano"), null);
});

// ── extractBankTransactionId ────────────────────────────────────────────

Deno.test("extractBankTransactionId extrai E2E quando presente", () => {
  const ocr = "Valor: 50.00\nE2E ID: E00416968202608061234ABCDE9F0";
  assertEquals(extractBankTransactionId(ocr), "E00416968202608061234ABCDE9F0");
});

Deno.test("extractBankTransactionId retorna null quando nao ha identificador (cenario 10, caso real)", () => {
  assertEquals(extractBankTransactionId(OCR_ORIGINAL), null);
});

// ── buildTransactionFingerprint ─────────────────────────────────────────

Deno.test("cenario 1/2/3/4/7: mesmo comprovante gera SEMPRE a mesma fingerprint forte, independente de message_id/legenda/bloco", () => {
  const base = {
    amount: 30,
    payerName: "Erminio Mendes da Silva",
    transactionAt: extractTransactionDateTime(OCR_ORIGINAL),
  };
  const original = buildTransactionFingerprint(base);
  const resendUpsell = buildTransactionFingerprint({
    amount: 30,
    payerName: "Erminio Mendes da Silva",
    transactionAt: extractTransactionDateTime(OCR_RESEND_UPSELL),
  });
  // Mesmo texto + legenda extra ("Eu já tinha te mandado") nao deveria nem
  // chegar a extrair campos diferentes, porque a extracao de valor/nome/data
  // usa os campos ja identificados pelo extrator determinístico, nao o texto
  // bruto concatenado (essa é a correção do bug).
  const withCaption = buildTransactionFingerprint({
    amount: 30,
    payerName: "Erminio Mendes da Silva",
    transactionAt: extractTransactionDateTime(OCR_WITH_CAPTION),
  });

  assertEquals(original.strength, "strong");
  assertEquals(original.fingerprint, resendUpsell.fingerprint);
  assertEquals(original.fingerprint, withCaption.fingerprint);
  assertEquals(
    original.fingerprint,
    "v1|amount=30.00|payer=erminio mendes da silva|transaction_at=2026-08-06T06:08:27",
  );
});

Deno.test("cenario 3: comprovante recomprimido com variacao minima de espacamento produz a mesma fingerprint", () => {
  const a = buildTransactionFingerprint({
    amount: "30.00",
    payerName: "Erminio   Mendes   da   Silva", // espaçamento OCR diferente
    transactionAt: "2026-08-06T06:08:27",
  });
  const b = buildTransactionFingerprint({
    amount: 30,
    payerName: "Erminio Mendes da Silva",
    transactionAt: "2026-08-06T06:08:27",
  });
  assertEquals(a.fingerprint, b.fingerprint);
});

Deno.test("cenario 4: diferencas de acentuacao/pontuacao no nome nao mudam a fingerprint", () => {
  const a = buildTransactionFingerprint({
    amount: 30,
    payerName: "Érminio Méndes-da Silva!",
    transactionAt: "2026-08-06T06:08:27",
  });
  const b = buildTransactionFingerprint({
    amount: 30,
    payerName: "Erminio Mendes da Silva",
    transactionAt: "2026-08-06T06:08:27",
  });
  assertEquals(a.fingerprint, b.fingerprint);
});

Deno.test("cenario 5: mesmo lead, dois pagamentos legitimos de mesmo valor em horarios diferentes geram fingerprints diferentes", () => {
  const p1 = buildTransactionFingerprint({
    amount: 30,
    payerName: "Erminio Mendes da Silva",
    transactionAt: "2026-08-06T06:08:27",
  });
  const p2 = buildTransactionFingerprint({
    amount: 30,
    payerName: "Erminio Mendes da Silva",
    transactionAt: "2026-08-06T09:45:10",
  });
  assertNotEquals(p1.fingerprint, p2.fingerprint);
  assertEquals(p1.strength, "strong");
  assertEquals(p2.strength, "strong");
});

Deno.test("cenario 6: dois leads diferentes com mesmo valor mas pagador/horario diferentes geram fingerprints diferentes", () => {
  const p1 = buildTransactionFingerprint({
    amount: 30,
    payerName: "Erminio Mendes da Silva",
    transactionAt: "2026-08-06T06:08:27",
  });
  const p2 = buildTransactionFingerprint({
    amount: 30,
    payerName: "Joao Carlos Pereira",
    transactionAt: "2026-08-06T11:22:33",
  });
  assertNotEquals(p1.fingerprint, p2.fingerprint);
});

Deno.test("cenario 9: falta de data/hora no OCR produz fingerprint fraca, nao forte", () => {
  const r = buildTransactionFingerprint({
    amount: 30,
    payerName: "Erminio Mendes da Silva",
    transactionAt: null,
  });
  assertEquals(r.strength, "weak");
});

Deno.test("cenario 10: falta de identificador bancario nao impede forca forte quando valor+pagador+data completos", () => {
  const r = buildTransactionFingerprint({
    bankTransactionId: null,
    amount: 30,
    payerName: "Erminio Mendes da Silva",
    transactionAt: "2026-08-06T06:08:27",
  });
  assertEquals(r.strength, "strong");
});

Deno.test("identificador bancario sozinho basta para forca forte, mesmo sem os demais campos", () => {
  const r = buildTransactionFingerprint({
    bankTransactionId: "E00416968202608061234ABCDE9F0",
    amount: null,
    payerName: null,
    transactionAt: null,
  });
  assertEquals(r.strength, "strong");
  assertEquals(r.fingerprint, "v1|bank_id=E00416968202608061234ABCDE9F0");
});

Deno.test("cenario 11: imagem vs PDF da mesma transacao com campos extraidos identicos gera a mesma fingerprint", () => {
  const fromImage = buildTransactionFingerprint({
    amount: 30,
    payerName: "Erminio Mendes da Silva",
    transactionAt: "2026-08-06T06:08:27",
  });
  const fromPdf = buildTransactionFingerprint({
    amount: 30,
    payerName: "Erminio Mendes da Silva",
    transactionAt: "2026-08-06T06:08:27",
  });
  assertEquals(fromImage.fingerprint, fromPdf.fingerprint);
});

Deno.test("fingerprint fraca nunca e vazia/colide com outro caso igualmente incompleto por acaso de campos ausentes", () => {
  const noFieldsAtAll = buildTransactionFingerprint({});
  const onlyAmount = buildTransactionFingerprint({ amount: 30 });
  assertNotEquals(noFieldsAtAll.fingerprint, onlyAmount.fingerprint);
  assertEquals(noFieldsAtAll.strength, "weak");
  assertEquals(onlyAmount.strength, "weak");
});

// ── hashFingerprint ──────────────────────────────────────────────────────

Deno.test("hashFingerprint e deterministico e sensivel a qualquer diferenca na fingerprint", async () => {
  const h1 = await hashFingerprint("v1|amount=30.00|payer=fulano|transaction_at=2026-08-06T06:08:27");
  const h2 = await hashFingerprint("v1|amount=30.00|payer=fulano|transaction_at=2026-08-06T06:08:27");
  const h3 = await hashFingerprint("v1|amount=30.01|payer=fulano|transaction_at=2026-08-06T06:08:27");
  assertEquals(h1, h2);
  assertNotEquals(h1, h3);
  assert(/^[0-9a-f]{64}$/.test(h1));
});

// ── normalizeBankTransactionId ───────────────────────────────────────────

Deno.test("normalizeBankTransactionId rejeita strings curtas demais para serem um identificador real", () => {
  assertEquals(normalizeBankTransactionId("abc"), null);
  assertEquals(normalizeBankTransactionId(""), null);
  assertEquals(normalizeBankTransactionId(null), null);
});

// ── decideReceiptDuplicateGate (Fase 2B — gate antecipado no ai_receipt +
// defesa em profundidade no pixel, mesma função pura para os dois) ───────

const ORG = "60639a08-4e91-42a9-83a8-8e95616eccb7";
const CANONICAL_ID = "70596872-c05b-4464-928a-cca7157390ab";

Deno.test("comprovante reenviado no upsell (claimed=false) bloqueia: nao avanca, nao entrega upsell, referencia a canonica", () => {
  const decision = decideReceiptDuplicateGate({
    fingerprintStrength: "strong",
    fingerprintHash: "hash-erminio-30",
    organizationId: ORG,
    alreadyClaimedId: null,
    claimRpcError: false,
    claimResult: { claimed: false, claim_id: "claim-1", existing_purchase_audit_id: CANONICAL_ID },
  });
  assertEquals(decision.action, "block");
  if (decision.action === "block") {
    assertEquals(decision.existingPurchaseAuditId, CANONICAL_ID);
    assertEquals(decision.reason, "receipt_fingerprint_already_claimed");
  }
});

Deno.test("comprovante novo e legitimo (claimed=true) permite continuar, com claim_id para linkagem posterior", () => {
  const decision = decideReceiptDuplicateGate({
    fingerprintStrength: "strong",
    fingerprintHash: "hash-novo-pagamento",
    organizationId: ORG,
    alreadyClaimedId: null,
    claimRpcError: false,
    claimResult: { claimed: true, claim_id: "claim-2", existing_purchase_audit_id: null },
  });
  assertEquals(decision.action, "proceed");
  if (decision.action === "proceed") assertEquals(decision.claimId, "claim-2");
});

Deno.test("conflito concorrente: dos dois lados da mesma corrida, um ganha (proceed) e o outro perde (block) - nunca os dois avancam", () => {
  // Simula o resultado que a constraint atomica do banco (UNIQUE org+fingerprint,
  // testada em transacao real na migration) garante: só um INSERT retorna
  // claimed=true, o outro sempre claimed=false com o id do vencedor.
  const winner = decideReceiptDuplicateGate({
    fingerprintStrength: "strong", fingerprintHash: "hash-race", organizationId: ORG,
    alreadyClaimedId: null, claimRpcError: false,
    claimResult: { claimed: true, claim_id: "claim-winner", existing_purchase_audit_id: null },
  });
  const loser = decideReceiptDuplicateGate({
    fingerprintStrength: "strong", fingerprintHash: "hash-race", organizationId: ORG,
    alreadyClaimedId: null, claimRpcError: false,
    claimResult: { claimed: false, claim_id: "claim-winner", existing_purchase_audit_id: "purchase-do-vencedor" },
  });
  assertEquals(winner.action, "proceed");
  assertEquals(loser.action, "block");
});

Deno.test("idempotencia: pixel reaproveita o claim_id ja obtido pelo ai_receipt na mesma execucao, sem novo claim", () => {
  const decision = decideReceiptDuplicateGate({
    fingerprintStrength: "strong",
    fingerprintHash: "hash-qualquer",
    organizationId: ORG,
    alreadyClaimedId: "claim-do-ai-receipt",
    // mesmo que claimResult/claimRpcError não tenham sido calculados (RPC
    // nem foi chamada de novo), a decisão não depende deles aqui.
    claimRpcError: false,
    claimResult: null,
  });
  assertEquals(decision.action, "proceed");
  if (decision.action === "proceed") assertEquals(decision.claimId, "claim-do-ai-receipt");
});

Deno.test("fingerprint fraca nunca bloqueia automaticamente (skip, nao block)", () => {
  const decision = decideReceiptDuplicateGate({
    fingerprintStrength: "weak",
    fingerprintHash: "hash-fraca",
    organizationId: ORG,
    alreadyClaimedId: null,
    claimRpcError: false,
    claimResult: null,
  });
  assertEquals(decision.action, "skip_weak_or_absent");
});

Deno.test("fingerprint ausente nunca bloqueia automaticamente (skip, nao block)", () => {
  const decision = decideReceiptDuplicateGate({
    fingerprintStrength: null,
    fingerprintHash: null,
    organizationId: ORG,
    alreadyClaimedId: null,
    claimRpcError: false,
    claimResult: null,
  });
  assertEquals(decision.action, "skip_weak_or_absent");
});

Deno.test("organization_id ausente nao tenta bloquear (skip_no_org, nao block)", () => {
  const decision = decideReceiptDuplicateGate({
    fingerprintStrength: "strong",
    fingerprintHash: "hash-sem-org",
    organizationId: null,
    alreadyClaimedId: null,
    claimRpcError: false,
    claimResult: null,
  });
  assertEquals(decision.action, "skip_no_org");
});

Deno.test("falha tecnica na RPC NUNCA e interpretada como duplicidade (fail-open, proceed sem claim_id)", () => {
  const decision = decideReceiptDuplicateGate({
    fingerprintStrength: "strong",
    fingerprintHash: "hash-erro-rpc",
    organizationId: ORG,
    alreadyClaimedId: null,
    claimRpcError: true,
    claimResult: null,
  });
  assertEquals(decision.action, "proceed");
  if (decision.action === "proceed") assertEquals(decision.claimId, null);
});

Deno.test("resultado da RPC ausente sem erro explicito tambem e fail-open (defensivo)", () => {
  const decision = decideReceiptDuplicateGate({
    fingerprintStrength: "strong",
    fingerprintHash: "hash-sem-resultado",
    organizationId: ORG,
    alreadyClaimedId: null,
    claimRpcError: false,
    claimResult: null,
  });
  assertEquals(decision.action, "proceed");
});
