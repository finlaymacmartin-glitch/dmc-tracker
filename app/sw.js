// Service worker: precache the app shell for full offline use.
// Bump VERSION on every deploy — updates then apply AUTOMATICALLY on next load (no user action).

const VERSION = '2.0.1';
const CACHE = 'dmc-' + VERSION;

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/db.js',
  'js/models.js',
  'js/alerts.js',
  'js/billing.js',
  'js/messages.js',
  'js/insights.js',
  'js/demo.js',
  'js/schedule.js',
  'js/views/schedule.js',
  'js/export.js',
  'js/views/dashboard.js',
  'js/views/jobrow.js',
  'js/views/clients.js',
  'js/views/crew.js',
  'js/views/invoices.js',
  'js/views/expenses.js',
  'js/views/settings.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
  'icons/icon-180.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  // take over immediately — never sit in "waiting" hoping someone taps a toast
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('dmc-') && k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Cache-first for same-origin GETs; network fallback keeps things working online too.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(cached =>
      cached || fetch(event.request).then(resp => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return resp;
      })
    ).catch(() => caches.match('index.html'))
  );
});
