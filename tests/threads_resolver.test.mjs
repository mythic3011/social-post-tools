import assert from 'node:assert/strict';
import {
  MAX_REQUEST_BYTES,
  canonicalThreadsUrl,
  validShareAlias,
  metadataCanonical,
  readJsonBody,
  resolveThreadsAlias,
  resolveWithCache,
  statusForResolverResult,
  handleRequest,
} from '../edge/threads-resolver/worker.mjs';

const ALLOWED_ORIGIN = 'https://share-tools.mythic3011.com';
const ALIAS = 'https://www.threads.com/share/_l6aKbV0p';

assert.equal(validShareAlias(`${ALIAS}/?xmt=abc`), ALIAS);
assert.equal(validShareAlias('https://evil.example/share/_l6aKbV0p/'), null);
assert.equal(canonicalThreadsUrl('https://threads.com/@alice/post/AbCd123?xmt=tracking#x'), 'https://www.threads.com/@alice/post/AbCd123');
assert.equal(canonicalThreadsUrl('https://www.threads.com/share/AbCd123'), null);
assert.equal(metadataCanonical('<html><head><link href="https://www.threads.com/@bob/post/XYZ?xmt=1" rel="canonical"></head></html>'), 'https://www.threads.com/@bob/post/XYZ');
assert.equal(metadataCanonical('<meta property="og:url" content="https://www.threads.com/@bob/post/XYZ?xmt=1">'), 'https://www.threads.com/@bob/post/XYZ');

{
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push([String(url), options?.redirect]);
    return new Response(null, {
      status: 302,
      headers: { location: 'https://www.threads.com/@alice/post/POST123?xmt=abc' },
    });
  };
  const result = await resolveThreadsAlias(`${ALIAS}/`, { fetchImpl });
  assert.deepEqual(result, {
    ok: true,
    canonicalUrl: 'https://www.threads.com/@alice/post/POST123',
    resolution: 'redirect',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 'manual');
}

{
  const result = await resolveThreadsAlias(ALIAS, {
    fetchImpl: async () => new Response(null, {
      status: 302,
      headers: { location: 'https://evil.example/tracker' },
    }),
  });
  assert.deepEqual(result, { ok: false, error: 'redirect_left_threads' });
}

{
  const result = await resolveThreadsAlias(ALIAS, {
    fetchImpl: async () => new Response(
      '<html><head><meta property="og:url" content="https://www.threads.com/@carol/post/Meta123?xmt=abc"></head></html>',
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
    ),
  });
  assert.deepEqual(result, {
    ok: true,
    canonicalUrl: 'https://www.threads.com/@carol/post/Meta123',
    resolution: 'metadata',
  });
}

{
  const result = await resolveThreadsAlias(ALIAS, {
    fetchImpl: async () => new Response('{"not":"html"}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });
  assert.deepEqual(result, { ok: false, error: 'upstream_not_html' });
  assert.equal(statusForResolverResult(result), 502);
}

{
  const fetchImpl = async (_url, options) => new Promise((_resolve, reject) => {
    const fail = () => reject(new DOMException('aborted', 'AbortError'));
    if (options.signal.aborted) fail();
    else options.signal.addEventListener('abort', fail, { once: true });
  });
  const result = await resolveThreadsAlias(ALIAS, { fetchImpl, timeoutMs: 10 });
  assert.deepEqual(result, { ok: false, error: 'upstream_timeout' });
  assert.equal(statusForResolverResult(result), 504);
}

{
  const wrongType = await readJsonBody(new Request('https://resolver.example/v1/threads/resolve', {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: '{}',
  }));
  assert.deepEqual(wrongType, { ok: false, status: 415, error: 'content_type_must_be_json' });

  const oversized = await readJsonBody(new Request('https://resolver.example/v1/threads/resolve', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': String(MAX_REQUEST_BYTES + 1) },
    body: '{}',
  }));
  assert.deepEqual(oversized, { ok: false, status: 413, error: 'request_too_large' });
}

{
  const store = new Map();
  const cache = {
    async match(request) {
      const response = store.get(request.url);
      return response?.clone();
    },
    async put(request, response) {
      store.set(request.url, response.clone());
    },
  };
  let upstreamCalls = 0;
  const fetchImpl = async () => {
    upstreamCalls += 1;
    return new Response(null, {
      status: 302,
      headers: { location: 'https://www.threads.com/@cached/post/CACHE1' },
    });
  };
  const first = await resolveWithCache(ALIAS, { cache, fetchImpl });
  const second = await resolveWithCache(ALIAS, { cache, fetchImpl });
  assert.equal(first.resolution, 'redirect');
  assert.deepEqual(second, {
    ok: true,
    canonicalUrl: 'https://www.threads.com/@cached/post/CACHE1',
    resolution: 'cache',
  });
  assert.equal(upstreamCalls, 1);
}

{
  let response = await handleRequest(new Request('https://resolver.example/healthz'), {}, {}, { cache: null });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).service, 'social-post-tools-threads-resolver');

  response = await handleRequest(new Request('https://resolver.example/v1/threads/resolve', {
    method: 'POST',
    headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
    body: JSON.stringify({ url: ALIAS }),
  }), {}, {}, { cache: null });
  assert.equal(response.status, 403);

  response = await handleRequest(new Request('https://resolver.example/v1/threads/resolve', {
    method: 'POST',
    headers: { origin: ALLOWED_ORIGIN, 'content-type': 'text/plain' },
    body: JSON.stringify({ url: ALIAS }),
  }), {}, {}, { cache: null });
  assert.equal(response.status, 415);
  assert.equal(response.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN);

  response = await handleRequest(new Request('https://resolver.example/v1/threads/resolve', {
    method: 'POST',
    headers: { origin: ALLOWED_ORIGIN, 'content-type': 'application/json' },
    body: '{bad',
  }), {}, {}, { cache: null });
  assert.equal(response.status, 400);

  response = await handleRequest(new Request('https://resolver.example/v1/threads/resolve', {
    method: 'POST',
    headers: { origin: ALLOWED_ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ url: ALIAS }),
  }), {}, {}, {
    cache: null,
    fetchImpl: async () => new Response(null, {
      status: 302,
      headers: { location: 'https://www.threads.com/@worker/post/OK1' },
    }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    canonicalUrl: 'https://www.threads.com/@worker/post/OK1',
    resolution: 'redirect',
  });
}

console.log('PASS threads-alias-resolver');
