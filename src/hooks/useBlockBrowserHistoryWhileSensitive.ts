import { useEffect } from 'react';

// FASE 18G — bloqueia (interceptando, não impedindo de verdade — ver
// nota abaixo) o botão voltar/avançar do navegador enquanto um segredo
// HookCloud não foi confirmado como salvo.
//
// Técnica: ao ativar, empilha uma entrada extra de histórico
// (`history.pushState`) — a mesma URL, sem navegar de verdade. Se o
// usuário clicar em "voltar", o navegador dispara `popstate` para essa
// entrada extra (que ainda é a MESMA página); o listener reage
// imediatamente empilhando outra entrada extra de novo, mantendo o
// usuário na mesma URL, e chama `onBlocked` para mostrar o aviso.
//
// Isto NÃO é um monkey-patch de `window.history.pushState`/
// `replaceState` (as funções nativas nunca são sobrescritas/
// substituídas) — é uso normal, público, da mesma API que qualquer
// código da aplicação (inclusive o próprio react-router) já usa para
// navegar. Efeito colateral conhecido e aceito: depois que o segredo é
// confirmado (`active` volta a `false`), a entrada extra empilhada
// continua no histórico — um primeiro clique em "voltar" após isso
// remove essa entrada (voltando para a MESMA página) antes de sair de
// verdade; é um passo a mais no histórico, não um travamento.
export function useBlockBrowserHistoryWhileSensitive(active: boolean, onBlocked: () => void): void {
  useEffect(() => {
    if (!active) return;

    window.history.pushState(null, '', window.location.href);

    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
      onBlocked();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [active, onBlocked]);
}
