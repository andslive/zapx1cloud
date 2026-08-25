// deno test --allow-import hookCloudSecretRevealState.test.ts
//
// FASE 21B — testes das decisões puras da máquina de estados do modal de
// segredo único. A integração real com React/DOM não tem infraestrutura
// de teste neste repositório (nenhum Vitest/Jest/Testing Library) —
// coberta por validação visual/estrutural separada, registrada no
// relatório da fase, não fingida como coberta aqui.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  areAllRequiredFieldsCopied,
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

// FASE 21C (achado da revisão independente do PR #29) — a checkbox de
// confirmação não exigia ter copiado nada antes de ficar disponível.

Deno.test("nenhum campo copiado => checkbox não pode ser habilitada", () => {
  assertEquals(areAllRequiredFieldsCopied(["callback", "verify"], new Set()), false);
});

Deno.test("só um dos dois campos copiado => ainda não habilita", () => {
  assertEquals(areAllRequiredFieldsCopied(["callback", "verify"], new Set(["callback"])), false);
});

Deno.test("ambos os campos copiados => habilita", () => {
  assertEquals(areAllRequiredFieldsCopied(["callback", "verify"], new Set(["callback", "verify"])), true);
});

Deno.test("copiar um campo extra que não é exigido não afeta o resultado", () => {
  assertEquals(areAllRequiredFieldsCopied(["callback", "verify"], new Set(["callback", "verify", "algo-nao-exigido"])), true);
});

Deno.test("lista de campos exigidos vazia (ex.: só campo informativo não-copiável) => vacuamente satisfeita", () => {
  assertEquals(areAllRequiredFieldsCopied([], new Set()), true);
});

Deno.test("um único campo exigido (ex.: rotação de só um dos dois segredos) segue a mesma regra", () => {
  assertEquals(areAllRequiredFieldsCopied(["verify"], new Set()), false);
  assertEquals(areAllRequiredFieldsCopied(["verify"], new Set(["verify"])), true);
});
