/* Офлайн-кэш тренажёра. При каждом обновлении приложения увеличь VERSION —
   старый кэш удалится, а новые файлы скачаются при следующем открытии. */
const VERSION = 'v1';
const CACHE = 'trainer-' + VERSION;
const SHELL = [
  './', 'index.html', 'app.css', 'manifest.webmanifest',
  'js/core.js', 'js/app.js', 'js/subjects/adp.js', 'js/subjects/stat.js', 'js/subjects/db.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('trainer-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* сначала кэш (мгновенно и без сети), параллельно обновляем копию из сети */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !fonts) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: sameOrigin });
    const net = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
