(() => {
  'use strict';

  const Core = globalThis.SocialPostCore;
  if (!Core) return;

  const $ = (id) => document.getElementById(id);

  function status(text) { if ($('status')) $('status').textContent = text || ''; }

  function registerServiceWorker() {
    if (globalThis.SPTInstallBridge?.registrationPromise) return;
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
  }

  registerServiceWorker();

  const Install = globalThis.SPTInstallManager;
  if (Install) Install.setupInstallPrompt(status);

  const page = document.body.dataset.page;
  if (page === 'settings') globalThis.SPTPageSettings?.renderSettingsPage();
  if (page === 'share-target') globalThis.SPTPageShareTarget?.renderShareTarget().catch(() => status('Could not prepare the shared post.'));
  if (page === 'capture-handoff') globalThis.SPTPageCaptureHandoff?.renderCaptureHandoffPage();
})();
