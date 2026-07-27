// deno test --allow-import receipt-recovery.test.ts
//
// Testa apenas as funções puras de receipt-recovery.ts. Nenhum teste aqui
// chama a OpenAI, o Supabase ou a Meta — todos rodam sem rede.

import {
  deterministicRecoveryEventId,
  isSameTransaction,
  mergePurchaseStatus,
  resolveOriginalEventTime,
} from "./receipt-recovery.ts";
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

const baseCtx = {
  organizationId: "org-1",
  conversationId: "conv-1",
  pixelBlockId: "block-abc",
  originalMessageId: "5511999999999:AABBCCDD",
};

// 2 — dois replays do mesmo caso geram o mesmo event_id
Deno.test("deterministicRecoveryEventId is stable across repeated calls", async () => {
  const id1 = await deterministicRecoveryEventId(baseCtx);
  const id2 = await deterministicRecoveryEventId(baseCtx);
  assertEquals(id1, id2);
  assert(id1.startsWith("capi_recovery_"));
});

Deno.test("deterministicRecoveryEventId changes if any identifier changes", async () => {
  const id1 = await deterministicRecoveryEventId(baseCtx);
  const id2 = await deterministicRecoveryEventId({
    ...baseCtx,
    originalMessageId: "5511999999999:DIFFERENT",
  });
  assert(id1 !== id2);
});

// 3 — event_time é o horário da mídia original
Deno.test("resolveOriginalEventTime uses the original message timestamp, not now()", () => {
  const now = new Date("2026-07-27T13:00:00Z");
  const original = "2026-07-26T11:36:18.560Z";
  const result = resolveOriginalEventTime(original, now);
  assert(result.ok);
  if (result.ok) {
    assertEquals(result.eventTimeUnixSeconds, Math.floor(new Date(original).getTime() / 1000));
  }
});

Deno.test("resolveOriginalEventTime rejects future timestamps", () => {
  const now = new Date("2026-07-27T13:00:00Z");
  const future = "2026-07-28T00:00:00Z";
  const result = resolveOriginalEventTime(future, now);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "in_future");
});

Deno.test("resolveOriginalEventTime rejects timestamps older than Meta's accepted window", () => {
  const now = new Date("2026-07-27T13:00:00Z");
  const tooOld = "2026-07-01T00:00:00Z"; // > 7 dias antes
  const result = resolveOriginalEventTime(tooOld, now);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "too_old_for_meta");
});

Deno.test("resolveOriginalEventTime rejects invalid dates", () => {
  const result = resolveOriginalEventTime("not-a-date");
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "invalid_date");
});

// 7 — mesmo SHA/E2E não gera segunda venda; 8 — upsell REALMENTE distinto
// (evidência positiva) continua separado; hash diferente sozinho é
// inconclusivo, nunca "distinct" por omissão (correção FASE 2.1 — o teste
// anterior aqui chamava hash-diferente-sem-E2E de "legitimate upsream",
// que é conceitualmente errado: ausência de prova de duplicidade não é
// prova de distinção).
Deno.test("isSameTransaction: same sha256 is always duplicate", () => {
  const a = { sha256: "abc123", e2e: null };
  const b = { sha256: "abc123", e2e: "E2E-1" };
  const result = isSameTransaction(a, b);
  assertEquals(result.verdict, "duplicate");
  assertEquals(result.reason, "same_sha256");
});

Deno.test("isSameTransaction: same E2E id is duplicate even with different hash", () => {
  const a = { sha256: "hashA", e2e: "E2E-999" };
  const b = { sha256: "hashB", e2e: "e2e-999" }; // case-insensitive
  const result = isSameTransaction(a, b);
  assertEquals(result.verdict, "duplicate");
  assertEquals(result.reason, "same_e2e_transaction_id");
});

Deno.test("isSameTransaction: different hash WITH two valid different E2E ids is distinct (positive evidence)", () => {
  const a = { sha256: "hashA", e2e: "E2E-1" };
  const b = { sha256: "hashB", e2e: "E2E-2" };
  const result = isSameTransaction(a, b);
  assertEquals(result.verdict, "distinct");
  assertEquals(result.reason, "different_e2e_transaction_ids");
});

Deno.test("isSameTransaction: different E2E ids but very high visual similarity is inconclusive, not distinct", () => {
  const a = { sha256: "hashA", e2e: "E2E-1" };
  const b = { sha256: "hashB", e2e: "E2E-2" };
  const result = isSameTransaction(a, b, { visualSimilarity: 0.97 });
  assertEquals(result.verdict, "inconclusive");
  assertEquals(result.reason, "conflicting_e2e_vs_high_visual_similarity");
});

Deno.test("isSameTransaction: different hash with NO E2E info on either side is INCONCLUSIVE, never distinct", () => {
  const a = { sha256: "hashA", e2e: null };
  const b = { sha256: "hashB", e2e: null };
  const result = isSameTransaction(a, b);
  assertEquals(result.verdict, "inconclusive");
  assertEquals(result.reason, "insufficient_evidence_no_e2e");
});

Deno.test("isSameTransaction: different hash with E2E on only one side is INCONCLUSIVE, never distinct", () => {
  const a = { sha256: "hashA", e2e: "E2E-1" };
  const b = { sha256: "hashB", e2e: null };
  const result = isSameTransaction(a, b);
  assertEquals(result.verdict, "inconclusive");
  assertEquals(result.reason, "insufficient_evidence_no_e2e");
});

// Espelha a regra do trigger/RPC record_purchase_result: falha seguida de
// sucesso é sucesso; sucesso seguido de retry falho NÃO regride.
// A atomicidade real é garantida pelo Postgres (ON CONFLICT DO UPDATE),
// não testável sem um Postgres real disponível neste ambiente — ver
// limitação registrada no relatório FASE 2.1.
Deno.test("mergePurchaseStatus: failed then success => success", () => {
  assertEquals(mergePurchaseStatus("failed", "success"), "success");
});

Deno.test("mergePurchaseStatus: success then failed retry => stays success (never regresses)", () => {
  assertEquals(mergePurchaseStatus("success", "failed"), "success");
});

Deno.test("mergePurchaseStatus: no prior row (null) then failed => failed", () => {
  assertEquals(mergePurchaseStatus(null, "failed"), "failed");
});

Deno.test("mergePurchaseStatus: no prior row (null) then success => success", () => {
  assertEquals(mergePurchaseStatus(null, "success"), "success");
});
