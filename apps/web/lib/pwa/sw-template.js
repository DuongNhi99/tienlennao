// Service worker for Tiến Lên Online. Served by app/sw.js/route.ts, which replaces
// __BUILD_ID__ so every deployment produces a byte-different worker (triggering updates).
//
// Caching policy
// - Hashed static assets (/_next/static, /icons): cache-first; they are immutable.
// - Page navigations: network-only, falling back to the offline page when the network fails.
//   HTML is never cached because authenticated pages may contain private data.
// - API requests, other origins, and non-GET requests: never intercepted or cached.

const BUILD_ID = '__BUILD_ID__';
const STATIC_CACHE = `tienlen-static-${BUILD_ID}`;
const OFFLINE_CACHE = `tienlen-offline-${BUILD_ID}`;
const OFFLINE_URL = '/offline';
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const offlineCache = await caches.open(OFFLINE_CACHE);
      await offlineCache.addAll(PRECACHE_URLS);
      // Also cache the CSS/JS the offline page needs so it renders styled without a network.
      const response = await offlineCache.match(OFFLINE_URL);
      const html = response ? await response.text() : '';
      const assets = [...html.matchAll(/(?:href|src)="(\/_next\/static\/[^"]+)"/g)].map(
        (match) => match[1],
      );
      const staticCache = await caches.open(STATIC_CACHE);
      await staticCache.addAll([...new Set(assets)]);
      // No skipWaiting() here: the page asks the user before activating an update.
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, OFFLINE_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('tienlen-') && !keep.has(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(OFFLINE_CACHE);
        return (await cache.match(OFFLINE_URL)) || Response.error();
      }),
    );
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      })(),
    );
  }
});
