/* Share pipeline: text composition, Threads alias resolution, share actions.
   Attaches to globalThis.SPT.share. Classic script (CSP script-src 'self').
   Depends on SPT.store. */
(() => {
  'use strict';
  const Core = globalThis.SocialPostCore;
  const SPT = (globalThis.SPT = globalThis.SPT || {});
  if (!Core || !SPT.store) return;

  const THREADS_RESOLVER_URL = '__THREADS_RESOLVER_URL__';
  const THREADS_RESOLVE_TIMEOUT_MS = 5000;

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

  SPT.share = {
    shareVars,
    shareText,
    outgoingShareText,
    copyText,
    nativeShare,
    addAction,
    telegramShare,
    rewriteResolvedThreadsText,
    resolveThreadsShareAlias,
    runShareEnrichers,
    SHARE_ENRICHER_PLUGINS,
  };
})();
