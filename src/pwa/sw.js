'use strict';
const CACHE = 'social-post-tools-pwa-v4.3.1-ui3';
const SHELL = [
  './', './index.html', './install.html', './settings.html', './share-target.html', './capture-handoff.html', './privacy.html', './404.html',
  './assets/vendor/pico.conditional.min.css', './assets/app.css', './assets/install.css', './install-bootstrap.js', './provider-policy.js', './app.js', './social-post-core.js', './manifest.webmanifest',
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

  if (event.request.mode === 'navigate' && url.pathname.endsWith('/share-target.html')) {
    event.respondWith(caches.match('./share-target.html').then((cached) => cached || fetch('./share-target.html')));
    return;
  }

  if (event.request.mode === 'navigate' && url.pathname.endsWith('/capture-handoff.html')) {
    event.respondWith(caches.match('./capture-handoff.html').then((cached) => cached || fetch('./capture-handoff.html')));
    return;
  }

  // Install/update endpoints must bypass the service-worker cache so a stale
  // shell cannot pin an old Userscript release.
  if (url.pathname.includes('/install/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (
    event.request.mode === 'navigate'
    || /\.(?:js|css|webmanifest)$/i.test(url.pathname)
  ) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
