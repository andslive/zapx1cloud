// FASE 18F — decisão PURA (sem DOM) de quando um clique deve ser
// interceptado para bloquear navegação SPA enquanto um segredo HookCloud
// não foi confirmado como salvo. Extraída do hook
// `useBlockInternalNavigationWhileSensitive` (que só faz a integração
// real com `document.addEventListener`/`Element.closest`) exatamente
// para poder ser testada sem precisar de um DOM real — este repositório
// não tem infraestrutura de teste de componente/DOM (nenhum Vitest/
// Jest/Testing Library, só Deno para lógica pura). A integração DOM em
// si (addEventListener em fase de captura, `closest('a[href]')`,
// `stopPropagation`) continua sem teste automatizado — verificada por
// inspeção estrutural do código, registrada no relatório da Fase 18F,
// não escondida como se fosse coberta.

export interface InterceptableClickInfo {
  /** Já foi tratado por outro handler (ex.: o próprio elemento chamou preventDefault) — nunca interceptar de novo. */
  defaultPrevented: boolean;
  /** 0 = botão esquerdo. Só o clique esquerdo simples é interceptado. */
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** `href` do `<a>` mais próximo do alvo do clique, ou `null` se o clique não teve nenhum `<a href>` como ancestral. */
  anchorHref: string | null;
  /** `target` do mesmo `<a>` (`''`/`'_self'`/`'_blank'`/etc.), ou `null` junto com `anchorHref: null`. */
  anchorTarget: string | null;
  /** `window.location.origin` no momento do clique — usado para resolver `href` relativo e comparar origem. */
  currentOrigin: string;
}

/**
 * `true` quando o clique é uma navegação SPA interna real que deve ser
 * bloqueada: botão esquerdo simples, sem modificador, sobre um `<a>`
 * com `href` não-vazio, não-fragmento (`#...`), que abre na mesma aba
 * (`target` ausente/`_self`) e aponta para a MESMA origem da página
 * atual. Qualquer outra combinação (clique com modificador, botão
 * direito/meio, link externo, link que abre em nova aba, âncora só de
 * fragmento) NUNCA é interceptada — o usuário pode continuar abrindo
 * links em nova aba, usando o menu de contexto, etc., normalmente.
 */
export function shouldInterceptInternalNavigationClick(info: InterceptableClickInfo): boolean {
  if (info.defaultPrevented) return false;
  if (info.button !== 0) return false;
  if (info.metaKey || info.ctrlKey || info.shiftKey || info.altKey) return false;
  if (info.anchorHref === null) return false;
  if (info.anchorHref === '' || info.anchorHref.startsWith('#')) return false;
  if (info.anchorTarget && info.anchorTarget !== '_self') return false;

  let linkUrl: URL;
  let currentUrl: URL;
  try {
    currentUrl = new URL(info.currentOrigin);
    linkUrl = new URL(info.anchorHref, info.currentOrigin);
  } catch {
    return false;
  }
  if (linkUrl.origin !== currentUrl.origin) return false;

  return true;
}
