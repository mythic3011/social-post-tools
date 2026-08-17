const THREADS_HOSTS = new Set(['threads.com', 'www.threads.com', 'threads.net', 'www.threads.net']);
const SHARE_PATH = /^\/share\/([A-Za-z0-9_-]+)\/?$/;
const MAX_REDIRECTS = 5;
const MAX_HEAD_BYTES = 262144;

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
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

async function resolveThreadsAlias(raw) {
  let current = validShareAlias(raw);
  if (!current) return { ok: false, error: 'invalid_threads_share_alias' };

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const direct = canonicalThreadsUrl(current);
    if (direct) return { ok: true, canonicalUrl: direct, resolution: 'redirect' };

    const currentUrl = new URL(current);
    if (currentUrl.protocol !== 'https:' || !THREADS_HOSTS.has(currentUrl.hostname.toLowerCase())) {
      return { ok: false, error: 'redirect_left_threads' };
    }

    const response = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'SocialPostTools-Resolver/1.0',
      },
    });

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

    if (!response.ok) return { ok: false, error: 'threads_upstream_failed' };
    const canonicalFromUrl = canonicalThreadsUrl(current);
    if (canonicalFromUrl) return { ok: true, canonicalUrl: canonicalFromUrl, resolution: 'redirect' };
    const prefix = await readPrefix(response);
    const canonicalFromMeta = metadataCanonical(prefix);
    if (canonicalFromMeta) return { ok: true, canonicalUrl: canonicalFromMeta, resolution: 'metadata' };
    return { ok: false, error: 'canonical_not_found' };
  }
  return { ok: false, error: 'too_many_redirects' };
}

export { canonicalThreadsUrl, validShareAlias, metadataCanonical, resolveThreadsAlias };

export default {
  async fetch(request, env) {
    const allowedOrigin = String(env.ALLOWED_ORIGIN || 'https://share-tools.mythic3011.com').replace(/\/$/, '');
    const origin = request.headers.get('origin') || '';
    const cors = corsHeaders(origin, allowedOrigin);

    if (request.method === 'OPTIONS') {
      if (origin !== allowedOrigin) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors });
    }
    const requestUrl = new URL(request.url);
    if (request.method === 'GET' && requestUrl.pathname === '/healthz') {
      return json({ ok: true, service: 'social-post-tools-threads-resolver' }, { status: 200 });
    }
    if (request.method !== 'POST' || requestUrl.pathname !== '/v1/threads/resolve') return json({ ok: false, error: 'not_found' }, { status: 404 });
    if (origin !== allowedOrigin) return json({ ok: false, error: 'origin_not_allowed' }, { status: 403 });

    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid_json' }, { status: 400, headers: cors }); }
    const alias = validShareAlias(body?.url);
    if (!alias) return json({ ok: false, error: 'invalid_threads_share_alias' }, { status: 400, headers: cors });

    let result;
    try { result = await resolveThreadsAlias(alias); }
    catch { result = { ok: false, error: 'resolver_failed' }; }
    return json(result, { status: result.ok ? 200 : 422, headers: cors });
  },
};
