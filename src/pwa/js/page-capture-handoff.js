/* Capture-handoff page renderer. Classic script (CSP script-src 'self').
   Depends on SPT.store, SPT.share. Runs on data-page="capture-handoff". */
(() => {
  'use strict';
  const Core = globalThis.SocialPostCore;
  const SPT = (globalThis.SPT = globalThis.SPT || {});
  if (!Core || !SPT.store || !SPT.share) return;

  const { copyText } = SPT.share;
  const $ = (id) => document.getElementById(id);
  const status = (text) => { if ($('status')) $('status').textContent = text || ''; };

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

  SPT.pages = SPT.pages || {};
  SPT.pages.captureHandoff = renderCaptureHandoffPage;
})();
