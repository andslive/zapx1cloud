import { useEffect } from 'react';
import { shouldInterceptInternalNavigationClick } from '@/lib/whatsapp/internalNavigationGuard';

// FASE 18F — bloqueia navegação SPA para outra rota enquanto um segredo
// HookCloud (callback URL/verify token) ainda não foi confirmado como
// salvo, ou uma submissão está em andamento. Limitação conhecida desde a
// Fase 18B: este projeto usa `<BrowserRouter>` (roteador declarativo),
// não `createBrowserRouter`/`RouterProvider` (roteador de dados) — por
// isso `useBlocker`/`unstable_useBlocker` do react-router-dom NÃO estão
// disponíveis (lançam erro em runtime fora de um roteador de dados).
// Substituir o roteador só para isto seria uma mudança estrutural fora
// de proporção — a tarefa pediu explicitamente o menor mecanismo
// compatível com a arquitetura existente.
//
// Mecanismo real: um listener de `click` em fase de CAPTURA no
// `document`. Fase de captura roda ANTES de qualquer handler de bubble —
// inclusive o `onClick` que `<Link>`/`<NavLink>` do react-router usa
// internamente para chamar `navigate()` — então `stopPropagation()`
// aqui impede a navegação de sequer começar, sem depender de nenhuma
// API interna do roteador. Cobre TODO link interno da aplicação
// (sidebar, breadcrumbs, botões que navegam), não só desta tela, porque
// o listener vive no `document`, não num container local.
//
// A DECISÃO de quando interceptar é pura e testada
// (`shouldInterceptInternalNavigationClick`, `connectionProviderView`'s
// vizinho `internalNavigationGuard.ts`) — a integração real com o DOM
// (este arquivo) não tem teste automatizado, por falta de infraestrutura
// de teste de componente/DOM neste repositório; verificada por inspeção
// estrutural, registrada no relatório da Fase 18F, não escondida.
export function useBlockInternalNavigationWhileSensitive(active: boolean, onBlocked: () => void): void {
  useEffect(() => {
    if (!active) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;

      const shouldIntercept = shouldInterceptInternalNavigationClick({
        defaultPrevented: event.defaultPrevented,
        button: event.button,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        anchorHref: anchor?.getAttribute('href') ?? null,
        anchorTarget: anchor?.target ?? null,
        currentOrigin: window.location.origin,
      });

      if (!shouldIntercept) return;
      event.preventDefault();
      event.stopPropagation();
      onBlocked();
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [active, onBlocked]);
}
