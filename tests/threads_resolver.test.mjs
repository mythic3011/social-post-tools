import assert from 'node:assert/strict';
import {
  canonicalThreadsUrl,
  validShareAlias,
  metadataCanonical,
  resolveThreadsAlias,
} from '../edge/threads-resolver/worker.mjs';

assert.equal(validShareAlias('https://www.threads.com/share/_l6aKbV0p/?xmt=abc'), 'https://www.threads.com/share/_l6aKbV0p');
assert.equal(validShareAlias('https://evil.example/share/_l6aKbV0p/'), null);
assert.equal(canonicalThreadsUrl('https://threads.com/@alice/post/AbCd123?xmt=tracking#x'), 'https://www.threads.com/@alice/post/AbCd123');
assert.equal(canonicalThreadsUrl('https://www.threads.com/share/AbCd123'), null);
assert.equal(metadataCanonical('<html><head><link href="https://www.threads.com/@bob/post/XYZ?xmt=1" rel="canonical"></head></html>'), 'https://www.threads.com/@bob/post/XYZ');
assert.equal(metadataCanonical('<meta property="og:url" content="https://www.threads.com/@bob/post/XYZ?xmt=1">'), 'https://www.threads.com/@bob/post/XYZ');

const realFetch = globalThis.fetch;
try {
  let calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([String(url), options?.redirect]);
    return new Response(null, {
      status: 302,
      headers: { location: 'https://www.threads.com/@alice/post/POST123?xmt=abc' },
    });
  };
  let result = await resolveThreadsAlias('https://www.threads.com/share/_l6aKbV0p/');
  assert.deepEqual(result, {
    ok: true,
    canonicalUrl: 'https://www.threads.com/@alice/post/POST123',
    resolution: 'redirect',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 'manual');

  globalThis.fetch = async () => new Response(null, {
    status: 302,
    headers: { location: 'https://evil.example/tracker' },
  });
  result = await resolveThreadsAlias('https://www.threads.com/share/_l6aKbV0p/');
  assert.deepEqual(result, { ok: false, error: 'redirect_left_threads' });

  globalThis.fetch = async () => new Response(
    '<html><head><meta property="og:url" content="https://www.threads.com/@carol/post/Meta123?xmt=abc"></head></html>',
    { status: 200, headers: { 'content-type': 'text/html' } },
  );
  result = await resolveThreadsAlias('https://www.threads.com/share/_l6aKbV0p/');
  assert.deepEqual(result, {
    ok: true,
    canonicalUrl: 'https://www.threads.com/@carol/post/Meta123',
    resolution: 'metadata',
  });
} finally {
  globalThis.fetch = realFetch;
}

console.log('PASS threads-alias-resolver');
// v4.3.1 deployment invariant: production worker exposes a health endpoint in addition to the constrained resolver.
