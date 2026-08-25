// deno test --allow-import hookCloudSecretRevealState.test.ts
//
// FASE 21B — testes das decisões puras da máquina de estados do modal de
// segredo único. A integração real com React/DOM não tem infraestrutura
// de teste neste repositório (nenhum Vitest/Jest/Testing Library) —
// coberta por validação visual/estrutural separada, registrada no
// relatório da fase, não fingida como coberta aqui.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  canCloseHookCloudSecretRevealModal,
  hookCloudSecretRevealPhaseOnCheckboxChange,
  initialHookCloudSecretRevealPhase,
} from "./hookCloudSecretRevealState.ts";

Deno.test("estado inicial é sempre secret_visible_unconfirmed", () => {
  assertEquals(initialHookCloudSecretRevealPhase(), "secret_visible_unconfirmed");
});

Deno.test("marcar a caixa (checked=true) avança para secret_confirmed", () => {
  assertEquals(hookCloudSecretRevealPhaseOnCheckboxChange(true), "secret_confirmed");
});

Deno.test("desmarcar a caixa (checked=false) volta para secret_visible_unconfirmed", () => {
  assertEquals(hookCloudSecretRevealPhaseOnCheckboxChange(false), "secret_visible_unconfirmed");
});

Deno.test("fechamento NÃO é permitido em secret_visible_unconfirmed (X/Escape/clique fora/botão final bloqueados)", () => {
  assertEquals(canCloseHookCloudSecretRevealModal("secret_visible_unconfirmed"), false);
});

Deno.test("fechamento É permitido somente em secret_confirmed", () => {
  assertEquals(canCloseHookCloudSecretRevealModal("secret_confirmed"), true);
});

Deno.test("desmarcar depois de confirmar bloqueia o fechamento de novo (não é um trinco só de ida)", () => {
  const afterCheck = hookCloudSecretRevealPhaseOnCheckboxChange(true);
  assertEquals(canCloseHookCloudSecretRevealModal(afterCheck), true);
  const afterUncheck = hookCloudSecretRevealPhaseOnCheckboxChange(false);
  assertEquals(canCloseHookCloudSecretRevealModal(afterUncheck), false);
});
