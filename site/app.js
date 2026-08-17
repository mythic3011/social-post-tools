(() => {
  'use strict';
  const Core = globalThis.SocialPostCore;
  if (!Core) return;

  const SETTINGS_KEY = 'social-post-tools:pwa-settings:v1';
  const THREADS_RESOLVER_URL = 'https://resolver.mythic3011.com/v1/threads/resolve';
  const THREADS_RESOLVE_TIMEOUT_MS = 5000;
  const ANDROID_CAPTURE_BROWSERS = Object.freeze({
    firefox: Object.freeze({ id: 'firefox', label: 'Firefox (recommended for Userscripts)', packageName: 'org.mozilla.firefox' }),
    firefoxBeta: Object.freeze({ id: 'firefoxBeta', label: 'Firefox Beta', packageName: 'org.mozilla.firefox_beta' }),
    firefoxNightly: Object.freeze({ id: 'firefoxNightly', label: 'Firefox Nightly', packageName: 'org.mozilla.fenix' }),
    system: Object.freeze({ id: 'system', label: 'System browser / app chooser', packageName: null }),
  });
  const ACTIONS = Object.freeze([
    ['copyClean', 'Copy original link'],
    ['copyAlternate', 'Copy share link'],
    ['systemShare', 'Share…'],
    ['telegram', 'Send to Telegram'],
    ['openAlternate', 'Open share link'],
    ['richCapture', 'Use with AI'],
  ]);
  const DEFAULTS = Object.freeze({
    schemaVersion: 1,
    links: { x: { builderId: 'nitter-net' }, threads: { builderId: 'vxthreads' } },
    builders: { custom: [] },
    actions: { enabled: { copyClean: false, copyAlternate: true, systemShare: true, telegram: false, openAlternate: false, richCapture: true } },
    share: { linkSource: 'selected', template: '{text}' },
    capture: { androidBrowser: 'firefox' },
    security: { allowInsecureCustomUrls: false },
  });

  const $ = (id) => document.getElementById(id);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const merge = (base, value) => {
    if (Array.isArray(base)) return Array.isArray(value) ? value.slice() : base.slice();
    if (!base || typeof base !== 'object') return value === undefined ? base : value;
    const out = {};
    const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    for (const [key, fallback] of Object.entries(base)) out[key] = merge(fallback, src[key]);
    return out;
  };

  function loadSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      return sanitizeSettings(raw || clone(DEFAULTS));
    } catch { return clone(DEFAULTS); }
  }

  function sanitizeSettings(raw) {
    const settings = merge(DEFAULTS, raw || {});
    const allow = Boolean(settings.security?.allowInsecureCustomUrls);
    const registry = Core.builderRegistry(settings.builders?.custom || [], { allowInsecureHttp: allow });
    settings.builders.custom = registry.filter((builder) => !builder.builtin);
    for (const platform of ['x', 'threads']) {
      const wanted = String(settings.links?.[platform]?.builderId || '');
      if (!registry.some((builder) => builder.id === wanted && builder.platforms.includes(platform))) {
        settings.links[platform].builderId = DEFAULTS.links[platform].builderId;
      }
    }
    for (const [id] of ACTIONS) settings.actions.enabled[id] = settings.actions.enabled[id] !== false;
    settings.share.linkSource = settings.share.linkSource === 'clean' ? 'clean' : 'selected';
    settings.share.template = String(settings.share.template || '{text}').slice(0, 8000);
    if (!ANDROID_CAPTURE_BROWSERS[settings.capture?.androidBrowser]) settings.capture.androidBrowser = DEFAULTS.capture.androidBrowser;
    return settings;
  }

  function saveSettings(settings) {
    const clean = sanitizeSettings(settings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(clean));
    return clean;
  }

  function status(text) { if ($('status')) $('status').textContent = text || ''; }

  function registerServiceWorker() {
    if (globalThis.SPTInstallBridge?.registrationPromise) return;
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
  }

  function compatible(platform, settings) {
    return Core.compatibleBuilders(platform, settings.builders.custom, { allowInsecureHttp: settings.security.allowInsecureCustomUrls });
  }

  function selectedBuilder(platform, settings) {
    return Core.selectBuilder(platform, settings.links[platform]?.builderId, settings.builders.custom, { allowInsecureHttp: settings.security.allowInsecureCustomUrls });
  }

  function transformed(platform, canonicalUrl, settings) {
    const builder = selectedBuilder(platform, settings);
    return Core.buildUrl(builder, platform, canonicalUrl, { allowInsecureHttp: settings.security.allowInsecureCustomUrls });
  }

  function builderDisplayLabel(builder) {
    if (!builder) return '';
    if (!builder.builtin) return `${builder.name} — custom`;
    if (builder.group === 'Nitter') return `${builder.name} — alternative reader`;
    if (builder.group === 'Embed fixer') return `${builder.name} — better chat previews`;
    if (builder.id === 'vxthreads') return `${builder.name} — better chat previews`;
    return builder.name;
  }

  function optionSelect(select, builders, selectedId) {
    select.replaceChildren();
    for (const builder of builders) {
      const option = document.createElement('option');
      option.value = builder.id;
      option.textContent = builderDisplayLabel(builder);
      option.selected = builder.id === selectedId;
      select.append(option);
    }
  }

  let deferredInstallPrompt = null;

  function isStandaloneApp() {
    return window.matchMedia?.('(display-mode: standalone)').matches === true || navigator.standalone === true;
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

  function isAndroidClient() {
    return /Android/i.test(String(navigator.userAgent || ''));
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

  function installBridge() {
    return globalThis.SPTInstallBridge || null;
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

    // Fallback listener for builds/pages that load app.js without the early
    // install bridge. Normal production pages capture this in <head>.
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

  function renderSettingsPage() {
    let draft = loadSettings();
    optionSelect($('x-builder'), compatible('x', draft), draft.links.x.builderId);
    optionSelect($('threads-builder'), compatible('threads', draft), draft.links.threads.builderId);

    const checks = $('action-checks');
    for (const [id, label] of ACTIONS) {
      const input = document.createElement('input');
      input.type = 'checkbox'; input.checked = draft.actions.enabled[id] !== false; input.dataset.action = id;
      const wrap = document.createElement('label'); wrap.append(input, document.createTextNode(label)); checks.append(wrap);
    }
    $('share-link-source').value = draft.share.linkSource;
    $('share-template').value = draft.share.template;
    if ($('android-capture-browser')) $('android-capture-browser').value = draft.capture.androidBrowser;

    function refreshBuilderList() {
      const list = $('builder-list'); list.replaceChildren();
      if (!draft.builders.custom.length) {
        const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'No custom builders.'; list.append(p); return;
      }
      for (const builder of draft.builders.custom) {
        const row = document.createElement('div'); row.className = 'builder-item';
        const label = document.createElement('div');
        const strong = document.createElement('strong'); strong.textContent = builder.name;
        const detail = document.createElement('div'); detail.className = 'url muted'; detail.textContent = builder.baseUrl || builder.template || '';
        label.append(strong, detail);
        const del = document.createElement('button'); del.type = 'button'; del.className = 'secondary outline'; del.textContent = 'Delete';
        del.addEventListener('click', () => {
          draft.builders.custom = draft.builders.custom.filter((item) => item.id !== builder.id);
          for (const p of ['x', 'threads']) if (draft.links[p].builderId === builder.id) draft.links[p].builderId = DEFAULTS.links[p].builderId;
          refreshAllSelects(); refreshBuilderList();
        });
        row.append(label, del); list.append(row);
      }
    }

    function refreshAllSelects() {
      optionSelect($('x-builder'), compatible('x', draft), draft.links.x.builderId);
      optionSelect($('threads-builder'), compatible('threads', draft), draft.links.threads.builderId);
    }

    function previewBuilder() {
      const platform = $('builder-platform').value;
      const type = $('builder-type').value;
      const value = $('builder-value').value.trim();
      const raw = { id: 'preview', name: $('builder-name').value || 'Preview', platforms: [platform], type };
      if (type === 'replace-origin') raw.baseUrl = value; else raw.template = value;
      const builder = Core.normalizeCustomBuilder(raw, { allowInsecureHttp: draft.security.allowInsecureCustomUrls });
      const sample = platform === 'x' ? 'https://x.com/example/status/1234567890' : 'https://www.threads.com/@example/post/AbCdEf';
      $('builder-preview').textContent = builder ? (Core.buildUrl(builder, platform, sample, { allowInsecureHttp: draft.security.allowInsecureCustomUrls }) || 'Invalid output') : 'Invalid builder';
    }
    for (const id of ['builder-name', 'builder-platform', 'builder-type', 'builder-value']) $(id).addEventListener('input', previewBuilder);
    $('builder-type').addEventListener('change', previewBuilder);
    $('builder-add').addEventListener('click', () => {
      const platform = $('builder-platform').value;
      const type = $('builder-type').value;
      const raw = { name: $('builder-name').value, platforms: [platform], type };
      if (type === 'replace-origin') raw.baseUrl = $('builder-value').value; else raw.template = $('builder-value').value;
      const builder = Core.normalizeCustomBuilder(raw, { allowInsecureHttp: draft.security.allowInsecureCustomUrls });
      if (!builder || draft.builders.custom.length >= Core.MAX_CUSTOM_BUILDERS) { status('Invalid builder. HTTPS is required except loopback.'); return; }
      draft.builders.custom.push(builder); $('builder-name').value = ''; $('builder-value').value = ''; previewBuilder(); refreshAllSelects(); refreshBuilderList(); status('Builder added to draft settings.');
    });

    $('portable-export').addEventListener('click', () => {
      draft.links.x.builderId = $('x-builder').value; draft.links.threads.builderId = $('threads-builder').value;
      $('portable-json').value = JSON.stringify(Core.makePortableLinkSettings(draft), null, 2);
      status('Portable link settings exported.');
    });
    $('portable-import').addEventListener('click', () => {
      try {
        const portable = Core.sanitizePortableLinkSettings(JSON.parse($('portable-json').value));
        if (!portable) throw new Error('bad schema');
        draft.links = portable.links; draft.builders.custom = portable.builders.custom; draft.security.allowInsecureCustomUrls = portable.security.allowInsecureCustomUrls;
        refreshAllSelects(); refreshBuilderList(); status('Portable link settings imported into the draft.');
      } catch { status('Invalid portable settings JSON.'); }
    });
    $('settings-reset').addEventListener('click', () => {
      draft = clone(DEFAULTS); refreshAllSelects(); refreshBuilderList(); $('share-link-source').value = draft.share.linkSource; $('share-template').value = draft.share.template; if ($('android-capture-browser')) $('android-capture-browser').value = draft.capture.androidBrowser;
      for (const input of checks.querySelectorAll('input[data-action]')) input.checked = draft.actions.enabled[input.dataset.action] !== false;
      status('Settings reset in the draft.');
    });
    $('settings-save').addEventListener('click', () => {
      draft.links.x.builderId = $('x-builder').value; draft.links.threads.builderId = $('threads-builder').value;
      draft.share.linkSource = $('share-link-source').value; draft.share.template = $('share-template').value; if ($('android-capture-browser')) draft.capture.androidBrowser = $('android-capture-browser').value;
      for (const input of checks.querySelectorAll('input[data-action]')) draft.actions.enabled[input.dataset.action] = input.checked;
      draft = saveSettings(draft); status('Saved.');
    });
    refreshBuilderList(); previewBuilder();
  }

  function shareVars(parsed, alternateUrl) {
    return {
      title: parsed.title || '',
      text: parsed.text || '',
      url: parsed.canonicalUrl || parsed.sharedUrl || '',
      alternateUrl: alternateUrl || '',
      platform: parsed.platform || '',
    };
  }

  function shareText(settings, parsed, alternateUrl) {
    const vars = shareVars(parsed, alternateUrl);
    const rendered = Core.applyTemplate(settings.share.template || '{text}', vars).trim();
    return rendered.slice(0, 4000);
  }

  function outgoingShareText(settings, parsed, alternateUrl, chosenUrl) {
    const rendered = shareText(settings, parsed, alternateUrl);
    // Android sources frequently repeat the same permalink in both text and
    // url. Destinations receive the URL in navigator.share({ url }), so strip
    // equivalent canonical/alias/alternate URLs from the text field once more
    // after the final destination URL has been selected. Preserve captions and
    // unrelated URLs.
    return Core.normalizeSharedText(rendered, [
      chosenUrl,
      parsed.canonicalUrl,
      parsed.sharedUrl,
      alternateUrl,
    ].filter(Boolean));
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }

  async function nativeShare({ title, text, url }) {
    if (typeof navigator.share !== 'function') return false;
    try { await navigator.share({ title: title || undefined, text: text || undefined, url: url || undefined }); return true; } catch (error) {
      if (error?.name === 'AbortError') return null;
      return false;
    }
  }

  function addAction(container, label, handler) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', handler); container.append(button); return button;
  }

  function telegramShare(url, text) {
    const target = new URL('https://t.me/share/url');
    target.searchParams.set('url', url || '');
    if (text) target.searchParams.set('text', text);
    window.open(target.href, '_blank', 'noopener,noreferrer');
  }


  function rewriteResolvedThreadsText(text, canonicalUrl) {
    const pattern = /https:\/\/(?:www\.)?threads\.(?:com|net)\/share\/[A-Za-z0-9_-]+\/?(?:[?#][^\s]*)?/gi;
    const replaced = String(text || '').replace(pattern, canonicalUrl).trim();
    return replaced === canonicalUrl ? '' : replaced;
  }

  async function resolveThreadsShareAlias(parsed) {
    if (!parsed?.supported || parsed.platform !== 'threads' || !parsed.needsResolution || !parsed.sharedUrl) return parsed;
    if (!THREADS_RESOLVER_URL) return { ...parsed, resolutionError: 'resolver_not_configured' };

    let lastError = 'resolver_failed';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), THREADS_RESOLVE_TIMEOUT_MS);
      try {
        const response = await fetch(THREADS_RESOLVER_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: parsed.sharedUrl }),
          credentials: 'omit',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          signal: controller.signal,
        });
        let data = null;
        try { data = await response.json(); } catch {}
        if (!response.ok) {
          lastError = String(data?.error || `resolver_http_${response.status}`);
          if (response.status < 500) break;
          continue;
        }
        const canonicalUrl = Core.canonicalize('threads', data?.canonicalUrl || '');
        if (!canonicalUrl) {
          lastError = 'resolver_invalid_canonical';
          break;
        }
        return {
          ...parsed,
          canonicalUrl,
          text: rewriteResolvedThreadsText(parsed.text, canonicalUrl),
          shareKind: 'resolved-post',
          needsResolution: false,
          resolvedFrom: parsed.sharedUrl,
          resolution: String(data?.resolution || 'resolver'),
          resolutionError: null,
          pipeline: {
            ...(parsed.pipeline || {}),
            stages: (parsed.pipeline?.stages || []).map((stage) => stage.id === 's02-enrich'
              ? { ...stage, status: 'resolved', plugin: 'threads-share-resolver' }
              : stage),
          },
        };
      } catch (error) {
        lastError = error?.name === 'AbortError' ? 'resolver_timeout' : 'resolver_network_error';
      } finally {
        clearTimeout(timer);
      }
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
    return {
      ...parsed,
      resolutionError: lastError,
      pipeline: {
        ...(parsed.pipeline || {}),
        stages: (parsed.pipeline?.stages || []).map((stage) => stage.id === 's02-enrich'
          ? { ...stage, status: 'failed', plugin: 'threads-share-resolver', error: lastError }
          : stage),
      },
    };
  }

  const SHARE_ENRICHER_PLUGINS = Object.freeze([
    Object.freeze({
      id: 'threads-share-resolver',
      kind: 'enricher',
      priority: 100,
      matches(parsed) {
        return parsed?.supported
          && parsed.platform === 'threads'
          && parsed.needsResolution
          && Boolean(parsed.sharedUrl);
      },
      run: resolveThreadsShareAlias,
    }),
  ]);

  async function runShareEnrichers(parsed) {
    let current = parsed;
    for (const plugin of SHARE_ENRICHER_PLUGINS.slice().sort((a, b) => b.priority - a.priority)) {
      if (!plugin.matches(current)) continue;
      current = await plugin.run(current);
    }
    return current;
  }

  async function renderShareTarget() {
    const params = new URLSearchParams(location.search);
    const incoming = { title: params.get('title') || '', text: params.get('text') || '', url: params.get('url') || '' };
    let parsed = Core.parseIncomingShare(incoming);
    // Remove shared data from visible history as soon as it has been parsed.
    history.replaceState(null, '', './share-target.html');

    if (parsed.supported && parsed.platform === 'threads' && parsed.needsResolution) {
      $('platform-badge').textContent = Core.PLATFORMS.threads.name;
      $('share-title').textContent = 'Resolving Threads link…';
      $('share-note').classList.remove('hidden');
      $('share-note').textContent = 'Converting the Threads /share/ alias into the canonical post permalink.';
      $('alternate-url').textContent = parsed.sharedUrl || '';
      parsed = await runShareEnrichers(parsed);
    }

    const settings = loadSettings();
    const hasCanonicalPost = Boolean(parsed.canonicalUrl);
    const alternateUrl = hasCanonicalPost ? transformed(parsed.platform, parsed.canonicalUrl, settings) : null;
    const chosenUrl = settings.share.linkSource === 'clean' ? (parsed.canonicalUrl || parsed.sharedUrl) : (alternateUrl || parsed.canonicalUrl || parsed.sharedUrl);
    const text = outgoingShareText(settings, parsed, alternateUrl, chosenUrl);

    if (parsed.supported) {
      $('platform-badge').textContent = Core.PLATFORMS[parsed.platform].name;
      $('share-title').textContent = parsed.needsResolution ? 'Threads shared link' : (parsed.title || 'Post link');
      $('share-text').textContent = parsed.text || '';
      if (parsed.needsResolution) {
        $('share-note').classList.remove('hidden');
        $('share-note').textContent = parsed.resolutionError
          ? `Automatic canonical-link resolution failed (${parsed.resolutionError}). Retry first; the /share/ URL is only a fallback.`
          : 'Threads supplied a /share/ alias and the canonical post permalink is still unresolved.';
        $('share-link-label').textContent = 'Threads share link';
        $('alternate-url').textContent = parsed.sharedUrl || '';
        $('original-link-details').classList.add('hidden');
      } else {
        if (parsed.resolvedFrom) {
          $('share-note').classList.remove('hidden');
          $('share-note').textContent = 'Threads short link resolved automatically. Actions below use the canonical post permalink, not the /share/ alias.';
        }
        $('clean-url').textContent = parsed.canonicalUrl || '';
        $('alternate-url').textContent = alternateUrl || parsed.canonicalUrl || 'No compatible builder';
      }
    } else {
      $('supported-card').classList.add('hidden'); $('unsupported-card').classList.remove('hidden');
      $('raw-share').textContent = parsed.sharedUrl || parsed.text || parsed.title || 'No URL or text was supplied.';
    }

    const primaryActions = $('actions-primary');
    const moreActions = $('actions-more');
    const moreCard = $('more-actions-card');
    if (parsed.needsResolution && parsed.sharedUrl) {
      addAction(primaryActions, 'Retry canonical link', () => {
        const retry = new URL(location.href);
        retry.searchParams.set('url', parsed.sharedUrl);
        location.replace(retry.href);
      });
      addAction(moreActions, 'Open Threads fallback', () => {
        window.open(parsed.sharedUrl, '_blank', 'noopener,noreferrer');
      });
    }
    if (settings.actions.enabled.systemShare && chosenUrl) addAction(primaryActions, 'Share…', async () => {
      const ok = await nativeShare({ title: parsed.title, text, url: chosenUrl });
      if (ok === false) status(await copyText([text, chosenUrl].filter(Boolean).join('\n\n')) ? 'Native share unavailable; copied instead.' : 'Native share unavailable.');
    });
    if (settings.actions.enabled.copyAlternate && alternateUrl) addAction(primaryActions, 'Copy share link', async () => status(await copyText(alternateUrl) ? 'Share link copied.' : 'Clipboard unavailable.'));
    if (parsed.needsResolution && parsed.sharedUrl) addAction(primaryActions, 'Copy Threads link', async () => status(await copyText(parsed.sharedUrl) ? 'Threads share link copied.' : 'Clipboard unavailable.'));
    if (settings.actions.enabled.copyClean && parsed.canonicalUrl) addAction(moreActions, 'Copy original link', async () => status(await copyText(parsed.canonicalUrl) ? 'Original link copied.' : 'Clipboard unavailable.'));
    if (settings.actions.enabled.telegram && chosenUrl) addAction(moreActions, 'Send to Telegram', () => telegramShare(chosenUrl, text));
    if (settings.actions.enabled.openAlternate && alternateUrl) addAction(moreActions, 'Open share link', () => window.open(alternateUrl, '_blank', 'noopener,noreferrer'));
    moreCard.classList.toggle('hidden', !moreActions.children.length);

    const captureCard = $('ai-capture-card');
    const captureButton = $('open-source');
    const captureCopy = captureCard?.querySelector('p.muted');
    const handoffSource = parsed.canonicalUrl || (parsed.needsResolution ? parsed.sharedUrl : null);
    const unresolvedThreads = parsed.platform === 'threads' && parsed.needsResolution && Boolean(parsed.sharedUrl);
    const captureEnabled = settings.actions.enabled.richCapture !== false && Boolean(handoffSource);
    captureCard.classList.toggle('hidden', !captureEnabled);
    captureButton.disabled = !handoffSource;
    if (captureCopy) {
      captureCopy.textContent = unresolvedThreads
        ? 'Open the Threads share alias in your Userscript browser. Social Post Tools will resolve the final post there and continue capture without handing the link back to the Threads app.'
        : 'Open the post in the browser that has the Social Post Tools Userscript. On Android, Firefox is used by default so the native Threads/X app does not intercept the handoff.';
    }
    captureButton.textContent = 'Open for AI capture';
    captureButton.addEventListener('click', () => {
      if (!handoffSource) return;
      if (!openCaptureBridge(handoffSource, settings, 'smart')) status('Could not prepare the AI capture handoff.');
    });
  }

  function renderCaptureHandoffPage() {
    const params = new URLSearchParams(location.search);
    const raw = params.get('url') || document.documentElement.dataset.sptCaptureBridgeSource || '';
    const platform = Core.platformForUrl(raw);
    const canonicalUrl = platform ? Core.canonicalize(platform, raw) : null;
    const alias = platform?.id === 'threads' ? Core.threadsShareAlias(raw) : null;
    const target = canonicalUrl || alias;
    history.replaceState(null, '', './capture-handoff.html');

    const targetNode = $('handoff-target');
    const titleNode = $('handoff-title');
    const noteNode = $('handoff-note');
    const copyButton = $('handoff-copy');
    if (!target) {
      if (titleNode) titleNode.textContent = 'Invalid capture target';
      if (noteNode) noteNode.textContent = 'Only X and Threads post links or supported Threads share aliases can be handed to the Userscript.';
      if (copyButton) copyButton.disabled = true;
      return;
    }
    if (targetNode) targetNode.textContent = target;
    copyButton?.addEventListener('click', async () => status(await copyText(target) ? 'Post link copied.' : 'Clipboard unavailable.'));

    // The Userscript marks the document at document-start, then uses
    // GM_openInTab so Android does not hand the social URL to the native app.
    setTimeout(() => {
      const handled = document.documentElement.dataset.sptCaptureBridge === 'handled';
      if (handled) {
        if (titleNode) titleNode.textContent = 'Opening in your Userscript browser…';
        if (noteNode) noteNode.textContent = 'The Social Post Tools Userscript detected the handoff and is opening the post in a browser tab.';
      } else {
        if (titleNode) titleNode.textContent = 'Userscript not detected';
        if (noteNode) noteNode.textContent = 'Install or enable Social Post Tools in this browser, then retry from the Android share screen. Firefox + Tampermonkey/Violentmonkey is the recommended Android capture path.';
      }
    }, 900);
  }

  registerServiceWorker();
  setupInstallPrompt();
  const page = document.body.dataset.page;
  if (page === 'settings') renderSettingsPage();
  if (page === 'share-target') renderShareTarget().catch(() => status('Could not prepare the shared post.'));
  if (page === 'capture-handoff') renderCaptureHandoffPage();
})();
