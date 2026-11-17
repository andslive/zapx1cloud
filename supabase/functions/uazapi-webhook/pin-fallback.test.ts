import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isDeadlockError, isPinRefusal, runPinWithFallback } from "./pin-fallback.ts";

const noSleep = () => Promise.resolve();
const dl = () => Object.assign(new Error("deadlock detected"), { code: "40P01" });
const p0001 = () => Object.assign(new Error("funnel_already_active"), { code: "P0001" });

Deno.test("classifica deadlock e recusa", () => {
  assert(isDeadlockError(dl()));
  assert(isDeadlockError({ message: "ERROR: deadlock detected" }));
  assert(!isDeadlockError(p0001()));
  assert(isPinRefusal(p0001()));
  assert(isPinRefusal({ message: "funnel_already_active" }));
  assert(!isPinRefusal(dl()));
  assert(!isPinRefusal(null));
});

Deno.test("sucesso na primeira tentativa não repete", async () => {
  let calls = 0;
  const r = await runPinWithFallback(async () => { calls++; return "ok"; }, { label: "t", sleepFn: noSleep });
  assertEquals(calls, 1);
  assert(r.ok && r.value === "ok" && r.attempts === 1);
});

Deno.test("deadlock é repetido e recupera", async () => {
  let calls = 0;
  const r = await runPinWithFallback(async () => { if (++calls < 3) throw dl(); return "won"; }, { label: "t", sleepFn: noSleep });
  assertEquals(calls, 3);
  assert(r.ok && r.value === "won" && r.attempts === 3);
});

Deno.test("deadlock esgotado devolve falha limitada (3 tentativas), sem lançar", async () => {
  let calls = 0;
  const r = await runPinWithFallback(async () => { calls++; throw dl(); }, { label: "t", sleepFn: noSleep });
  assertEquals(calls, 3);
  assert(!r.ok && r.kind === "deadlock_exhausted");
});

Deno.test("P0001 não é repetido e vira refused", async () => {
  let calls = 0;
  const r = await runPinWithFallback(async () => { calls++; throw p0001(); }, { label: "t", sleepFn: noSleep });
  assertEquals(calls, 1);
  assert(!r.ok && r.kind === "refused");
});

Deno.test("outro erro não é repetido e vira error", async () => {
  let calls = 0;
  const r = await runPinWithFallback(async () => { calls++; throw Object.assign(new Error("boom"), { code: "XX000" }); }, { label: "t", sleepFn: noSleep });
  assertEquals(calls, 1);
  assert(!r.ok && r.kind === "error");
});

// Fiação no index.ts: os 3 caminhos usam o fallback e respeitam a reentrega.
Deno.test("index.ts: 3 caminhos usam runPinWithFallback e pulam entrada em reentrega", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  for (const label of ['label: "reopen"', 'label: "existing"', 'label: "new"', 'label: "new_no_funnel"', 'label: "reopen_no_funnel"']) {
    assert(src.includes(label), `falta ${label}`);
  }
  assertEquals((src.match(/if \(inboundAlreadyProcessed\) continue;/g) ?? []).length, 3);
  assertEquals((src.match(/pin_failed_fallback_no_funnel/g) ?? []).length, 3);
});
