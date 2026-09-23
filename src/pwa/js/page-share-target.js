/* Share-target page renderer. Classic script (CSP script-src 'self').
   Depends on SPT.store, SPT.share, SPT.capture. Runs on data-page="share-target". */
(() => {
  'use strict';
  const Core = globalThis.SocialPostCore;
  const SPT = (globalThis.SPT = globalThis.SPT || {});
  if (!Core || !SPT.store || !SPT.share || !SPT.capture) return;

  const { loadSettings, transformed } = SPT.store;
  const { outgoingShareText, copyText, nativeShare, addAction, telegramShare, runShareEnrichers } = SPT.share;
  const { openCaptureBridge } = SPT.capture;
  const $ = (id) => document.getElementById(id);
  const status = (text) => { if ($('status')) $('status').textContent = text || ''; };

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

  SPT.pages = SPT.pages || {};
  SPT.pages.shareTarget = renderShareTarget;
})();
