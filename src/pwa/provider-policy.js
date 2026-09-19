(() => {
  'use strict';

  const SETTINGS_KEY = 'social-post-tools:pwa-settings:v1';
  const DEFAULT_X_BUILDER = 'fixupx';
  const DEFAULT_THREADS_BUILDER = 'vxthreads';
  const RETIRED = new Set([
    'nitter-net',
    'nitter-catsarch',
    'nitter-privacyredirect',
    'nitter-tiekoetter',
  ]);

  const META = Object.freeze({
    fixupx: Object.freeze({ capability: 'embed', status: 'recommended', label: 'FixupX', detail: 'Chat-friendly X previews' }),
    fixvx: Object.freeze({ capability: 'embed', status: 'available', label: 'FixVX', detail: 'Alternative X embed fixer' }),
    xcancel: Object.freeze({ capability: 'reader', status: 'available', label: 'XCancel', detail: 'Alternative X reader' }),
    vxthreads: Object.freeze({ capability: 'embed', status: 'available', label: 'vxThreads', detail: 'Chat-friendly Threads previews' }),
  });

  function migrateSettings() {
    let parsed = null;
    try { parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch {}

    if (!parsed || typeof parsed !== 'object') {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        schemaVersion: 1,
        links: {
          x: { builderId: DEFAULT_X_BUILDER },
          threads: { builderId: DEFAULT_THREADS_BUILDER },
        },
      }));
      return { changed: true, from: null, to: DEFAULT_X_BUILDER };
    }

    const current = String(parsed.links?.x?.builderId || '');
    if (!RETIRED.has(current)) return { changed: false };

    parsed.links ||= {};
    parsed.links.x = { ...(parsed.links.x || {}), builderId: DEFAULT_X_BUILDER };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
    return { changed: true, from: current, to: DEFAULT_X_BUILDER };
  }

  function decorateSelect(select) {
    if (!select) return;
    for (const option of [...select.options]) {
      if (RETIRED.has(option.value)) {
        option.remove();
        continue;
      }
      const meta = META[option.value];
      if (!meta) continue;
      option.textContent = `${meta.label} — ${meta.detail}`;
      option.dataset.capability = meta.capability;
      option.dataset.status = meta.status;
    }
    if (!select.value && select.id === 'x-builder') select.value = DEFAULT_X_BUILDER;
    if (!select.value && select.id === 'threads-builder') select.value = DEFAULT_THREADS_BUILDER;
  }

  function keepProviderSelectsClean() {
    for (const id of ['x-builder', 'threads-builder']) {
      const select = document.getElementById(id);
      if (!select) continue;
      decorateSelect(select);
      const observer = new MutationObserver(() => decorateSelect(select));
      observer.observe(select, { childList: true });
    }
  }

  function textNode(tag, text, className = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text;
    return node;
  }

  function renderProviderSummary() {
    const host = document.getElementById('provider-status-list');
    if (!host) return;
    host.replaceChildren();

    const entries = [
      ['fixupx', 'Recommended', 'Embed fixer', 'Default for X sharing. Optimized for rich previews rather than acting as a full reader.'],
      ['xcancel', 'Available', 'Reader', 'Use when you want an alternate reading frontend instead of only a preview-friendly link.'],
      ['fixvx', 'Available', 'Embed fixer', 'Secondary X preview-link option.'],
      ['vxthreads', 'Available', 'Embed fixer', 'Threads preview-link option.'],
    ];

    for (const [id, state, capability, description] of entries) {
      const row = document.createElement('div');
      row.className = 'provider-row';

      const identity = document.createElement('div');
      identity.append(
        textNode('strong', META[id]?.label || id),
        textNode('small', capability),
      );

      const copy = document.createElement('div');
      copy.className = 'provider-copy';
      copy.append(
        textNode('span', state, 'status-chip'),
        textNode('p', description),
      );

      row.append(identity, copy);
      host.append(row);
    }
  }

  const migration = migrateSettings();
  globalThis.SocialPostProviderPolicy = Object.freeze({
    DEFAULT_X_BUILDER,
    DEFAULT_THREADS_BUILDER,
    RETIRED,
    META,
    migration,
    isRetired(id) { return RETIRED.has(String(id || '')); },
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      keepProviderSelectsClean();
      renderProviderSummary();
    }, { once: true });
  } else {
    keepProviderSelectsClean();
    renderProviderSummary();
  }
})();
