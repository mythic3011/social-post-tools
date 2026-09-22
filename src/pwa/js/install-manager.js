/* Install prompt + capture-bridge helpers.
   Attaches to globalThis.SPT.install and globalThis.SPT.capture.
   Classic script (CSP script-src 'self'). Depends on SPT.store. */
(() => {
  'use strict';
  const Core = globalThis.SocialPostCore;
  const SPT = (globalThis.SPT = globalThis.SPT || {});
  if (!Core || !SPT.store) return;

  const { ANDROID_CAPTURE_BROWSERS } = SPT.store;
  const $ = (id) => document.getElementById(id);
  const status = (text) => { if ($('status')) $('status').textContent = text || ''; };

  let deferredInstallPrompt = null;

  function installBridge() {
    return globalThis.SPTInstallBridge || null;
  }

  function isStandaloneApp() {
    return window.matchMedia?.('(display-mode: standalone)').matches === true || navigator.standalone === true;
  }

  function isAndroidClient() {
    return /Android/i.test(String(navigator.userAgent || ''));
  }

  function browserFamily() {
    const bridgeBrowser = installBridge()?.browser;
    if (bridgeBrowser) return bridgeBrowser;
    const ua = String(navigator.userAgent || '');
    if (navigator.brave && typeof navigator.brave.isBrave === 'function') return 'brave';
    if (/Firefox|FxiOS/i.test(ua)) return 'firefox';
    if (/EdgA|EdgiOS|Edg\//i.test(ua)) return 'edge';
    if (/Chrome|CriOS/i.test(ua)) return 'chrome';
    return 'other';
  }

  function captureBridgeUrl(sourceUrl, mode = 'smart') {
    const platform = Core.platformForUrl(sourceUrl);
    const canonicalUrl = platform ? Core.canonicalize(platform, sourceUrl) : null;
    const alias = platform?.id === 'threads' ? Core.threadsShareAlias(sourceUrl) : null;
    const target = canonicalUrl || alias;
    if (!target) return null;
    const bridge = new URL('./capture-handoff.html', location.href);
    bridge.searchParams.set('url', target);
    bridge.searchParams.set('mode', Core.normalizeCaptureMode(mode));
    return bridge.href;
  }

  function androidIntentUrl(webUrl, packageName) {
    const target = new URL(webUrl);
    if (!packageName || target.protocol !== 'https:') return target.href;
    const data = `intent://${target.host}${target.pathname}${target.search}`;
    return `${data}#Intent;scheme=https;package=${packageName};S.browser_fallback_url=${encodeURIComponent(target.href)};end`;
  }

  function openCaptureBridge(sourceUrl, settings, mode = 'smart') {
    const bridgeUrl = captureBridgeUrl(sourceUrl, mode);
    if (!bridgeUrl) return false;
    if (isAndroidClient()) {
      const browser = ANDROID_CAPTURE_BROWSERS[settings.capture?.androidBrowser] || ANDROID_CAPTURE_BROWSERS.firefox;
      // The explicit browser package prevents Android App Links from handing
      // the Threads/X URL straight back to the native social app. The bridge
      // then lets the Userscript open the actual post with GM_openInTab.
      location.href = androidIntentUrl(bridgeUrl, browser.packageName);
      return true;
    }
    window.open(bridgeUrl, '_blank', 'noopener,noreferrer');
    return true;
  }

  function installManualGuidance() {
    const ua = String(navigator.userAgent || '');
    const browser = browserFamily();
    if (/Android/i.test(ua) && browser === 'brave') {
      return 'Brave can install the PWA on some builds, but Android Share Target registration is experimental and may require a developer Web App install setting. For the normal share-sheet path, open this site in Google Chrome and install it there.';
    }
    if (/Android/i.test(ua) && browser === 'firefox') {
      return 'Firefox can install the PWA, but it may not register Social Post Tools in Android Share. For Android Share-sheet integration, open this site in Google Chrome and install it there.';
    }
    if (/Android/i.test(ua) && browser === 'chrome') {
      return 'Open the Chrome menu, then choose Install app. After installation, verify Social Post Tools appears in Android Share.';
    }
    if (/Android/i.test(ua)) {
      return 'This browser may install the PWA without Android Share Target integration. For the supported Android Share-sheet path, use Google Chrome → Install app.';
    }
    if (/iPad|iPhone|iPod/i.test(ua)) {
      return 'Open the browser Share menu, then choose Add to Home Screen.';
    }
    return 'Use your browser address-bar install icon or menu → Install app / Add to Home screen.';
  }

  function syncInstallDiagnostics() {
    const bridge = installBridge();
    const secure = $('diag-secure');
    const worker = $('diag-worker');
    const prompt = $('diag-prompt');
    const mode = $('diag-mode');
    const shareTarget = $('diag-share-target');
    if (secure) secure.textContent = window.isSecureContext ? 'OK' : 'HTTPS required';
    if (worker) {
      if (!('serviceWorker' in navigator)) worker.textContent = 'Not supported';
      else if (bridge?.serviceWorkerError) worker.textContent = 'Registration failed';
      else if (navigator.serviceWorker.controller || bridge?.serviceWorkerReady) worker.textContent = 'Ready';
      else if (bridge?.serviceWorkerRegistration) worker.textContent = 'Registered; activating';
      else worker.textContent = 'Registering';
    }
    if (prompt) {
      if (bridge?.deferredPrompt || deferredInstallPrompt) prompt.textContent = 'Ready';
      else if ('BeforeInstallPromptEvent' in window || /Chrome|Chromium|Edg|OPR/i.test(String(navigator.userAgent || ''))) prompt.textContent = 'Not offered yet';
      else prompt.textContent = 'Use browser menu';
    }
    if (mode) mode.textContent = isStandaloneApp() ? 'Installed / standalone' : 'Browser';
    if (shareTarget) {
      const browser = browserFamily();
      if (!/Android/i.test(String(navigator.userAgent || ''))) shareTarget.textContent = 'Android only';
      else if (browser === 'chrome') shareTarget.textContent = 'Supported path';
      else if (browser === 'brave') shareTarget.textContent = 'Experimental / browser setting may be required';
      else if (browser === 'firefox') shareTarget.textContent = 'PWA install only; system share not guaranteed';
      else shareTarget.textContent = 'Not verified; use Chrome';
    }
  }

  function showInstallHelp() {
    const dialog = $('install-dialog');
    const guidance = $('install-guidance');
    if (guidance) guidance.textContent = window.isSecureContext
      ? installManualGuidance()
      : 'Open the HTTPS version of this site first. PWA installation requires a secure context.';
    syncInstallDiagnostics();
    if (dialog?.showModal) {
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (dialog) {
      dialog.setAttribute('open', '');
      dialog.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      return;
    }
    status(installManualGuidance());
  }

  function updateInstallUI() {
    const button = $('install-app');
    const help = $('install-help');
    if (!button) return;
    const bridge = installBridge();
    const prompt = bridge?.deferredPrompt || deferredInstallPrompt;

    if (isStandaloneApp() || bridge?.installed) {
      button.hidden = true;
      if (help) help.textContent = 'Social Post Tools is already installed on this device.';
      syncInstallDiagnostics();
      return;
    }

    // Keep the CTA usable even without beforeinstallprompt. In browsers such as
    // Firefox Android, clicking it opens manual install guidance rather than a
    // dead control.
    button.hidden = false;
    button.disabled = false;
    button.dataset.installState = prompt ? 'prompt-ready' : 'manual-fallback';
    if (help) help.textContent = prompt
      ? 'Ready. Tap Install to open the browser install prompt.'
      : 'Tap Install. If your browser cannot open a native prompt, manual Android install steps will be shown.';
    syncInstallDiagnostics();
  }

  function setupInstallPrompt() {
    const button = $('install-app');
    if (!button) return;
    const bridge = installBridge();

    // Fallback listener for builds/pages that load without the early install
    // bridge. Normal production pages capture this in <head>.
    if (!bridge) {
      window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredInstallPrompt = event;
        updateInstallUI();
      });
      window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        updateInstallUI();
        status('Installed. You can now choose Social Post Tools from Android Share.');
      });
    } else {
      deferredInstallPrompt = bridge.deferredPrompt;
      bridge.onChange((reason) => {
        deferredInstallPrompt = bridge.deferredPrompt;
        updateInstallUI();
        if (reason === 'installed') status('Installed. You can now choose Social Post Tools from Android Share.');
      });
    }

    $('install-dialog-close')?.addEventListener('click', () => {
      const dialog = $('install-dialog');
      if (typeof dialog?.close === 'function') dialog.close();
      else dialog?.removeAttribute('open');
    });

    button.addEventListener('click', async () => {
      const currentBridge = installBridge();
      const prompt = currentBridge?.deferredPrompt || deferredInstallPrompt;
      if (!prompt) {
        showInstallHelp();
        return;
      }

      if (currentBridge) currentBridge.deferredPrompt = null;
      deferredInstallPrompt = null;
      updateInstallUI();
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice?.outcome === 'accepted') {
          status('Install accepted. Android is finishing the app installation.');
        } else {
          status('Install dismissed. Tap Install again for manual browser-menu instructions.');
        }
      } catch {
        status('The browser could not open its native install prompt.');
        showInstallHelp();
      }
      updateInstallUI();
    });

    updateInstallUI();
  }

  SPT.install = {
    setupInstallPrompt,
    updateInstallUI,
    showInstallHelp,
    isStandaloneApp,
    isAndroidClient,
    browserFamily,
  };
  SPT.capture = {
    captureBridgeUrl,
    androidIntentUrl,
    openCaptureBridge,
  };
})();
