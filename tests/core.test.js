'use strict';
const assert = require('assert');
const Core = require('../src/core/social-post-core.js');

async function main() {

  assert.equal(Core.canonicalize('x', 'https://twitter.com/alice/status/123?s=20&t=abc'), 'https://x.com/alice/status/123');
  assert.equal(Core.canonicalize('threads', 'https://threads.net/@bob/post/Ab_C-9/foo?xmt=track'), 'https://www.threads.com/@bob/post/Ab_C-9');
  assert.equal(Core.canonicalize('x', 'https://evil.example/alice/status/123'), null);
  assert.equal(Core.transformedUrl('x', 'https://x.com/alice/status/123', 'nitter-net'), 'https://nitter.net/alice/status/123');
  assert.equal(Core.transformedUrl('threads', 'https://www.threads.com/@bob/post/AbC', 'vxthreads'), 'https://vxthreads.net/@bob/post/AbC');

  const custom = Core.normalizeCustomBuilder({ name: 'Self', id: 'self', platforms: ['x'], type: 'replace-origin', baseUrl: 'https://n.example' });
  assert(custom);
  assert.equal(Core.buildUrl(custom, 'x', 'https://x.com/a/status/9'), 'https://n.example/a/status/9');
  assert.equal(Core.normalizeCustomBuilder({ name: 'Bad', id: 'bad', platforms: ['x'], type: 'replace-origin', baseUrl: 'javascript:alert(1)' }), null);
  assert.equal(Core.normalizeCustomBuilder({ name: 'Cred', id: 'cred', platforms: ['x'], type: 'replace-origin', baseUrl: 'https://u:p@example.com' }), null);
  assert(Core.normalizeCustomBuilder({ name: 'Loop', id: 'loop', platforms: ['x'], type: 'replace-origin', baseUrl: 'http://127.0.0.1:8080' }));

  let incoming = Core.parseIncomingShare({ text: 'Look https://x.com/a/status/9?s=20' });
  assert.equal(incoming.supported, true);
  assert.equal(incoming.canonicalUrl, 'https://x.com/a/status/9');
  incoming = Core.parseIncomingShare({ url: 'https://example.com/page' });
  assert.equal(incoming.supported, false);
  assert.equal(incoming.sharedUrl, 'https://example.com/page');

  const portable = Core.makePortableLinkSettings({ links: { x: { builderId: 'self' }, threads: { builderId: 'vxthreads' } }, builders: { custom: [custom] }, security: { allowInsecureCustomUrls: false } });
  const restored = Core.sanitizePortableLinkSettings(JSON.parse(JSON.stringify(portable)));
  assert(restored);
  assert.equal(restored.links.x.builderId, 'self');
  assert.equal(restored.builders.custom.length, 1);


  const handoff = Core.makeCaptureHandoffUrl('https://twitter.com/alice/status/123?s=20', { mode: 'smart' });
  assert.equal(handoff, 'https://x.com/alice/status/123#sptCapture=v1&mode=smart');
  const parsedHandoff = Core.parseCaptureHandoff(handoff);
  assert(parsedHandoff);
  assert.equal(parsedHandoff.platform, 'x');
  assert.equal(parsedHandoff.canonicalUrl, 'https://x.com/alice/status/123');
  assert.equal(parsedHandoff.mode, 'smart');
  assert.equal(Core.parseCaptureHandoff('https://evil.example/alice/status/123#sptCapture=v1&mode=smart'), null);
  assert.equal(Core.makeCaptureHandoffUrl('https://x.com/alice/status/123', { mode: 'discussion' }), 'https://x.com/alice/status/123#sptCapture=v1&mode=smart');

  const stableA = Core.stableJsonStringify({ z: 1, a: { y: 2, x: 3 }, list: [{ b: 2, a: 1 }] });
  const stableB = Core.stableJsonStringify({ list: [{ a: 1, b: 2 }], a: { x: 3, y: 2 }, z: 1 });
  assert.equal(stableA, stableB);
  assert.equal(stableA, '{"a":{"x":3,"y":2},"list":[{"a":1,"b":2}],"z":1}');
  assert.equal(await Core.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

  console.log('PASS shared core');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
