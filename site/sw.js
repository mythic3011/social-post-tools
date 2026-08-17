'use strict';
const CACHE = 'social-post-tools-pwa-v4.2.3';
const SHELL = [
  './', './index.html', './install.html', './settings.html', './share-target.html', './privacy.html', './404.html',
  './assets/vendor/pico.conditional.min.css', './assets/app.css', './install-bootstrap.js', './app.js', './social-post-core.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response?.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request, { ignoreSearch: true }))
      || (request.mode === 'navigate' ? await cache.match('./404.html') : undefined)
      || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // The Android share payload arrives in the query string. Serve the cached
  // shell instead of forwarding that query back to the origin when possible.
  if (event.request.mode === 'navigate' && url.pathname.endsWith('/share-target.html')) {
    event.respondWith(caches.match('./share-target.html').then((cached) => cached || fetch('./share-target.html')));
    return;
  }

  // Userscript install/update endpoints are deliberately network-only so a
  // service-worker cache cannot pin an old release.
  if (url.pathname.includes('/install/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Navigations and install-critical metadata/code prefer the network, then
  // fall back to the precache. This reduces stale-install UI after a deploy
  // while preserving offline startup.
  if (
    event.request.mode === 'navigate'
    || /\.(?:js|css|webmanifest)$/i.test(url.pathname)
  ) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
