// deno test --no-check --allow-read --allow-env src/lib/whatsapp/internalNavigationGuard.test.ts
//
// Fase 18F: garante que a decisão de bloquear navegação SPA durante o
// estado sensível do HookCloud intercepta exatamente os cliques certos
// (link interno, botão esquerdo, sem modificador, mesma origem, mesma
// aba) e nunca os errados (abrir em nova aba, link externo, clique já
// tratado, âncora de fragmento).

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { shouldInterceptInternalNavigationClick, type InterceptableClickInfo } from "./internalNavigationGuard.ts";

const ORIGIN = "https://app.exemplo.com";

function clickInfo(overrides: Partial<InterceptableClickInfo> = {}): InterceptableClickInfo {
  return {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    anchorHref: "/admin/funis",
    anchorTarget: null,
    currentOrigin: ORIGIN,
    ...overrides,
  };
}

Deno.test("intercepta link interno relativo, clique esquerdo simples", () => {
  assertEquals(shouldInterceptInternalNavigationClick(clickInfo()), true);
});

Deno.test("intercepta link interno absoluto da mesma origem", () => {
  assertEquals(
    shouldInterceptInternalNavigationClick(clickInfo({ anchorHref: `${ORIGIN}/admin/leads` })),
    true,
  );
});

Deno.test("NÃO intercepta quando o clique não teve nenhum <a href> como ancestral", () => {
  assertEquals(shouldInterceptInternalNavigationClick(clickInfo({ anchorHref: null, anchorTarget: null })), false);
});

Deno.test("NÃO intercepta href vazio ou só fragmento (#...) — não é navegação de rota", () => {
  assertEquals(shouldInterceptInternalNavigationClick(clickInfo({ anchorHref: "" })), false);
  assertEquals(shouldInterceptInternalNavigationClick(clickInfo({ anchorHref: "#secao-2" })), false);
});

Deno.test("NÃO intercepta quando o evento já foi tratado (defaultPrevented)", () => {
  assertEquals(shouldInterceptInternalNavigationClick(clickInfo({ defaultPrevented: true })), false);
});

Deno.test("NÃO intercepta botão diferente do esquerdo (meio/direito)", () => {
  assertEquals(shouldInterceptInternalNavigationClick(clickInfo({ button: 1 })), false);
  assertEquals(shouldInterceptInternalNavigationClick(clickInfo({ button: 2 })), false);
});

Deno.test("NÃO intercepta com qualquer modificador (Ctrl/Cmd/Shift/Alt) — usuário pode abrir em nova aba normalmente", () => {
  assertEquals(shouldInterceptInternalNavigationClick(clickInfo({ ctrlKey: true })), false);
  assertEquals(shouldInterceptInternalNavigationClick(clickInfo({ metaKey: true })), false);
  assertEquals(shouldInterceptInternalNavigationClick(clickInfo({ shiftKey: true })), false);
  assertEquals(shouldInterceptInternalNavigationClick(clickInfo({ altKey: true })), false);
});

Deno.test("NÃO intercepta link com target=_blank (abre em outra aba, não é navegação SPA desta aba)", () => {
  assertEquals(shouldInterceptInternalNavigationClick(clickInfo({ anchorTarget: "_blank" })), false);
});

Deno.test("target=_self ou ausente continua sendo interceptado (mesma aba)", () => {
  assertEquals(shouldInterceptInternalNavigationClick(clickInfo({ anchorTarget: "_self" })), true);
  assertEquals(shouldInterceptInternalNavigationClick(clickInfo({ anchorTarget: "" })), true);
});

Deno.test("NÃO intercepta link de origem externa (navegação interna, por definição, é só dentro do mesmo app)", () => {
  assertEquals(
    shouldInterceptInternalNavigationClick(clickInfo({ anchorHref: "https://outro-dominio.example/pagina" })),
    false,
  );
});

Deno.test("currentOrigin inválido não lança exceção, apenas não intercepta (nunca trava a navegação por um erro interno)", () => {
  assertEquals(shouldInterceptInternalNavigationClick(clickInfo({ currentOrigin: "não-é-uma-origem-valida" })), false);
});
