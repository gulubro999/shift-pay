/* Service worker: makes the app open instantly and work with no internet.
 *
 * Every time you change index.html, app.js, app.css or any icon, bump CACHE_VERSION
 * so phones pick up the new files. Saved data lives in localStorage, never in this cache,
 * so updating the app does not touch anyone's data. */
const CACHE_VERSION = 'v2';
const CACHE = 'shift-payroll-' + CACHE_VERSION;

const APP_SHELL = [
  './',
  'index.html',
  'app.css',
  'app.js',
  'manifest.webmanifest',
  'fonts/inter-latin-var.woff',
  'icons/icon-48.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' skips the browser's own HTTP cache, so a new version never installs stale files.
      .then((cache) => cache.addAll(APP_SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shift-payroll-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Opening the app: use the saved page straight away, refresh it in the background.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('index.html').then((cached) => {
        const refresh = fetch(req).then((res) => {
          if (res && res.ok) caches.open(CACHE).then((c) => c.put('index.html', res.clone()));
          return res;
        }).catch(() => null);
        return cached || refresh.then((res) => res || caches.match('./'));
      })
    );
    return;
  }

  // Everything else: saved copy first, refresh it in the background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const refresh = fetch(req).then((res) => {
        if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || refresh;
    })
  );
});
