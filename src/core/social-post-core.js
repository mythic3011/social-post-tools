(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SocialPostCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '1.2.1';
  const MAX_BUILDER_URL_CHARS = 8192;
  const MAX_CUSTOM_BUILDERS = 32;

  const PLATFORMS = Object.freeze({
    x: Object.freeze({
      id: 'x',
      name: 'X',
      hosts: Object.freeze(['x.com', 'twitter.com', 'mobile.twitter.com']),
      canonicalOrigin: 'https://x.com',
    }),
    threads: Object.freeze({
      id: 'threads',
      name: 'Threads',
      hosts: Object.freeze(['threads.com', 'www.threads.com', 'threads.net', 'www.threads.net']),
      canonicalOrigin: 'https://www.threads.com',
    }),
  });

  const BUILTIN_BUILDERS = Object.freeze([
    Object.freeze({ id: 'nitter-net', name: 'Nitter.net', platforms: ['x'], type: 'replace-origin', baseUrl: 'https://nitter.net', builtin: true, group: 'Nitter' }),
    Object.freeze({ id: 'nitter-catsarch', name: 'Nitter · catsarch.com', platforms: ['x'], type: 'replace-origin', baseUrl: 'https://nitter.catsarch.com', builtin: true, group: 'Nitter' }),
    Object.freeze({ id: 'nitter-privacyredirect', name: 'Nitter · privacyredirect.com', platforms: ['x'], type: 'replace-origin', baseUrl: 'https://nitter.privacyredirect.com', builtin: true, group: 'Nitter' }),
    Object.freeze({ id: 'nitter-tiekoetter', name: 'Nitter · tiekoetter.com', platforms: ['x'], type: 'replace-origin', baseUrl: 'https://nitter.tiekoetter.com', builtin: true, group: 'Nitter' }),
    Object.freeze({ id: 'xcancel', name: 'XCancel', platforms: ['x'], type: 'replace-origin', baseUrl: 'https://xcancel.com', builtin: true, group: 'Nitter' }),
    Object.freeze({ id: 'fixupx', name: 'FixupX', platforms: ['x'], type: 'replace-origin', baseUrl: 'https://fixupx.com', builtin: true, group: 'Embed fixer' }),
    Object.freeze({ id: 'fixvx', name: 'FixVX', platforms: ['x'], type: 'replace-origin', baseUrl: 'https://fixvx.com', builtin: true, group: 'Embed fixer' }),
    Object.freeze({ id: 'vxthreads', name: 'vxThreads', platforms: ['threads'], type: 'replace-origin', baseUrl: 'https://vxthreads.net', builtin: true, group: 'Threads' }),
  ]);

  function parseUrl(raw, base = 'https://example.invalid/') {
    try { return new URL(raw, base); } catch { return null; }
  }

  function cleanText(value) {
    return String(value || '')
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  function uniqueValues(values) {
    const seen = new Set();
    return (values || []).filter((value) => {
      const text = String(value || '');
      const key = text.toLocaleLowerCase();
      if (!text || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function boundedString(value, max) {
    return String(value ?? '').slice(0, max);
  }

  function stripTrailingSlash(raw) {
    return String(raw || '').replace(/\/+$/, '');
  }

  function platformById(platform) {
    if (!platform) return null;
    const id = typeof platform === 'string' ? platform : platform.id;
    return PLATFORMS[id] || null;
  }

  function platformForUrl(raw, base) {
    const url = parseUrl(raw, base);
    if (!url) return null;
    const host = url.hostname.toLowerCase();
    return Object.values(PLATFORMS).find((platform) => platform.hosts.includes(host)) || null;
  }

  function canonicalize(platform, rawUrl, base) {
    const p = platformById(platform) || platformForUrl(rawUrl, base);
    const url = parseUrl(rawUrl, base);
    if (!p || !url || !p.hosts.includes(url.hostname.toLowerCase())) return null;

    if (p.id === 'x') {
      const match = /^\/([^/]+)\/status\/(\d+)(?:\/.*)?$/.exec(url.pathname);
      if (!match) return null;
      return `${p.canonicalOrigin}/${match[1]}/status/${match[2]}`;
    }

    if (p.id === 'threads') {
      let match = /^\/(?:@|%40)([^/]+)\/post\/([A-Za-z0-9_-]+)(?:\/.*)?$/i.exec(url.pathname);
      if (match) return `${p.canonicalOrigin}/@${match[1]}/post/${match[2]}`;
      match = /^\/t\/([A-Za-z0-9_-]+)(?:\/.*)?$/i.exec(url.pathname);
      if (match) return `${p.canonicalOrigin}/t/${match[1]}`;
    }

    return null;
  }

  function postParts(platform, canonicalUrl) {
    const p = platformById(platform) || platformForUrl(canonicalUrl);
    const url = parseUrl(canonicalUrl);
    if (!p || !url) return { author: null, postId: null };

    if (p.id === 'x') {
      const match = /^\/([^/]+)\/status\/(\d+)$/.exec(url.pathname);
      return match ? { author: decodeURIComponent(match[1]), postId: match[2] } : { author: null, postId: null };
    }

    if (p.id === 'threads') {
      let match = /^\/@([^/]+)\/post\/([A-Za-z0-9_-]+)$/i.exec(url.pathname);
      if (match) return { author: decodeURIComponent(match[1]), postId: match[2] };
      match = /^\/t\/([A-Za-z0-9_-]+)$/i.exec(url.pathname);
      if (match) return { author: null, postId: match[1] };
    }

    return { author: null, postId: null };
  }

  function hasUrlCredentials(url) {
    return Boolean(url?.username || url?.password);
  }

  function isLoopbackHost(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    return host === 'localhost'
      || host.endsWith('.localhost')
      || host === '::1'
      || /^127(?:\.\d{1,3}){3}$/.test(host);
  }

  function customUrlAllowed(url, allowInsecureHttp = false) {
    if (!url || hasUrlCredentials(url)) return false;
    if (url.protocol === 'https:') return true;
    if (url.protocol !== 'http:') return false;
    return isLoopbackHost(url.hostname) || Boolean(allowInsecureHttp);
  }

  function templateProbeUrl(template) {
    const probe = String(template || '').replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, 'x');
    return parseUrl(probe, 'https://example.invalid/');
  }

  function normalizeCustomBuilder(raw, {
    allowInsecureHttp = false,
    maxNameChars = 80,
    maxIdChars = 96,
  } = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const id = boundedString(String(raw.id || `custom-${random}`), maxIdChars).replace(/[^a-zA-Z0-9_-]/g, '-');
    const name = cleanText(raw.name).slice(0, maxNameChars);
    const platforms = uniqueValues((raw.platforms || []).filter((platform) => Boolean(PLATFORMS[platform])));
    const type = ['replace-origin', 'template', 'structured'].includes(raw.type) ? raw.type : 'replace-origin';
    if (!name || !platforms.length || !id) return null;

    const builder = { id, name, platforms, type, builtin: false };
    if (type === 'replace-origin') {
      const base = parseUrl(boundedString(raw.baseUrl, 2048));
      if (!customUrlAllowed(base, allowInsecureHttp)) return null;
      base.search = '';
      base.hash = '';
      builder.baseUrl = stripTrailingSlash(base.href);
    } else if (type === 'template') {
      const template = boundedString(raw.template, 4096).trim();
      const authority = template.match(/^https?:\/\/([^/]+)/i)?.[1] || '';
      const probe = templateProbeUrl(template);
      if (!template || !authority || /\{/.test(authority) || !customUrlAllowed(probe, allowInsecureHttp)) return null;
      builder.template = template;
    } else {
      const base = parseUrl(boundedString(raw.baseUrl, 2048));
      if (!customUrlAllowed(base, allowInsecureHttp)) return null;
      base.search = '';
      base.hash = '';
      builder.baseUrl = stripTrailingSlash(base.href);
      builder.pathTemplate = boundedString(raw.pathTemplate || '{path}', 2048);
      const query = {};
      if (raw.query && typeof raw.query === 'object' && !Array.isArray(raw.query)) {
        for (const [key, value] of Object.entries(raw.query).slice(0, 32)) {
          const safeKey = boundedString(key, 128);
          if (!safeKey) continue;
          query[safeKey] = boundedString(value, 2048);
        }
      }
      builder.query = query;
    }
    return builder;
  }

  function builderRegistry(customBuilders = [], { allowInsecureHttp = false } = {}) {
    const used = new Set(BUILTIN_BUILDERS.map((builder) => builder.id));
    const normalized = [];
    for (const raw of (Array.isArray(customBuilders) ? customBuilders : []).slice(0, MAX_CUSTOM_BUILDERS)) {
      const builder = normalizeCustomBuilder(raw, { allowInsecureHttp });
      if (!builder || used.has(builder.id)) continue;
      used.add(builder.id);
      normalized.push(builder);
    }
    return [...BUILTIN_BUILDERS, ...normalized];
  }

  function compatibleBuilders(platform, customBuilders = [], options = {}) {
    const p = platformById(platform);
    if (!p) return [];
    return builderRegistry(customBuilders, options).filter((builder) => builder.platforms.includes(p.id));
  }

  function builderById(id, customBuilders = [], options = {}) {
    return builderRegistry(customBuilders, options).find((builder) => builder.id === id) || null;
  }

  function builderVars(platform, canonicalUrl) {
    const p = platformById(platform) || platformForUrl(canonicalUrl);
    const url = parseUrl(canonicalUrl);
    if (!p || !url) return null;
    const parts = postParts(p, canonicalUrl);
    return {
      url: canonicalUrl,
      encodedUrl: encodeURIComponent(canonicalUrl),
      origin: url.origin,
      host: url.hostname,
      path: url.pathname,
      author: parts.author || '',
      postId: parts.postId || '',
      platform: p.id,
    };
  }

  function applyTemplate(template, vars, { encode = false } = {}) {
    return String(template || '').replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (full, key) => {
      if (!(key in vars)) return full;
      const value = String(vars[key] ?? '');
      return encode ? encodeURIComponent(value) : value;
    });
  }

  function finalizeBuiltUrl(builder, raw, { allowInsecureHttp = false, maxUrlChars = MAX_BUILDER_URL_CHARS } = {}) {
    if (!raw || String(raw).length > maxUrlChars) return null;
    const url = parseUrl(raw);
    if (!url || hasUrlCredentials(url)) return null;
    if (builder?.builtin) return url.protocol === 'https:' ? url.href : null;
    return customUrlAllowed(url, allowInsecureHttp) ? url.href : null;
  }

  function buildUrl(builder, platform, canonicalUrl, options = {}) {
    const p = platformById(platform) || platformForUrl(canonicalUrl);
    if (!builder || !p || !builder.platforms?.includes(p.id)) return null;
    const source = parseUrl(canonicalUrl);
    const vars = builderVars(p, canonicalUrl);
    if (!source || !vars) return null;

    try {
      if (builder.type === 'replace-origin') {
        const target = parseUrl(builder.baseUrl);
        if (!target) return null;
        target.pathname = target.pathname.replace(/\/$/, '') + source.pathname;
        target.search = '';
        target.hash = '';
        return finalizeBuiltUrl(builder, target.href, options);
      }
      if (builder.type === 'template') {
        return finalizeBuiltUrl(builder, applyTemplate(builder.template, vars), options);
      }
      if (builder.type === 'structured') {
        const target = parseUrl(builder.baseUrl);
        if (!target) return null;
        const path = applyTemplate(builder.pathTemplate || '{path}', vars);
        target.pathname = target.pathname.replace(/\/$/, '') + (path.startsWith('/') ? path : `/${path}`);
        target.search = '';
        for (const [key, valueTemplate] of Object.entries(builder.query || {})) {
          target.searchParams.set(key, applyTemplate(String(valueTemplate), vars));
        }
        target.hash = '';
        return finalizeBuiltUrl(builder, target.href, options);
      }
    } catch {}
    return null;
  }

  function selectBuilder(platform, builderId, customBuilders = [], options = {}) {
    const compatible = compatibleBuilders(platform, customBuilders, options);
    return compatible.find((builder) => builder.id === builderId) || compatible[0] || null;
  }

  function transformedUrl(platform, canonicalUrl, builderId, customBuilders = [], options = {}) {
    const builder = selectBuilder(platform, builderId, customBuilders, options);
    return buildUrl(builder, platform, canonicalUrl, options);
  }

  function firstHttpUrlInText(text) {
    const input = String(text || '');
    const matches = input.match(/https?:\/\/[^\s<>"']+/gi) || [];
    for (let raw of matches) {
      raw = raw.replace(/[),.;!?]+$/g, '');
      const url = parseUrl(raw);
      if (url && ['http:', 'https:'].includes(url.protocol)) return url.href;
    }
    return null;
  }

  const CAPTURE_HANDOFF_VERSION = 'v1';
  const CAPTURE_HANDOFF_KEY = 'sptCapture';
  const CAPTURE_MODES = Object.freeze(['smart', 'post']);

  function normalizeCaptureMode(value) {
    return CAPTURE_MODES.includes(String(value || '').toLowerCase())
      ? String(value).toLowerCase()
      : 'smart';
  }

  function makeCaptureHandoffUrl(rawUrl, { mode = 'smart' } = {}) {
    const platform = platformForUrl(rawUrl);
    const canonicalUrl = platform ? canonicalize(platform, rawUrl) : null;
    const shareAlias = platform?.id === 'threads' ? threadsShareAlias(rawUrl) : null;
    if (!platform || (!canonicalUrl && !shareAlias)) return null;
    const sourceUrl = canonicalUrl || shareAlias;
    const url = parseUrl(sourceUrl);
    if (!url) return null;
    const params = new URLSearchParams();
    params.set(CAPTURE_HANDOFF_KEY, CAPTURE_HANDOFF_VERSION);
    params.set('mode', normalizeCaptureMode(mode));
    url.hash = params.toString();
    return url.href;
  }

  function parseCaptureHandoff(rawUrl, base) {
    const url = parseUrl(rawUrl, base);
    if (!url || !url.hash) return null;
    const params = new URLSearchParams(url.hash.slice(1));
    if (params.get(CAPTURE_HANDOFF_KEY) !== CAPTURE_HANDOFF_VERSION) return null;
    const platform = platformForUrl(url.href);
    const canonicalUrl = platform ? canonicalize(platform, url.href) : null;
    const shareAlias = platform?.id === 'threads' ? threadsShareAlias(url.href) : null;
    if (!platform || (!canonicalUrl && !shareAlias)) return null;
    return {
      version: CAPTURE_HANDOFF_VERSION,
      platform: platform.id,
      canonicalUrl,
      sourceUrl: canonicalUrl || shareAlias,
      unresolved: !canonicalUrl && Boolean(shareAlias),
      mode: normalizeCaptureMode(params.get('mode')),
    };
  }

  function threadsShareAlias(rawUrl, base) {
    const url = parseUrl(rawUrl, base);
    if (!url) return null;
    const platform = platformForUrl(url.href);
    if (!platform || platform.id !== 'threads') return null;
    const match = /^\/share\/([A-Za-z0-9_-]+)\/?$/i.exec(url.pathname);
    if (!match) return null;
    return `${platform.canonicalOrigin}/share/${match[1]}`;
  }

  function parseIncomingShare({ title = '', text = '', url = '' } = {}) {
    const rawUrl = String(url || '').trim();
    const candidates = [];
    if (rawUrl) candidates.push(rawUrl);
    const textUrl = firstHttpUrlInText(text);
    if (textUrl && !candidates.includes(textUrl)) candidates.push(textUrl);

    // Prefer a real post permalink when the share payload contains both a
    // Threads /share/... alias and a canonical /@user/post/... URL.
    for (const candidate of candidates) {
      const platform = platformForUrl(candidate);
      const canonicalUrl = platform ? canonicalize(platform, candidate) : null;
      if (platform && canonicalUrl) {
        return {
          supported: true,
          platform: platform.id,
          canonicalUrl,
          sharedUrl: candidate,
          shareKind: 'post',
          needsResolution: false,
          title: cleanText(title),
          text: cleanText(text),
        };
      }
    }

    // Threads Android may share a public https://www.threads.com/share/<id>
    // link instead of the canonical /@user/post/<id> permalink. Treat it as
    // a supported Threads share alias, but do not pretend it is canonical:
    // alternate-front-end conversion and rich handoff require the exact post
    // permalink after Threads resolves the alias.
    for (const candidate of candidates) {
      const alias = threadsShareAlias(candidate);
      if (alias) {
        return {
          supported: true,
          platform: 'threads',
          canonicalUrl: null,
          sharedUrl: alias,
          shareKind: 'share-alias',
          needsResolution: true,
          title: cleanText(title),
          text: cleanText(text),
        };
      }
    }

    const fallback = parseUrl(rawUrl || textUrl || '');
    return {
      supported: false,
      platform: null,
      canonicalUrl: null,
      sharedUrl: fallback && ['http:', 'https:'].includes(fallback.protocol) ? fallback.href : null,
      shareKind: 'unknown',
      needsResolution: false,
      title: cleanText(title),
      text: cleanText(text),
    };
  }

  function canonicalJsonValue(value) {
    if (value === null) return null;
    const type = typeof value;
    if (type === 'string' || type === 'boolean') return value;
    if (type === 'number') return Number.isFinite(value) ? value : null;
    if (type === 'bigint') return String(value);
    if (Array.isArray(value)) {
      return value.map((item) => {
        const itemType = typeof item;
        if (itemType === 'undefined' || itemType === 'function' || itemType === 'symbol') return null;
        return canonicalJsonValue(item);
      });
    }
    if (type === 'object') {
      if (typeof value.toJSON === 'function' && !(value instanceof Object && Object.getPrototypeOf(value) === Object.prototype)) {
        return canonicalJsonValue(value.toJSON());
      }
      const out = {};
      for (const key of Object.keys(value).sort()) {
        const item = value[key];
        const itemType = typeof item;
        if (itemType === 'undefined' || itemType === 'function' || itemType === 'symbol') continue;
        out[key] = canonicalJsonValue(item);
      }
      return out;
    }
    return null;
  }

  function stableJsonStringify(value) {
    return JSON.stringify(canonicalJsonValue(value));
  }

  async function sha256Hex(input) {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle || typeof subtle.digest !== 'function') throw new Error('sha256-unavailable');
    let bytes;
    if (typeof input === 'string') {
      bytes = new TextEncoder().encode(input);
    } else if (input instanceof ArrayBuffer) {
      bytes = new Uint8Array(input);
    } else if (ArrayBuffer.isView(input)) {
      bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    } else {
      throw new TypeError('sha256-input-must-be-string-or-bytes');
    }
    const digest = await subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function makePortableLinkSettings(settings = {}) {
    const links = settings.links && typeof settings.links === 'object' ? settings.links : {};
    const custom = settings.builders?.custom;
    const security = settings.security && typeof settings.security === 'object' ? settings.security : {};
    return {
      schema: 'social-post-tools-links/v1',
      links: {
        x: { builderId: String(links.x?.builderId || 'nitter-net') },
        threads: { builderId: String(links.threads?.builderId || 'vxthreads') },
      },
      builders: { custom: Array.isArray(custom) ? custom.slice(0, MAX_CUSTOM_BUILDERS) : [] },
      security: { allowInsecureCustomUrls: Boolean(security.allowInsecureCustomUrls) },
    };
  }

  function sanitizePortableLinkSettings(raw) {
    if (!raw || raw.schema !== 'social-post-tools-links/v1') return null;
    const allowInsecureCustomUrls = Boolean(raw.security?.allowInsecureCustomUrls);
    const registry = builderRegistry(raw.builders?.custom || [], { allowInsecureHttp: allowInsecureCustomUrls });
    const custom = registry.filter((builder) => !builder.builtin);
    const out = {
      schema: 'social-post-tools-links/v1',
      links: { x: { builderId: 'nitter-net' }, threads: { builderId: 'vxthreads' } },
      builders: { custom },
      security: { allowInsecureCustomUrls },
    };
    for (const platform of ['x', 'threads']) {
      const selected = String(raw.links?.[platform]?.builderId || '');
      const exists = registry.some((builder) => builder.id === selected && builder.platforms.includes(platform));
      if (exists) out.links[platform].builderId = selected;
    }
    return out;
  }

  return Object.freeze({
    VERSION,
    PLATFORMS,
    BUILTIN_BUILDERS,
    MAX_BUILDER_URL_CHARS,
    MAX_CUSTOM_BUILDERS,
    parseUrl,
    cleanText,
    boundedString,
    platformById,
    platformForUrl,
    canonicalize,
    postParts,
    hasUrlCredentials,
    isLoopbackHost,
    customUrlAllowed,
    normalizeCustomBuilder,
    builderRegistry,
    compatibleBuilders,
    builderById,
    builderVars,
    applyTemplate,
    finalizeBuiltUrl,
    buildUrl,
    selectBuilder,
    transformedUrl,
    firstHttpUrlInText,
    CAPTURE_HANDOFF_VERSION,
    CAPTURE_HANDOFF_KEY,
    CAPTURE_MODES,
    normalizeCaptureMode,
    makeCaptureHandoffUrl,
    parseCaptureHandoff,
    parseIncomingShare,
    threadsShareAlias,
    stableJsonStringify,
    sha256Hex,
    makePortableLinkSettings,
    sanitizePortableLinkSettings,
  });
});
