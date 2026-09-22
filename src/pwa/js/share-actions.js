(() => {
  'use strict';

  const Core = globalThis.SocialPostCore;
  if (!Core) return;

  const $ = (id) => document.getElementById(id);

  function status(text) { if ($('status')) $('status').textContent = text || ''; }

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
    return Core.normalizeSharedText(rendered, [
      chosenUrl,
      parsed.canonicalUrl,
      parsed.sharedUrl,
      alternateUrl,
    ].filter(Boolean));
  }

  globalThis.SPTShareActions = {
    status,
    copyText,
    nativeShare,
    addAction,
    telegramShare,
    shareVars,
    shareText,
    outgoingShareText,
  };
})();
