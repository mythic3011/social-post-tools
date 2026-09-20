(() => {
  'use strict';

  const Core = globalThis.SocialPostCore;
  if (!Core) return;

  const SETTINGS_KEY = 'social-post-tools:pwa-settings:v1';
  const $ = (id) => document.getElementById(id);

  function loadProviderSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null') || {};
      return {
        links: raw.links && typeof raw.links === 'object' ? raw.links : {},
        custom: Array.isArray(raw.builders?.custom) ? raw.builders.custom : [],
        allowInsecureHttp: Boolean(raw.security?.allowInsecureCustomUrls),
      };
    } catch {
      return { links: {}, custom: [], allowInsecureHttp: false };
    }
  }

  function compatibleProviders(platform, settings) {
    return Core.compatibleBuilders(platform, settings.custom, {
      allowInsecureHttp: settings.allowInsecureHttp,
    });
  }

  function providerForCapability(platform, capability, settings) {
    const compatible = compatibleProviders(platform, settings);
    const configuredId = settings.links?.[platform]?.builderId;
    const configured = Core.selectBuilder(platform, configuredId, settings.custom, {
      allowInsecureHttp: settings.allowInsecureHttp,
    });
    if (configured?.capability === capability) return configured;
    return compatible.find((builder) => builder.capability === capability && builder.status === 'recommended')
      || compatible.find((builder) => builder.capability === capability)
      || null;
  }

  function providerDescription(builder) {
    if (!builder) return 'No active provider supports this capability for the detected platform.';
    const status = builder.status === 'recommended' ? 'recommended' : builder.status || 'available';
    const capability = builder.capability || 'custom';
    return `${builder.name} · ${capability} · ${status}${builder.builtin ? '' : ' · custom'}`;
  }

  function actionButtonsFor(outputId) {
    return [
      ...document.querySelectorAll(`[data-copy-output="${outputId}"], [data-open-output="${outputId}"]`),
    ];
  }

  function setOutput(id, value, metaId, meta, stateId, state) {
    const output = $(id);
    const normalized = String(value || '');
    output.value = normalized;
    output.disabled = !normalized;
    for (const button of actionButtonsFor(id)) button.disabled = !normalized;
    if ($(metaId)) $(metaId).textContent = meta;
    if ($(stateId)) $(stateId).textContent = state;
  }

  function resetOutputs() {
    setOutput('clean-output', '', 'clean-meta', 'Canonical source URL.', 'clean-state', 'Canonical');
    setOutput('preview-output', '', 'preview-meta', 'Waiting for a supported post URL.', 'preview-state', 'Embed');
    setOutput('reader-output', '', 'reader-meta', 'Waiting for a supported post URL.', 'reader-state', 'Optional');
    $('lab-results').hidden = true;
  }

  function setStatus(message) {
    $('lab-status').textContent = message;
  }

  function analyze(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) {
      resetOutputs();
      setStatus('Paste an X or Threads post URL first.');
      return false;
    }

    const platform = Core.platformForUrl(raw);
    if (!platform) {
      resetOutputs();
      setStatus('Unsupported URL. Link Lab currently accepts X/Twitter and Threads post URLs.');
      return false;
    }

    const canonicalUrl = Core.canonicalize(platform, raw);
    const threadsAlias = platform.id === 'threads' ? Core.threadsShareAlias(raw) : null;
    $('lab-results').hidden = false;

    if (!canonicalUrl && threadsAlias) {
      setOutput('clean-output', threadsAlias, 'clean-meta', 'Threads share alias recognized. Canonical post resolution requires the normal share-target resolver.', 'clean-state', 'Alias');
      setOutput('preview-output', '', 'preview-meta', 'Unavailable until the Threads share alias resolves to a canonical post URL.', 'preview-state', 'Pending');
      setOutput('reader-output', '', 'reader-meta', 'Unavailable until the Threads share alias resolves to a canonical post URL.', 'reader-state', 'Pending');
      setStatus('Recognized a Threads share alias. Link Lab stays network-silent, so it will not resolve the alias in the background.');
      return true;
    }

    if (!canonicalUrl) {
      resetOutputs();
      setStatus(`Recognized ${platform.name}, but this is not a supported post URL.`);
      return false;
    }

    const settings = loadProviderSettings();
    const previewProvider = providerForCapability(platform.id, 'embed', settings);
    const readerProvider = providerForCapability(platform.id, 'reader', settings);
    const options = { allowInsecureHttp: settings.allowInsecureHttp };
    const previewUrl = previewProvider ? Core.buildUrl(previewProvider, platform.id, canonicalUrl, options) : null;
    const readerUrl = readerProvider ? Core.buildUrl(readerProvider, platform.id, canonicalUrl, options) : null;

    setOutput(
      'clean-output',
      canonicalUrl,
      'clean-meta',
      `${platform.name} canonical source · tracking parameters removed`,
      'clean-state',
      'Canonical',
    );
    setOutput(
      'preview-output',
      previewUrl,
      'preview-meta',
      providerDescription(previewProvider),
      'preview-state',
      previewProvider ? 'Embed' : 'Unavailable',
    );
    setOutput(
      'reader-output',
      readerUrl,
      'reader-meta',
      providerDescription(readerProvider),
      'reader-state',
      readerProvider ? 'Reader' : 'Unavailable',
    );

    const available = [previewProvider && 'preview', readerProvider && 'reader'].filter(Boolean).join(' + ');
    setStatus(`${platform.name} post normalized locally${available ? ` · ${available} output${available.includes('+') ? 's' : ''} available` : ''}.`);
    return true;
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch {}
      textarea.remove();
      return copied;
    }
  }

  function safeOutputUrl(outputId) {
    const value = String($(outputId)?.value || '').trim();
    if (!value) return null;
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) ? url : null;
    } catch {
      return null;
    }
  }

  document.addEventListener('click', async (event) => {
    const copyButton = event.target.closest?.('[data-copy-output]');
    if (copyButton) {
      const url = safeOutputUrl(copyButton.dataset.copyOutput);
      if (!url) return;
      const copied = await copyText(url.href);
      setStatus(copied ? 'Copied output link.' : 'Could not copy the output link.');
      return;
    }

    const openButton = event.target.closest?.('[data-open-output]');
    if (openButton) {
      const url = safeOutputUrl(openButton.dataset.openOutput);
      if (!url) return;
      window.open(url.href, '_blank', 'noopener,noreferrer');
      setStatus('Opened output link in a new tab.');
    }
  });

  $('link-lab-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    analyze($('source-url').value);
  });

  $('paste-link')?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      $('source-url').value = String(text || '').trim();
      analyze($('source-url').value);
    } catch {
      setStatus('Clipboard read was blocked by the browser. Paste the URL into the field manually.');
      $('source-url').focus();
    }
  });

  resetOutputs();
})();
