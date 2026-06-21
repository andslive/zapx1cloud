// Minimal Service Worker — only purpose is to enable PWA installability.
// Does NOT cache anything. We deliberately avoid intercepting fetches so
// the live app is always served from the network and never stuck on an
// old bundle (which previously caused infinite spinners after deploys).

const SW_VERSION = '2026.04.28.1';

self.addEventListener('install', (event) => {
  // Take over immediately so users don't have to close/reopen the PWA.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop any caches an older SW might have created.
    if (self.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    await self.clients.claim();
  })());
});

// Empty passthrough fetch handler — required for installability criteria,
// but we never short-circuit responses, so the network is always the source
// of truth.
self.addEventListener('fetch', () => {});

// Allow the page to ask for an immediate update.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
