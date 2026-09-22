(() => {
  'use strict';

  const Core = globalThis.SocialPostCore;
  const Store = globalThis.SPTSettingsStore;
  const Share = globalThis.SPTShareActions;
  const Install = globalThis.SPTInstallManager;
  if (!Core || !Store || !Share || !Install) return;

  const $ = (id) => document.getElementById(id);
  const { loadSettings } = Store;
  const { status, copyText, nativeShare, addAction, telegramShare, outgoingShareText } = Share;
  const { isAndroidClient } = Install;

  const THREADS_RESOLVER_URL = '__THREADS_RESOLVER_URL__';
  const THREADS_RESOLVE_TIMEOUT_MS = 5000;

  function transformed(platform, canonicalUrl, settings) {
    const builder = Core.selectBuilder(platform, settings.links[platform]?.builderId, settings.builders.custom, { allowInsecureHttp: settings.security.allowInsecureCustomUrls });
    return Core.buildUrl(builder, platform, canonicalUrl, { allowInsecureHttp: settings.security.allowInsecureCustomUrls });
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
      const browser = Store.ANDROID_CAPTURE_BROWSERS[settings.capture?.androidBrowser] || Store.ANDROID_CAPTURE_BROWSERS.firefox;
      location.href = androidIntentUrl(bridgeUrl, browser.packageName);
      return true;
    }
    window.open(bridgeUrl, '_blank', 'noopener,noreferrer');
    return true;
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

  globalThis.SPTPageShareTarget = { renderShareTarget };
})();
