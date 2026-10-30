// Service worker: keeps a copy of the app on the phone so it opens without
// internet. Strategy "stale-while-revalidate": answer from the saved copy
// right away, and refresh that copy in the background when online.
// Changes you publish show up the second time you open the app.

const CACHE = 'rutina-v1';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'data/exercises.json',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // Also save every exercise photo, so the guide works offline.
    const data = await (await fetch('data/exercises.json')).json();
    const photos = data.exercises.flatMap((ex) => ex.media.filter((m) => m.src).map((m) => m.src));
    await cache.addAll(photos);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key);
    }
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request, { ignoreSearch: true });
    const fresh = fetch(event.request)
      .then((response) => {
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      })
      .catch(() => cached);
    if (cached) {
      event.waitUntil(fresh);
      return cached;
    }
    return fresh;
  })());
});
