const APP_CACHE = 'ner-app-v1';
const TILE_CACHE = 'ner-map-tiles-v1';
const APP_FILES = ['/','/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => ![APP_CACHE, TILE_CACHE].includes(key)).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) caches.open(APP_CACHE).then((cache) => cache.put('/index.html', response.clone()));
      return response;
    }).catch(async () => (await caches.match('/index.html')) || Response.error()));
    return;
  }

  if (/^\/api\/(road|satellite|satellite-overlay)\//.test(url.pathname)) {
    event.respondWith(caches.open(TILE_CACHE).then(async (cache) => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
          const keys = await cache.keys();
          if (keys.length > 120) await cache.delete(keys[0]);
        }
        return response;
      } catch {
        return (await cache.match(request)) || Response.error();
      }
    }));
    return;
  }

  if (request.destination === 'script' || request.destination === 'style' || request.destination === 'image' || request.destination === 'font') {
    event.respondWith(caches.open(APP_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      }).catch(() => cached || Response.error());
      return cached || network;
    }));
  }
});
