const CACHE_NAME = 'pingpong-v2';
const STATIC_ASSETS = [
  '/',
  '/static/style.css',
  '/static/js/state.js',
  '/static/js/api.js',
  '/static/js/helpers.js',
  '/static/js/generators.js',
  '/static/js/ui-setup.js',
  '/static/js/ui-main.js',
  '/static/js/modal.js',
  '/static/js/init.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // API 요청은 항상 네트워크 (실시간 데이터)
  if (url.pathname.startsWith('/api/')) return;
  // POST/PUT/DELETE는 캐싱하지 않음
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
