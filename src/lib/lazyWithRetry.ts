import { lazy, ComponentType } from 'react';

/**
 * Cache de imports já iniciados (deduplicação).
 * Garante que o mesmo módulo nunca seja baixado 2x e que o `prefetch`
 * compartilhe o mesmo Promise do `lazy`.
 */
const importCache = new Map<unknown, Promise<unknown>>();

function memoize<T>(factory: () => Promise<T>): () => Promise<T> {
  return () => {
    const cached = importCache.get(factory);
    if (cached) return cached as Promise<T>;
    const p = retry(factory, 2, 500).catch((err) => {
      // Em caso de falha, remove do cache para permitir nova tentativa.
      importCache.delete(factory);
      throw err;
    });
    importCache.set(factory, p);
    return p;
  };
}

/**
 * Wrapper sobre `React.lazy` que tenta novamente o import dinâmico em caso
 * de falha (chunk velho no cache após deploy, instabilidade de rede no
 * mobile). Após N tentativas, propaga o erro para o ErrorBoundary.
 *
 * Também expõe `.preload()` na referência retornada para permitir prefetch
 * antecipado (em hover, idle callback, etc.) sem renderizar o componente.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  const memoized = memoize(factory);
  const Component = lazy(memoized) as unknown as ReturnType<typeof lazy> & {
    preload: () => Promise<{ default: T }>;
  };
  Component.preload = memoized;
  return Component;
}

/**
 * Dispara o download de um chunk em segundo plano. Usa o mesmo cache do
 * `lazyWithRetry`, então se o usuário clicar antes do prefetch terminar,
 * apenas espera o Promise existente (sem download duplicado).
 */
export function prefetch(factory: () => Promise<unknown>): void {
  const cached = importCache.get(factory);
  if (cached) return;
  const p = retry(factory, 1, 300).catch((err) => {
    importCache.delete(factory);
    // Falha silenciosa em prefetch — não queremos quebrar a UI.
    if (typeof console !== 'undefined') console.debug('[prefetch] falhou:', err);
  });
  importCache.set(factory, p);
}

/**
 * Agenda um callback para rodar quando o browser estiver ocioso.
 * Útil para prefetch sem competir com renderização inicial.
 */
export function onIdle(cb: () => void, timeout = 2000): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void;
  };
  if (w.requestIdleCallback) {
    w.requestIdleCallback(cb, { timeout });
  } else {
    setTimeout(cb, 800);
  }
}

function isChunkLoadError(err: unknown): boolean {
  const msg = (err as { message?: string })?.message || '';
  const name = (err as { name?: string })?.name || '';
  return (
    /Importing a module script failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Loading CSS chunk/i.test(msg) ||
    name === 'ChunkLoadError'
  );
}

const RELOAD_KEY = 'chunk-reload-attempt';

function maybeReloadOnce(err: unknown): void {
  if (typeof window === 'undefined') return;
  if (!isChunkLoadError(err)) return;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || '0');
    const now = Date.now();
    // Only auto-reload once per 30s window to avoid infinite loops.
    if (now - last < 30000) return;
    sessionStorage.setItem(RELOAD_KEY, String(now));
    if ('caches' in window) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
    }
    window.location.reload();
  } catch {
    // ignore
  }
}

function retry<T>(
  fn: () => Promise<T>,
  retries: number,
  delayMs: number
): Promise<T> {
  return fn().catch((err) => {
    if (retries <= 0) {
      maybeReloadOnce(err);
      throw err;
    }
    return new Promise<T>((resolve, reject) => {
      setTimeout(() => {
        retry(fn, retries - 1, delayMs).then(resolve, reject);
      }, delayMs);
    });
  });
}
