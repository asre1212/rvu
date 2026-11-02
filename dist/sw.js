const VERSION = '3cbf0fa4470b5d2a';
const PREFIX = 'rvu-daily-shell-';
const CACHE = PREFIX + VERSION;
const FILES = ['./','./index.html','./styles.css','./app.js','./engine.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))); });
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil((async () => { for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key); await self.clients.claim(); })()); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  const relative = url.pathname.slice(scope.pathname.length);
  if (!FILES.some(file => file.replace('./','') === relative)) return;
  // Serve a coherent app shell; the new worker swaps the whole version atomically.
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request, { ignoreSearch: true })) || fetch(event.request)));
});

