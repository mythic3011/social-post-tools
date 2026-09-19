(() => {
  'use strict';

  const Core = globalThis.SocialPostCore;
  if (!Core) return;

  const SETTINGS_KEY = 'social-post-tools:pwa-settings:v1';
  const DEFAULT_X_BUILDER = Core.defaultBuilderId('x');
  const DEFAULT_THREADS_BUILDER = Core.defaultBuilderId('threads');
  const RETIRED = new Set(Core.BUILTIN_BUILDERS.filter((builder) => builder.retired).map((builder) => builder.id));
  const META = Object.freeze(Object.fromEntries(
    Core.BUILTIN_BUILDERS.map((builder) => [builder.id, Object.freeze({
      capability: builder.capability || 'custom',
      status: builder.status || (builder.retired ? 'retired' : 'available'),
      label: builder.name,
      detail: builder.detail || builder.group || '',
      retired: Boolean(builder.retired),
    })]),
  ));

  function writeSettings(value) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function migrateSettings() {
    let parsed = null;
    try { parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch {}

    if (!parsed || typeof parsed !== 'object') {
      const seeded = {
        schemaVersion: 1,
        links: {
          x: { builderId: DEFAULT_X_BUILDER },
          threads: { builderId: DEFAULT_THREADS_BUILDER },
        },
      };
      return { changed: writeSettings(seeded), from: null, to: DEFAULT_X_BUILDER };
    }

    const current = String(parsed.links?.x?.builderId || '');
    if (!RETIRED.has(current)) return { changed: false };

    parsed.links ||= {};
    parsed.links.x = { ...(parsed.links.x || {}), builderId: DEFAULT_X_BUILDER };
    return { changed: writeSettings(parsed), from: current, to: DEFAULT_X_BUILDER };
  }

  function decorateSelect(select) {
    if (!select) return;
    for (const option of [...select.options]) {
      const meta = META[option.value];
      if (meta?.retired) {
        option.remove();
        continue;
      }
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

  function displayStatus(status) {
    if (status === 'recommended') return 'Recommended';
    if (status === 'available') return 'Available';
    if (status === 'custom') return 'Custom';
    return status || 'Available';
  }

  function displayCapability(capability) {
    if (capability === 'embed') return 'Embed fixer';
    if (capability === 'reader') return 'Reader';
    if (capability === 'archive') return 'Archive';
    return 'Custom';
  }

  function renderProviderSummary() {
    const host = document.getElementById('provider-status-list');
    if (!host) return;
    host.replaceChildren();

    for (const builder of Core.BUILTIN_BUILDERS.filter((entry) => !entry.retired)) {
      const row = document.createElement('div');
      row.className = 'provider-row';

      const identity = document.createElement('div');
      identity.append(
        textNode('strong', builder.name),
        textNode('small', displayCapability(builder.capability)),
      );

      const copy = document.createElement('div');
      copy.className = 'provider-copy';
      copy.append(
        textNode('span', displayStatus(builder.status), 'status-chip'),
        textNode('p', builder.detail || builder.group || ''),
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
