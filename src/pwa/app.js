/* App bootstrap: registers the service worker, wires the install prompt, and
   dispatches to the per-page renderer. Classic script (CSP script-src 'self').
   Page logic lives in js/*.js modules attached to globalThis.SPT. */
(() => {
  'use strict';
  const Core = globalThis.SocialPostCore;
  const SPT = globalThis.SPT;
  if (!Core || !SPT) return;

  const $ = (id) => document.getElementById(id);
  const status = (text) => { if ($('status')) $('status').textContent = text || ''; };

  function registerServiceWorker() {
    if (globalThis.SPTInstallBridge?.registrationPromise) return;
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
  }

  registerServiceWorker();
  SPT.install?.setupInstallPrompt();

  const page = document.body.dataset.page;
  if (page === 'settings') SPT.pages?.settings?.();
  if (page === 'share-target') SPT.pages?.shareTarget?.().catch(() => status('Could not prepare the shared post.'));
  if (page === 'capture-handoff') SPT.pages?.captureHandoff?.();
})();
