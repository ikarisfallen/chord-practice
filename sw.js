/* Service worker: precache the app shell so it runs fully offline.
 * Bump CACHE whenever you change index.html / styles.css / app.js so phones
 * pick up the new version on next online launch. */
const CACHE = 'chord-practice-v9';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './piano/C3.mp3',
  './piano/Fs3.mp3',
  './piano/C4.mp3',
  './piano/Fs4.mp3',
  './piano/C5.mp3',
  './piano/Fs5.mp3',
  './piano/C6.mp3',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((resp) => {
          // Cache same-origin successful responses for future offline use.
          if (resp.ok && new URL(req.url).origin === self.location.origin) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return resp;
        })
        .catch(() => caches.match('./index.html')); // offline navigation fallback
    })
  );
});
