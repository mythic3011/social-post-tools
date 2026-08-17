#!/usr/bin/env python3
from __future__ import annotations

import html
import json
import re
import subprocess
import sys
import tempfile
import time
import socket
import os
import shutil
import urllib.request
import websocket
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'dist/social-post-tools.user.js'
FIXTURES = ROOT / 'tests' / 'fixtures'

CASES = [
    {
        'name': 'x-current',
        'file': 'x-current.html',
        'platform': 'x',
        'target': '#share-path',
        'expect': {
            'trigger': True,
            'url': 'https://x.com/Urging898369ia/status/2083264384554639597',
            'focalTextContains': 'How Sol “Calls” a Luna Subagent in Codex Desktop',
            'focalMediaCount': 0,
            'embeddedCount': 0,
            'postModeEmbeddedCount': 0,
            'handle': '@Urging898369ia',
            'publishedAt': '2026-07-31T18:51:49.000Z',
            'views': 11,
        },
    },
    {
        'name': 'x-quote-media-ownership',
        'file': 'x-quote-media.html',
        'platform': 'x',
        'target': '#share-path',
        'expect': {
            'trigger': True,
            'url': 'https://x.com/alice/status/100',
            'focalText': 'Outer post text',
            'focalMediaCount': 1,
            'embeddedCount': 1,
            'embeddedText': 'Quoted post text',
            'embeddedMediaCount': 1,
            'postModeEmbeddedCount': 0,
            'postModeRepost': False,
        },
    },
    {
        'name': 'x-repost-context',
        'file': 'x-repost.html',
        'platform': 'x',
        'target': '#share',
        'expect': {
            'trigger': True,
            'url': 'https://x.com/origin/status/300',
            'focalText': 'Original reposted content',
            'embeddedCount': 0,
            'repost': True,
            'repostActor': '@reposter',
            'postModeRepost': False,
        },
    },
    {
        'name': 'threads-real-sample',
        'file': 'threads-real-sample.html',
        'platform': 'threads',
        'target': 'svg[aria-label="Share"] path',
        'expect': {
            'trigger': True,
            'url': 'https://www.threads.com/@chenkaixi766/post/DcAyVuNkyc-',
            'focalText': '情勒鳥做事了欸',
            'focalMediaCount': 1,
            'embeddedCount': 0,
            'postModeEmbeddedCount': 0,
            'handle': '@chenkaixi766',
            'publishedAt': '2026-08-14T07:33:36.000Z',
        },
    },
    {
        'name': 'threads-quote-media-and-comment-boundary',
        'file': 'threads-quote-media.html',
        'platform': 'threads',
        'target': '#share-path',
        'expect': {
            'trigger': True,
            'url': 'https://www.threads.com/@alice/post/AAA111',
            'focalText': 'Outer Threads post',
            'focalMediaCount': 1,
            'embeddedCount': 1,
            'embeddedText': 'Quoted Threads post',
            'embeddedMediaCount': 1,
            'postModeEmbeddedCount': 0,
            'commentLeak': False,
        },
    },
]


def test_source() -> str:
    src = SOURCE.read_text(encoding='utf-8')
    marker = "  installClipboardSanitizer();\n  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });\n  else start();\n})();"
    replacement = """  if (globalThis.__SPT_TEST_MODE__) {
    state.settings = sanitizeSettings(deepClone(DEFAULT_SETTINGS));
    globalThis.__SPT_TEST__ = {
      site: (id) => SITES.find((site) => site.id === id) || null,
      findShareTrigger,
      resolvePostContext,
      buildSocialCapture,
      extractPostNode,
      extractEmbeddedContext,
      extractRepostContext,
      canonicalize,
      buildUrl,
      builderById,
      renderCaptureText,
      renderCaptureHtml,
      captureShareFiles,
      normalizeCustomBuilder,
      buildUrl,
      createEl,
      mediaFetchUrlAllowed,
      safeImageMime,
      openSettingsDialog,
      prepareCapturePackage,
      prepareArchiveSnapshot,
      findHandoffContext,
      showHandoffBar,
      closeHandoffBar,
      rememberCapture,
      getCachedCapture,
      getCachedCaptureRecord,
      captureFreshness,
      compareCaptureSnapshots,
      snapshotFingerprint,
      provenanceChangeCount,
      refreshCaptureFromPage,
      forgetCachedCapture,
      consumeResumeCaptureForCurrentPage,
    };
    return;
  }

  installClipboardSanitizer();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();"""
    if marker not in src:
        raise RuntimeError('Could not patch test API into userscript')
    return src.replace(marker, replacement)


def assertion_script(case: dict) -> str:
    payload = json.dumps(case, ensure_ascii=False)
    return f"""
<script>
(async () => {{
  const spec = {payload};
  const api = window.__SPT_TEST__;
  const errors = [];
  const eq = (label, actual, expected) => {{ if (actual !== expected) errors.push(`${{label}}: expected ${{JSON.stringify(expected)}}, got ${{JSON.stringify(actual)}}`); }};
  const contains = (label, actual, expected) => {{ if (!String(actual || '').includes(expected)) errors.push(`${{label}}: expected to contain ${{JSON.stringify(expected)}}, got ${{JSON.stringify(actual)}}`); }};

  try {{
    if (!api) throw new Error('test API missing');
    const site = api.site(spec.platform);
    if (!site) throw new Error(`site missing: ${{spec.platform}}`);
    const target = document.querySelector(spec.target);
    if (!target) throw new Error(`target missing: ${{spec.target}}`);
    const trigger = api.findShareTrigger(site, target);
    eq('trigger', Boolean(trigger), spec.expect.trigger);
    if (!trigger) throw new Error('share trigger not resolved');
    const resolved = api.resolvePostContext(site, trigger);
    if (!resolved) throw new Error('post context not resolved');
    eq('url', resolved.url, spec.expect.url);

    const context = {{ site, url: resolved.url, root: resolved.root }};
    const handoffContext = api.findHandoffContext(site, resolved.url);
    eq('handoffContextUrl', handoffContext?.url || null, resolved.url);
    const smart = api.buildSocialCapture(context, 'smart');
    const postOnly = api.buildSocialCapture(context, 'post');
    if (spec.name === 'x-current') {{
      api.showHandoffBar({{ capture: smart }});
      const handoffBar = document.querySelector('#spt-handoff');
      eq('handoffBarVisible', Boolean(handoffBar), true);
      eq('handoffBarCopyAction', [...(handoffBar?.querySelectorAll('button') || [])].some((button) => button.textContent === 'Copy capture'), true);
      eq('handoffBarShareAction', [...(handoffBar?.querySelectorAll('button') || [])].some((button) => button.textContent === 'Share to apps…'), true);
      api.closeHandoffBar();
      eq('handoffBarDismissed', Boolean(document.querySelector('#spt-handoff')), false);

      const cacheCandidate = structuredClone(smart);
      cacheCandidate.discussion.posts = [{{ id:'reply:1', text:'must not persist' }}];
      cacheCandidate.discussion.visiblePosts = [{{ id:'reply:legacy', text:'must not persist either' }}];
      cacheCandidate.discussion.capturedReplyCount = 2;
      eq('captureCacheRemembered', api.rememberCapture(cacheCandidate), true);
      const cached = api.getCachedCapture(smart.focal.url);
      eq('captureCacheRoundTrip', cached?.focal?.url || null, smart.focal.url);
      eq('captureCacheDropsDiscussionPosts', cached?.discussion?.posts?.length ?? null, 0);
      eq('captureCacheDropsLegacyVisiblePosts', cached?.discussion?.visiblePosts?.length ?? null, 0);
      eq('captureCacheMarksDiscussionOmitted', cached?.discussion?.cacheOmitted || false, true);
      let cacheRecord = api.getCachedCaptureRecord(smart.focal.url);
      eq('captureCacheRecordStoredAt', Number.isFinite(cacheRecord?.storedAt), true);
      eq('captureProvenanceSchema', cacheRecord?.provenance?.schema || null, 'social-capture-provenance/v1');
      eq('captureProvenanceInitialEvents', cacheRecord?.provenance?.events?.length || 0, 1);
      eq('captureSnapshotFingerprint', smart.snapshot?.fingerprint || null, api.snapshotFingerprint(smart));
      eq('captureFingerprintAlgorithm', smart.snapshot?.fingerprintAlgorithm || null, 'fnv1a64-noncrypto');
      const freshCapture = structuredClone(smart);
      freshCapture.capturedAt = new Date(Date.now() - 60 * 1000).toISOString();
      eq('captureFreshnessFresh', api.captureFreshness(freshCapture).stale, false);
      const staleCapture = structuredClone(smart);
      staleCapture.capturedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      eq('captureFreshnessStale', api.captureFreshness(staleCapture).stale, true);
      eq('captureSnapshotMetadata', smart.snapshot?.source || null, 'live-dom');
      eq('captureTextWarnsDynamicSnapshot', api.renderCaptureText(smart).includes('metrics and remote media references may have changed'), true);
      const changedCapture = structuredClone(smart);
      changedCapture.capturedAt = new Date(Date.now() + 1000).toISOString();
      changedCapture.focal.text = `${{changedCapture.focal.text || ''}} edited`;
      changedCapture.focal.metrics = {{ ...(changedCapture.focal.metrics || {{}}), likes: 999 }};
      changedCapture.snapshot.fingerprint = api.snapshotFingerprint(changedCapture);
      const snapshotDiff = api.compareCaptureSnapshots(smart, changedCapture);
      eq('captureDiffTextChanged', snapshotDiff.textChanged, true);
      eq('captureDiffMetricsChanged', snapshotDiff.metricsChanged, true);
      eq('captureRevisionRemembered', api.rememberCapture(changedCapture, {{ revisionKind:'refresh', previousCapture:smart }}), true);
      cacheRecord = api.getCachedCaptureRecord(smart.focal.url);
      eq('captureRevisionChangeCount', api.provenanceChangeCount(cacheRecord?.provenance), 1);
      const latestRevision = cacheRecord?.provenance?.events?.at(-1);
      eq('captureRevisionTracksText', latestRevision?.changes?.includes('text') || false, true);
      eq('captureRevisionTracksMetrics', latestRevision?.changes?.includes('metrics') || false, true);
      eq('captureRevisionMetadataNoPostText', JSON.stringify(cacheRecord?.provenance || {{}}).includes('How Sol'), false);

      let previousRevisionCapture = changedCapture;
      for (let i = 0; i < 10; i += 1) {{
        const nextRevisionCapture = structuredClone(previousRevisionCapture);
        nextRevisionCapture.capturedAt = new Date(Date.now() + 2000 + i * 1000).toISOString();
        nextRevisionCapture.focal.metrics = {{ ...(nextRevisionCapture.focal.metrics || {{}}), likes: 1000 + i }};
        nextRevisionCapture.snapshot.fingerprint = api.snapshotFingerprint(nextRevisionCapture);
        api.rememberCapture(nextRevisionCapture, {{ revisionKind:'refresh', previousCapture:previousRevisionCapture }});
        previousRevisionCapture = nextRevisionCapture;
      }}
      cacheRecord = api.getCachedCaptureRecord(smart.focal.url);
      eq('captureRevisionHistoryBounded', (cacheRecord?.provenance?.events?.length || 0) <= 6, true);

      const beforeNoChangeCount = cacheRecord?.provenance?.events?.length || 0;
      const noChangeCapture = structuredClone(previousRevisionCapture);
      noChangeCapture.capturedAt = new Date(Date.now() + 20000).toISOString();
      noChangeCapture.snapshot.fingerprint = api.snapshotFingerprint(noChangeCapture);
      api.rememberCapture(noChangeCapture, {{ revisionKind:'refresh', previousCapture:previousRevisionCapture }});
      cacheRecord = api.getCachedCaptureRecord(smart.focal.url);
      eq('captureRevisionNoNoiseForNoChange', cacheRecord?.provenance?.events?.length || 0, beforeNoChangeCount);
      eq('captureRevisionLastCheckedUpdated', Number.isFinite(Date.parse(cacheRecord?.provenance?.lastCheckedAt || '')), true);

      const mediaQueryA = structuredClone(smart);
      mediaQueryA.focal.media = [{{ type:'image', url:'https://pbs.twimg.com/media/abc.jpg?token=one', alt:'same', width:1, height:1 }}];
      const mediaQueryB = structuredClone(mediaQueryA);
      mediaQueryB.focal.media[0].url = 'https://pbs.twimg.com/media/abc.jpg?token=two';
      eq('captureRevisionIgnoresMediaSignatureQuery', api.compareCaptureSnapshots(mediaQueryA, mediaQueryB).mediaChanged, false);
      api.forgetCachedCapture(smart.focal.url);
      eq('captureCacheForget', api.getCachedCapture(smart.focal.url), null);
    }}
    if (!smart || !postOnly) throw new Error('capture failed');

    const shareFiles = api.captureShareFiles(smart);
    eq('captureShareFileCount', shareFiles.length, 2);
    eq('captureShareMarkdownType', shareFiles[0]?.type || null, 'text/markdown;charset=utf-8');
    eq('captureShareJsonType', shareFiles[1]?.type || null, 'application/json;charset=utf-8');

    if ('focalText' in spec.expect) eq('focalText', smart.focal.text, spec.expect.focalText);
    if ('focalTextContains' in spec.expect) contains('focalText', smart.focal.text, spec.expect.focalTextContains);
    if ('focalMediaCount' in spec.expect) eq('focalMediaCount', smart.focal.media.length, spec.expect.focalMediaCount);
    if ('embeddedCount' in spec.expect) eq('embeddedCount', smart.context.embedded.length, spec.expect.embeddedCount);
    if ('postModeEmbeddedCount' in spec.expect) eq('postModeEmbeddedCount', postOnly.context.embedded.length, spec.expect.postModeEmbeddedCount);
    if ('postModeRepost' in spec.expect) eq('postModeRepost', Boolean(postOnly.context.repost), spec.expect.postModeRepost);
    if ('embeddedText' in spec.expect) eq('embeddedText', smart.context.embedded[0]?.post?.text || null, spec.expect.embeddedText);
    if ('embeddedMediaCount' in spec.expect) eq('embeddedMediaCount', smart.context.embedded[0]?.post?.media?.length ?? null, spec.expect.embeddedMediaCount);
    if ('handle' in spec.expect) eq('handle', smart.focal.author.handle, spec.expect.handle);
    if ('publishedAt' in spec.expect) eq('publishedAt', smart.focal.publishedAt, spec.expect.publishedAt);
    if ('views' in spec.expect) eq('views', smart.focal.metrics.views ?? null, spec.expect.views);
    if ('repost' in spec.expect) eq('repost', Boolean(smart.context.repost), spec.expect.repost);
    if ('repostActor' in spec.expect) eq('repostActor', smart.context.repost?.actor?.handle || null, spec.expect.repostActor);
    if ('commentLeak' in spec.expect) {{
      const text = api.renderCaptureText(smart);
      eq('commentLeak', text.includes('visible comment and must not leak'), spec.expect.commentLeak);
    }}

    // Shared URL regression checks.
    if (spec.platform === 'x') {{
      eq('xCanonicalTracking', api.canonicalize(site, 'https://x.com/alice/status/123?s=20&t=abc'), 'https://x.com/alice/status/123');
      eq('xNitterBuilder', api.buildUrl(api.builderById('nitter-net'), site, 'https://x.com/alice/status/123'), 'https://nitter.net/alice/status/123');
    }} else {{
      eq('threadsCanonicalTracking', api.canonicalize(site, 'https://www.threads.com/@alice/post/ABC123?xmt=tracking'), 'https://www.threads.com/@alice/post/ABC123');
      eq('threadsVxBuilder', api.buildUrl(api.builderById('vxthreads'), site, 'https://www.threads.com/@alice/post/ABC123'), 'https://vxthreads.net/@alice/post/ABC123');
    }}


    if (spec.name === 'x-quote-media-ownership') {{
      eq('richHtmlRemoteImageDefaultOff', api.renderCaptureHtml(smart).includes('<img '), false);
      eq('mediaAllowXcdn', api.mediaFetchUrlAllowed('https://pbs.twimg.com/media/example.jpg'), true);
      eq('mediaRejectOtherHost', api.mediaFetchUrlAllowed('https://example.com/image.jpg'), false);
      eq('mediaRejectSvg', api.safeImageMime('image/svg+xml'), null);
    }}

    if (spec.name === 'x-current') {{
      const remoteHttp = api.normalizeCustomBuilder({{ id:'http-remote', name:'HTTP', platforms:['x'], type:'replace-origin', baseUrl:'http://example.com' }});
      eq('customBuilderRejectRemoteHttp', remoteHttp, null);
      const loopback = api.normalizeCustomBuilder({{ id:'loopback', name:'Local', platforms:['x'], type:'replace-origin', baseUrl:'http://127.0.0.1:3000' }});
      eq('customBuilderAllowLoopbackHttp', Boolean(loopback), true);
      const credentials = api.normalizeCustomBuilder({{ id:'cred', name:'Cred', platforms:['x'], type:'replace-origin', baseUrl:'https://u:p@example.com' }});
      eq('customBuilderRejectCredentials', credentials, null);
      const dynamicHost = api.normalizeCustomBuilder({{ id:'dyn', name:'Dyn', platforms:['x'], type:'template', template:'https://{{author}}.example.com/{{postId}}' }});
      eq('customBuilderRejectDynamicAuthority', dynamicHost, null);
      const textEl = api.createEl('div', {{ text:'visible-setting-label', onclick:'alert(1)' }});
      eq('createElTextContent', textEl.textContent, 'visible-setting-label');
      eq('createElDropsInlineHandler', textEl.hasAttribute('onclick'), false);
      api.openSettingsDialog();
      const settingsDialog = document.querySelector('#spt-settings');
      eq('settingsDialogHeadingVisible', settingsDialog?.querySelector('h2')?.textContent || null, 'Social Post Tools settings');
      eq('settingsQuickSetupVisible', settingsDialog?.textContent.includes('Ready to use — no setup required'), true);
      eq('settingsSimpleMenuDefault', settingsDialog?.querySelector('#spt-menu-style')?.value || null, 'simple');
      const disclosures = [...(settingsDialog?.querySelectorAll('details.spt-disclosure') || [])];
      eq('settingsProgressiveDisclosureCount', disclosures.length >= 5, true);
      eq('settingsAdvancedClosedByDefault', disclosures.every((details) => !details.open), true);
      const closeButton = [...(settingsDialog?.querySelectorAll('button') || [])].find((button) => button.textContent === 'Close');
      eq('settingsCloseButtonVisible', Boolean(closeButton), true);
      closeButton?.click();
      eq('settingsCloseButtonWorks', Boolean(settingsDialog?.open), false);

      const packageCapture = structuredClone(smart);
      const png = new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])], {{ type:'image/png' }});
      const blobUrl = URL.createObjectURL(png);
      packageCapture.focal.media = [{{ type:'image', url:blobUrl, alt:'fixture image', width:1, height:1 }}];
      const prepared = await api.prepareCapturePackage(packageCapture);
      eq('preparedPackageImageCount', prepared.imageFileCount, 1);
      eq('preparedPackageHasManifest', prepared.files.some((file) => file.name === 'package-manifest.json'), true);
      eq('preparedPackageHasImage', prepared.files.some((file) => file.name === 'media-01.png'), true);

      // The CDP fixture uses about:blank, which is not a secure context and
      // therefore has no SubtleCrypto. Production X/Threads pages are HTTPS.
      // The integration path is exposed here, while actual SHA-256 correctness
      // is covered by core.test.js with the standard `abc` vector.
      eq('archiveApiExposed', typeof api.prepareArchiveSnapshot, 'function');
      URL.revokeObjectURL(blobUrl);
    }}
  }} catch (error) {{
    errors.push(error?.stack || String(error));
  }}

  const result = document.createElement('pre');
  result.id = 'spt-test-result';
  result.textContent = JSON.stringify({{ name: spec.name, ok: errors.length === 0, errors }}, null, 2);
  document.body.append(result);
}})();
</script>
"""


def _free_port() -> int:
    sock = socket.socket()
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def _cdp_call(ws, method: str, params: dict | None, call_id: int) -> dict:
    payload = {'id': call_id, 'method': method}
    if params is not None:
        payload['params'] = params
    ws.send(json.dumps(payload))
    while True:
        message = json.loads(ws.recv())
        if message.get('id') == call_id:
            return message


def _cdp_eval(ws, expression: str, call_id: int) -> dict:
    return _cdp_call(ws, 'Runtime.evaluate', {
        'expression': expression,
        'returnByValue': True,
        'awaitPromise': True,
    }, call_id)


def run_case(chromium: str, source: str, case: dict) -> tuple[bool, dict, str]:
    fragment = (FIXTURES / case['file']).read_text(encoding='utf-8')
    base = 'https://www.threads.com/' if case['platform'] == 'threads' else 'https://x.com/'
    doc = f"""<!doctype html><html><head><meta charset=\"utf-8\"><base href=\"{base}\"><style>body{{font-family:sans-serif}} article,[data-pressable-container=\"true\"]{{display:block;padding:4px}}</style></head><body>
<script>window.__SPT_TEST_MODE__ = true;</script>
{fragment}
<script>{source.replace('</script>', '<\\/script>')}</script>
{assertion_script(case)}
</body></html>"""
    with tempfile.TemporaryDirectory(prefix='spt-fixture-') as td:
        debug_port = _free_port()
        profile = Path(td) / 'profile'
        cmd = [
            chromium,
            '--headless=new',
            '--no-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-sync',
            '--metrics-recording-only',
            '--mute-audio',
            '--no-first-run',
            '--remote-allow-origins=*',
            f'--remote-debugging-port={debug_port}',
            f'--user-data-dir={profile}',
            'about:blank',
        ]
        proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        ws = None
        try:
            target = None
            deadline = time.time() + 10
            while time.time() < deadline:
                if proc.poll() is not None:
                    break
                try:
                    with urllib.request.urlopen(f'http://127.0.0.1:{debug_port}/json', timeout=.4) as response:
                        targets = json.load(response)
                    target = next((item for item in targets if item.get('type') == 'page'), None)
                    if target and target.get('webSocketDebuggerUrl'):
                        break
                except Exception:
                    pass
                time.sleep(.1)
            if not target:
                return False, {'name': case['name'], 'ok': False, 'errors': ['CDP page target unavailable']}, ''

            ws = websocket.create_connection(target['webSocketDebuggerUrl'], timeout=5, origin=f'http://127.0.0.1:{debug_port}')
            call_id = 1
            _cdp_call(ws, 'Page.enable', {}, call_id); call_id += 1
            frame_tree = _cdp_call(ws, 'Page.getFrameTree', {}, call_id); call_id += 1
            frame_id = frame_tree['result']['frameTree']['frame']['id']
            set_doc = _cdp_call(ws, 'Page.setDocumentContent', {'frameId': frame_id, 'html': doc}, call_id); call_id += 1
            if 'error' in set_doc:
                return False, {'name': case['name'], 'ok': False, 'errors': [str(set_doc['error'])]}, ''

            result_text = None
            deadline = time.time() + 8
            while time.time() < deadline:
                response = _cdp_eval(ws, "document.querySelector('#spt-test-result')?.textContent || null", call_id)
                call_id += 1
                result_text = response.get('result', {}).get('result', {}).get('value')
                if result_text:
                    break
                time.sleep(.05)
            if not result_text:
                console = _cdp_eval(ws, "document.documentElement.outerHTML.slice(-6000)", call_id)
                tail = console.get('result', {}).get('result', {}).get('value', '')
                return False, {'name': case['name'], 'ok': False, 'errors': ['result marker missing', tail]}, ''
            data = json.loads(result_text)
            return bool(data.get('ok')), data, ''
        finally:
            try:
                if ws:
                    ws.close()
            except Exception:
                pass
            proc.terminate()
            try:
                _, _ = proc.communicate(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.communicate(timeout=2)


def find_browser() -> str | None:
    override = os.environ.get('SPT_BROWSER', '').strip()
    if override:
        path = shutil.which(override) if '/' not in override else override
        if path and Path(path).is_file():
            return str(path)
    for candidate in ('chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'):
        path = shutil.which(candidate)
        if path:
            return path
    for candidate in ('/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'):
        if Path(candidate).is_file():
            return candidate
    return None


def main() -> int:
    chromium = find_browser()
    if not chromium:
        print('SKIP: Chromium/Chrome not found', file=sys.stderr)
        return 77
    source = test_source()
    failures = 0
    for case in CASES:
        ok, data, stderr = run_case(chromium, source, case)
        print(('PASS' if ok else 'FAIL'), data['name'])
        for error in data.get('errors', []):
            print('   ', error)
        if not ok:
            failures += 1
            if stderr.strip():
                print('    chromium:', stderr.strip().splitlines()[-1])
    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(main())
