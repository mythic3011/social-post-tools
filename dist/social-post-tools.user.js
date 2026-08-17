// ==UserScript==
// @name         Social Post Tools
// @namespace    social-post-tools
// @version      4.2.2
// @description  Simple post sharing and AI capture for X/Threads, with optional advanced link builders, archive tools, Android sharing, and Telegram.
// @homepageURL  https://share-tools.mythic3011.com/
// @downloadURL  https://share-tools.mythic3011.com/install/social-post-tools.user.js
// @updateURL    https://share-tools.mythic3011.com/install/social-post-tools.meta.js
// @match        https://x.com/*
// @match        https://twitter.com/*
// @match        https://mobile.twitter.com/*
// @match        https://www.threads.com/*
// @match        https://threads.com/*
// @match        https://www.threads.net/*
// @match        https://threads.net/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      pbs.twimg.com
// @connect      *.twimg.com
// @connect      *.fbcdn.net
// @connect      *.cdninstagram.com
// ==/UserScript==

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SocialPostCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '1.2.0';
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
    if (!platform || !canonicalUrl) return null;
    const url = parseUrl(canonicalUrl);
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
    if (!platform || !canonicalUrl) return null;
    return {
      version: CAPTURE_HANDOFF_VERSION,
      platform: platform.id,
      canonicalUrl,
      mode: normalizeCaptureMode(params.get('mode')),
    };
  }

  function parseIncomingShare({ title = '', text = '', url = '' } = {}) {
    const rawUrl = String(url || '').trim();
    const candidates = [];
    if (rawUrl) candidates.push(rawUrl);
    const textUrl = firstHttpUrlInText(text);
    if (textUrl && !candidates.includes(textUrl)) candidates.push(textUrl);

    for (const candidate of candidates) {
      const platform = platformForUrl(candidate);
      const canonicalUrl = platform ? canonicalize(platform, candidate) : null;
      if (platform && canonicalUrl) {
        return {
          supported: true,
          platform: platform.id,
          canonicalUrl,
          sharedUrl: candidate,
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
    stableJsonStringify,
    sha256Hex,
    makePortableLinkSettings,
    sanitizePortableLinkSettings,
  });
});

(() => {
  'use strict';

  const CORE = globalThis.SocialPostCore;
  if (!CORE) throw new Error('SocialPostCore failed to initialize');

  const APP = Object.freeze({
    id: 'social-post-tools',
    version: '4.2.2',
    settingsKey: 'social-post-tools:settings',
    captureCacheKey: 'social-post-tools:capture-cache:v1',
    captureResumeKey: 'social-post-tools:capture-resume:v1',
    actionTtlMs: 3500,
    injectWatchMs: 1200,
    injectFallbackMs: [0, 60, 180, 420],
    maxCustomBuilders: 32,
    maxBuilderUrlChars: 8192,
    mediaPackageMaxFiles: 8,
    mediaPackageMaxFileBytes: 12 * 1024 * 1024,
    mediaPackageMaxTotalBytes: 32 * 1024 * 1024,
    mediaFetchTimeoutMs: 15000,
    handoffWatchMs: 10000,
    handoffMutationDebounceMs: 70,
    captureResumeTtlMs: 10 * 60 * 1000,
    captureCacheMaxEntries: 8,
    captureCacheMaxEntryChars: 512 * 1024,
    captureCacheMaxTotalChars: 1536 * 1024,
    captureRevisionMaxEvents: 6,
  });

  const TEXT = Object.freeze({
    entry: 'Post tools  ›',
    back: '← Back',
    backToTools: '← Post tools',
    backToCapture: '← Use with AI',
    capture: 'Use with AI  ›',
    archive: 'Archive snapshot  ›',
    backToArchive: '← Post tools',
    archivePrepare: 'Prepare archive · post + context',
    archivePrepareDiscussion: 'Prepare archive · visible discussion',
    archivePrepareMedia: 'Prepare archive + images',
    archivePreparing: 'Preparing archive…',
    archiveIntegrityNote: 'SHA-256 checks file integrity only; it does not prove source authenticity, authorship, or publication time.',
    archiveHash: (hash) => `Snapshot SHA-256 · ${String(hash || '').slice(0, 12)}…`,
    archiveCopyHash: 'Copy snapshot SHA-256',
    archiveShare: (count) => `Share archive package${count ? ` · ${count} files` : ''}…`,
    archiveClear: 'Clear prepared archive',
    captureSmart: (summary) => `Copy smart capture${summary ? ` · ${summary}` : ''}`,
    capturePost: 'Copy this post only',
    captureContext: (summary) => `Post + context${summary ? ` · ${summary}` : ''}`,
    captureDiscussion: (count = null) => count == null ? 'Copy with visible replies' : `Copy with visible replies · ${count} repl${count === 1 ? 'y' : 'ies'}`,
    captureOptions: 'Capture options  ›',
    recentCapture: 'Recent capture  ›',
    backToRecentCapture: '← Use with AI',
    shareSmartCapture: 'Share smart capture…',
    moreTools: 'More tools  ›',
    backToMoreTools: '← Post tools',
    copyCaptureJson: 'Copy capture JSON',
    shareCapture: 'Share capture to apps…',
    preparePackage: 'Prepare package with images',
    preparingPackage: 'Preparing package…',
    sharePreparedPackage: (count) => `Share prepared package${count ? ` · ${count} files` : ''}…`,
    clearPreparedPackage: 'Clear prepared package',
    copyClean: 'Copy original link',
    copyAlternate: 'Copy share link',
    telegram: 'Send to Telegram',
    systemShare: 'Share…',
    openAlternate: 'Open share link',
    settings: 'Settings',
    copied: 'Copied',
    captured: (summary) => `Captured${summary ? ` · ${summary}` : ''}`,
    failed: 'Unavailable',
    copiedInstead: 'Copied instead',
    shared: 'Shared',
    handoffReady: 'AI capture ready',
    handoffPreparing: 'Preparing AI capture…',
    handoffFailed: 'Could not prepare AI capture',
    handoffCopy: 'Copy capture',
    handoffShare: 'Share to apps…',
    handoffDismiss: 'Dismiss',
    handoffResumed: 'AI capture resumed',
    resumeCachedCapture: 'Resume cached capture',
    forgetCachedCapture: 'Forget cached capture',
    refreshCapture: 'Refresh capture',
    handoffRefreshed: 'AI capture refreshed',
    revisionHistory: (count) => `Revision history${count ? ` · ${count} change${count === 1 ? '' : 's'}` : ''}  ›`,
    backToRevisionHistory: '← Use with AI',
  });

  const SEMANTIC_LABELS = Object.freeze({
    share: [
      'share', 'share post',
      '分享', '分享貼文', '分享帖子', '共享',
      'シェア', '共有', '공유',
      'compartir', 'partager', 'teilen', 'condividi',
      'compartilhar', 'delen', 'udostępnij', 'paylaş',
    ],
  });

  const BUILTIN_BUILDERS = CORE.BUILTIN_BUILDERS;

  const SAFE_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

  const ACTION_DEFS = Object.freeze({
    capture: { label: 'Use with AI', defaultEnabled: true },
    archive: { label: 'Archive snapshot', defaultEnabled: true },
    copyClean: { label: 'Copy original link', defaultEnabled: true },
    copyAlternate: { label: 'Copy share link', defaultEnabled: true },
    telegram: { label: 'Send to Telegram', defaultEnabled: true },
    systemShare: { label: 'Share', defaultEnabled: true },
    openAlternate: { label: 'Open share link', defaultEnabled: true },
    settings: { label: 'Settings', defaultEnabled: true },
  });

  const DEFAULT_SETTINGS = Object.freeze({
    schemaVersion: 10,
    actions: {
      enabled: Object.fromEntries(Object.entries(ACTION_DEFS).map(([id, def]) => [id, def.defaultEnabled])),
      order: ['capture', 'archive', 'copyClean', 'copyAlternate', 'telegram', 'systemShare', 'openAlternate', 'settings'],
    },
    links: {
      x: { builderId: 'nitter-net' },
      threads: { builderId: 'vxthreads' },
    },
    builders: {
      custom: [],
    },
    capture: {
      defaultMode: 'smart',
      includeMedia: true,
      includeMetrics: true,
      richHtmlImages: false,
      maxVisibleReplies: 12,
      cacheEnabled: true,
      cacheTtlMinutes: 20,
      freshMinutes: 5,
    },
    telegram: {
      linkSource: 'selected',
      includeAuthor: true,
      includeText: true,
      maxText: 700,
      template: '{author}\n\n{text}',
    },
    systemShare: {
      linkSource: 'selected',
      includeAuthor: true,
      includeText: true,
      maxText: 700,
      template: '{author}\n\n{text}',
    },
    security: {
      sanitizeNativeCopy: true,
      allowInsecureCustomUrls: false,
    },
    ui: {
      statusFeedback: true,
      menuStyle: 'simple',
    },
  });

  const SITES = [
    {
      id: 'x',
      platformName: 'X',
      hosts: CORE.PLATFORMS.x.hosts,
      canonicalOrigin: CORE.PLATFORMS.x.canonicalOrigin,
      shareSelectors: [
        'button[aria-haspopup="menu"][aria-label="Share post"]',
        '[data-testid="share"]',
        '[data-testid="shareButton"]',
      ],
      shareSemantics: ['share'],
      menu: {
        surfaceSelectors: ['[role="menu"]'],
        containerSelectors: ['[data-testid="Dropdown"]'],
        itemSelectors: ['[role="menuitem"]'],
        placement: 'append',
        templateIndices: {
          default: 1,
          copy: 1,
          capture: 1,
          open: 1,
          settings: 1,
          telegram: 2,
          share: 2,
          back: 1,
        },
      },
      identityScopeSelectors: ['[role="group"]', '[data-testid="tweet"]', 'article'],
      postLinkSelectors: [
        'a[href*="/status/"]:has(time)',
        'a[href*="/status/"][href*="/analytics"]',
        'a[href*="/status/"]',
      ],
      urlRules: [
        {
          match: /^\/([^/]+)\/status\/(\d+)(?:\/.*)?$/,
          build: (match) => `/${match[1]}/status/${match[2]}`,
          parts: (match) => ({ author: decodeURIComponent(match[1]), postId: match[2] }),
        },
      ],
      content: {
        rootSelectors: ['article[data-testid="tweet"]', '[data-testid="tweet"]', 'article'],
        ownershipRootSelectors: ['article[data-testid="tweet"]', '[data-testid="tweet"]', 'article'],
        nestedPostRootSelectors: ['article[data-testid="tweet"]', '[data-testid="tweet"]'],
        bodySelectors: ['[data-testid="tweetText"]'],
        fallbackTextSelectors: ['[dir="auto"]'],
        bodyExcludeAncestorSelectors: ['a', 'button', '[role="button"]', '[role="menu"]', '[role="dialog"]'],
        timestampSelectors: ['time[datetime]'],
        authorContainerSelectors: ['[data-testid="User-Name"]'],
        mediaImageSelectors: ['[data-testid="tweetPhoto"] img'],
        mediaVideoSelectors: ['video'],
        repostContextSelectors: ['[data-testid="socialContext"]'],
        repostActorLinkSelectors: ['[data-testid="socialContext"] a[href]'],
        discussionRootSelectors: ['article[data-testid="tweet"]', '[data-testid="tweet"]'],
      },
    },
    {
      id: 'threads',
      platformName: 'Threads',
      hosts: CORE.PLATFORMS.threads.hosts,
      canonicalOrigin: CORE.PLATFORMS.threads.canonicalOrigin,
      shareSelectors: [
        '[role="button"]:has(svg[aria-label="Share"])',
        'button:has(svg[aria-label="Share"])',
      ],
      shareSemantics: ['share'],
      menu: {
        surfaceSelectors: ['[role="menu"]', '[role="dialog"]'],
        containerSelectors: [],
        itemSelectors: ['[role="menuitem"]', 'button', '[role="button"]'],
        placement: 'append',
        templateIndices: {},
      },
      identityScopeSelectors: ['[data-pressable-container="true"]', '[data-pagelet^="threads_"]'],
      postLinkSelectors: ['a[href*="/post/"]', 'a[href*="/t/"]'],
      urlRules: [
        {
          match: /^\/(?:@|%40)([^/]+)\/post\/([A-Za-z0-9_-]+)(?:\/.*)?$/i,
          build: (match) => `/@${match[1]}/post/${match[2]}`,
          parts: (match) => ({ author: decodeURIComponent(match[1]), postId: match[2] }),
        },
        {
          match: /^\/t\/([A-Za-z0-9_-]+)(?:\/.*)?$/i,
          build: (match) => `/t/${match[1]}`,
          parts: (match) => ({ author: null, postId: match[1] }),
        },
      ],
      content: {
        rootSelectors: ['[data-pressable-container="true"]', 'article', '[data-pagelet^="threads_"]'],
        ownershipRootSelectors: ['[data-pressable-container="true"]'],
        nestedPostRootSelectors: ['[data-pressable-container="true"]'],
        bodySelectors: ['[data-text="true"]', '[dir="auto"]'],
        fallbackTextSelectors: ['[dir="auto"]'],
        bodyExcludeAncestorSelectors: ['a', 'button', '[role="button"]', '[role="menu"]', '[role="dialog"]'],
        bodyExcludeSelectors: ['[translate="no"]'],
        bodyExcludeDescendantSelectors: ['time'],
        timestampSelectors: ['time[datetime]'],
        authorContainerSelectors: [],
        mediaImageSelectors: ['a[href*="/media"] img'],
        mediaVideoSelectors: ['a[href*="/media"] video', 'video'],
        repostContextSelectors: [],
        repostActorLinkSelectors: [],
        discussionRootSelectors: ['[data-pressable-container="true"]'],
      },
    },
  ].map(prepareSite);

  const state = {
    settings: null,
    pending: null,
    injectObserver: null,
    injectRaf: 0,
    injectStopTimer: 0,
    injectFallbackTimers: [],
    panel: null,
    settingsDialog: null,
    site: null,
    clipboardPatch: null,
    volatileStore: new Map(),
    handoff: null,
    handoffObserver: null,
    handoffStopTimer: 0,
    handoffScanTimer: 0,
    handoffBar: null,
  };

  // Capture handoff is carried only in the URL fragment, so it is never sent
  // to X/Threads servers. Consume and remove it before the site app starts.
  state.handoff = CORE.parseCaptureHandoff(location.href);
  if (state.handoff) {
    try { history.replaceState(history.state, '', state.handoff.canonicalUrl); } catch {}
  }

  // ---------- Generic utilities ----------

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function mergeDefaults(defaults, value) {
    if (Array.isArray(defaults)) return Array.isArray(value) ? value.slice() : defaults.slice();
    if (!isPlainObject(defaults)) return value === undefined ? defaults : value;

    const out = {};
    const source = isPlainObject(value) ? value : {};
    for (const [key, fallback] of Object.entries(defaults)) {
      out[key] = mergeDefaults(fallback, source[key]);
    }
    for (const [key, extra] of Object.entries(source)) {
      if (!(key in out)) out[key] = extra;
    }
    return out;
  }

  function normalizeLabel(value) {
    return String(value || '')
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[\s\u00A0]+/g, ' ')
      .replace(/[.…]+$/u, '')
      .trim();
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
    return values.filter((value) => {
      const text = String(value || '');
      const key = text.toLocaleLowerCase();
      if (!text || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function clampInt(value, min, max, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseUrl(raw, base = location.href) {
    try {
      return new URL(raw, base);
    } catch {
      return null;
    }
  }

  function validHttpUrl(raw, base = location.href) {
    const url = parseUrl(raw, base);
    if (!url || !['http:', 'https:'].includes(url.protocol)) return null;
    return url;
  }

  function stripTrailingSlash(raw) {
    return String(raw || '').replace(/\/+$/, '');
  }

  function queryAll(root, selector) {
    try {
      return [...(root?.querySelectorAll?.(selector) || [])];
    } catch {
      return [];
    }
  }

  function queryMany(root, selectors) {
    const seen = new Set();
    const out = [];
    for (const selector of selectors || []) {
      for (const element of queryAll(root, selector)) {
        if (seen.has(element)) continue;
        seen.add(element);
        out.push(element);
      }
    }
    return out;
  }

  function matchesAny(element, selectors) {
    if (!(element instanceof Element)) return false;
    for (const selector of selectors || []) {
      try {
        if (element.matches(selector)) return true;
      } catch {}
    }
    return false;
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }

  function semanticLabels(names) {
    return (names || []).flatMap((name) => SEMANTIC_LABELS[name] || []);
  }

  function prepareSite(site) {
    const labels = semanticLabels(site.shareSemantics);
    return {
      ...site,
      hostSet: new Set(site.hosts.map((host) => host.toLowerCase())),
      shareLabelSet: new Set(labels.map(normalizeLabel).filter(Boolean)),
      menu: {
        surfaceSelectors: ['[role="menu"]', '[role="dialog"]'],
        containerSelectors: [],
        itemSelectors: ['[role="menuitem"]', 'button', '[role="button"]'],
        placement: 'append',
        templateIndices: {},
        ...(site.menu || {}),
      },
    };
  }

  function currentSite() {
    const host = location.hostname.toLowerCase();
    return SITES.find((site) => site.hostSet.has(host)) || null;
  }

  function canonicalize(site, rawUrl) {
    return CORE.canonicalize(site?.id || site, rawUrl, location.href);
  }

  function postParts(site, canonicalUrl) {
    return CORE.postParts(site?.id || site, canonicalUrl);
  }

  // ---------- Settings + migrations ----------

  function gmGet(key, fallback = null) {
    try {
      if (typeof GM_getValue === 'function') return GM_getValue(key, fallback);
    } catch {}
    return state.volatileStore.has(key) ? deepClone(state.volatileStore.get(key)) : fallback;
  }

  function gmSet(key, value) {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, value);
        return true;
      }
    } catch {}
    state.volatileStore.set(key, deepClone(value));
    return true;
  }

  function gmDelete(key) {
    try {
      if (typeof GM_deleteValue === 'function') GM_deleteValue(key);
    } catch {}
    state.volatileStore.delete(key);
  }

  function oldLocalStorageValue(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function migrateLegacySettings(settings) {
    const site = currentSite();
    if (!site) return settings;

    if (site.id === 'x') {
      const old = oldLocalStorageValue('social-mirror-share-copy:x:provider')
        || oldLocalStorageValue('x-mirror-share-copy:selected-mirror')
        || oldLocalStorageValue('x-mirror-share-copy:selected-provider');
      const map = {
        nitter: 'nitter-net',
        'nitter-auto': 'nitter-net',
        fixupx: 'fixupx',
        fixvx: 'fixvx',
      };
      if (old && map[old]) settings.links.x.builderId = map[old];
    }

    if (site.id === 'threads') {
      const old = oldLocalStorageValue('social-mirror-share-copy:threads:provider')
        || oldLocalStorageValue('x-mirror-share-copy:threads:selected-provider');
      if (old === 'vxthreads') settings.links.threads.builderId = 'vxthreads';
    }

    return settings;
  }

  function sanitizeSettings(raw) {
    const sourceSchemaVersion = Number(raw?.schemaVersion || 0);
    const settings = mergeDefaults(DEFAULT_SETTINGS, raw);
    settings.schemaVersion = 10;

    if (sourceSchemaVersion > 0 && sourceSchemaVersion < 4) settings.actions.enabled.systemShare = true;

    settings.security.sanitizeNativeCopy = settings.security.sanitizeNativeCopy !== false;
    settings.security.allowInsecureCustomUrls = Boolean(settings.security.allowInsecureCustomUrls);
    settings.capture.includeMedia = settings.capture.includeMedia !== false;
    settings.capture.includeMetrics = settings.capture.includeMetrics !== false;
    settings.capture.richHtmlImages = Boolean(settings.capture.richHtmlImages);
    settings.capture.cacheEnabled = settings.capture.cacheEnabled !== false;
    settings.ui.statusFeedback = settings.ui.statusFeedback !== false;
    settings.ui.menuStyle = settings.ui.menuStyle === 'custom' ? 'custom' : 'simple';
    if (sourceSchemaVersion > 0 && sourceSchemaVersion < 10 && !raw?.ui?.menuStyle) {
      const oldOrder = ['capture', 'archive', 'copyClean', 'copyAlternate', 'telegram', 'systemShare', 'openAlternate', 'settings'];
      const rawOrder = Array.isArray(raw?.actions?.order) ? raw.actions.order : oldOrder;
      const reordered = rawOrder.join('|') !== oldOrder.join('|');
      const hidden = Object.values(raw?.actions?.enabled || {}).some((value) => value === false);
      settings.ui.menuStyle = reordered || hidden ? 'custom' : 'simple';
    }

    const validActionIds = new Set(Object.keys(ACTION_DEFS));
    settings.actions.order = uniqueValues((settings.actions.order || []).filter((id) => validActionIds.has(id)));
    for (const id of validActionIds) {
      if (!settings.actions.order.includes(id)) settings.actions.order.push(id);
      settings.actions.enabled[id] = Boolean(settings.actions.enabled[id]);
    }

    settings.capture.maxVisibleReplies = clampInt(settings.capture.maxVisibleReplies, 0, 50, 12);
    settings.capture.cacheTtlMinutes = clampInt(settings.capture.cacheTtlMinutes, 1, 120, 20);
    settings.capture.freshMinutes = clampInt(settings.capture.freshMinutes, 1, settings.capture.cacheTtlMinutes, Math.min(5, settings.capture.cacheTtlMinutes));
    settings.telegram.maxText = clampInt(settings.telegram.maxText, 0, 4000, 700);
    settings.systemShare.maxText = clampInt(settings.systemShare.maxText, 0, 4000, 700);
    settings.telegram.template = boundedString(settings.telegram.template || '{author}\n\n{text}', 8000);
    settings.systemShare.template = boundedString(settings.systemShare.template || '{author}\n\n{text}', 8000);
    if (!['smart', 'post', 'discussion'].includes(settings.capture.defaultMode)) settings.capture.defaultMode = 'smart';

    // Preserve existing v3.2 HTTP custom builders during migration, but new
    // installs require HTTPS (loopback HTTP is always allowed).
    const rawCustom = Array.isArray(raw?.builders?.custom) ? raw.builders.custom : [];
    if (sourceSchemaVersion > 0 && sourceSchemaVersion < 5 && rawCustom.some((item) => /^http:\/\//i.test(item?.baseUrl || item?.template || ''))) {
      settings.security.allowInsecureCustomUrls = true;
    }

    const usedIds = new Set(BUILTIN_BUILDERS.map((builder) => builder.id));
    const custom = [];
    for (const item of (settings.builders.custom || []).slice(0, APP.maxCustomBuilders)) {
      const builder = normalizeCustomBuilder(item, { allowInsecureHttp: settings.security.allowInsecureCustomUrls });
      if (!builder || usedIds.has(builder.id)) continue;
      usedIds.add(builder.id);
      custom.push(builder);
    }
    settings.builders.custom = custom;

    for (const platform of ['x', 'threads']) {
      const selected = String(settings.links?.[platform]?.builderId || '');
      const exists = [...BUILTIN_BUILDERS, ...custom].some((builder) => builder.id === selected && builder.platforms.includes(platform));
      if (!exists) settings.links[platform].builderId = DEFAULT_SETTINGS.links[platform].builderId;
    }

    return settings;
  }

  function loadSettings() {
    const raw = gmGet(APP.settingsKey, null);
    let settings = sanitizeSettings(raw || deepClone(DEFAULT_SETTINGS));
    if (!raw) {
      settings = migrateLegacySettings(settings);
      gmSet(APP.settingsKey, settings);
    }
    return settings;
  }

  function saveSettings(next) {
    state.settings = sanitizeSettings(next);
    gmSet(APP.settingsKey, state.settings);
    syncClipboardSanitizer();
    if (!state.settings.capture.cacheEnabled) {
      gmDelete(APP.captureCacheKey);
      gmDelete(APP.captureResumeKey);
    }
    return state.settings;
  }

  function resetSettings() {
    gmDelete(APP.settingsKey);
    state.settings = sanitizeSettings(deepClone(DEFAULT_SETTINGS));
    gmSet(APP.settingsKey, state.settings);
    syncClipboardSanitizer();
  }

  // ---------- Short-lived capture cache ----------

  function captureCacheTtlMs() {
    return clampInt(state.settings?.capture?.cacheTtlMinutes, 1, 120, 20) * 60 * 1000;
  }

  function captureFreshnessMs() {
    const ttlMinutes = clampInt(state.settings?.capture?.cacheTtlMinutes, 1, 120, 20);
    return clampInt(state.settings?.capture?.freshMinutes, 1, ttlMinutes, Math.min(5, ttlMinutes)) * 60 * 1000;
  }

  function captureAgeMs(capture, now = Date.now()) {
    const captured = Date.parse(capture?.capturedAt || '');
    if (!Number.isFinite(captured)) return null;
    return Math.max(0, now - captured);
  }

  function formatCaptureAge(ageMs) {
    if (!Number.isFinite(ageMs)) return 'unknown age';
    if (ageMs < 60 * 1000) return 'just now';
    const minutes = Math.floor(ageMs / (60 * 1000));
    if (minutes < 60) return `${minutes}m old`;
    const hours = Math.floor(minutes / 60);
    const remain = minutes % 60;
    return remain ? `${hours}h ${remain}m old` : `${hours}h old`;
  }

  function captureFreshness(capture, now = Date.now()) {
    const ageMs = captureAgeMs(capture, now);
    const freshForMs = captureFreshnessMs();
    const stale = ageMs == null ? true : ageMs > freshForMs;
    return {
      ageMs,
      freshForMs,
      stale,
      label: ageMs == null ? 'unknown age' : formatCaptureAge(ageMs),
    };
  }

  function mediaIdentityUrl(raw) {
    const parsed = parseUrl(raw);
    if (!parsed || !/^https?:$/.test(parsed.protocol)) return String(raw || '');
    return `${parsed.origin}${parsed.pathname}`;
  }

  function compareCaptureSnapshots(previous, next) {
    const prevFocal = previous?.focal || {};
    const nextFocal = next?.focal || {};
    const normalizeMedia = (items) => (items || []).map((item) => [
      item?.type || '',
      mediaIdentityUrl(item?.url),
      mediaIdentityUrl(item?.previewUrl),
      item?.alt || '',
      Number(item?.width || 0),
      Number(item?.height || 0),
    ]);
    const normalizeContext = (capture) => ({
      repost: capture?.context?.repost ? {
        label: capture.context.repost.label || '',
        actor: capture.context.repost.actor?.handle || capture.context.repost.actor?.displayName || '',
      } : null,
      embedded: (capture?.context?.embedded || []).map((item) => ({
        relation: item?.relation || '',
        url: item?.post?.url || item?.post?.id || '',
        text: item?.post?.text || '',
        media: normalizeMedia(item?.post?.media),
      })),
    });
    return {
      textChanged: String(prevFocal.text || '') !== String(nextFocal.text || ''),
      mediaChanged: JSON.stringify(normalizeMedia(prevFocal.media)) !== JSON.stringify(normalizeMedia(nextFocal.media)),
      metricsChanged: JSON.stringify(prevFocal.metrics || {}) !== JSON.stringify(nextFocal.metrics || {}),
      contextChanged: JSON.stringify(normalizeContext(previous)) !== JSON.stringify(normalizeContext(next)),
    };
  }

  function captureDiffSummary(diff) {
    if (!diff) return '';
    const parts = [];
    if (diff.textChanged) parts.push('text changed');
    if (diff.mediaChanged) parts.push('media changed');
    if (diff.metricsChanged) parts.push('metrics changed');
    if (diff.contextChanged) parts.push('context changed');
    return parts.length ? parts.join(', ') : 'no visible changes';
  }

  function captureDiffKeys(diff) {
    if (!diff) return [];
    const changes = [];
    if (diff.textChanged) changes.push('text');
    if (diff.mediaChanged) changes.push('media');
    if (diff.metricsChanged) changes.push('metrics');
    if (diff.contextChanged) changes.push('context');
    return changes;
  }

  function captureFingerprintPayload(capture) {
    const focal = capture?.focal || {};
    const normalizeMedia = (items) => (items || []).map((item) => ({
      type: item?.type || '',
      url: mediaIdentityUrl(item?.url),
      previewUrl: mediaIdentityUrl(item?.previewUrl),
      alt: item?.alt || '',
      width: Number(item?.width || 0),
      height: Number(item?.height || 0),
    }));
    return {
      platform: capture?.platform || '',
      url: focal.url || '',
      text: focal.text || '',
      publishedAt: focal.publishedAt || '',
      media: normalizeMedia(focal.media),
      metrics: focal.metrics || {},
      repost: capture?.context?.repost ? {
        label: capture.context.repost.label || '',
        actor: capture.context.repost.actor?.handle || capture.context.repost.actor?.displayName || '',
      } : null,
      embedded: (capture?.context?.embedded || []).map((item) => ({
        relation: item?.relation || '',
        url: item?.post?.url || '',
        id: item?.post?.id || '',
        text: item?.post?.text || '',
        media: normalizeMedia(item?.post?.media),
      })),
    };
  }

  function snapshotFingerprint(capture) {
    const text = JSON.stringify(captureFingerprintPayload(capture));
    // FNV-1a 64-bit is used only as a compact change fingerprint. It is not
    // an integrity/authenticity primitive and must never be treated as one.
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      hash ^= BigInt(code & 0xff);
      hash = BigInt.asUintN(64, hash * prime);
      if (code > 0xff) {
        hash ^= BigInt((code >>> 8) & 0xff);
        hash = BigInt.asUintN(64, hash * prime);
      }
    }
    return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
  }

  function shortFingerprint(fingerprint) {
    const value = String(fingerprint || '').split(':').pop() || '';
    return value ? value.slice(0, 8) : 'unknown';
  }

  function normalizeCaptureProvenance(raw, capture) {
    const fallbackAt = capture?.capturedAt || new Date().toISOString();
    const source = raw && raw.schema === 'social-capture-provenance/v1' ? raw : null;
    const sourceFingerprint = typeof source?.currentFingerprint === 'string' && source.currentFingerprint.length <= 64
      ? source.currentFingerprint
      : null;
    const fingerprint = sourceFingerprint || snapshotFingerprint(capture);
    const events = [];
    for (const event of (source?.events || []).slice(-APP.captureRevisionMaxEvents)) {
      const at = typeof event?.at === 'string' && Number.isFinite(Date.parse(event.at)) ? event.at : null;
      const kind = event?.kind === 'refresh' ? 'refresh' : event?.kind === 'capture' ? 'capture' : null;
      const eventFingerprint = typeof event?.fingerprint === 'string' ? event.fingerprint.slice(0, 64) : null;
      const changes = Array.isArray(event?.changes)
        ? event.changes.filter((item) => ['initial', 'text', 'media', 'metrics', 'context'].includes(item)).slice(0, 5)
        : [];
      if (!at || !kind || !eventFingerprint) continue;
      events.push({ at, kind, fingerprint: eventFingerprint, changes });
    }
    if (!events.length) {
      events.push({ at: fallbackAt, kind: 'capture', fingerprint, changes: ['initial'] });
    }
    return {
      schema: 'social-capture-provenance/v1',
      baselineAt: typeof source?.baselineAt === 'string' && Number.isFinite(Date.parse(source.baselineAt)) ? source.baselineAt : events[0].at,
      lastCapturedAt: typeof source?.lastCapturedAt === 'string' && Number.isFinite(Date.parse(source.lastCapturedAt)) ? source.lastCapturedAt : fallbackAt,
      lastCheckedAt: typeof source?.lastCheckedAt === 'string' && Number.isFinite(Date.parse(source.lastCheckedAt)) ? source.lastCheckedAt : fallbackAt,
      currentFingerprint: typeof source?.currentFingerprint === 'string' ? source.currentFingerprint.slice(0, 64) : fingerprint,
      events: events.slice(-APP.captureRevisionMaxEvents),
    };
  }

  function updateCaptureProvenance(existing, capture, { kind = 'capture', previousCapture = null } = {}) {
    const now = capture?.capturedAt || new Date().toISOString();
    const provenance = normalizeCaptureProvenance(existing, capture);
    const fingerprint = snapshotFingerprint(capture);
    provenance.lastCapturedAt = now;

    if (kind === 'refresh') {
      provenance.lastCheckedAt = now;
      const diff = compareCaptureSnapshots(previousCapture, capture);
      const changes = captureDiffKeys(diff);
      if (changes.length && fingerprint !== provenance.currentFingerprint) {
        provenance.events.push({ at: now, kind: 'refresh', fingerprint, changes });
        provenance.events = provenance.events.slice(-APP.captureRevisionMaxEvents);
      }
    }

    provenance.currentFingerprint = fingerprint;
    return provenance;
  }

  function provenanceChangeCount(provenance) {
    return (provenance?.events || []).filter((event) => event.kind === 'refresh' && event.changes?.length).length;
  }

  function formatRevisionTime(value) {
    const date = new Date(value || 0);
    if (!Number.isFinite(date.getTime())) return 'unknown time';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function emptyCaptureCache() {
    return { schema: 'social-capture-cache/v1', entries: [] };
  }

  function captureCacheEntryChars(item) {
    try {
      return JSON.stringify({ capture: item?.capture, provenance: item?.provenance || null }).length;
    } catch {
      return Infinity;
    }
  }

  function loadCaptureCache() {
    if (state.settings?.capture?.cacheEnabled === false) return emptyCaptureCache();
    const now = Date.now();
    const raw = gmGet(APP.captureCacheKey, null);
    const cache = raw && raw.schema === 'social-capture-cache/v1' && Array.isArray(raw.entries)
      ? raw
      : emptyCaptureCache();
    const seen = new Set();
    const entries = [];
    let totalChars = 0;
    let shouldRewrite = cache !== raw;
    for (const item of cache.entries) {
      if (!item || typeof item.url !== 'string' || !item.capture || Number(item.expiresAt || 0) <= now) {
        shouldRewrite = true;
        continue;
      }
      if (seen.has(item.url)) {
        shouldRewrite = true;
        continue;
      }
      const hasPersistedDiscussion = Boolean(item.capture?.discussion?.posts?.length || item.capture?.discussion?.visiblePosts?.length);
      const safeCapture = hasPersistedDiscussion ? cacheSafeCapture(item.capture) : item.capture;
      if (!safeCapture) {
        shouldRewrite = true;
        continue;
      }
      if (hasPersistedDiscussion) shouldRewrite = true;
      const hadValidProvenance = item.provenance?.schema === 'social-capture-provenance/v1';
      const provenance = normalizeCaptureProvenance(item.provenance, safeCapture);
      if (!hadValidProvenance) shouldRewrite = true;
      const normalized = {
        url: item.url,
        storedAt: Number(item.storedAt || now),
        expiresAt: Number(item.expiresAt),
        capture: safeCapture,
        provenance,
      };
      const serializedChars = captureCacheEntryChars(normalized);
      if (!Number.isFinite(serializedChars) || serializedChars > APP.captureCacheMaxEntryChars) {
        shouldRewrite = true;
        continue;
      }
      if (totalChars + serializedChars > APP.captureCacheMaxTotalChars) {
        shouldRewrite = true;
        continue;
      }
      seen.add(item.url);
      totalChars += serializedChars;
      entries.push(normalized);
      if (entries.length >= APP.captureCacheMaxEntries) {
        if (cache.entries.length > entries.length) shouldRewrite = true;
        break;
      }
    }
    const normalizedRaw = { schema: 'social-capture-cache/v1', entries };
    if (entries.length !== cache.entries.length) shouldRewrite = true;
    if (shouldRewrite) gmSet(APP.captureCacheKey, normalizedRaw);
    return normalizedRaw;
  }

  function cacheSafeCapture(capture) {
    if (!capture?.focal?.url) return null;
    let safe;
    try { safe = deepClone(capture); } catch { return null; }
    // Discussion can contain unrelated people/content and grows quickly. It is
    // intentionally never persisted; the live capture still keeps it.
    if (safe.discussion) {
      safe.discussion.posts = [];
      safe.discussion.visiblePosts = []; // v3.6 compatibility; never persist discussion content.
      safe.discussion.capturedReplyCount = 0;
      safe.discussion.complete = false;
      safe.discussion.cacheOmitted = true;
    }
    return safe;
  }

  function rememberCapture(capture, { armResume = false, revisionKind = 'capture', previousCapture = null } = {}) {
    if (state.settings?.capture?.cacheEnabled === false) return false;
    const safe = cacheSafeCapture(capture);
    if (!safe) return false;

    const now = Date.now();
    const expiresAt = now + captureCacheTtlMs();
    const cache = loadCaptureCache();
    const existing = cache.entries.find((item) => item.url === safe.focal.url) || null;
    const provenance = updateCaptureProvenance(existing?.provenance, safe, {
      kind: revisionKind,
      previousCapture: previousCapture || existing?.capture || null,
    });
    const nextEntry = { url: safe.focal.url, storedAt: now, expiresAt, capture: safe, provenance };
    const nextSize = captureCacheEntryChars(nextEntry);
    if (!Number.isFinite(nextSize) || nextSize > APP.captureCacheMaxEntryChars) return false;

    const entries = [
      nextEntry,
      ...cache.entries.filter((item) => item.url !== safe.focal.url),
    ];
    let totalChars = 0;
    const kept = [];
    for (const item of entries) {
      const size = captureCacheEntryChars(item);
      if (!Number.isFinite(size) || size > APP.captureCacheMaxEntryChars || totalChars + size > APP.captureCacheMaxTotalChars) continue;
      kept.push(item);
      totalChars += size;
      if (kept.length >= APP.captureCacheMaxEntries) break;
    }
    gmSet(APP.captureCacheKey, { schema: 'social-capture-cache/v1', entries: kept });
    if (armResume) {
      gmSet(APP.captureResumeKey, {
        schema: 'social-capture-resume/v1',
        url: safe.focal.url,
        expiresAt: Math.min(expiresAt, now + APP.captureResumeTtlMs),
      });
    }
    return true;
  }

  function getCachedCaptureRecord(canonicalUrl) {
    if (!canonicalUrl) return null;
    const item = loadCaptureCache().entries.find((entry) => entry.url === canonicalUrl);
    if (!item) return null;
    return {
      url: item.url,
      storedAt: item.storedAt,
      expiresAt: item.expiresAt,
      capture: deepClone(item.capture),
      provenance: deepClone(item.provenance),
    };
  }

  function getCachedCapture(canonicalUrl) {
    return getCachedCaptureRecord(canonicalUrl)?.capture || null;
  }

  function forgetCachedCapture(canonicalUrl) {
    if (!canonicalUrl) return;
    const cache = loadCaptureCache();
    gmSet(APP.captureCacheKey, {
      schema: 'social-capture-cache/v1',
      entries: cache.entries.filter((item) => item.url !== canonicalUrl),
    });
    clearResumeTicket(canonicalUrl);
  }

  function clearResumeTicket(canonicalUrl = null) {
    const ticket = gmGet(APP.captureResumeKey, null);
    if (!ticket) return;
    if (!canonicalUrl || ticket.url === canonicalUrl) gmDelete(APP.captureResumeKey);
  }

  function consumeResumeCaptureForCurrentPage() {
    if (state.handoff || state.settings?.capture?.cacheEnabled === false) return null;
    const ticket = gmGet(APP.captureResumeKey, null);
    if (!ticket || ticket.schema !== 'social-capture-resume/v1' || Number(ticket.expiresAt || 0) <= Date.now()) {
      gmDelete(APP.captureResumeKey);
      return null;
    }
    const site = state.site || currentSite();
    const current = site ? canonicalize(site, location.href) : null;
    if (!current || current !== ticket.url) return null;
    const capture = getCachedCapture(current);
    gmDelete(APP.captureResumeKey); // one-shot auto-resume; cache itself remains available.
    return capture;
  }

  // ---------- URL builder registry ----------

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

  function boundedString(value, max) {
    return String(value ?? '').slice(0, max);
  }

  function templateProbeUrl(template) {
    const probe = String(template || '').replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, 'x');
    return parseUrl(probe, 'https://example.invalid/');
  }

  function normalizeCustomBuilder(raw, { allowInsecureHttp = false } = {}) {
    return CORE.normalizeCustomBuilder(raw, { allowInsecureHttp });
  }

  function builderRegistry() {
    const custom = state.settings?.builders?.custom || [];
    return [...BUILTIN_BUILDERS, ...custom];
  }

  function compatibleBuilders(platform) {
    return builderRegistry().filter((builder) => builder.platforms.includes(platform));
  }

  function builderById(id) {
    return builderRegistry().find((builder) => builder.id === id) || null;
  }

  function selectedBuilder(site) {
    const id = state.settings?.links?.[site.id]?.builderId;
    const selected = builderById(id);
    if (selected?.platforms.includes(site.id)) return selected;
    return compatibleBuilders(site.id)[0] || null;
  }

  function builderVars(site, canonicalUrl) {
    return CORE.builderVars(site?.id || site, canonicalUrl);
  }

  function applyTemplate(template, vars, { encode = false } = {}) {
    return CORE.applyTemplate(template, vars, { encode });
  }

  function finalizeBuiltUrl(builder, raw) {
    return CORE.finalizeBuiltUrl(builder, raw, {
      allowInsecureHttp: state.settings?.security?.allowInsecureCustomUrls,
      maxUrlChars: APP.maxBuilderUrlChars,
    });
  }

  function buildUrl(builder, site, canonicalUrl) {
    return CORE.buildUrl(builder, site?.id || site, canonicalUrl, {
      allowInsecureHttp: state.settings?.security?.allowInsecureCustomUrls,
      maxUrlChars: APP.maxBuilderUrlChars,
    });
  }

  function transformedUrl(site, canonicalUrl) {
    return buildUrl(selectedBuilder(site), site, canonicalUrl);
  }

  // ---------- Native Copy-link tracking sanitizer ----------

  function sanitizeClipboardText(site, value) {
    if (!site || typeof value !== 'string') return value;
    if (!value || value.trim() !== value || /[\r\n]/.test(value)) return value;
    return canonicalize(site, value) || value;
  }

  function installClipboardSanitizer() {
    if (state.settings?.security?.sanitizeNativeCopy === false) return false;
    if (state.clipboardPatch) return true;

    const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const clipboard = pageWindow?.navigator?.clipboard;
    if (!clipboard || typeof clipboard.writeText !== 'function') return false;

    const ownDescriptor = Object.getOwnPropertyDescriptor(clipboard, 'writeText');
    const originalMethod = clipboard.writeText;
    const wrapped = (value) => originalMethod.call(clipboard, sanitizeClipboardText(state.site || currentSite(), value));

    try {
      Object.defineProperty(clipboard, 'writeText', {
        configurable: true,
        writable: true,
        value: wrapped,
      });
      state.clipboardPatch = { clipboard, originalMethod, wrapped, ownDescriptor };
      return true;
    } catch {
      try {
        clipboard.writeText = wrapped;
        state.clipboardPatch = { clipboard, originalMethod, wrapped, ownDescriptor, assignmentFallback: true };
        return true;
      } catch {
        return false;
      }
    }
  }

  function uninstallClipboardSanitizer() {
    const patch = state.clipboardPatch;
    if (!patch) return true;
    try {
      if (patch.clipboard?.writeText === patch.wrapped) {
        if (patch.ownDescriptor) Object.defineProperty(patch.clipboard, 'writeText', patch.ownDescriptor);
        else delete patch.clipboard.writeText;
      }
    } catch {
      try {
        if (patch.clipboard?.writeText === patch.wrapped) patch.clipboard.writeText = patch.originalMethod;
      } catch {}
    }
    state.clipboardPatch = null;
    return true;
  }

  function syncClipboardSanitizer() {
    if (state.settings?.security?.sanitizeNativeCopy === false) return uninstallClipboardSanitizer();
    return installClipboardSanitizer();
  }

  // ---------- Share trigger + post identity ----------

  function accessibleLabels(target) {
    if (!(target instanceof Element)) return [];
    const control = target.closest('button, [role="button"], a') || target;
    const values = [];
    const push = (value) => {
      const text = cleanText(value);
      if (text) values.push(text);
    };

    push(control.getAttribute?.('aria-label'));
    push(control.getAttribute?.('title'));

    const labelledBy = control.getAttribute?.('aria-labelledby');
    if (labelledBy) {
      push(labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' '));
    }

    for (const element of queryAll(control, '[aria-label], [title], svg title')) {
      push(element.getAttribute?.('aria-label'));
      push(element.getAttribute?.('title'));
      if (element.matches?.('svg title')) push(element.textContent);
      if (values.length >= 12) break;
    }

    return uniqueValues(values);
  }

  function findShareTrigger(site, target) {
    if (!(target instanceof Element)) return null;
    for (const selector of site.shareSelectors || []) {
      try {
        const found = target.closest(selector);
        if (found) return found;
      } catch {}
    }

    const control = target.closest('button, [role="button"], a');
    if (!control) return null;
    const directLabels = [control.getAttribute?.('aria-label'), control.getAttribute?.('title')]
      .map(normalizeLabel)
      .filter(Boolean);
    if (directLabels.some((label) => site.shareLabelSet.has(label))) return control;

    // Most clicks never reach the semantic fallback. Only inspect descendants
    // when the control actually exposes accessible labelling metadata.
    let hasNestedLabel = false;
    try { hasNestedLabel = Boolean(control.querySelector?.('[aria-label], [title], svg title')); } catch {}
    if (!hasNestedLabel && !control.getAttribute?.('aria-labelledby')) return null;
    if (accessibleLabels(control).some((label) => site.shareLabelSet.has(normalizeLabel(label)))) return control;
    return null;
  }

  function findCanonicalLinkIn(site, root) {
    if (!(root instanceof Element)) return null;
    const seen = new Set();

    for (const selector of site.postLinkSelectors || []) {
      const links = [];
      try { if (root.matches?.(selector)) links.push(root); } catch {}
      links.push(...queryAll(root, selector));
      for (const link of links) {
        if (!link?.href || seen.has(link.href)) continue;
        seen.add(link.href);
        const canonical = canonicalize(site, link.href);
        if (canonical) return canonical;
      }
    }

    for (const link of queryAll(root, 'a[href]')) {
      if (!link?.href || seen.has(link.href)) continue;
      seen.add(link.href);
      const canonical = canonicalize(site, link.href);
      if (canonical) return canonical;
    }
    return null;
  }

  function rootHasSelector(root, selectors) {
    if (!(root instanceof Element)) return false;
    for (const selector of selectors || []) {
      try {
        if (root.matches?.(selector) || root.querySelector?.(selector)) return true;
      } catch {}
    }
    return false;
  }

  function rootContainsCanonical(site, root, canonicalUrl) {
    if (!(root instanceof Element)) return false;
    for (const link of queryAll(root, 'a[href]')) {
      if (canonicalize(site, link.href) === canonicalUrl) return true;
    }
    return false;
  }

  function closestBySelectors(element, selectors) {
    if (!(element instanceof Element) || !selectors?.length) return null;
    try {
      return element.closest(selectors.join(','));
    } catch {
      for (const selector of selectors) {
        try {
          const found = element.closest(selector);
          if (found) return found;
        } catch {}
      }
      return null;
    }
  }

  function isOwnedByPostRoot(site, root, element) {
    if (!(root instanceof Element) || !(element instanceof Element)) return false;
    if (element !== root && !root.contains(element)) return false;

    const selectors = site.content.ownershipRootSelectors || site.content.rootSelectors || [];
    const owner = closestBySelectors(element, selectors);
    if (!owner) return true;
    if (owner === root) return true;

    // A nested post/quote owns its own body, media, metadata and controls.
    // Do not let those descendants leak into the focal post extraction.
    return false;
  }

  function ownedQueryAll(site, root, selector) {
    return queryAll(root, selector).filter((element) => isOwnedByPostRoot(site, root, element));
  }

  function ownedQueryMany(site, root, selectors) {
    const seen = new Set();
    const out = [];
    for (const selector of selectors || []) {
      for (const element of ownedQueryAll(site, root, selector)) {
        if (seen.has(element)) continue;
        seen.add(element);
        out.push(element);
      }
    }
    return out;
  }

  function directNestedPostRoots(site, root) {
    if (!(root instanceof Element)) return [];
    const selectors = site.content.nestedPostRootSelectors || site.content.ownershipRootSelectors || [];
    const candidates = queryMany(root, selectors).filter((candidate) => candidate !== root && root.contains(candidate));
    return candidates.filter((candidate) => {
      const parentOwner = closestBySelectors(candidate.parentElement, site.content.ownershipRootSelectors || selectors);
      return parentOwner === root;
    });
  }

  function resolveContentRoot(site, trigger, canonicalUrl, identityRoot = null) {
    for (const selector of site.content.rootSelectors || []) {
      const root = trigger.closest?.(selector);
      if (root) return root;
    }

    const bodySelectors = [...(site.content.bodySelectors || []), ...(site.content.fallbackTextSelectors || [])];
    let node = identityRoot || trigger;
    while (node && node !== document.body && node !== document.documentElement) {
      if (rootHasSelector(node, bodySelectors) && rootContainsCanonical(site, node, canonicalUrl)) return node;
      node = node.parentElement;
    }
    return identityRoot || trigger;
  }

  function resolvePostContext(site, trigger) {
    for (const selector of site.identityScopeSelectors || []) {
      const scope = trigger.closest?.(selector);
      if (!scope) continue;
      const url = findCanonicalLinkIn(site, scope);
      if (url) return { url, root: resolveContentRoot(site, trigger, url, scope) };
    }

    for (const selector of site.content.rootSelectors || []) {
      const root = trigger.closest?.(selector);
      if (!root) continue;
      const url = findCanonicalLinkIn(site, root);
      if (url) return { url, root };
    }

    let node = trigger;
    while (node && node !== document.body && node !== document.documentElement) {
      const url = findCanonicalLinkIn(site, node);
      if (url) return { url, root: resolveContentRoot(site, trigger, url, node) };
      node = node.parentElement;
    }

    const pageUrl = canonicalize(site, location.href);
    return pageUrl ? { url: pageUrl, root: resolveContentRoot(site, trigger, pageUrl) } : null;
  }

  // ---------- SocialCapture extraction ----------

  function isExcludedBodyNode(root, element, config) {
    if (!(element instanceof Element)) return true;
    for (const selector of config.bodyExcludeSelectors || []) {
      try { if (element.matches(selector)) return true; } catch {}
    }
    for (const selector of config.bodyExcludeAncestorSelectors || []) {
      try {
        const ancestor = element.closest(selector);
        if (ancestor && ancestor !== root && root.contains(ancestor)) return true;
      } catch {}
    }
    for (const selector of config.bodyExcludeDescendantSelectors || []) {
      try { if (element.querySelector(selector)) return true; } catch {}
    }
    return false;
  }

  function textFromSelectors(site, root, selectors, config) {
    if (!(root instanceof Element)) return [];
    const values = [];
    for (const selector of selectors || []) {
      for (const element of ownedQueryAll(site, root, selector)) {
        if (!isVisible(element) || isExcludedBodyNode(root, element, config)) continue;
        const text = cleanText(element.innerText || element.textContent);
        if (text) values.push(text);
      }
      if (values.length) break;
    }
    return uniqueValues(values);
  }

  function plausibleBody(text, authorHandle) {
    const value = cleanText(text);
    if (!value) return false;
    const bare = String(authorHandle || '').replace(/^@/, '').toLocaleLowerCase();
    const lowered = value.toLocaleLowerCase();
    if (bare && [bare, `@${bare}`].includes(lowered)) return false;
    if (/^[\d.,+\s]*(?:k|m|b|萬|万|千|億|亿)?$/iu.test(value)) return false;
    if (/^\d+\s*(?:s|m|h|d|w|y|min|hr|day|week|year)s?$/iu.test(value)) return false;
    return true;
  }

  function extractTimestamp(root, site) {
    for (const selector of site.content.timestampSelectors || []) {
      for (const element of ownedQueryAll(site, root, selector)) {
        const value = element.getAttribute?.('datetime') || element.dateTime || '';
        if (value) return value;
      }
    }
    return null;
  }

  function extractDisplayName(site, root, authorHandle) {
    const bare = String(authorHandle || '').replace(/^@/, '').toLocaleLowerCase();

    if (site.id === 'x') {
      for (const container of ownedQueryMany(site, root, site.content.authorContainerSelectors)) {
        const texts = ownedQueryAll(site, root, 'span').filter((el) => container.contains(el)).map((el) => cleanText(el.textContent)).filter(Boolean);
        const display = texts.find((text) => !text.startsWith('@') && text.toLocaleLowerCase() !== bare && !/^·$/.test(text));
        if (display) return display;
      }
    }

    if (site.id === 'threads' && bare) {
      for (const link of ownedQueryAll(site, root, 'a[href^="/@"], a[href^="/"]')) {
        const href = (parseUrl(link.href)?.pathname || '').toLocaleLowerCase();
        if (href !== `/@${bare}` && href !== `/${bare}`) continue;
        const text = cleanText(link.textContent);
        if (text && text.toLocaleLowerCase() !== bare && text.toLocaleLowerCase() !== `@${bare}`) return text;
      }
    }
    return null;
  }

  function extractMedia(site, root) {
    const media = [];
    const seen = new Set();

    for (const image of ownedQueryMany(site, root, site.content.mediaImageSelectors)) {
      const src = image.currentSrc || image.src || '';
      if (!src || seen.has(src)) continue;
      seen.add(src);
      media.push({
        type: 'image',
        url: src,
        alt: cleanText(image.getAttribute('alt')) || null,
        width: image.naturalWidth || Number(image.getAttribute('width')) || null,
        height: image.naturalHeight || Number(image.getAttribute('height')) || null,
      });
    }

    for (const video of ownedQueryMany(site, root, site.content.mediaVideoSelectors)) {
      const src = video.currentSrc || video.src || '';
      const poster = video.poster || '';
      const key = src || poster;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      media.push({
        type: 'video',
        url: src || null,
        previewUrl: poster || null,
        alt: null,
        width: video.videoWidth || null,
        height: video.videoHeight || null,
      });
    }

    return media;
  }

  function parseCompactNumber(raw) {
    const text = String(raw || '').replace(/,/g, '').trim().toLocaleLowerCase();
    const match = text.match(/(\d+(?:\.\d+)?)\s*([kmb])?/i);
    if (!match) return null;
    const factor = match[2] === 'k' ? 1e3 : match[2] === 'm' ? 1e6 : match[2] === 'b' ? 1e9 : 1;
    return Math.round(Number(match[1]) * factor);
  }

  function extractMetrics(site, root) {
    if (!state.settings.capture.includeMetrics) return {};
    const metrics = {};

    if (site.id === 'x') {
      const defs = [
        ['replies', '[data-testid="reply"]'],
        ['reposts', '[data-testid="retweet"]'],
        ['likes', '[data-testid="like"]'],
      ];
      for (const [key, selector] of defs) {
        const element = ownedQueryAll(site, root, selector)[0];
        const count = parseCompactNumber(element?.getAttribute?.('aria-label') || '');
        if (count != null) metrics[key] = count;
      }
      const analytics = ownedQueryAll(site, root, 'a[href*="/analytics"]')[0];
      const views = parseCompactNumber(analytics?.getAttribute?.('aria-label') || analytics?.textContent || '');
      if (views != null) metrics.views = views;
    }

    if (site.id === 'threads') {
      const map = { Like: 'likes', Comment: 'replies', Repost: 'reposts' };
      for (const [label, key] of Object.entries(map)) {
        const icon = ownedQueryAll(site, root, `svg[aria-label="${label}"]`)[0];
        const control = icon?.closest?.('[role="button"], button');
        const count = parseCompactNumber(control?.innerText || control?.textContent || '');
        if (count != null) metrics[key] = count;
      }
    }

    return metrics;
  }

  function actorFromProfileLink(site, link) {
    const url = parseUrl(link?.href);
    if (!url || !site.hostSet.has(url.hostname.toLowerCase())) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (!parts.length) return null;
    const first = decodeURIComponent(parts[0]).replace(/^@/, '');
    if (!first || ['home', 'explore', 'search', 'i', 'messages', 'notifications'].includes(first.toLocaleLowerCase())) return null;
    return { handle: `@${first}` };
  }

  function extractRepostContext(site, root) {
    for (const selector of site.content.repostContextSelectors || []) {
      for (const element of ownedQueryAll(site, root, selector)) {
        const label = cleanText(element.innerText || element.textContent);
        if (!label) continue;
        let actor = null;
        for (const actorSelector of site.content.repostActorLinkSelectors || []) {
          const link = ownedQueryAll(site, root, actorSelector).find((candidate) => element.contains(candidate));
          actor = actorFromProfileLink(site, link);
          if (actor) break;
        }
        return { label, actor };
      }
    }

    // Conservative fallback: only inspect short, focal-owned lines near the top
    // of a post card. Do not classify quote text or arbitrary body text.
    const candidates = ownedQueryAll(site, root, '[dir="auto"], span')
      .slice(0, 30)
      .map((el) => cleanText(el.textContent))
      .filter((text) => text && text.length < 120);
    const label = candidates.find((text) => /\b(reposted|repost by|reposted by)\b/i.test(text));
    return label ? { label, actor: null } : null;
  }

  function extractPostNode(site, root, canonicalUrl) {
    if (!(root instanceof Element) || !canonicalUrl) return null;
    const parts = postParts(site, canonicalUrl);
    const handle = parts.author ? `@${parts.author}` : null;

    let bodies = textFromSelectors(site, root, site.content.bodySelectors, site.content).filter((text) => plausibleBody(text, handle));
    if (!bodies.length) {
      bodies = textFromSelectors(site, root, site.content.fallbackTextSelectors, site.content).filter((text) => plausibleBody(text, handle));
    }

    return {
      id: `${site.id}:${parts.postId || canonicalUrl}`,
      platform: site.id,
      url: canonicalUrl,
      author: {
        handle,
        displayName: extractDisplayName(site, root, handle),
      },
      text: bodies[0] || null,
      publishedAt: extractTimestamp(root, site),
      media: state.settings.capture.includeMedia ? extractMedia(site, root) : [],
      metrics: extractMetrics(site, root),
    };
  }

  function candidateNestedRoots(site, root) {
    return directNestedPostRoots(site, root);
  }

  function extractEmbeddedContext(site, focalRoot, focalUrl) {
    const items = [];
    const seen = new Set([focalUrl]);

    for (const candidate of candidateNestedRoots(site, focalRoot)) {
      const url = findCanonicalLinkIn(site, candidate);
      if (!url || seen.has(url)) continue;
      const post = extractPostNode(site, candidate, url);
      if (!post?.text && !post?.media?.length) continue;
      seen.add(url);
      items.push({ relation: 'quotes', confidence: 'nested-post-root', post });
      if (items.length >= 3) break;
    }
    return items;
  }

  function reportedReplyCount(focal) {
    return Number.isFinite(focal?.metrics?.replies) ? focal.metrics.replies : null;
  }

  function isTopLevelDiscussionRoot(site, main, root) {
    const selectors = site.content.ownershipRootSelectors || site.content.discussionRootSelectors || [];
    const owner = closestBySelectors(root.parentElement, selectors);
    return !owner || !main.contains(owner);
  }

  function collectVisibleDiscussion(site, context, limit) {
    if (!limit) return [];
    const pageCanonical = canonicalize(site, location.href);
    if (!pageCanonical || pageCanonical !== context.url) return [];

    const main = context.root.closest?.('main') || document.querySelector('main') || document.body;
    const roots = queryMany(main, site.content.discussionRootSelectors || site.content.rootSelectors);
    const replies = [];
    const seen = new Set([context.url]);

    for (const root of roots) {
      if (root === context.root || context.root.contains(root)) continue;
      if (!isTopLevelDiscussionRoot(site, main, root)) continue;
      const position = context.root.compareDocumentPosition(root);
      if (!(position & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      const url = findCanonicalLinkIn(site, root);
      if (!url || seen.has(url)) continue;
      const post = extractPostNode(site, root, url);
      if (!post?.text && !post?.media?.length) continue;
      seen.add(url);
      replies.push(post);
      if (replies.length >= limit) break;
    }
    return replies;
  }

  function canCaptureVisibleDiscussion(context) {
    return canonicalize(context.site, location.href) === context.url;
  }

  function buildSocialCapture(context, mode = 'smart') {
    const focal = extractPostNode(context.site, context.root, context.url);
    if (!focal) return null;

    const includeContext = mode !== 'post';
    const embedded = includeContext ? extractEmbeddedContext(context.site, context.root, context.url) : [];
    const repost = includeContext ? extractRepostContext(context.site, context.root) : null;
    const includeDiscussion = mode === 'discussion';
    const visibleReplies = includeDiscussion
      ? collectVisibleDiscussion(context.site, context, state.settings.capture.maxVisibleReplies)
      : [];

    const relations = embedded.map((item) => ({
      type: item.relation,
      from: focal.id,
      to: item.post.id,
      confidence: item.confidence || 'dom',
    }));

    const capturedAt = new Date().toISOString();
    const capture = {
      schema: 'social-capture/v1',
      capturedAt,
      snapshot: {
        source: 'live-dom',
        dynamicFields: ['metrics', 'media-urls'],
        note: 'Metrics and remote media references may change after capture.',
        fingerprintAlgorithm: 'fnv1a64-noncrypto',
        fingerprint: null,
      },
      platform: context.site.id,
      platformName: context.site.platformName,
      captureMode: mode,
      focal,
      relations,
      context: {
        repost,
        embedded,
      },
      discussion: {
        scope: includeDiscussion ? 'visible-following-posts' : 'not-captured',
        reportedReplyCount: reportedReplyCount(focal),
        capturedReplyCount: visibleReplies.length,
        complete: false,
        posts: visibleReplies,
      },
    };
    capture.snapshot.fingerprint = snapshotFingerprint(capture);
    return capture;
  }

  function captureContextSummary(capture) {
    if (!capture) return '';
    const parts = [];
    if (capture.context.repost) parts.push('repost');
    if (capture.context.embedded.length) parts.push(`${capture.context.embedded.length} quote${capture.context.embedded.length === 1 ? '' : 's'}`);
    if (capture.focal.media.length) parts.push(`${capture.focal.media.length} media`);
    return parts.join(', ');
  }

  function captureStatusSummary(capture) {
    if (!capture) return '';
    const parts = [];
    const context = captureContextSummary(capture);
    if (context) parts.push(context);
    if (capture.discussion.capturedReplyCount) parts.push(`${capture.discussion.capturedReplyCount} replies`);
    return parts.join(', ');
  }

  // ---------- SocialCapture renderers ----------

  function safeRenderableUrl(raw) {
    const url = validHttpUrl(raw);
    return url && !hasUrlCredentials(url) ? url.href : null;
  }

  function renderPostText(post, heading = 'Post') {
    const lines = [`## ${heading}`, ''];
    const author = [post.author.displayName, post.author.handle].filter(Boolean).join(' ');
    if (author) lines.push(`Author: ${author}`);
    lines.push(`Source: ${post.url}`);
    if (post.publishedAt) lines.push(`Published: ${post.publishedAt}`);

    if (Object.keys(post.metrics || {}).length) {
      const metrics = Object.entries(post.metrics).map(([key, value]) => `${key}=${value}`).join(', ');
      lines.push(`Metrics: ${metrics}`);
    }

    if (post.text) {
      lines.push('', ...post.text.split('\n').map((line) => `> ${line}`));
    }

    if (post.media?.length) {
      lines.push('', `### Media (${post.media.length})`, '');
      post.media.forEach((media, index) => {
        lines.push(`${index + 1}. ${media.type}`);
        if (media.url) lines.push(`   URL: ${media.url}`);
        if (media.previewUrl) lines.push(`   Preview: ${media.previewUrl}`);
        if (media.alt) lines.push(`   Alt: ${media.alt}`);
        if (media.width && media.height) lines.push(`   Size: ${media.width}×${media.height}`);
      });
    }

    return lines.join('\n');
  }

  function renderCaptureText(capture) {
    const lines = [
      'Social post capture',
      `Schema: ${capture.schema}`,
      `Platform: ${capture.platformName}`,
      `Capture mode: ${capture.captureMode}`,
      `Captured at: ${capture.capturedAt}`,
      `Snapshot fingerprint: ${capture.snapshot?.fingerprint || 'unavailable'} (non-cryptographic change marker)`,
      'Snapshot note: metrics and remote media references may have changed since capture.',
      '',
      renderPostText(capture.focal, 'Focal post'),
    ];

    if (capture.context.repost) {
      lines.push('', '## Repost context', '', capture.context.repost.label);
      if (capture.context.repost.actor?.handle) lines.push(`Actor: ${capture.context.repost.actor.handle}`);
    }

    for (const [index, item] of capture.context.embedded.entries()) {
      lines.push('', renderPostText(item.post, `Quoted / embedded post ${index + 1}`));
    }

    if (capture.discussion.posts.length) {
      lines.push(
        '',
        '## Visible discussion',
        '',
        `Captured replies: ${capture.discussion.capturedReplyCount}`,
        `Reported reply count: ${capture.discussion.reportedReplyCount ?? 'unknown'}`,
        'Discussion complete: no',
      );
      capture.discussion.posts.forEach((post, index) => {
        lines.push('', renderPostText(post, `Visible reply ${index + 1}`));
      });
    } else if (capture.captureMode === 'discussion') {
      lines.push(
        '',
        '## Visible discussion',
        '',
        'Captured replies: 0',
        `Reported reply count: ${capture.discussion.reportedReplyCount ?? 'unknown'}`,
        'Discussion complete: no',
      );
    } else if (capture.discussion.reportedReplyCount != null) {
      lines.push('', `Reported replies: ${capture.discussion.reportedReplyCount}`, 'Visible discussion captured: no');
    }

    return `${lines.join('\n').trim()}\n`;
  }

  function renderPostHtml(post, heading = 'Post') {
    const author = [post.author.displayName, post.author.handle].filter(Boolean).map(escapeHtml).join(' ');
    const metrics = Object.entries(post.metrics || {}).map(([key, value]) => `${escapeHtml(key)}=${escapeHtml(value)}`).join(', ');
    const media = (post.media || []).map((item) => {
      const mediaUrl = safeRenderableUrl(item.url);
      const previewUrl = safeRenderableUrl(item.previewUrl);
      const src = mediaUrl || previewUrl;
      // Remote images are opt-in: pasting rich HTML with <img src=https://...>
      // can trigger an automatic network request in the destination editor.
      const image = state.settings.capture.richHtmlImages && item.type === 'image' && src
        ? `<div style="margin:8px 0"><img src="${escapeHtml(src)}" alt="${escapeHtml(item.alt || '')}" style="max-width:100%;height:auto"></div>`
        : '';
      const links = [
        mediaUrl ? `<a rel="noreferrer noopener" href="${escapeHtml(mediaUrl)}">media</a>` : '',
        previewUrl ? `<a rel="noreferrer noopener" href="${escapeHtml(previewUrl)}">preview</a>` : '',
      ].filter(Boolean).join(' · ');
      return `<li>${escapeHtml(item.type)}${item.alt ? ` — ${escapeHtml(item.alt)}` : ''}${links ? ` (${links})` : ''}${image}</li>`;
    }).join('');
    const sourceUrl = safeRenderableUrl(post.url);

    return `
      <section>
        <h2>${escapeHtml(heading)}</h2>
        ${author ? `<p><strong>Author:</strong> ${author}</p>` : ''}
        <p><strong>Source:</strong> ${sourceUrl ? `<a rel="noreferrer noopener" href="${escapeHtml(sourceUrl)}">${escapeHtml(post.url)}</a>` : escapeHtml(post.url)}</p>
        ${post.publishedAt ? `<p><strong>Published:</strong> ${escapeHtml(post.publishedAt)}</p>` : ''}
        ${metrics ? `<p><strong>Metrics:</strong> ${metrics}</p>` : ''}
        ${post.text ? `<blockquote>${escapeHtml(post.text).replace(/\n/g, '<br>')}</blockquote>` : ''}
        ${media ? `<h3>Media</h3><ul>${media}</ul>` : ''}
      </section>`;
  }

  function renderCaptureHtml(capture) {
    return `<!doctype html><html><body>
      <h1>Social post capture</h1>
      <p><strong>Platform:</strong> ${escapeHtml(capture.platformName)}<br>
      <strong>Capture mode:</strong> ${escapeHtml(capture.captureMode)}<br>
      <strong>Captured at:</strong> ${escapeHtml(capture.capturedAt)}<br>
      <strong>Snapshot:</strong> metrics and remote media references may have changed since capture.</p>
      ${renderPostHtml(capture.focal, 'Focal post')}
      ${capture.context.repost ? `<section><h2>Repost context</h2><p>${escapeHtml(capture.context.repost.label)}${capture.context.repost.actor?.handle ? `<br><strong>Actor:</strong> ${escapeHtml(capture.context.repost.actor.handle)}` : ''}</p></section>` : ''}
      ${capture.context.embedded.map((item, i) => renderPostHtml(item.post, `Quoted / embedded post ${i + 1}`)).join('')}
      ${capture.discussion.posts.length ? `<section><h2>Visible discussion</h2><p>Captured replies: ${capture.discussion.capturedReplyCount}<br>Reported reply count: ${escapeHtml(capture.discussion.reportedReplyCount ?? 'unknown')}<br>Discussion complete: no</p>${capture.discussion.posts.map((post, i) => renderPostHtml(post, `Visible reply ${i + 1}`)).join('')}</section>` : capture.captureMode === 'discussion' ? `<section><h2>Visible discussion</h2><p>Captured replies: 0<br>Reported reply count: ${escapeHtml(capture.discussion.reportedReplyCount ?? 'unknown')}<br>Discussion complete: no</p></section>` : ''}
    </body></html>`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      Object.assign(textarea.style, { position: 'fixed', opacity: '0', pointerEvents: 'none' });
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch {}
      textarea.remove();
      return ok;
    }
  }

  async function copyCaptureSmart(capture) {
    const plain = renderCaptureText(capture);
    const html = renderCaptureHtml(capture);
    try {
      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        const item = new ClipboardItem({
          'text/plain': new Blob([plain], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        });
        await navigator.clipboard.write([item]);
        return true;
      }
    } catch {}
    return copyText(plain);
  }

  // ---------- Telegram ----------

  function templateVarsForCapture(capture, targetUrl) {
    const focal = capture.focal;
    const author = [focal.author.displayName, focal.author.handle].filter(Boolean).join(' ');
    return {
      author,
      handle: focal.author.handle || '',
      text: focal.text || '',
      url: targetUrl || focal.url,
      sourceUrl: focal.url,
      platform: capture.platformName,
      publishedAt: focal.publishedAt || '',
      mediaCount: String(focal.media?.length || 0),
    };
  }

  function telegramTargetUrl(context) {
    const mode = state.settings.telegram.linkSource;
    if (mode === 'clean') return context.url;
    if (mode && mode !== 'selected') {
      const builder = builderById(mode);
      if (builder?.platforms.includes(context.site.id)) return buildUrl(builder, context.site, context.url) || context.url;
    }
    return transformedUrl(context.site, context.url) || context.url;
  }

  function telegramText(capture, targetUrl) {
    const vars = templateVarsForCapture(capture, targetUrl);
    let template = state.settings.telegram.template || '{author}\n\n{text}';
    let text = applyTemplate(template, vars);
    if (!state.settings.telegram.includeAuthor) text = text.replace(vars.author, '').trim();
    if (!state.settings.telegram.includeText) text = text.replace(vars.text, '').trim();
    const max = state.settings.telegram.maxText;
    if (max > 0 && text.length > max) text = `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
    return text;
  }

  function openTelegramShare(context) {
    const capture = buildSocialCapture(context, 'post');
    if (!capture) return false;
    const target = telegramTargetUrl(context);
    const share = new URL('https://t.me/share/url');
    share.searchParams.set('url', target);
    const text = telegramText(capture, target);
    if (text) share.searchParams.set('text', text);
    window.open(share.href, '_blank', 'noopener,noreferrer');
    return true;
  }

  // ---------- Native / Android share ----------

  function configuredTargetUrl(context, config) {
    const mode = config?.linkSource || 'selected';
    if (mode === 'clean') return context.url;
    if (mode && mode !== 'selected') {
      const builder = builderById(mode);
      if (builder?.platforms.includes(context.site.id)) return buildUrl(builder, context.site, context.url) || context.url;
    }
    return transformedUrl(context.site, context.url) || context.url;
  }

  function configuredShareText(capture, targetUrl, config) {
    const vars = templateVarsForCapture(capture, targetUrl);
    let text = applyTemplate(config?.template || '{author}\n\n{text}', vars);
    if (config?.includeAuthor === false && vars.author) text = text.replace(vars.author, '').trim();
    if (config?.includeText === false && vars.text) text = text.replace(vars.text, '').trim();
    const max = clampInt(config?.maxText, 0, 4000, 700);
    if (max > 0 && text.length > max) text = `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
    return text;
  }

  async function nativeShare(payload) {
    if (typeof navigator.share !== 'function') return { ok: false, unsupported: true };
    try {
      await navigator.share(payload);
      return { ok: true };
    } catch (error) {
      if (error?.name === 'AbortError') return { ok: false, cancelled: true };
      return { ok: false, error };
    }
  }

  async function sharePostToApps(context) {
    const capture = buildSocialCapture(context, 'post');
    if (!capture) return { ok: false };
    const target = configuredTargetUrl(context, state.settings.systemShare);
    const text = configuredShareText(capture, target, state.settings.systemShare);
    const payload = { url: target };
    if (text) payload.text = text;
    const author = capture.focal.author?.handle || capture.focal.author?.displayName;
    if (author) payload.title = `${capture.platformName} post · ${author}`;
    return nativeShare(payload);
  }

  function safeFilePart(value, fallback = 'post') {
    const clean = String(value || '')
      .replace(/^@/, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
    return clean || fallback;
  }

  function captureShareFiles(capture) {
    if (typeof File === 'undefined') return [];
    const author = safeFilePart(capture.focal.author?.handle || capture.focal.author?.displayName, 'post');
    const postId = safeFilePart(capture.focal.id, 'capture');
    const base = `${safeFilePart(capture.platform, 'social')}-${author}-${postId}`;
    const markdown = renderCaptureText(capture);
    const json = JSON.stringify(capture, null, 2);
    return [
      new File([markdown], `${base}.md`, { type: 'text/markdown;charset=utf-8' }),
      new File([json], `${base}.json`, { type: 'application/json;charset=utf-8' }),
    ];
  }

  function collectCaptureImageMedia(capture) {
    const out = [];
    const seen = new Set();
    const addPost = (post) => {
      for (const media of post?.media || []) {
        if (media.type !== 'image') continue;
        const raw = media.url || media.previewUrl;
        if (!raw || seen.has(raw)) continue;
        seen.add(raw);
        out.push({ ...media, sourceUrl: raw });
      }
    };

    addPost(capture?.focal);
    for (const item of capture?.context?.embedded || []) addPost(item.post);
    for (const post of capture?.discussion?.posts || []) addPost(post);
    return out.slice(0, APP.mediaPackageMaxFiles);
  }

  function mediaFetchUrlAllowed(raw) {
    const url = parseUrl(raw);
    if (!url || hasUrlCredentials(url)) return false;
    if (url.protocol === 'blob:') return true;
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return host === 'pbs.twimg.com'
      || host === 'video.twimg.com'
      || host.endsWith('.twimg.com')
      || host === 'fbcdn.net'
      || host.endsWith('.fbcdn.net')
      || host === 'cdninstagram.com'
      || host.endsWith('.cdninstagram.com');
  }

  function safeImageMime(mime) {
    const type = String(mime || '').split(';', 1)[0].toLowerCase();
    return SAFE_IMAGE_MIMES.has(type) ? type : null;
  }

  function extensionForMime(mime) {
    const type = String(mime || '').split(';', 1)[0].toLowerCase();
    return ({
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/avif': '.avif',
    })[type] || '.img';
  }

  async function fetchImageBlob(rawUrl) {
    if (!mediaFetchUrlAllowed(rawUrl)) throw new Error('media-origin-not-allowed');
    const url = parseUrl(rawUrl);

    if (url.protocol === 'blob:') {
      const response = await fetch(url.href, { credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error(`media-http-${response.status}`);
      const blob = await response.blob();
      if (!safeImageMime(blob.type)) throw new Error('media-not-safe-image');
      if (blob.size > APP.mediaPackageMaxFileBytes) throw new Error('media-too-large');
      return blob;
    }

    if (typeof GM_xmlhttpRequest !== 'function') {
      const response = await fetch(url.href, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error(`media-http-${response.status}`);
      const blob = await response.blob();
      if (!safeImageMime(blob.type)) throw new Error('media-not-safe-image');
      if (blob.size > APP.mediaPackageMaxFileBytes) throw new Error('media-too-large');
      return blob;
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let request = null;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error(String(error || 'media-fetch-failed')));
      };
      try {
        request = GM_xmlhttpRequest({
          method: 'GET',
          url: url.href,
          responseType: 'arraybuffer',
          timeout: APP.mediaFetchTimeoutMs,
          anonymous: true,
          headers: { Accept: 'image/avif,image/webp,image/*,*/*;q=0.5' },
          onprogress: (event) => {
            const size = Number(event?.loaded || 0);
            if (size > APP.mediaPackageMaxFileBytes) {
              try { request?.abort?.(); } catch {}
              fail(new Error('media-too-large'));
            }
          },
          ontimeout: () => fail(new Error('media-timeout')),
          onerror: () => fail(new Error('media-network-error')),
          onabort: () => fail(new Error('media-aborted')),
          onload: (response) => {
            if (settled) return;
            const status = Number(response?.status || 0);
            if (status < 200 || status >= 300) return fail(new Error(`media-http-${status}`));
            if (!mediaFetchUrlAllowed(response?.finalUrl || url.href)) return fail(new Error('media-redirect-not-allowed'));
            const buffer = response.response;
            const size = buffer?.byteLength || 0;
            if (!size || size > APP.mediaPackageMaxFileBytes) return fail(new Error(size ? 'media-too-large' : 'media-empty'));
            const contentTypeHeader = String(response.responseHeaders || '')
              .split(/\r?\n/)
              .find((line) => /^content-type\s*:/i.test(line));
            const mime = contentTypeHeader?.split(':').slice(1).join(':').trim().split(';', 1)[0] || 'application/octet-stream';
            const safeMime = safeImageMime(mime);
            if (!safeMime) return fail(new Error('media-not-safe-image'));
            settled = true;
            resolve(new Blob([buffer], { type: safeMime }));
          },
        });
      } catch (error) {
        fail(error);
      }
    });
  }

  async function prepareCapturePackage(capture) {
    const baseFiles = captureShareFiles(capture);
    const files = [...baseFiles];
    const warnings = [];
    const manifestMedia = [];
    let totalBytes = baseFiles.reduce((sum, file) => sum + Number(file.size || 0), 0);
    const mediaItems = collectCaptureImageMedia(capture);

    for (let index = 0; index < mediaItems.length; index += 1) {
      const media = mediaItems[index];
      if (totalBytes >= APP.mediaPackageMaxTotalBytes) {
        warnings.push('package-total-limit');
        break;
      }
      try {
        const blob = await fetchImageBlob(media.sourceUrl);
        if (totalBytes + blob.size > APP.mediaPackageMaxTotalBytes) {
          warnings.push(`media-${index + 1}:package-total-limit`);
          break;
        }
        const extension = extensionForMime(blob.type);
        const fileName = `media-${String(index + 1).padStart(2, '0')}${extension}`;
        const file = new File([blob], fileName, { type: blob.type });
        files.push(file);
        totalBytes += file.size;
        manifestMedia.push({
          file: fileName,
          sourceUrl: media.sourceUrl,
          type: media.type,
          mime: blob.type,
          bytes: blob.size,
          alt: media.alt || null,
          width: media.width || null,
          height: media.height || null,
        });
      } catch (error) {
        warnings.push(`media-${index + 1}:${error?.message || 'failed'}`);
      }
    }

    const manifest = {
      schema: 'social-capture-package/v1',
      source: capture.focal.url,
      platform: capture.platform,
      preparedAt: new Date().toISOString(),
      media: manifestMedia,
      warnings,
    };
    const manifestFile = new File([JSON.stringify(manifest, null, 2)], 'package-manifest.json', { type: 'application/json;charset=utf-8' });
    if (totalBytes + manifestFile.size <= APP.mediaPackageMaxTotalBytes) {
      files.push(manifestFile);
      totalBytes += manifestFile.size;
    } else {
      warnings.push('manifest:package-total-limit');
    }

    return {
      schema: 'social-capture-package/v1',
      capture,
      files,
      imageFileCount: manifestMedia.length,
      warnings,
      totalBytes,
      preparedAt: manifest.preparedAt,
    };
  }

  function formatBytes(bytes) {
    const size = Number(bytes || 0);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function canNativeShareFiles(files) {
    if (!files?.length || typeof navigator.canShare !== 'function') return false;
    try { return navigator.canShare({ files }); } catch { return false; }
  }

  async function shareCaptureToApps(capture) {
    if (!capture) return { ok: false };
    const files = captureShareFiles(capture);
    const summary = captureStatusSummary(capture);
    const title = `Social capture · ${capture.platformName}`;

    // File sharing is preferred on Android because AI/chat apps can receive the
    // structured .json and readable .md as real attachments. Media URLs and alt
    // text remain inside the capture model; binary media packaging is separate.
    if (canNativeShareFiles(files)) {
      const result = await nativeShare({
        title,
        text: summary ? `Social post capture · ${summary}` : 'Social post capture',
        files,
      });
      if (result.ok || result.cancelled) return result;
    }

    return nativeShare({
      title,
      text: renderCaptureText(capture),
      url: capture.focal.url,
    });
  }

  async function sharePreparedPackage(prepared) {
    if (!prepared?.files?.length) return { ok: false };
    const title = `Social capture · ${prepared.capture.platformName}`;
    const statusText = prepared.warnings.length
      ? `Prepared capture · ${prepared.warnings.length} media warning(s)`
      : 'Prepared social capture';

    if (canNativeShareFiles(prepared.files)) {
      return nativeShare({ title, text: statusText, files: prepared.files });
    }

    // Some Android targets reject mixed image + JSON/Markdown MIME sets even
    // though they accept images. Preserve the capture as text in that fallback.
    const imageFiles = prepared.files.filter((file) => String(file.type || '').startsWith('image/'));
    if (imageFiles.length && canNativeShareFiles(imageFiles)) {
      return nativeShare({
        title,
        text: renderCaptureText(prepared.capture),
        url: prepared.capture.focal.url,
        files: imageFiles,
      });
    }

    return { ok: false, unsupported: true };
  }

  // ---------- Evidence-oriented archive snapshots ----------

  function archiveBaseName(capture) {
    const author = safeFilePart(capture?.focal?.author?.handle || capture?.focal?.author?.displayName, 'post');
    const postId = safeFilePart(capture?.focal?.id, 'snapshot');
    return `${safeFilePart(capture?.platform, 'social')}-${author}-${postId}`;
  }

  async function fileSha256Record(file, role, extra = {}) {
    const buffer = await file.arrayBuffer();
    const sha256 = await CORE.sha256Hex(buffer);
    return {
      file: file.name,
      role,
      sha256: `sha256:${sha256}`,
      bytes: file.size,
      mime: String(file.type || 'application/octet-stream').split(';', 1)[0],
      ...extra,
    };
  }

  async function prepareArchiveSnapshot(capture, { includeMedia = false } = {}) {
    if (!capture || typeof File === 'undefined') throw new Error('archive-files-unavailable');
    if (typeof CORE.stableJsonStringify !== 'function' || typeof CORE.sha256Hex !== 'function') throw new Error('archive-crypto-unavailable');

    // Canonicalization is deterministic key ordering for integrity hashing. It
    // does not claim authenticity or trusted timestamping.
    const canonicalJson = CORE.stableJsonStringify(capture);
    const captureHashHex = await CORE.sha256Hex(canonicalJson);
    const base = archiveBaseName(capture);
    const canonicalFile = new File([canonicalJson], `${base}.canonical.json`, { type: 'application/json;charset=utf-8' });
    const readableFile = new File([renderCaptureText(capture)], `${base}.md`, { type: 'text/markdown;charset=utf-8' });

    const files = [canonicalFile, readableFile];
    const records = [
      await fileSha256Record(canonicalFile, 'canonical-capture'),
      await fileSha256Record(readableFile, 'readable-capture'),
    ];
    const warnings = [];
    let totalBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);

    if (includeMedia) {
      const mediaItems = collectCaptureImageMedia(capture);
      for (let index = 0; index < mediaItems.length; index += 1) {
        const media = mediaItems[index];
        if (totalBytes >= APP.mediaPackageMaxTotalBytes) {
          warnings.push('package-total-limit');
          break;
        }
        try {
          const blob = await fetchImageBlob(media.sourceUrl);
          if (totalBytes + blob.size > APP.mediaPackageMaxTotalBytes) {
            warnings.push(`media-${index + 1}:package-total-limit`);
            break;
          }
          const extension = extensionForMime(blob.type);
          const fileName = `media-${String(index + 1).padStart(2, '0')}${extension}`;
          const file = new File([blob], fileName, { type: blob.type });
          files.push(file);
          totalBytes += file.size;
          records.push(await fileSha256Record(file, 'media', {
            sourceUrl: media.sourceUrl,
            mediaType: media.type,
            alt: media.alt || null,
            width: media.width || null,
            height: media.height || null,
          }));
        } catch (error) {
          warnings.push(`media-${index + 1}:${error?.message || 'failed'}`);
        }
      }
    }

    const createdAt = new Date().toISOString();
    const manifest = {
      schema: 'social-post-archive/v1',
      archiveCreatedAt: createdAt,
      source: capture.focal.url,
      platform: capture.platform,
      captureSchema: capture.schema,
      canonicalization: 'social-post-tools-json/v1',
      snapshotSha256: `sha256:${captureHashHex}`,
      integrity: {
        algorithm: 'SHA-256',
        scope: 'Exact bytes of files listed in this manifest.',
        note: 'Integrity only. SHA-256 does not prove source authenticity, authorship, account ownership, or publication time.',
      },
      files: records,
      warnings,
    };
    const manifestText = JSON.stringify(manifest, null, 2);
    const manifestFile = new File([manifestText], 'archive-manifest.json', { type: 'application/json;charset=utf-8' });
    const manifestRecord = await fileSha256Record(manifestFile, 'manifest');

    const checksumRecords = [...records, manifestRecord];
    const checksumText = checksumRecords
      .map((record) => `${record.sha256.replace(/^sha256:/, '')}  ${record.file}`)
      .join('\n') + '\n';
    const checksumFile = new File([checksumText], 'SHA256SUMS.txt', { type: 'text/plain;charset=utf-8' });

    if (totalBytes + manifestFile.size + checksumFile.size > APP.mediaPackageMaxTotalBytes) {
      throw new Error('archive-package-too-large');
    }
    files.push(manifestFile, checksumFile);
    totalBytes += manifestFile.size + checksumFile.size;

    return {
      schema: 'social-post-archive/v1',
      capture,
      files,
      manifest,
      snapshotSha256: manifest.snapshotSha256,
      warnings,
      totalBytes,
      preparedAt: createdAt,
      includeMedia,
    };
  }

  async function shareArchiveSnapshot(prepared) {
    if (!prepared?.files?.length) return { ok: false };
    const title = `Social archive · ${prepared.capture.platformName}`;
    const text = prepared.warnings?.length
      ? `Archive snapshot · ${prepared.warnings.length} warning(s)`
      : 'Archive snapshot · SHA-256 integrity manifest included';
    if (canNativeShareFiles(prepared.files)) {
      return nativeShare({ title, text, files: prepared.files });
    }
    const essential = prepared.files.filter((file) => /\.canonical\.json$|archive-manifest\.json$|SHA256SUMS\.txt$/.test(file.name));
    if (essential.length && canNativeShareFiles(essential)) {
      return nativeShare({ title, text, files: essential });
    }
    return { ok: false, unsupported: true };
  }

  // ---------- Native menu discovery ----------

  function visibleSurfaces(site) {
    return queryMany(document, site.menu.surfaceSelectors).filter(isVisible);
  }

  function surfaceSnapshot(site) {
    return new Set(visibleSurfaces(site));
  }

  function nativeMenuItems(site, container) {
    if (!(container instanceof Element)) return [];
    const direct = [...container.children]
      .filter((el) => !el.dataset.socialPostToolsAction)
      .filter((el) => matchesAny(el, site.menu.itemSelectors))
      .filter(isVisible);
    if (direct.length >= 2) return direct;

    let fallback = direct;
    for (const selector of site.menu.itemSelectors || []) {
      const items = queryAll(container, selector)
        .filter((el) => !el.dataset.socialPostToolsAction)
        .filter(isVisible);
      if (items.length >= 2) return items;
      if (!fallback.length && items.length) fallback = items;
    }
    return fallback;
  }

  function directChildWithin(container, element) {
    let node = element;
    while (node?.parentElement && node.parentElement !== container) node = node.parentElement;
    return node?.parentElement === container ? node : null;
  }

  function bestMenuContainer(surface, items) {
    if (!(surface instanceof Element) || !items.length) return null;
    if (items.length === 1) return items[0].parentElement || surface;

    const candidates = new Map();
    for (const item of items.slice(0, 12)) {
      let node = item.parentElement;
      let depth = 0;
      while (node && surface.contains(node)) {
        const record = candidates.get(node) || { depth, children: new Set() };
        const child = directChildWithin(node, item);
        if (child) record.children.add(child);
        record.depth = Math.min(record.depth, depth);
        candidates.set(node, record);
        if (node === surface) break;
        node = node.parentElement;
        depth += 1;
      }
    }

    return [...candidates.entries()]
      .filter(([, record]) => record.children.size >= 2)
      .sort((a, b) => {
        const delta = b[1].children.size - a[1].children.size;
        return delta || a[1].depth - b[1].depth;
      })[0]?.[0] || items[0].parentElement || surface;
  }

  function surfaceTemplate(site, surface) {
    for (const selector of site.menu.containerSelectors || []) {
      const containers = [];
      if (matchesAny(surface, [selector])) containers.push(surface);
      containers.push(...queryAll(surface, selector));
      for (const container of containers) {
        const items = nativeMenuItems(site, container);
        if (items.length) return { surface, container, template: items[0], items };
      }
    }

    const items = nativeMenuItems(site, surface);
    if (!items.length) return null;
    const container = bestMenuContainer(surface, items);
    return { surface, container, template: items[0], items };
  }

  function findInjectionTarget(pending) {
    const ranked = visibleSurfaces(pending.site)
      .map((surface, index) => {
        const rect = surface.getBoundingClientRect();
        return {
          surface,
          isNew: !pending.surfaceSnapshot.has(surface),
          distance: Math.hypot(rect.left - pending.triggerRect.left, rect.top - pending.triggerRect.top),
          index,
        };
      })
      .sort((a, b) => (a.isNew !== b.isNew ? (a.isNew ? -1 : 1) : a.distance - b.distance || b.index - a.index));

    for (const candidate of ranked) {
      const found = surfaceTemplate(pending.site, candidate.surface);
      if (found) return found;
    }
    return null;
  }

  // ---------- Native in-place views ----------

  function firstTextNode(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) if (node.textContent.trim()) return node;
    return null;
  }

  function setMenuItemLabel(item, label) {
    const node = firstTextNode(item);
    if (node) node.textContent = label;
    else item.append(Object.assign(document.createElement('span'), { textContent: label }));
  }

  function stripCloneIdentity(item) {
    for (const el of [item, ...queryAll(item, '*')]) {
      el.removeAttribute?.('id');
      el.removeAttribute?.('data-testid');
      el.removeAttribute?.('href');
      el.removeAttribute?.('target');
      el.removeAttribute?.('download');
      el.removeAttribute?.('formaction');
      el.removeAttribute?.('aria-controls');
      for (const attr of [...(el.attributes || [])]) {
        if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      }
    }
  }

  function makeNativeEntry(template, label, onClick, { submenu = false, role = 'menuitem' } = {}) {
    const item = template.cloneNode(true);
    stripCloneIdentity(item);
    item.dataset.socialPostToolsAction = '1';
    item.removeAttribute('href');
    item.removeAttribute('aria-disabled');
    item.removeAttribute('aria-checked');
    item.removeAttribute('aria-haspopup');
    item.removeAttribute('aria-expanded');
    item.setAttribute('role', role);
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', label);
    if (submenu) {
      item.setAttribute('aria-haspopup', 'menu');
      item.setAttribute('aria-expanded', 'false');
    }
    setMenuItemLabel(item, label);

    item.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (item.dataset.busy === '1') return;
      await onClick(item);
    }, true);
    return item;
  }

  function flashEntry(item, temporary, original) {
    if (!state.settings.ui.statusFeedback) return;
    item.dataset.busy = '1';
    item.setAttribute('aria-disabled', 'true');
    setMenuItemLabel(item, temporary);
    setTimeout(() => {
      if (!item.isConnected) return;
      setMenuItemLabel(item, original);
      item.removeAttribute('aria-disabled');
      delete item.dataset.busy;
    }, 900);
  }

  function panelChildren(panel) {
    return [...panel.container.children].filter((el) => el.dataset.socialPostToolsPanel === '1');
  }

  function clearPanelChildren(panel) {
    panelChildren(panel).forEach((el) => el.remove());
  }

  function closePanel({ restoreFocus = false } = {}) {
    const panel = state.panel;
    if (!panel) return;
    panel.container.removeEventListener('keydown', panel.keyHandler, true);
    clearPanelChildren(panel);
    for (const { node, hidden } of panel.originals) if (node.isConnected) node.hidden = hidden;
    panel.anchor?.setAttribute('aria-expanded', 'false');
    state.panel = null;
    if (restoreFocus && panel.anchor?.isConnected) panel.anchor.focus?.();
  }

  function pickTemplate(context, kind = 'default') {
    return context.templates[kind] || context.templates.default;
  }

  function appendPanelEntry(panel, kind, label, onClick, options = {}) {
    const item = makeNativeEntry(pickTemplate(panel.context, kind), label, onClick, options);
    item.dataset.socialPostToolsPanel = '1';
    panel.container.append(item);
    return item;
  }

  function appendPanelInfo(panel, kind, label) {
    const item = pickTemplate(panel.context, kind).cloneNode(true);
    stripCloneIdentity(item);
    item.dataset.socialPostToolsPanel = '1';
    item.setAttribute('role', 'menuitem');
    item.setAttribute('aria-disabled', 'true');
    item.setAttribute('tabindex', '-1');
    item.removeAttribute('href');
    setMenuItemLabel(item, label);
    panel.container.append(item);
    return item;
  }

  function revisionEventLabel(event) {
    const time = formatRevisionTime(event?.at);
    if (event?.kind === 'capture' || event?.changes?.includes('initial')) {
      return `${time} · captured · ${shortFingerprint(event?.fingerprint)}`;
    }
    const summary = (event?.changes || []).map((item) => `${item} changed`).join(', ') || 'changed';
    return `${time} · ${summary} · ${shortFingerprint(event?.fingerprint)}`;
  }

  function renderRevisionHistoryView(panel, record) {
    clearPanelChildren(panel);
    panel.view = 'revisions';
    appendPanelEntry(panel, 'back', TEXT.backToRevisionHistory, async () => renderCaptureView(panel));

    const provenance = record?.provenance;
    if (!provenance) {
      appendPanelInfo(panel, 'capture', 'No revision metadata available');
      return;
    }

    appendPanelInfo(panel, 'capture', `Current snapshot · ${shortFingerprint(provenance.currentFingerprint)}`);
    const events = [...(provenance.events || [])].reverse();
    for (const event of events) appendPanelInfo(panel, 'capture', revisionEventLabel(event));

    const latestEventAt = events.length ? Date.parse(events[0].at || '') : 0;
    const checkedAt = Date.parse(provenance.lastCheckedAt || '');
    if (Number.isFinite(checkedAt) && checkedAt > latestEventAt) {
      appendPanelInfo(panel, 'capture', `${formatRevisionTime(provenance.lastCheckedAt)} · checked · no visible changes`);
    }
  }

  function focusPanelItem(panel, index) {
    const items = panelChildren(panel);
    if (!items.length) return;
    items[(index + items.length) % items.length]?.focus?.();
  }

  function buildCapturePreview(context) {
    return buildSocialCapture(context, 'smart');
  }

  function refreshCaptureFromPage(capture, fallbackContext = null) {
    const site = SITES.find((item) => item.id === capture?.platform) || fallbackContext?.site || currentSite();
    const canonicalUrl = capture?.focal?.url || fallbackContext?.url || null;
    if (!site || !canonicalUrl) return null;

    let context = fallbackContext;
    if (!context || context.site?.id !== site.id || context.url !== canonicalUrl) {
      const current = canonicalize(site, location.href);
      if (current && current === canonicalUrl) context = findHandoffContext(site, canonicalUrl);
    }
    if (!context) return null;

    const requestedMode = ['post', 'smart', 'discussion'].includes(capture?.captureMode) ? capture.captureMode : 'smart';
    const fresh = buildSocialCapture(context, requestedMode);
    const meaningful = fresh && (fresh.focal?.text || fresh.focal?.media?.length || fresh.focal?.publishedAt);
    if (!meaningful) return null;
    rememberCapture(fresh, { revisionKind: 'refresh', previousCapture: capture });
    return fresh;
  }

  async function captureToClipboard(panel, item, mode, originalLabel) {
    const capture = buildSocialCapture(panel.context, mode);
    if (capture) rememberCapture(capture);
    const ok = capture ? await copyCaptureSmart(capture) : false;
    flashEntry(item, ok ? TEXT.captured(captureStatusSummary(capture)) : TEXT.failed, originalLabel);
  }

  function renderRecentCaptureView(panel) {
    clearPanelChildren(panel);
    panel.view = 'recent-capture';
    appendPanelEntry(panel, 'back', TEXT.backToRecentCapture, async () => renderCaptureView(panel));

    const cachedRecord = getCachedCaptureRecord(panel.context.url);
    if (!cachedRecord) {
      appendPanelInfo(panel, 'capture', 'No recent capture for this post.');
      return focusPanelItem(panel, 0);
    }

    const cachedCapture = cachedRecord.capture;
    const freshness = captureFreshness(cachedCapture);
    const resumeLabel = `${TEXT.resumeCachedCapture} · ${freshness.label}${freshness.stale ? ' · stale' : ''}`;
    appendPanelEntry(panel, 'capture', resumeLabel, async () => {
      closePanel();
      showHandoffBar({ capture: cachedCapture, resumed: true });
    });
    appendPanelEntry(panel, 'capture', TEXT.refreshCapture, async (item) => {
      const fresh = refreshCaptureFromPage(cachedCapture, panel.context);
      if (!fresh) return flashEntry(item, TEXT.failed, TEXT.refreshCapture);
      const refreshDiff = compareCaptureSnapshots(cachedCapture, fresh);
      closePanel();
      showHandoffBar({ capture: fresh, refreshed: true, refreshDiff });
    });
    appendPanelEntry(panel, 'capture', TEXT.revisionHistory(provenanceChangeCount(cachedRecord.provenance)), async () => {
      const latest = getCachedCaptureRecord(panel.context.url) || cachedRecord;
      renderRevisionHistoryView(panel, latest);
    }, { submenu: true });
    appendPanelEntry(panel, 'copy', TEXT.forgetCachedCapture, async () => {
      forgetCachedCapture(panel.context.url);
      renderCaptureView(panel);
    });
    focusPanelItem(panel, 0);
  }

  function renderCaptureView(panel) {
    clearPanelChildren(panel);
    panel.view = 'capture';
    appendPanelEntry(panel, 'back', TEXT.backToTools, async () => renderToolsView(panel));

    const preview = buildCapturePreview(panel.context);
    const contextSummary = captureContextSummary(preview);
    const smartLabel = TEXT.captureSmart(contextSummary);
    appendPanelEntry(panel, 'capture', smartLabel, async (item) => captureToClipboard(panel, item, 'smart', smartLabel));
    appendPanelEntry(panel, 'capture', TEXT.capturePost, async (item) => captureToClipboard(panel, item, 'post', TEXT.capturePost));

    if (canCaptureVisibleDiscussion(panel.context)) {
      const label = TEXT.captureDiscussion();
      appendPanelEntry(panel, 'capture', label, async (item) => captureToClipboard(panel, item, 'discussion', label));
    }

    appendPanelEntry(panel, 'share', TEXT.shareSmartCapture, async (item) => {
      const capture = buildSocialCapture(panel.context, 'smart');
      if (capture) rememberCapture(capture);
      const result = await shareCaptureToApps(capture);
      if (result.cancelled || result.ok) return;
      const ok = capture ? await copyCaptureSmart(capture) : false;
      flashEntry(item, ok ? TEXT.copiedInstead : TEXT.failed, TEXT.shareSmartCapture);
    });

    if (getCachedCaptureRecord(panel.context.url)) {
      appendPanelEntry(panel, 'capture', TEXT.recentCapture, async () => renderRecentCaptureView(panel), { submenu: true });
    }
    appendPanelEntry(panel, 'capture', TEXT.captureOptions, async () => renderCaptureOptionsView(panel), { submenu: true });
    focusPanelItem(panel, 0);
  }

  function renderCaptureOptionsView(panel) {
    clearPanelChildren(panel);
    panel.view = 'capture-options';
    appendPanelEntry(panel, 'back', TEXT.backToCapture, async () => renderCaptureView(panel));
    appendPanelEntry(panel, 'copy', TEXT.copyCaptureJson, async (item) => {
      const capture = buildSocialCapture(panel.context, state.settings.capture.defaultMode);
      if (capture) rememberCapture(capture);
      const ok = capture ? await copyText(JSON.stringify(capture, null, 2)) : false;
      flashEntry(item, ok ? TEXT.copied : TEXT.failed, TEXT.copyCaptureJson);
    });
    appendPanelEntry(panel, 'share', TEXT.shareCapture, async (item) => {
      const capture = buildSocialCapture(panel.context, state.settings.capture.defaultMode);
      if (capture) rememberCapture(capture);
      const result = await shareCaptureToApps(capture);
      if (result.cancelled) return;
      if (result.ok) return;
      const ok = capture ? await copyCaptureSmart(capture) : false;
      flashEntry(item, ok ? TEXT.copiedInstead : TEXT.failed, TEXT.shareCapture);
    });

    if (panel.preparedPackage) {
      const prepared = panel.preparedPackage;
      const shareLabel = `${TEXT.sharePreparedPackage(prepared.files.length)} · ${formatBytes(prepared.totalBytes)}`;
      appendPanelEntry(panel, 'share', shareLabel, async (item) => {
        const result = await sharePreparedPackage(prepared);
        if (result.cancelled || result.ok) return;
        const ok = await copyCaptureSmart(prepared.capture);
        flashEntry(item, ok ? TEXT.copiedInstead : TEXT.failed, shareLabel);
      });
      appendPanelEntry(panel, 'copy', TEXT.clearPreparedPackage, async () => {
        panel.preparedPackage = null;
        renderCaptureOptionsView(panel);
      });
    } else if (state.settings.capture.includeMedia) {
      appendPanelEntry(panel, 'capture', TEXT.preparePackage, async (item) => {
        const capture = buildSocialCapture(panel.context, state.settings.capture.defaultMode);
        if (!capture) return flashEntry(item, TEXT.failed, TEXT.preparePackage);
        rememberCapture(capture);
        item.dataset.busy = '1';
        item.setAttribute('aria-disabled', 'true');
        setMenuItemLabel(item, TEXT.preparingPackage);
        try {
          panel.preparedPackage = await prepareCapturePackage(capture);
          renderCaptureOptionsView(panel);
        } catch {
          delete item.dataset.busy;
          item.removeAttribute('aria-disabled');
          flashEntry(item, TEXT.failed, TEXT.preparePackage);
        }
      });
    }

    focusPanelItem(panel, 0);
  }

  function renderArchiveView(panel) {
    clearPanelChildren(panel);
    panel.view = 'archive';
    appendPanelEntry(panel, 'back', TEXT.backToArchive, async () => renderToolsView(panel));
    appendPanelInfo(panel, 'archive', TEXT.archiveIntegrityNote);

    if (panel.preparedArchive) {
      const prepared = panel.preparedArchive;
      appendPanelInfo(panel, 'archive', TEXT.archiveHash(prepared.snapshotSha256));
      appendPanelEntry(panel, 'copy', TEXT.archiveCopyHash, async (item) => {
        const ok = await copyText(prepared.snapshotSha256);
        flashEntry(item, ok ? TEXT.copied : TEXT.failed, TEXT.archiveCopyHash);
      });
      const shareLabel = `${TEXT.archiveShare(prepared.files.length)} · ${formatBytes(prepared.totalBytes)}`;
      appendPanelEntry(panel, 'share', shareLabel, async (item) => {
        const result = await shareArchiveSnapshot(prepared);
        if (result.cancelled || result.ok) return;
        const ok = await copyText(prepared.snapshotSha256);
        flashEntry(item, ok ? TEXT.copiedInstead : TEXT.failed, shareLabel);
      });
      appendPanelEntry(panel, 'copy', TEXT.archiveClear, async () => {
        panel.preparedArchive = null;
        renderArchiveView(panel);
      });
    }

    const prepare = async (item, mode, includeMedia, originalLabel) => {
      const capture = buildSocialCapture(panel.context, mode);
      if (!capture) return flashEntry(item, TEXT.failed, originalLabel);
      item.dataset.busy = '1';
      item.setAttribute('aria-disabled', 'true');
      setMenuItemLabel(item, TEXT.archivePreparing);
      try {
        // Archive preparation is intentionally independent of the short-lived AI
        // capture cache. No archive or media binary is persisted to GM storage.
        panel.preparedArchive = await prepareArchiveSnapshot(capture, { includeMedia });
        renderArchiveView(panel);
      } catch {
        delete item.dataset.busy;
        item.removeAttribute('aria-disabled');
        flashEntry(item, TEXT.failed, originalLabel);
      }
    };

    appendPanelEntry(panel, 'archive', TEXT.archivePrepare, async (item) => prepare(item, 'smart', false, TEXT.archivePrepare));
    if (canCaptureVisibleDiscussion(panel.context)) {
      appendPanelEntry(panel, 'archive', TEXT.archivePrepareDiscussion, async (item) => prepare(item, 'discussion', false, TEXT.archivePrepareDiscussion));
    }
    if (state.settings.capture.includeMedia) {
      appendPanelEntry(panel, 'archive', TEXT.archivePrepareMedia, async (item) => prepare(item, 'smart', true, TEXT.archivePrepareMedia));
    }
    focusPanelItem(panel, 0);
  }

  function enabledActionIds() {
    return state.settings.actions.order.filter((id) => state.settings.actions.enabled[id]);
  }

  function actionEnabled(id) {
    return Boolean(state.settings.actions.enabled[id]);
  }

  async function runToolAction(panel, actionId, item = null) {
    if (actionId === 'copyClean') {
      const ok = await copyText(panel.context.url);
      if (item) flashEntry(item, ok ? TEXT.copied : TEXT.failed, TEXT.copyClean);
      return;
    }
    if (actionId === 'copyAlternate') {
      const target = transformedUrl(panel.context.site, panel.context.url);
      const ok = target ? await copyText(target) : false;
      if (item) flashEntry(item, ok ? TEXT.copied : TEXT.failed, TEXT.copyAlternate);
      return;
    }
    if (actionId === 'telegram') {
      openTelegramShare(panel.context);
      return closePanel();
    }
    if (actionId === 'systemShare') {
      const result = await sharePostToApps(panel.context);
      if (result.cancelled || result.ok) return;
      const target = configuredTargetUrl(panel.context, state.settings.systemShare);
      const ok = await copyText(target);
      if (item) flashEntry(item, ok ? TEXT.copiedInstead : TEXT.failed, TEXT.systemShare);
      return;
    }
    if (actionId === 'openAlternate') {
      const target = transformedUrl(panel.context.site, panel.context.url);
      if (target) window.open(target, '_blank', 'noopener,noreferrer');
      return closePanel();
    }
  }

  function renderMoreToolsView(panel) {
    clearPanelChildren(panel);
    panel.view = 'more-tools';
    appendPanelEntry(panel, 'back', TEXT.backToMoreTools, async () => renderToolsView(panel));

    const moreOrder = enabledActionIds().filter((id) => ['openAlternate', 'telegram', 'copyClean', 'archive'].includes(id));
    for (const actionId of moreOrder) {
      if (actionId === 'archive') {
        appendPanelEntry(panel, 'archive', TEXT.archive, async () => renderArchiveView(panel), { submenu: true });
      } else if (actionId === 'copyClean') {
        appendPanelEntry(panel, 'copy', TEXT.copyClean, async (item) => runToolAction(panel, actionId, item));
      } else if (actionId === 'telegram') {
        appendPanelEntry(panel, 'telegram', TEXT.telegram, async (item) => runToolAction(panel, actionId, item));
      } else if (actionId === 'openAlternate') {
        appendPanelEntry(panel, 'open', TEXT.openAlternate, async (item) => runToolAction(panel, actionId, item));
      }
    }
    focusPanelItem(panel, 0);
  }

  function renderCustomToolsView(panel) {
    clearPanelChildren(panel);
    panel.view = 'tools';
    appendPanelEntry(panel, 'back', TEXT.back, async () => closePanel({ restoreFocus: true }));

    for (const actionId of enabledActionIds()) {
      if (actionId === 'capture') {
        appendPanelEntry(panel, 'capture', TEXT.capture, async () => renderCaptureView(panel), { submenu: true });
      } else if (actionId === 'archive') {
        appendPanelEntry(panel, 'archive', TEXT.archive, async () => renderArchiveView(panel), { submenu: true });
      } else if (['copyClean', 'copyAlternate', 'telegram', 'systemShare', 'openAlternate'].includes(actionId)) {
        const kind = actionId === 'systemShare' ? 'share' : actionId === 'openAlternate' ? 'open' : actionId === 'telegram' ? 'telegram' : 'copy';
        const label = actionId === 'copyClean' ? TEXT.copyClean
          : actionId === 'copyAlternate' ? TEXT.copyAlternate
          : actionId === 'telegram' ? TEXT.telegram
          : actionId === 'systemShare' ? TEXT.systemShare
          : TEXT.openAlternate;
        appendPanelEntry(panel, kind, label, async (item) => runToolAction(panel, actionId, item));
      } else if (actionId === 'settings') {
        appendPanelEntry(panel, 'settings', TEXT.settings, async () => {
          closePanel();
          openSettingsDialog();
        });
      }
    }
    focusPanelItem(panel, 0);
  }

  function renderToolsView(panel) {
    if (state.settings.ui.menuStyle === 'custom') return renderCustomToolsView(panel);

    clearPanelChildren(panel);
    panel.view = 'tools';
    appendPanelEntry(panel, 'back', TEXT.back, async () => closePanel({ restoreFocus: true }));

    if (actionEnabled('capture')) {
      appendPanelEntry(panel, 'capture', TEXT.capture, async () => renderCaptureView(panel), { submenu: true });
    }
    if (actionEnabled('systemShare')) {
      appendPanelEntry(panel, 'share', TEXT.systemShare, async (item) => runToolAction(panel, 'systemShare', item));
    }
    if (actionEnabled('copyAlternate')) {
      appendPanelEntry(panel, 'copy', TEXT.copyAlternate, async (item) => runToolAction(panel, 'copyAlternate', item));
    }

    const hasMore = ['openAlternate', 'telegram', 'copyClean', 'archive'].some(actionEnabled);
    if (hasMore) appendPanelEntry(panel, 'settings', TEXT.moreTools, async () => renderMoreToolsView(panel), { submenu: true });

    if (actionEnabled('settings')) {
      appendPanelEntry(panel, 'settings', TEXT.settings, async () => {
        closePanel();
        openSettingsDialog();
      });
    }
    focusPanelItem(panel, 0);
  }

  function openPanel(anchor, context) {
    if (state.panel?.anchor === anchor) {
      closePanel({ restoreFocus: true });
      return;
    }
    closePanel();

    const originals = [...context.container.children].map((node) => ({ node, hidden: node.hidden }));
    originals.forEach(({ node }) => { node.hidden = true; });

    const panel = {
      anchor,
      container: context.container,
      surface: context.surface,
      context,
      originals,
      view: 'tools',
      keyHandler: null,
    };

    panel.keyHandler = (event) => {
      const items = panelChildren(panel);
      if (!items.length) return;
      const index = items.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (panel.view === 'capture-options') renderCaptureView(panel);
        else if (panel.view === 'capture') renderToolsView(panel);
        else closePanel({ restoreFocus: true });
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusPanelItem(panel, index < 0 ? 0 : index + 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusPanelItem(panel, index < 0 ? items.length - 1 : index - 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        focusPanelItem(panel, 0);
      } else if (event.key === 'End') {
        event.preventDefault();
        focusPanelItem(panel, items.length - 1);
      }
    };

    anchor.setAttribute('aria-expanded', 'true');
    context.container.addEventListener('keydown', panel.keyHandler, true);
    state.panel = panel;
    renderToolsView(panel);
  }

  function buildTemplateSet(site, found) {
    const indices = site.menu.templateIndices || {};
    const pick = (kind) => found.items[indices[kind] ?? indices.default ?? 0] || found.template;
    return {
      default: pick('default'),
      copy: pick('copy'),
      capture: pick('capture'),
      telegram: pick('telegram'),
      share: pick('share'),
      open: pick('open'),
      settings: pick('settings'),
      back: pick('back'),
    };
  }

  function pendingFresh() {
    return state.pending && Date.now() - state.pending.at <= APP.actionTtlMs;
  }

  function injectEntry() {
    if (!pendingFresh()) return false;
    const found = findInjectionTarget(state.pending);
    if (!found?.container || !found.template) return false;

    const existing = [...found.container.children].find((el) => el.dataset.socialPostToolsEntry === '1');
    if (existing) return true;

    const context = {
      site: state.pending.site,
      url: state.pending.url,
      root: state.pending.root,
      surface: found.surface,
      container: found.container,
      templates: buildTemplateSet(state.pending.site, found),
    };

    const entry = makeNativeEntry(context.templates.default, TEXT.entry, (anchor) => openPanel(anchor, context), { submenu: true });
    entry.dataset.socialPostToolsEntry = '1';
    if (state.pending.site.menu.placement === 'prepend') found.container.prepend(entry);
    else found.container.append(entry);
    return true;
  }

  function stopInjectionWatch() {
    state.injectObserver?.disconnect();
    state.injectObserver = null;
    if (state.injectRaf) cancelAnimationFrame(state.injectRaf);
    state.injectRaf = 0;
    clearTimeout(state.injectStopTimer);
    state.injectStopTimer = 0;
    state.injectFallbackTimers.forEach(clearTimeout);
    state.injectFallbackTimers = [];
  }

  function requestInject() {
    if (state.injectRaf || !pendingFresh()) return;
    state.injectRaf = requestAnimationFrame(() => {
      state.injectRaf = 0;
      if (injectEntry()) stopInjectionWatch();
    });
  }

  function startInjectionWatch() {
    stopInjectionWatch();
    const root = document.body || document.documentElement;
    if (!root) return;
    state.injectObserver = new MutationObserver((records) => {
      if (!pendingFresh()) return stopInjectionWatch();
      if (records.some((record) => record.addedNodes?.length)) requestInject();
    });
    state.injectObserver.observe(root, { childList: true, subtree: true });
    state.injectFallbackTimers = APP.injectFallbackMs.map((delay) => setTimeout(requestInject, delay));
    state.injectStopTimer = setTimeout(stopInjectionWatch, APP.injectWatchMs);
  }

  // ---------- Settings dialog ----------

  function builderDisplayLabel(builder) {
    if (!builder) return '';
    if (!builder.builtin) return `${builder.name} — custom`;
    if (builder.group === 'Nitter') return `${builder.name} — alternative reader`;
    if (builder.group === 'Embed fixer') return `${builder.name} — better chat previews`;
    if (builder.id === 'vxthreads') return `${builder.name} — better chat previews`;
    return builder.name;
  }

  function builderOptionsFor(platform) {
    return compatibleBuilders(platform).map((builder) => ({ value: builder.id, label: builderDisplayLabel(builder) }));
  }

  function createEl(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined) continue;
      if (key === 'className') el.className = String(value);
      else if (key === 'text') el.textContent = String(value);
      else if (key === 'value') el.value = String(value);
      else if (key === 'checked') el.checked = Boolean(value);
      else if (key === 'selected') el.selected = Boolean(value);
      else if (key === 'style' && isPlainObject(value)) Object.assign(el.style, value);
      else if (/^on/i.test(key)) continue; // Never create inline event-handler attributes from data.
      else el.setAttribute(key, String(value));
    }
    for (const child of Array.isArray(children) ? children : [children]) {
      if (child == null) continue;
      el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
  }

  function settingsCss() {
    return `
      #spt-settings { width:min(760px,calc(100vw - 32px)); max-height:min(86vh,900px); padding:0; border:1px solid color-mix(in srgb,currentColor 18%,transparent); border-radius:16px; color:CanvasText; background:Canvas; box-shadow:0 24px 80px rgba(0,0,0,.35); }
      #spt-settings::backdrop { background:rgba(0,0,0,.52); backdrop-filter:blur(2px); }
      #spt-settings * { box-sizing:border-box; font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
      .spt-head { position:sticky; top:0; z-index:2; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:18px 20px; background:Canvas; border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent); }
      .spt-head h2 { margin:0; font-size:18px; }
      .spt-body { padding:18px 20px 24px; overflow:auto; max-height:calc(86vh - 68px); }
      .spt-section { margin:0 0 22px; }
      .spt-callout { padding:12px 14px; border:1px solid color-mix(in srgb,currentColor 14%,transparent); border-radius:12px; background:color-mix(in srgb,LinkText 6%,Canvas); margin:0 0 18px; }
      .spt-callout strong { display:block; margin-bottom:4px; }
      .spt-disclosure { margin:10px 0; border:1px solid color-mix(in srgb,currentColor 13%,transparent); border-radius:12px; overflow:hidden; }
      .spt-disclosure > summary { cursor:pointer; list-style:none; min-height:48px; display:flex; align-items:center; padding:12px 14px; font-weight:600; }
      .spt-disclosure > summary::-webkit-details-marker { display:none; }
      .spt-disclosure > summary::after { content:'›'; margin-left:auto; transition:transform .15s ease; }
      .spt-disclosure[open] > summary::after { transform:rotate(90deg); }
      .spt-disclosure-body { padding:2px 14px 14px; border-top:1px solid color-mix(in srgb,currentColor 10%,transparent); }
      .spt-disclosure-body > .spt-section:last-child { margin-bottom:0; }
      .spt-savebar { position:sticky; bottom:-24px; z-index:2; padding:12px 0 4px; background:linear-gradient(to bottom,transparent,Canvas 24%); }
      .spt-section h3 { margin:0 0 10px; font-size:15px; }
      .spt-help { color:color-mix(in srgb,currentColor 62%,transparent); font-size:12px; line-height:1.45; margin:6px 0 12px; }
      .spt-row { display:grid; grid-template-columns:minmax(150px,1fr) minmax(220px,1.5fr); align-items:center; gap:12px; padding:8px 0; }
      .spt-row > label:first-child { font-size:13px; }
      .spt-input,.spt-select,.spt-textarea { width:100%; color:inherit; background:Field; border:1px solid color-mix(in srgb,currentColor 18%,transparent); border-radius:8px; padding:8px 10px; }
      .spt-textarea { min-height:86px; resize:vertical; }
      .spt-check { display:flex; align-items:center; gap:8px; font-size:13px; }
      .spt-actions { display:flex; flex-direction:column; gap:4px; }
      .spt-action-row { display:grid; grid-template-columns:1fr auto; align-items:center; gap:8px; padding:7px 8px; border-radius:8px; background:color-mix(in srgb,currentColor 4%,transparent); }
      .spt-small-buttons { display:flex; gap:4px; }
      .spt-btn { color:inherit; background:ButtonFace; border:1px solid color-mix(in srgb,currentColor 18%,transparent); border-radius:9px; min-height:40px; padding:8px 11px; cursor:pointer; }
      .spt-btn:focus-visible,.spt-input:focus-visible,.spt-select:focus-visible,.spt-textarea:focus-visible,.spt-disclosure > summary:focus-visible { outline:3px solid Highlight; outline-offset:2px; }
      .spt-btn:hover { filter:brightness(1.05); }
      .spt-btn.primary { font-weight:600; }
      .spt-btn.danger { color:#d33; }
      .spt-builder-list { display:flex; flex-direction:column; gap:6px; margin:10px 0 14px; }
      .spt-builder-item { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 10px; border:1px solid color-mix(in srgb,currentColor 12%,transparent); border-radius:8px; }
      .spt-builder-item code { font-size:11px; overflow-wrap:anywhere; }
      .spt-builder-form { padding:12px; border:1px solid color-mix(in srgb,currentColor 14%,transparent); border-radius:10px; }
      .spt-preview { margin-top:8px; padding:9px 10px; border-radius:8px; background:color-mix(in srgb,currentColor 6%,transparent); font:12px ui-monospace,SFMono-Regular,Menlo,monospace; overflow-wrap:anywhere; }
      .spt-foot { display:flex; justify-content:flex-end; gap:8px; margin-top:18px; }
      @media (max-width:620px) { .spt-row{grid-template-columns:1fr}.spt-head{padding:14px}.spt-body{padding:14px}.spt-small-buttons .spt-btn{padding:6px 8px} }
      @media (pointer:coarse) { .spt-btn,.spt-select,.spt-input { min-height:48px; } .spt-check { min-height:48px; } }
    `;
  }

  function ensureSettingsDialog() {
    if (state.settingsDialog?.isConnected) return state.settingsDialog;
    const style = createEl('style', { text: settingsCss() });
    document.documentElement.append(style);
    const dialog = createEl('dialog', { id: 'spt-settings' });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
    document.body.append(dialog);
    state.settingsDialog = dialog;
    return dialog;
  }

  function makeSelect(options, value) {
    const select = createEl('select', { className: 'spt-select' });
    for (const option of options) {
      const el = createEl('option', { value: option.value, text: option.label });
      if (option.value === value) el.selected = true;
      select.append(el);
    }
    return select;
  }

  function exampleCanonical(platform) {
    return platform === 'threads'
      ? 'https://www.threads.com/@example/post/ABC123'
      : 'https://x.com/example/status/1234567890';
  }

  function previewBuilder(rawBuilder, platform, allowInsecureHttp = state.settings?.security?.allowInsecureCustomUrls) {
    const site = SITES.find((item) => item.id === platform);
    const builder = normalizeCustomBuilder({
      id: 'preview',
      name: 'Preview',
      platforms: [platform],
      ...rawBuilder,
    }, { allowInsecureHttp });
    return builder && site ? buildUrl(builder, site, exampleCanonical(platform)) : null;
  }

  function renderSettingsDialog() {
    const dialog = ensureSettingsDialog();
    dialog.replaceChildren();
    const draft = deepClone(state.settings);

    const close = createEl('button', { className: 'spt-btn', type: 'button', text: 'Close' });
    close.addEventListener('click', () => dialog.close());
    const head = createEl('div', { className: 'spt-head' }, [createEl('h2', { text: 'Social Post Tools settings' }), close]);
    const body = createEl('div', { className: 'spt-body' });

    const disclosure = (title, help = '') => {
      const details = createEl('details', { className: 'spt-disclosure' });
      const summary = createEl('summary', { text: title });
      const content = createEl('div', { className: 'spt-disclosure-body' });
      if (help) content.append(createEl('p', { className: 'spt-help', text: help }));
      details.append(summary, content);
      return { details, content };
    };

    const quick = createEl('section', { className: 'spt-section' });
    quick.append(createEl('div', { className: 'spt-callout' }, [
      createEl('strong', { text: 'Ready to use — no setup required' }),
      createEl('span', { text: 'Recommended defaults are already active. Change the two common choices below only if you want to.' }),
    ]));
    quick.append(createEl('h3', { text: 'Quick setup' }));
    const menuStyle = makeSelect([
      { value: 'simple', label: 'Simple menu (recommended)' },
      { value: 'custom', label: 'Custom menu' },
    ], draft.ui.menuStyle);
    menuStyle.id = 'spt-menu-style';
    menuStyle.addEventListener('change', () => { draft.ui.menuStyle = menuStyle.value; });
    quick.append(createEl('div', { className: 'spt-row' }, [
      createEl('label', { text: 'Post tools menu' }),
      menuStyle,
    ]));
    quick.append(createEl('p', { className: 'spt-help', text: 'Simple keeps common actions visible and moves specialist tools under More tools. Custom uses your exact action list and order.' }));
    body.append(quick);

    const menuAdvanced = disclosure('Customize menu', 'Optional. Hide actions you never use or switch to Custom menu for exact ordering.');
    const sharingAdvanced = disclosure('Sharing details', 'Optional Telegram and Android/system-share templates.');
    const aiAdvanced = disclosure('AI capture & archive', 'Smart capture works without configuration. Open this only for cache, media, reply-limit, or archive details.');
    const buildersAdvanced = disclosure('Custom link builders', 'For self-hosted frontends or custom URL templates. Built-in link styles do not require this.');
    const privacyAdvanced = disclosure('Privacy, security & data transfer', 'Tracking cleanup, advanced HTTP exceptions, and portable settings.');

    // Actions
    const actionsSection = createEl('section', { className: 'spt-section' });
    actionsSection.append(createEl('h3', { text: 'Post menu actions' }));
    actionsSection.append(createEl('p', { className: 'spt-help', text: 'Disabled actions are not rendered at all. Use arrows to control the native menu order.' }));
    const actionList = createEl('div', { className: 'spt-actions' });

    const rerenderActions = () => {
      actionList.replaceChildren();
      draft.actions.order.forEach((id, index) => {
        const def = ACTION_DEFS[id];
        if (!def) return;
        const check = createEl('input', { type: 'checkbox', checked: draft.actions.enabled[id] });
        check.addEventListener('change', () => { draft.actions.enabled[id] = check.checked; });
        const label = createEl('label', { className: 'spt-check' }, [check, def.label]);
        const up = createEl('button', { className: 'spt-btn', type: 'button', text: '↑' });
        const down = createEl('button', { className: 'spt-btn', type: 'button', text: '↓' });
        up.disabled = index === 0;
        down.disabled = index === draft.actions.order.length - 1;
        up.addEventListener('click', () => {
          [draft.actions.order[index - 1], draft.actions.order[index]] = [draft.actions.order[index], draft.actions.order[index - 1]];
          rerenderActions();
        });
        down.addEventListener('click', () => {
          [draft.actions.order[index], draft.actions.order[index + 1]] = [draft.actions.order[index + 1], draft.actions.order[index]];
          rerenderActions();
        });
        actionList.append(createEl('div', { className: 'spt-action-row' }, [label, createEl('div', { className: 'spt-small-buttons' }, [up, down])]));
      });
    };
    rerenderActions();
    actionsSection.append(actionList);
    menuAdvanced.content.append(actionsSection);

    // Links
    const linksSection = createEl('section', { className: 'spt-section' });
    linksSection.append(createEl('h3', { text: 'Link sharing' }));
    linksSection.append(createEl('p', { className: 'spt-help', text: 'Choose what kind of link Post tools should copy/share. The defaults work immediately; no account or health check is required.' }));

    for (const platform of ['x', 'threads']) {
      const select = makeSelect(builderOptionsFor(platform), draft.links[platform].builderId);
      select.addEventListener('change', () => { draft.links[platform].builderId = select.value; });
      linksSection.append(createEl('div', { className: 'spt-row' }, [createEl('label', { text: platform === 'x' ? 'X link style' : 'Threads link style' }), select]));
    }
    body.append(linksSection);

    // Telegram
    const tgSection = createEl('section', { className: 'spt-section' });
    tgSection.append(createEl('h3', { text: 'Telegram' }));
    tgSection.append(createEl('p', { className: 'spt-help', text: 'Uses Telegram\'s interactive share URL. No bot token is stored.' }));

    const tgSources = [
      { value: 'selected', label: 'Selected alternate link' },
      { value: 'clean', label: 'Clean source link' },
      ...builderRegistry().map((builder) => ({ value: builder.id, label: `Builder · ${builder.name}` })),
    ];
    const tgSource = makeSelect(tgSources, draft.telegram.linkSource);
    tgSource.addEventListener('change', () => { draft.telegram.linkSource = tgSource.value; });
    tgSection.append(createEl('div', { className: 'spt-row' }, [createEl('label', { text: 'Link source' }), tgSource]));

    const template = createEl('textarea', { className: 'spt-textarea', value: draft.telegram.template });
    template.addEventListener('input', () => { draft.telegram.template = template.value; });
    tgSection.append(createEl('div', { className: 'spt-row' }, [createEl('label', { text: 'Message template' }), template]));
    tgSection.append(createEl('p', { className: 'spt-help', text: 'Variables: {author}, {handle}, {text}, {url}, {sourceUrl}, {platform}, {publishedAt}, {mediaCount}' }));

    const maxText = createEl('input', { className: 'spt-input', type: 'number', min: '0', max: '4000', value: draft.telegram.maxText });
    maxText.addEventListener('input', () => { draft.telegram.maxText = clampInt(maxText.value, 0, 4000, 700); });
    tgSection.append(createEl('div', { className: 'spt-row' }, [createEl('label', { text: 'Max message characters' }), maxText]));
    sharingAdvanced.content.append(tgSection);

    // Native / Android share
    const shareSection = createEl('section', { className: 'spt-section' });
    shareSection.append(createEl('h3', { text: 'Share to apps' }));
    shareSection.append(createEl('p', { className: 'spt-help', text: 'Uses the browser Web Share API. On Android this opens the native share sheet. If unavailable, the post action falls back to copying the selected link.' }));

    const shareSources = [
      { value: 'selected', label: 'Selected alternate link' },
      { value: 'clean', label: 'Clean source link' },
      ...builderRegistry().map((builder) => ({ value: builder.id, label: `Builder · ${builder.name}` })),
    ];
    const shareSource = makeSelect(shareSources, draft.systemShare.linkSource);
    shareSource.addEventListener('change', () => { draft.systemShare.linkSource = shareSource.value; });
    shareSection.append(createEl('div', { className: 'spt-row' }, [createEl('label', { text: 'Link source' }), shareSource]));

    const shareTemplate = createEl('textarea', { className: 'spt-textarea', value: draft.systemShare.template });
    shareTemplate.addEventListener('input', () => { draft.systemShare.template = shareTemplate.value; });
    shareSection.append(createEl('div', { className: 'spt-row' }, [createEl('label', { text: 'Share text template' }), shareTemplate]));
    shareSection.append(createEl('p', { className: 'spt-help', text: 'Variables: {author}, {handle}, {text}, {url}, {sourceUrl}, {platform}, {publishedAt}, {mediaCount}. Some destination apps may combine or ignore the separate URL/text fields.' }));

    const shareMaxText = createEl('input', { className: 'spt-input', type: 'number', min: '0', max: '4000', value: draft.systemShare.maxText });
    shareMaxText.addEventListener('input', () => { draft.systemShare.maxText = clampInt(shareMaxText.value, 0, 4000, 700); });
    shareSection.append(createEl('div', { className: 'spt-row' }, [createEl('label', { text: 'Max share text characters' }), shareMaxText]));
    sharingAdvanced.content.append(shareSection);

    // Capture
    const capSection = createEl('section', { className: 'spt-section' });
    capSection.append(createEl('h3', { text: 'AI capture' }));
    capSection.append(createEl('p', { className: 'spt-help', text: 'Smart capture includes the selected post, media references, quote/repost context, but not comments. Visible discussion is always opt-in. Capture options can prepare actual image files for Android/system sharing.' }));

    const mediaCheck = createEl('input', { type: 'checkbox', checked: draft.capture.includeMedia });
    mediaCheck.addEventListener('change', () => { draft.capture.includeMedia = mediaCheck.checked; });
    capSection.append(createEl('div', { className: 'spt-row' }, [createEl('label', { text: 'Include media' }), createEl('label', { className: 'spt-check' }, [mediaCheck, 'Include image/video references'])]));

    const richImagesCheck = createEl('input', { type: 'checkbox', checked: draft.capture.richHtmlImages });
    richImagesCheck.addEventListener('change', () => { draft.capture.richHtmlImages = richImagesCheck.checked; });
    capSection.append(createEl('div', { className: 'spt-row' }, [createEl('label', { text: 'Rich clipboard images' }), createEl('label', { className: 'spt-check' }, [richImagesCheck, 'Embed remote <img> references when copying rich HTML (privacy-sensitive)'])]));

    const metricsCheck = createEl('input', { type: 'checkbox', checked: draft.capture.includeMetrics });
    metricsCheck.addEventListener('change', () => { draft.capture.includeMetrics = metricsCheck.checked; });
    capSection.append(createEl('div', { className: 'spt-row' }, [createEl('label', { text: 'Include metrics' }), createEl('label', { className: 'spt-check' }, [metricsCheck, 'Likes/replies/reposts/views when available'])]));

    const cacheCheck = createEl('input', { type: 'checkbox', checked: draft.capture.cacheEnabled });
    cacheCheck.addEventListener('change', () => { draft.capture.cacheEnabled = cacheCheck.checked; });
    capSection.append(createEl('div', { className: 'spt-row' }, [createEl('label', { text: 'Recent capture cache' }), createEl('label', { className: 'spt-check' }, [cacheCheck, 'Keep short-lived captures in userscript storage for refresh/app-switch resume'])]));

    const cacheTtl = createEl('input', { className: 'spt-input', type: 'number', min: '1', max: '120', value: draft.capture.cacheTtlMinutes });
    cacheTtl.addEventListener('input', () => {
      draft.capture.cacheTtlMinutes = clampInt(cacheTtl.value, 1, 120, 20);
      draft.capture.freshMinutes = Math.min(draft.capture.freshMinutes, draft.capture.cacheTtlMinutes);
      freshMinutes.max = String(draft.capture.cacheTtlMinutes);
      freshMinutes.value = String(draft.capture.freshMinutes);
    });
    capSection.append(createEl('div', { className: 'spt-row' }, [createEl('label', { text: 'Capture cache TTL (minutes)' }), cacheTtl]));

    const freshMinutes = createEl('input', { className: 'spt-input', type: 'number', min: '1', max: String(draft.capture.cacheTtlMinutes), value: draft.capture.freshMinutes });
    freshMinutes.addEventListener('input', () => { draft.capture.freshMinutes = clampInt(freshMinutes.value, 1, draft.capture.cacheTtlMinutes, Math.min(5, draft.capture.cacheTtlMinutes)); });
    capSection.append(createEl('div', { className: 'spt-row' }, [createEl('label', { text: 'Treat snapshot as fresh (minutes)' }), freshMinutes]));
    capSection.append(createEl('p', { className: 'spt-help', text: 'Cached captures remain usable until TTL, but are marked stale after the freshness window because metrics and remote media references can change. Refresh capture re-reads the current DOM.' }));
    capSection.append(createEl('p', { className: 'spt-help', text: 'Cache is stored with GM storage, never page localStorage. Visible discussion/comments and downloaded media binaries are never persisted.' }));

    const replies = createEl('input', { className: 'spt-input', type: 'number', min: '0', max: '50', value: draft.capture.maxVisibleReplies });
    replies.addEventListener('input', () => { draft.capture.maxVisibleReplies = clampInt(replies.value, 0, 50, 12); });
    capSection.append(createEl('div', { className: 'spt-row' }, [createEl('label', { text: 'Visible reply limit' }), replies]));
    aiAdvanced.content.append(capSection);

    // Archive
    const archiveSection = createEl('section', { className: 'spt-section' });
    archiveSection.append(createEl('h3', { text: 'Archive snapshots' }));
    archiveSection.append(createEl('p', { className: 'spt-help', text: 'Archive is separate from AI capture cache. It creates deterministic canonical JSON, a SHA-256 integrity manifest, SHA256SUMS.txt, and optionally actual image files. Archive packages are kept only in memory until shared/cleared.' }));
    archiveSection.append(createEl('p', { className: 'spt-help', text: 'SHA-256 can detect byte changes. It does not prove that a social post was authentic, that an account owned the content, or that the claimed publication time is trustworthy.' }));
    aiAdvanced.content.append(archiveSection);

    // Security / privacy
    const securitySection = createEl('section', { className: 'spt-section' });
    securitySection.append(createEl('h3', { text: 'Security & privacy' }));
    securitySection.append(createEl('p', { className: 'spt-help', text: 'Native copy sanitization patches the page clipboard method only on X/Threads. Custom builders require HTTPS by default; loopback HTTP is always allowed.' }));

    const sanitizeCopyCheck = createEl('input', { type: 'checkbox', checked: draft.security.sanitizeNativeCopy });
    sanitizeCopyCheck.addEventListener('change', () => { draft.security.sanitizeNativeCopy = sanitizeCopyCheck.checked; });
    securitySection.append(createEl('div', { className: 'spt-row' }, [createEl('label', { text: 'Sanitize native Copy link' }), createEl('label', { className: 'spt-check' }, [sanitizeCopyCheck, 'Strip tracking from copied X/Threads post URLs'])]));

    const insecureCheck = createEl('input', { type: 'checkbox', checked: draft.security.allowInsecureCustomUrls });
    insecureCheck.addEventListener('change', () => { draft.security.allowInsecureCustomUrls = insecureCheck.checked; updatePreview(); });
    securitySection.append(createEl('div', { className: 'spt-row' }, [createEl('label', { text: 'Allow insecure HTTP builders' }), createEl('label', { className: 'spt-check' }, [insecureCheck, 'Allow remote http:// custom builders (not recommended)'])]));
    privacyAdvanced.content.append(securitySection);

    // Custom builders
    const builderSection = createEl('section', { className: 'spt-section' });
    builderSection.append(createEl('h3', { text: 'Custom URL builders' }));
    builderSection.append(createEl('p', { className: 'spt-help', text: 'Use Base replacement for self-hosted frontends, or Template for wrappers. HTTPS is required unless insecure HTTP is explicitly enabled. Credentials in URLs are rejected. Variables: {url}, {encodedUrl}, {origin}, {host}, {path}, {author}, {postId}, {platform}.' }));

    const customList = createEl('div', { className: 'spt-builder-list' });
    const renderCustomList = () => {
      customList.replaceChildren();
      if (!draft.builders.custom.length) customList.append(createEl('div', { className: 'spt-help', text: 'No custom builders.' }));
      for (const builder of draft.builders.custom) {
        const detail = builder.type === 'replace-origin' ? builder.baseUrl : builder.template;
        const remove = createEl('button', { className: 'spt-btn danger', type: 'button', text: 'Delete' });
        remove.addEventListener('click', () => {
          draft.builders.custom = draft.builders.custom.filter((item) => item.id !== builder.id);
          for (const platform of ['x', 'threads']) {
            if (draft.links[platform].builderId === builder.id) draft.links[platform].builderId = DEFAULT_SETTINGS.links[platform].builderId;
          }
          renderSettingsDialogWithDraft(dialog, draft);
        });
        customList.append(createEl('div', { className: 'spt-builder-item' }, [
          createEl('div', {}, [createEl('strong', { text: builder.name }), createEl('div', {}, [createEl('code', { text: detail || '' })])]),
          remove,
        ]));
      }
    };
    renderCustomList();
    builderSection.append(customList);

    const form = createEl('div', { className: 'spt-builder-form' });
    const nameInput = createEl('input', { className: 'spt-input', placeholder: 'My Nitter' });
    const platformSelect = makeSelect([
      { value: 'x', label: 'X' },
      { value: 'threads', label: 'Threads' },
      { value: 'both', label: 'X + Threads' },
    ], 'x');
    const typeSelect = makeSelect([
      { value: 'replace-origin', label: 'Base replacement' },
      { value: 'template', label: 'URL template' },
    ], 'replace-origin');
    const valueInput = createEl('input', { className: 'spt-input', placeholder: 'https://nitter.example.com' });
    const preview = createEl('div', { className: 'spt-preview', text: 'Preview will appear here.' });

    const updatePreview = () => {
      const platform = platformSelect.value === 'both' ? 'x' : platformSelect.value;
      const raw = typeSelect.value === 'replace-origin'
        ? { type: 'replace-origin', baseUrl: valueInput.value }
        : { type: 'template', template: valueInput.value };
      const output = previewBuilder(raw, platform, draft.security.allowInsecureCustomUrls);
      preview.textContent = output || 'Invalid builder.';
      valueInput.placeholder = typeSelect.value === 'replace-origin'
        ? 'https://nitter.example.com'
        : 'https://example.com/view?url={encodedUrl}';
    };
    [platformSelect, typeSelect, valueInput].forEach((el) => el.addEventListener('input', updatePreview));
    [platformSelect, typeSelect].forEach((el) => el.addEventListener('change', updatePreview));

    form.append(
      createEl('div', { className: 'spt-row' }, [createEl('label', { text: 'Name' }), nameInput]),
      createEl('div', { className: 'spt-row' }, [createEl('label', { text: 'Platform' }), platformSelect]),
      createEl('div', { className: 'spt-row' }, [createEl('label', { text: 'Builder type' }), typeSelect]),
      createEl('div', { className: 'spt-row' }, [createEl('label', { text: 'Base / template' }), valueInput]),
      preview,
    );

    const add = createEl('button', { className: 'spt-btn', type: 'button', text: 'Add builder' });
    add.addEventListener('click', () => {
      if (draft.builders.custom.length >= APP.maxCustomBuilders) {
        preview.textContent = `Cannot add: maximum ${APP.maxCustomBuilders} custom builders.`;
        return;
      }
      const platforms = platformSelect.value === 'both' ? ['x', 'threads'] : [platformSelect.value];
      const candidate = normalizeCustomBuilder({
        id: `custom-${crypto?.randomUUID?.() || Date.now()}`,
        name: nameInput.value,
        platforms,
        type: typeSelect.value,
        ...(typeSelect.value === 'replace-origin' ? { baseUrl: valueInput.value } : { template: valueInput.value }),
      }, { allowInsecureHttp: draft.security.allowInsecureCustomUrls });
      if (!candidate) {
        preview.textContent = 'Cannot add: invalid name, platform, or URL.';
        return;
      }
      draft.builders.custom.push(candidate);
      renderSettingsDialogWithDraft(dialog, draft);
    });
    form.append(createEl('div', { className: 'spt-foot' }, [add]));
    builderSection.append(form);
    buildersAdvanced.content.append(builderSection);

    // Portable link settings for the Android companion PWA.
    const portableSection = createEl('section', { className: 'spt-section' });
    portableSection.append(createEl('h3', { text: 'Portable link settings' }));
    portableSection.append(createEl('p', { className: 'spt-help', text: 'Moves builder selection and custom URL builders between this userscript and the Android companion PWA. No capture data or credentials are included.' }));
    const portableText = createEl('textarea', { className: 'spt-textarea', value: '' });
    const exportPortable = createEl('button', { className: 'spt-btn', type: 'button', text: 'Export' });
    exportPortable.addEventListener('click', () => { portableText.value = JSON.stringify(CORE.makePortableLinkSettings(draft), null, 2); });
    const importPortable = createEl('button', { className: 'spt-btn', type: 'button', text: 'Import' });
    importPortable.addEventListener('click', () => {
      try {
        const parsed = CORE.sanitizePortableLinkSettings(JSON.parse(portableText.value));
        if (!parsed) throw new Error('Invalid portable settings');
        draft.links = parsed.links;
        draft.builders.custom = parsed.builders.custom;
        draft.security.allowInsecureCustomUrls = parsed.security.allowInsecureCustomUrls;
        renderSettingsDialogWithDraft(dialog, draft);
      } catch { portableText.value = 'Invalid portable settings JSON.'; }
    });
    portableSection.append(portableText, createEl('div', { className: 'spt-foot' }, [exportPortable, importPortable]));
    privacyAdvanced.content.append(portableSection);

    body.append(menuAdvanced.details, sharingAdvanced.details, aiAdvanced.details, buildersAdvanced.details, privacyAdvanced.details);

    const reset = createEl('button', { className: 'spt-btn danger', type: 'button', text: 'Reset defaults' });
    reset.addEventListener('click', () => {
      if (!confirm('Reset Social Post Tools settings?')) return;
      resetSettings();
      renderSettingsDialog();
    });
    const save = createEl('button', { className: 'spt-btn primary', type: 'button', text: 'Save' });
    save.addEventListener('click', () => {
      saveSettings(draft);
      dialog.close();
    });
    body.append(createEl('div', { className: 'spt-foot spt-savebar' }, [reset, save]));

    dialog.append(head, body);
  }

  function renderSettingsDialogWithDraft(dialog, draft) {
    // Persist the in-progress draft into state only for rerendering the custom
    // builder editor; the user still commits with Save.
    const previous = state.settings;
    state.settings = sanitizeSettings(draft);
    renderSettingsDialog();
    // renderSettingsDialog clones state.settings as its draft. Keep that draft
    // alive in the UI, but do not persist it to GM storage until Save.
    state.settings = previous;
    const rerendered = state.settingsDialog;
    if (!rerendered.open) rerendered.showModal();
  }

  function openSettingsDialog() {
    renderSettingsDialog();
    const dialog = state.settingsDialog;
    if (!dialog.open) dialog.showModal();
  }

  // ---------- Android/PWA rich-capture handoff ----------

  function handoffCss() {
    return `
      #spt-handoff { position:fixed; z-index:2147483647; left:50%; bottom:max(14px,env(safe-area-inset-bottom)); transform:translateX(-50%); width:min(600px,calc(100vw - 24px)); color:CanvasText; background:Canvas; border:1px solid color-mix(in srgb,currentColor 18%,transparent); border-radius:14px; box-shadow:0 14px 50px rgba(0,0,0,.34); padding:12px; font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color-scheme:light dark; }
      #spt-handoff * { box-sizing:border-box; font-family:inherit; }
      #spt-handoff .spt-handoff-row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      #spt-handoff .spt-handoff-copy { min-width:0; }
      #spt-handoff .spt-handoff-title { font-size:14px; font-weight:650; line-height:1.25; }
      #spt-handoff .spt-handoff-meta { margin-top:3px; color:color-mix(in srgb,currentColor 62%,transparent); font-size:12px; line-height:1.35; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      #spt-handoff .spt-handoff-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:7px; margin-top:10px; }
      #spt-handoff button { min-height:38px; padding:7px 11px; border-radius:9px; border:1px solid color-mix(in srgb,currentColor 18%,transparent); background:ButtonFace; color:ButtonText; font:inherit; cursor:pointer; }
      #spt-handoff button[data-primary="1"] { font-weight:650; }
      #spt-handoff button:disabled { opacity:.55; cursor:default; }
      @media (max-width:520px) { #spt-handoff { padding:11px; } #spt-handoff .spt-handoff-actions { display:grid; grid-template-columns:1fr 1fr; } #spt-handoff button:last-child { grid-column:1 / -1; } }
    `;
  }

  function closeHandoffBar() {
    state.handoffBar?.remove?.();
    state.handoffBar = null;
  }

  function ensureHandoffStyle() {
    if (document.querySelector('#spt-handoff-style')) return;
    const style = createEl('style', { id: 'spt-handoff-style', text: handoffCss() });
    document.documentElement.append(style);
  }

  function handoffMeta(capture) {
    if (!capture) return '';
    const author = capture.focal?.author?.handle || capture.focal?.author?.displayName || capture.platformName || '';
    const context = captureContextSummary(capture);
    return [author, context].filter(Boolean).join(' · ');
  }

  function showHandoffBar({ capture = null, failed = false, resumed = false, refreshed = false, refreshDiff = null } = {}) {
    if (!document.body) return;
    ensureHandoffStyle();
    closeHandoffBar();

    const bar = createEl('section', { id: 'spt-handoff', role: 'region', 'aria-live': 'polite' });
    const copy = createEl('div', { className: 'spt-handoff-copy' }, [
      createEl('div', { className: 'spt-handoff-title', text: failed ? TEXT.handoffFailed : (refreshed ? TEXT.handoffRefreshed : (resumed ? TEXT.handoffResumed : TEXT.handoffReady)) }),
      createEl('div', {
        className: 'spt-handoff-meta',
        text: failed
          ? 'The source post did not become extractable in time.'
          : (() => {
              const base = handoffMeta(capture) || 'Smart capture prepared locally. No comments were included.';
              if (!capture) return base;
              const freshness = captureFreshness(capture);
              if (refreshed) return `${base} · ${captureDiffSummary(refreshDiff)}`;
              if (resumed && freshness.stale) return `${base} · cached ${freshness.label} · stale snapshot; refresh recommended`;
              if (resumed) return `${base} · cached ${freshness.label}`;
              return base;
            })(),
      }),
    ]);
    bar.append(createEl('div', { className: 'spt-handoff-row' }, [copy]));

    const actions = createEl('div', { className: 'spt-handoff-actions' });
    if (capture && !failed) {
      const copyButton = createEl('button', { type: 'button', text: TEXT.handoffCopy, 'data-primary': '1' });
      copyButton.addEventListener('click', async () => {
        copyButton.disabled = true;
        const ok = await copyCaptureSmart(capture);
        if (ok) clearResumeTicket(capture?.focal?.url || null);
        copyButton.textContent = ok ? TEXT.copied : TEXT.failed;
        setTimeout(() => {
          if (!copyButton.isConnected) return;
          copyButton.disabled = false;
          copyButton.textContent = TEXT.handoffCopy;
        }, 900);
      });
      const shareButton = createEl('button', { type: 'button', text: TEXT.handoffShare });
      shareButton.addEventListener('click', async () => {
        shareButton.disabled = true;
        const result = await shareCaptureToApps(capture);
        if (result.cancelled) {
          shareButton.disabled = false;
          return;
        }
        if (result.ok) clearResumeTicket(capture?.focal?.url || null);
        if (!result.ok) {
          const ok = await copyCaptureSmart(capture);
          if (ok) clearResumeTicket(capture?.focal?.url || null);
          shareButton.textContent = ok ? TEXT.copiedInstead : TEXT.failed;
          setTimeout(() => {
            if (!shareButton.isConnected) return;
            shareButton.disabled = false;
            shareButton.textContent = TEXT.handoffShare;
          }, 900);
          return;
        }
        shareButton.disabled = false;
      });
      actions.append(copyButton, shareButton);

      const freshness = captureFreshness(capture);
      if (resumed || freshness.stale) {
        const refreshButton = createEl('button', { type: 'button', text: TEXT.refreshCapture });
        refreshButton.addEventListener('click', () => {
          refreshButton.disabled = true;
          const fresh = refreshCaptureFromPage(capture);
          if (!fresh) {
            refreshButton.textContent = TEXT.failed;
            setTimeout(() => {
              if (!refreshButton.isConnected) return;
              refreshButton.disabled = false;
              refreshButton.textContent = TEXT.refreshCapture;
            }, 900);
            return;
          }
          clearResumeTicket(capture?.focal?.url || null);
          const refreshDiff = compareCaptureSnapshots(capture, fresh);
          showHandoffBar({ capture: fresh, refreshed: true, refreshDiff });
        });
        actions.append(refreshButton);
      }
    }
    const dismiss = createEl('button', { type: 'button', text: TEXT.handoffDismiss });
    dismiss.addEventListener('click', () => {
      clearResumeTicket(capture?.focal?.url || null);
      closeHandoffBar();
    });
    actions.append(dismiss);
    bar.append(actions);
    document.body.append(bar);
    state.handoffBar = bar;
  }

  function handoffCandidateSelector(site, canonicalUrl) {
    const parts = postParts(site, canonicalUrl);
    if (!parts.postId) return null;
    if (site.id === 'x') return `a[href*="/status/${parts.postId}"]`;
    const parsed = parseUrl(canonicalUrl);
    return parsed?.pathname?.startsWith('/t/')
      ? `a[href*="/t/${parts.postId}"]`
      : `a[href*="/post/${parts.postId}"]`;
  }

  function findHandoffContext(site, canonicalUrl) {
    if (!site || !canonicalUrl) return null;
    const selector = handoffCandidateSelector(site, canonicalUrl);
    const candidates = selector ? queryAll(document, selector) : [];
    for (const link of candidates) {
      if (canonicalize(site, link.href) !== canonicalUrl) continue;
      const root = closestBySelectors(link, site.content.ownershipRootSelectors || site.content.rootSelectors || []);
      if (root) return { site, url: canonicalUrl, root };
    }

    // Detail-page fallback for layouts where the canonical permalink is late to
    // render. Require the root itself to resolve to the requested canonical URL.
    for (const root of queryMany(document, site.content.rootSelectors || [])) {
      if (findCanonicalLinkIn(site, root) === canonicalUrl) return { site, url: canonicalUrl, root };
    }
    return null;
  }

  function stopHandoffWatch() {
    state.handoffObserver?.disconnect?.();
    state.handoffObserver = null;
    if (state.handoffStopTimer) clearTimeout(state.handoffStopTimer);
    if (state.handoffScanTimer) clearTimeout(state.handoffScanTimer);
    state.handoffStopTimer = 0;
    state.handoffScanTimer = 0;
  }

  function scheduleHandoffScan(delay = APP.handoffMutationDebounceMs) {
    if (!state.handoff || state.handoffScanTimer) return;
    state.handoffScanTimer = setTimeout(() => {
      state.handoffScanTimer = 0;
      scanHandoff();
    }, delay);
  }

  function scanHandoff() {
    const handoff = state.handoff;
    if (!handoff) return;
    const site = SITES.find((item) => item.id === handoff.platform) || currentSite();
    if (!site || canonicalize(site, location.href) !== handoff.canonicalUrl) {
      stopHandoffWatch();
      state.handoff = null;
      return;
    }
    const context = findHandoffContext(site, handoff.canonicalUrl);
    if (!context) return;
    const capture = buildSocialCapture(context, handoff.mode || 'smart');
    const meaningful = capture && (capture.focal?.text || capture.focal?.media?.length || capture.focal?.publishedAt);
    if (!meaningful) return;

    stopHandoffWatch();
    state.handoff = null;
    rememberCapture(capture, { armResume: true });
    showHandoffBar({ capture });
  }

  function startHandoffWatch() {
    if (!state.handoff || !document.documentElement) return;
    scanHandoff();
    if (!state.handoff) return;
    state.handoffObserver = new MutationObserver(() => scheduleHandoffScan());
    state.handoffObserver.observe(document.documentElement, { childList: true, subtree: true });
    state.handoffStopTimer = setTimeout(() => {
      if (!state.handoff) return;
      stopHandoffWatch();
      state.handoff = null;
      showHandoffBar({ failed: true });
    }, APP.handoffWatchMs);
    for (const delay of [120, 350, 900, 1800, 3600, 6500]) setTimeout(() => scheduleHandoffScan(0), delay);
  }

  // ---------- Event/controller ----------

  function onDocumentClick(event) {
    const target = event.composedPath?.().find((node) => node instanceof Element) || event.target;
    if (state.panel && !state.panel.surface?.contains?.(target)) closePanel();

    const site = state.site || currentSite();
    if (!site) return;
    const trigger = findShareTrigger(site, target);
    if (!trigger) return;
    const post = resolvePostContext(site, trigger);
    if (!post) return;

    closePanel();
    state.pending = {
      site,
      url: post.url,
      root: post.root,
      at: Date.now(),
      triggerRect: trigger.getBoundingClientRect(),
      surfaceSnapshot: surfaceSnapshot(site),
    };
    startInjectionWatch();
  }

  function start() {
    state.site = state.site || currentSite();
    state.settings = state.settings || loadSettings();
    installClipboardSanitizer();
    document.addEventListener('click', onDocumentClick, true);
    startHandoffWatch();
    if (!state.handoff) {
      const resumedCapture = consumeResumeCaptureForCurrentPage();
      if (resumedCapture) showHandoffBar({ capture: resumedCapture, resumed: true });
    }
    try {
      if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('Social Post Tools settings', openSettingsDialog);
    } catch {}
  }

  state.site = currentSite();
  state.settings = loadSettings();
  installClipboardSanitizer();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
