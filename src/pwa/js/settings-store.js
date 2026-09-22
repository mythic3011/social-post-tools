(() => {
  'use strict';

  const Core = globalThis.SocialPostCore;
  if (!Core) return;

  const SETTINGS_KEY = 'social-post-tools:pwa-settings:v1';

  const DEFAULTS = Object.freeze({
    schemaVersion: 1,
    links: { x: { builderId: 'nitter-net' }, threads: { builderId: 'vxthreads' } },
    builders: { custom: [] },
    actions: { enabled: { copyClean: false, copyAlternate: true, systemShare: true, telegram: false, openAlternate: false, richCapture: true } },
    share: { linkSource: 'selected', template: '{text}' },
    capture: { androidBrowser: 'firefox' },
    security: { allowInsecureCustomUrls: false },
  });

  const ACTIONS = Object.freeze([
    ['copyClean', 'Copy original link'],
    ['copyAlternate', 'Copy share link'],
    ['systemShare', 'Share…'],
    ['telegram', 'Send to Telegram'],
    ['openAlternate', 'Open share link'],
    ['richCapture', 'Use with AI'],
  ]);

  const ANDROID_CAPTURE_BROWSERS = Object.freeze({
    firefox: Object.freeze({ id: 'firefox', label: 'Firefox (recommended for Userscripts)', packageName: 'org.mozilla.firefox' }),
    firefoxBeta: Object.freeze({ id: 'firefoxBeta', label: 'Firefox Beta', packageName: 'org.mozilla.firefox_beta' }),
    firefoxNightly: Object.freeze({ id: 'firefoxNightly', label: 'Firefox Nightly', packageName: 'org.mozilla.fenix' }),
    system: Object.freeze({ id: 'system', label: 'System browser / app chooser', packageName: null }),
  });

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const merge = (base, value) => {
    if (Array.isArray(base)) return Array.isArray(value) ? value.slice() : base.slice();
    if (!base || typeof base !== 'object') return value === undefined ? base : value;
    const out = {};
    const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    for (const [key, fallback] of Object.entries(base)) out[key] = merge(fallback, src[key]);
    return out;
  };

  function sanitizeSettings(raw) {
    const settings = merge(DEFAULTS, raw || {});
    const allow = Boolean(settings.security?.allowInsecureCustomUrls);
    const registry = Core.builderRegistry(settings.builders?.custom || [], { allowInsecureHttp: allow });
    settings.builders.custom = registry.filter((builder) => !builder.builtin);
    for (const platform of ['x', 'threads']) {
      const wanted = String(settings.links?.[platform]?.builderId || '');
      if (!registry.some((builder) => builder.id === wanted && builder.platforms.includes(platform))) {
        settings.links[platform].builderId = DEFAULTS.links[platform].builderId;
      }
    }
    for (const [id] of ACTIONS) settings.actions.enabled[id] = settings.actions.enabled[id] !== false;
    settings.share.linkSource = settings.share.linkSource === 'clean' ? 'clean' : 'selected';
    settings.share.template = String(settings.share.template || '{text}').slice(0, 8000);
    if (!ANDROID_CAPTURE_BROWSERS[settings.capture?.androidBrowser]) settings.capture.androidBrowser = DEFAULTS.capture.androidBrowser;
    return settings;
  }

  function loadSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      return sanitizeSettings(raw || clone(DEFAULTS));
    } catch { return clone(DEFAULTS); }
  }

  function saveSettings(settings) {
    const clean = sanitizeSettings(settings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(clean));
    return clean;
  }

  globalThis.SPTSettingsStore = {
    SETTINGS_KEY,
    DEFAULTS,
    ACTIONS,
    ANDROID_CAPTURE_BROWSERS,
    clone,
    loadSettings,
    saveSettings,
    sanitizeSettings,
  };
})();
