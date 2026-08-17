'use strict';
const CACHE = 'social-post-tools-pwa-v4.2.1';
const SHELL = [
  './', './index.html', './install.html', './settings.html', './share-target.html', './privacy.html', './404.html',
  './assets/vendor/pico.conditional.min.css', './assets/app.css', './app.js', './social-post-core.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png'
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.mode === 'navigate' && url.origin === self.location.origin && url.pathname.endsWith('/share-target.html')) {
    event.respondWith(caches.match('./share-target.html').then((cached) => cached || fetch('./share-target.html')));
    return;
  }
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Install artifacts are deliberately network-first and are not part of the
  // app-shell cache, so userscript update checks do not get an old cached file.
  if (url.pathname.includes('/install/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
