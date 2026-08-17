(() => {
  'use strict';
  const Core = globalThis.SocialPostCore;
  if (!Core) return;

  const SETTINGS_KEY = 'social-post-tools:pwa-settings:v1';
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

  function installManualGuidance() {
    const ua = String(navigator.userAgent || '');
    if (/Android/i.test(ua) && /Firefox/i.test(ua)) {
      return 'Open the Firefox menu, then choose Install. Firefox on Android can install PWAs, but it does not expose the custom beforeinstallprompt API used by Chromium.';
    }
    if (/Android/i.test(ua)) {
      return 'Open your browser menu, then choose Install app or Add to Home screen. In Chrome/Edge/other Chromium browsers, also check the address-bar or menu install entry.';
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
      draft = clone(DEFAULTS); refreshAllSelects(); refreshBuilderList(); $('share-link-source').value = draft.share.linkSource; $('share-template').value = draft.share.template;
      for (const input of checks.querySelectorAll('input[data-action]')) input.checked = draft.actions.enabled[input.dataset.action] !== false;
      status('Settings reset in the draft.');
    });
    $('settings-save').addEventListener('click', () => {
      draft.links.x.builderId = $('x-builder').value; draft.links.threads.builderId = $('threads-builder').value;
      draft.share.linkSource = $('share-link-source').value; draft.share.template = $('share-template').value;
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

  function renderShareTarget() {
    const params = new URLSearchParams(location.search);
    const incoming = { title: params.get('title') || '', text: params.get('text') || '', url: params.get('url') || '' };
    const parsed = Core.parseIncomingShare(incoming);
    // Remove shared data from visible history as soon as it has been parsed.
    history.replaceState(null, '', './share-target.html');

    const settings = loadSettings();
    const alternateUrl = parsed.supported ? transformed(parsed.platform, parsed.canonicalUrl, settings) : null;
    const chosenUrl = settings.share.linkSource === 'clean' ? (parsed.canonicalUrl || parsed.sharedUrl) : (alternateUrl || parsed.canonicalUrl || parsed.sharedUrl);
    const text = shareText(settings, parsed, alternateUrl);

    if (parsed.supported) {
      $('platform-badge').textContent = Core.PLATFORMS[parsed.platform].name;
      $('share-title').textContent = parsed.title || 'Post link';
      $('share-text').textContent = parsed.text || '';
      $('clean-url').textContent = parsed.canonicalUrl;
      $('alternate-url').textContent = alternateUrl || 'No compatible builder';
    } else {
      $('supported-card').classList.add('hidden'); $('unsupported-card').classList.remove('hidden');
      $('raw-share').textContent = parsed.sharedUrl || parsed.text || parsed.title || 'No URL or text was supplied.';
    }

    const primaryActions = $('actions-primary');
    const moreActions = $('actions-more');
    const moreCard = $('more-actions-card');
    if (settings.actions.enabled.systemShare && chosenUrl) addAction(primaryActions, 'Share…', async () => {
      const ok = await nativeShare({ title: parsed.title, text, url: chosenUrl });
      if (ok === false) status(await copyText([text, chosenUrl].filter(Boolean).join('\n\n')) ? 'Native share unavailable; copied instead.' : 'Native share unavailable.');
    });
    if (settings.actions.enabled.copyAlternate && alternateUrl) addAction(primaryActions, 'Copy share link', async () => status(await copyText(alternateUrl) ? 'Share link copied.' : 'Clipboard unavailable.'));
    if (settings.actions.enabled.copyClean && parsed.canonicalUrl) addAction(moreActions, 'Copy original link', async () => status(await copyText(parsed.canonicalUrl) ? 'Original link copied.' : 'Clipboard unavailable.'));
    if (settings.actions.enabled.telegram && chosenUrl) addAction(moreActions, 'Send to Telegram', () => telegramShare(chosenUrl, text));
    if (settings.actions.enabled.openAlternate && alternateUrl) addAction(moreActions, 'Open share link', () => window.open(alternateUrl, '_blank', 'noopener,noreferrer'));
    moreCard.classList.toggle('hidden', !moreActions.children.length);

    const sourceUrl = parsed.canonicalUrl || parsed.sharedUrl;
    const captureCard = $('ai-capture-card');
    const captureButton = $('open-source');
    const handoffUrl = parsed.canonicalUrl ? Core.makeCaptureHandoffUrl(parsed.canonicalUrl, { mode: 'smart' }) : null;
    const captureEnabled = settings.actions.enabled.richCapture !== false && Boolean(handoffUrl);
    captureCard.classList.toggle('hidden', !captureEnabled);
    captureButton.disabled = !handoffUrl;
    captureButton.addEventListener('click', () => {
      if (!handoffUrl) return;
      // The fragment is consumed and removed locally by the userscript before
      // capture preparation. No post content is sent back to this PWA.
      location.href = handoffUrl;
    });
  }

  registerServiceWorker();
  setupInstallPrompt();
  const page = document.body.dataset.page;
  if (page === 'settings') renderSettingsPage();
  if (page === 'share-target') renderShareTarget();
})();
