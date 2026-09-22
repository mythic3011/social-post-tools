const THREADS_HOSTS = new Set(['threads.com', 'www.threads.com', 'threads.net', 'www.threads.net']);
const SHARE_PATH = /^\/share\/([A-Za-z0-9_-]+)\/?$/;
const MAX_REDIRECTS = 5;
const MAX_HEAD_BYTES = 262144;
const MAX_REQUEST_BYTES = 4096;
const DEFAULT_UPSTREAM_TIMEOUT_MS = 7000;
const DEFAULT_CACHE_TTL_SECONDS = 6 * 60 * 60;

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function corsHeaders(origin, allowedOrigin) {
  const headers = new Headers();
  if (origin && origin === allowedOrigin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
    headers.set('access-control-allow-methods', 'POST, OPTIONS');
    headers.set('access-control-allow-headers', 'content-type');
    headers.set('access-control-max-age', '600');
  }
  return headers;
}

function canonicalThreadsUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:' || !THREADS_HOSTS.has(url.hostname.toLowerCase())) return null;
  let match = /^\/@([^/]+)\/post\/([^/?#]+)\/?$/i.exec(url.pathname);
  if (match) return `https://www.threads.com/@${match[1]}/post/${match[2]}`;
  match = /^\/t\/([^/?#]+)\/?$/i.exec(url.pathname);
  if (match) return `https://www.threads.com/t/${match[1]}`;
  return null;
}

function validShareAlias(raw) {
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:' || !THREADS_HOSTS.has(url.hostname.toLowerCase())) return null;
  const match = SHARE_PATH.exec(url.pathname);
  if (!match) return null;
  return `https://www.threads.com/share/${match[1]}`;
}

function decodeHtmlAttribute(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function metadataCanonical(html) {
  const tags = String(html || '').match(/<(?:link|meta)\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attrs = {};
    for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(["'])(.*?)\2/gi)) attrs[match[1].toLowerCase()] = decodeHtmlAttribute(match[3]);
    const rel = String(attrs.rel || '').toLowerCase().split(/\s+/);
    if (tag.toLowerCase().startsWith('<link') && rel.includes('canonical')) {
      const candidate = canonicalThreadsUrl(attrs.href);
      if (candidate) return candidate;
    }
    const metaName = String(attrs.property || attrs.name || '').toLowerCase();
    if (tag.toLowerCase().startsWith('<meta') && ['og:url', 'twitter:url'].includes(metaName)) {
      const candidate = canonicalThreadsUrl(attrs.content);
      if (candidate) return candidate;
    }
  }
  return null;
}

async function readPrefix(response, limit = MAX_HEAD_BYTES) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (total < limit) {
      const { value, done } = await reader.read();
      if (done) break;
      const remaining = limit - total;
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      total += chunk.byteLength;
      if (value.byteLength > remaining) break;
    }
  } finally {
    try { await reader.cancel(); } catch {}
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

function timeoutError() {
  const error = new Error('upstream_timeout');
  error.code = 'upstream_timeout';
  return error;
}

async function fetchWithDeadline(fetchImpl, input, init = {}, { signal, timeoutMs = DEFAULT_UPSTREAM_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const cleanup = () => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  };

  try {
    const response = await fetchImpl(input, { ...init, signal: controller.signal });
    return { response, cleanup, didTimeout: () => timedOut };
  } catch (error) {
    cleanup();
    if (timedOut) throw timeoutError();
    throw error;
  }
}

function upstreamIsHtml(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  return !contentType || contentType.includes('text/html') || contentType.includes('application/xhtml+xml');
}

async function resolveThreadsAlias(raw, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_UPSTREAM_TIMEOUT_MS;
  const maxRedirects = Number.isInteger(options.maxRedirects) ? options.maxRedirects : MAX_REDIRECTS;
  let current = validShareAlias(raw);
  if (!current) return { ok: false, error: 'invalid_threads_share_alias' };

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const direct = canonicalThreadsUrl(current);
    if (direct) return { ok: true, canonicalUrl: direct, resolution: 'redirect' };

    const currentUrl = new URL(current);
    if (currentUrl.protocol !== 'https:' || !THREADS_HOSTS.has(currentUrl.hostname.toLowerCase())) {
      return { ok: false, error: 'redirect_left_threads' };
    }

    let opened;
    try {
      opened = await fetchWithDeadline(fetchImpl, current, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent': 'SocialPostTools-Resolver/1.1',
        },
      }, { signal: options.signal, timeoutMs });
    } catch (error) {
      if (error?.code === 'upstream_timeout') return { ok: false, error: 'upstream_timeout' };
      if (options.signal?.aborted) return { ok: false, error: 'request_aborted' };
      return { ok: false, error: 'upstream_network_error' };
    }

    const { response, cleanup, didTimeout } = opened;
    try {
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return { ok: false, error: 'redirect_without_location' };
        const next = new URL(location, current);
        if (next.protocol !== 'https:' || !THREADS_HOSTS.has(next.hostname.toLowerCase())) {
          return { ok: false, error: 'redirect_left_threads' };
        }
        const canonical = canonicalThreadsUrl(next.href);
        if (canonical) return { ok: true, canonicalUrl: canonical, resolution: 'redirect' };
        current = next.href;
        continue;
      }

      if (!response.ok) return { ok: false, error: 'threads_upstream_failed', upstreamStatus: response.status };
      if (!upstreamIsHtml(response)) return { ok: false, error: 'upstream_not_html' };
      const canonicalFromUrl = canonicalThreadsUrl(current);
      if (canonicalFromUrl) return { ok: true, canonicalUrl: canonicalFromUrl, resolution: 'redirect' };
      const prefix = await readPrefix(response);
      if (didTimeout()) return { ok: false, error: 'upstream_timeout' };
      const canonicalFromMeta = metadataCanonical(prefix);
      if (canonicalFromMeta) return { ok: true, canonicalUrl: canonicalFromMeta, resolution: 'metadata' };
      return { ok: false, error: 'canonical_not_found' };
    } catch (error) {
      if (didTimeout() || error?.name === 'AbortError') return { ok: false, error: 'upstream_timeout' };
      return { ok: false, error: 'upstream_read_error' };
    } finally {
      cleanup();
    }
  }
  return { ok: false, error: 'too_many_redirects' };
}

function statusForResolverResult(result) {
  if (result.ok) return 200;
  switch (result.error) {
    case 'invalid_threads_share_alias': return 400;
    case 'canonical_not_found': return 422;
    case 'upstream_timeout': return 504;
    case 'request_aborted': return 499;
    case 'redirect_left_threads':
    case 'redirect_without_location':
    case 'threads_upstream_failed':
    case 'upstream_network_error':
    case 'upstream_not_html':
    case 'upstream_read_error':
    case 'too_many_redirects': return 502;
    default: return 502;
  }
}

async function readJsonBody(request, limit = MAX_REQUEST_BYTES) {
  const type = String(request.headers.get('content-type') || '').toLowerCase();
  if (!type.startsWith('application/json')) return { ok: false, status: 415, error: 'content_type_must_be_json' };
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) return { ok: false, status: 413, error: 'request_too_large' };

  let text;
  try { text = await request.text(); }
  catch { return { ok: false, status: 400, error: 'invalid_body' }; }
  if (new TextEncoder().encode(text).byteLength > limit) return { ok: false, status: 413, error: 'request_too_large' };
  try { return { ok: true, value: JSON.parse(text) }; }
  catch { return { ok: false, status: 400, error: 'invalid_json' }; }
}

function cacheRequestForAlias(alias) {
  const token = SHARE_PATH.exec(new URL(alias).pathname)?.[1] || '';
  return new Request(`https://resolver-cache.invalid/threads/${encodeURIComponent(token)}`, { method: 'GET' });
}

async function resolveWithCache(alias, { cache, ctx, ...options } = {}) {
  const cacheKey = cache ? cacheRequestForAlias(alias) : null;
  if (cache && cacheKey) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const data = await hit.json();
        const canonicalUrl = canonicalThreadsUrl(data?.canonicalUrl);
        if (canonicalUrl) return { ok: true, canonicalUrl, resolution: 'cache' };
      }
    } catch {}
  }

  const result = await resolveThreadsAlias(alias, options);
  if (result.ok && cache && cacheKey) {
    const cached = new Response(JSON.stringify({ canonicalUrl: result.canonicalUrl }), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': `public, max-age=${DEFAULT_CACHE_TTL_SECONDS}`,
      },
    });
    const write = cache.put(cacheKey, cached).catch(() => undefined);
    if (ctx?.waitUntil) ctx.waitUntil(write);
    else await write;
  }
  return result;
}

async function handleRequest(request, env = {}, ctx = {}, options = {}) {
  const allowedOrigin = String(env.ALLOWED_ORIGIN || 'https://share-tools.mythic3011.com').replace(/\/$/, '');
  const origin = request.headers.get('origin') || '';
  const cors = corsHeaders(origin, allowedOrigin);

  if (request.method === 'OPTIONS') {
    if (origin !== allowedOrigin) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: cors });
  }

  const requestUrl = new URL(request.url);
  if (request.method === 'GET' && requestUrl.pathname === '/healthz') {
    return json({ ok: true, service: 'social-post-tools-threads-resolver', version: 2 }, { status: 200 });
  }
  if (request.method !== 'POST' || requestUrl.pathname !== '/v1/threads/resolve') {
    return json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  if (origin !== allowedOrigin) return json({ ok: false, error: 'origin_not_allowed' }, { status: 403 });

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return json({ ok: false, error: parsedBody.error }, { status: parsedBody.status, headers: cors });
  const alias = validShareAlias(parsedBody.value?.url);
  if (!alias) return json({ ok: false, error: 'invalid_threads_share_alias' }, { status: 400, headers: cors });

  const cache = options.cache === undefined ? globalThis.caches?.default : options.cache;
  const result = await resolveWithCache(alias, {
    cache,
    ctx,
    fetchImpl: options.fetchImpl,
    signal: request.signal,
    timeoutMs: options.timeoutMs,
  });
  return json(result, { status: statusForResolverResult(result), headers: cors });
}

export {
  MAX_REQUEST_BYTES,
  DEFAULT_UPSTREAM_TIMEOUT_MS,
  canonicalThreadsUrl,
  validShareAlias,
  metadataCanonical,
  readJsonBody,
  resolveThreadsAlias,
  resolveWithCache,
  statusForResolverResult,
  handleRequest,
};

export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};
