(() => {
  'use strict';

  const Core = globalThis.SocialPostCore;
  if (!Core) return;

  const SETTINGS_KEY = 'social-post-tools:pwa-settings:v1';
  const $ = (id) => document.getElementById(id);
  let current = null;

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

  function providersForCapability(platform, capability, settings) {
    return compatibleProviders(platform, settings).filter((builder) => builder.capability === capability);
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

  function providerOptionLabel(builder) {
    if (!builder) return 'No active provider';
    const suffix = builder.status === 'recommended' ? ' · recommended' : builder.builtin ? '' : ' · custom';
    return `${builder.name}${suffix}`;
  }

  function populateProviderSelect(selectId, providers, selected) {
    const select = $(selectId);
    select.replaceChildren();
    if (!providers.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No active provider';
      select.append(option);
      select.disabled = true;
      return;
    }
    for (const builder of providers) {
      const option = document.createElement('option');
      option.value = builder.id;
      option.textContent = providerOptionLabel(builder);
      option.selected = builder.id === selected?.id;
      select.append(option);
    }
    select.disabled = false;
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

  function clearProviderSelects() {
    populateProviderSelect('preview-provider', [], null);
    populateProviderSelect('reader-provider', [], null);
  }

  function resetOutputs() {
    current = null;
    setOutput('clean-output', '', 'clean-meta', 'Canonical source URL.', 'clean-state', 'Canonical');
    setOutput('preview-output', '', 'preview-meta', 'Waiting for a supported post URL.', 'preview-state', 'Embed');
    setOutput('reader-output', '', 'reader-meta', 'Waiting for a supported post URL.', 'reader-state', 'Optional');
    clearProviderSelects();
    $('lab-results').hidden = true;
  }

  function setStatus(message) {
    $('lab-status').textContent = message;
  }

  function capabilityState(capability) {
    if (!current) return null;
    const selectId = capability === 'embed' ? 'preview-provider' : 'reader-provider';
    const providers = current.providers[capability] || [];
    const selectedId = String($(selectId)?.value || '');
    return providers.find((builder) => builder.id === selectedId) || providers[0] || null;
  }

  function renderCapability(capability) {
    if (!current) return;
    const builder = capabilityState(capability);
    const isPreview = capability === 'embed';
    const outputId = isPreview ? 'preview-output' : 'reader-output';
    const metaId = isPreview ? 'preview-meta' : 'reader-meta';
    const stateId = isPreview ? 'preview-state' : 'reader-state';
    const label = isPreview ? 'Embed' : 'Reader';
    const url = builder
      ? Core.buildUrl(builder, current.platform.id, current.canonicalUrl, current.options)
      : null;
    setOutput(outputId, url, metaId, providerDescription(builder), stateId, builder ? label : 'Unavailable');
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
      current = null;
      clearProviderSelects();
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
    const previewProviders = providersForCapability(platform.id, 'embed', settings);
    const readerProviders = providersForCapability(platform.id, 'reader', settings);
    const previewProvider = providerForCapability(platform.id, 'embed', settings);
    const readerProvider = providerForCapability(platform.id, 'reader', settings);
    const options = { allowInsecureHttp: settings.allowInsecureHttp };

    current = {
      platform,
      canonicalUrl,
      options,
      providers: { embed: previewProviders, reader: readerProviders },
    };

    setOutput(
      'clean-output',
      canonicalUrl,
      'clean-meta',
      `${platform.name} canonical source · tracking parameters removed`,
      'clean-state',
      'Canonical',
    );
    populateProviderSelect('preview-provider', previewProviders, previewProvider);
    populateProviderSelect('reader-provider', readerProviders, readerProvider);
    renderCapability('embed');
    renderCapability('reader');

    const available = [previewProviders.length && 'preview', readerProviders.length && 'reader'].filter(Boolean).join(' + ');
    setStatus(`${platform.name} post normalized locally${available ? ` · ${available} output${available.includes('+') ? 's' : ''} available` : ''}.`);
    return true;
  }

  function consumeFragmentInput() {
    if (!location.hash) return false;
    const params = new URLSearchParams(location.hash.slice(1));
    const raw = String(params.get('url') || '').trim();
    if (!raw) return false;
    try { history.replaceState(history.state, '', `${location.pathname}${location.search}`); } catch {}
    $('source-url').value = raw;
    const accepted = analyze(raw);
    if (accepted) setStatus(`${$('lab-status').textContent} Loaded from a local URL fragment.`);
    return accepted;
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

  $('preview-provider')?.addEventListener('change', () => {
    renderCapability('embed');
    setStatus('Preview provider changed for this comparison only.');
  });

  $('reader-provider')?.addEventListener('change', () => {
    renderCapability('reader');
    setStatus('Reader provider changed for this comparison only.');
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
  consumeFragmentInput();
})();