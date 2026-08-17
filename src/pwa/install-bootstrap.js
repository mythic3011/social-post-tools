(() => {
  'use strict';

  // Capture installability as early as possible. The main application loads at
  // the end of <body>; keeping this tiny bridge in <head> avoids losing a
  // beforeinstallprompt event that a browser may dispatch earlier.
  if (globalThis.SPTInstallBridge) return;

  const listeners = new Set();
  const bridge = {
    deferredPrompt: null,
    installed: false,
    promptSeen: false,
    serviceWorkerRegistration: null,
    serviceWorkerReady: false,
    serviceWorkerError: '',
    registrationPromise: null,
    onChange(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify(reason) {
      for (const listener of listeners) {
        try { listener(reason); } catch { /* UI listeners must not break install state. */ }
      }
    },
  };

  globalThis.SPTInstallBridge = bridge;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    bridge.deferredPrompt = event;
    bridge.promptSeen = true;
    bridge.notify('prompt-available');
  });

  window.addEventListener('appinstalled', () => {
    bridge.deferredPrompt = null;
    bridge.installed = true;
    bridge.notify('installed');
  });

  if ('serviceWorker' in navigator) {
    bridge.registrationPromise = navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        bridge.serviceWorkerRegistration = registration;
        bridge.notify('service-worker-registered');
        navigator.serviceWorker.ready.then(() => {
          bridge.serviceWorkerReady = true;
          bridge.notify('service-worker-ready');
        }).catch(() => {});
        return registration;
      })
      .catch((error) => {
        bridge.serviceWorkerError = String(error?.message || error || 'Service worker registration failed');
        bridge.notify('service-worker-error');
        return null;
      });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      bridge.notify('service-worker-controller-change');
    });
  }
})();
