(() => {
  'use strict';

  const Core = globalThis.SocialPostCore;
  if (!Core) return;

  const SETTINGS_KEY = 'social-post-tools:pwa-settings:v1';
  const DEFAULT_X_BUILDER = Core.defaultBuilderId('x');
  const DEFAULT_THREADS_BUILDER = Core.defaultBuilderId('threads');
  const ALL_BUILDERS = Core.ALL_BUILTIN_BUILDERS || Core.BUILTIN_BUILDERS;
  const RETIRED = new Set(ALL_BUILDERS.filter((builder) => builder.retired).map((builder) => builder.id));
  const META = Object.freeze(Object.fromEntries(
    ALL_BUILDERS.map((builder) => [builder.id, Object.freeze({
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

  function portableSnapshot(settings) {
    return Core.makePortableLinkSettings(settings || {});
  }

  function applyPortableSettings(target, portable) {
    target.links ||= {};
    for (const platform of ['x', 'threads']) {
      target.links[platform] = {
        ...(target.links[platform] || {}),
        builderId: portable.links[platform].builderId,
      };
    }
    target.builders = {
      ...(target.builders || {}),
      custom: portable.builders.custom,
    };
    target.security = {
      ...(target.security || {}),
      allowInsecureCustomUrls: portable.security.allowInsecureCustomUrls,
    };
    return target;
  }

  function migrateSettings() {
    let parsed = null;
    try { parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch {}

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      const seeded = applyPortableSettings({ schemaVersion: 1 }, portableSnapshot({}));
      return {
        changed: writeSettings(seeded),
        from: null,
        to: { x: DEFAULT_X_BUILDER, threads: DEFAULT_THREADS_BUILDER },
      };
    }

    const before = {
      links: {
        x: String(parsed.links?.x?.builderId || ''),
        threads: String(parsed.links?.threads?.builderId || ''),
      },
      builders: Array.isArray(parsed.builders?.custom) ? parsed.builders.custom : [],
      allowInsecureCustomUrls: Boolean(parsed.security?.allowInsecureCustomUrls),
    };
    const portable = portableSnapshot(parsed);
    const next = applyPortableSettings(parsed, portable);
    const after = {
      links: {
        x: portable.links.x.builderId,
        threads: portable.links.threads.builderId,
      },
      builders: portable.builders.custom,
      allowInsecureCustomUrls: portable.security.allowInsecureCustomUrls,
    };
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    return {
      changed: changed ? writeSettings(next) : false,
      from: before.links,
      to: after.links,
    };
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

    for (const builder of Core.BUILTIN_BUILDERS) {
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
    normalizeBuilderId(platform, id, customBuilders = [], options = {}) {
      return Core.normalizeBuilderId(platform, id, customBuilders, options);
    },
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