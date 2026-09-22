(() => {
  'use strict';

  const Core = globalThis.SocialPostCore;
  if (!Core) return;

  const cleanNode = document.getElementById('clean-url');
  const link = document.getElementById('open-link-lab');
  if (!cleanNode || !link) return;

  function linkLabSource(raw) {
    const value = String(raw || '').trim();
    const platform = Core.platformForUrl(value);
    if (!platform) return null;
    return Core.canonicalize(platform, value)
      || (platform.id === 'threads' ? Core.threadsShareAlias(value) : null);
  }

  function syncLinkLabTarget() {
    const source = linkLabSource(cleanNode.textContent);
    if (!source) {
      link.hidden = true;
      link.setAttribute('href', './link-lab.html');
      return;
    }
    link.setAttribute('href', `./link-lab.html#url=${encodeURIComponent(source)}`);
    link.hidden = false;
  }

  const observer = new MutationObserver(syncLinkLabTarget);
  observer.observe(cleanNode, { childList: true, characterData: true, subtree: true });
  syncLinkLabTarget();
})();