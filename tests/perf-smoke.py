#!/usr/bin/env python3
from __future__ import annotations
import importlib.util
import json
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
runner_path = ROOT / 'tests' / 'run-fixtures.py'
spec = importlib.util.spec_from_file_location('fixture_runner', runner_path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
source = mod.test_source()
chromium = '/usr/bin/chromium'
if not Path(chromium).exists():
    raise SystemExit('SKIP: Chromium unavailable')

body = '''
<article data-testid="tweet">
  <a href="/alice/status/123"><time datetime="2026-08-14T00:00:00.000Z">now</time></a>
  <div data-testid="tweetText">hello</div>
  <button id="like" aria-label="0 Likes. Like"><svg aria-hidden="true"><path></path></svg></button>
  <button id="share" aria-haspopup="menu" aria-label="Share post"><svg aria-hidden="true"><path></path></svg></button>
</article>
<div id="blank"></div>
'''
bench = '''
(() => {
  const api = window.__SPT_TEST__;
  const site = api.site('x');
  const like = document.querySelector('#like');
  const share = document.querySelector('#share');
  const blank = document.querySelector('#blank');
  for (let i = 0; i < 500; i++) { const span = document.createElement('span'); span.append(document.createElement('i')); blank.append(span); }
  const tb = performance.now();
  for (let i = 0; i < 5000; i++) api.findShareTrigger(site, blank);
  const blankMs = performance.now() - tb;
  const t0 = performance.now();
  for (let i = 0; i < 5000; i++) api.findShareTrigger(site, like);
  const nonShareMs = performance.now() - t0;
  const t1 = performance.now();
  for (let i = 0; i < 5000; i++) api.findShareTrigger(site, share);
  const shareMs = performance.now() - t1;
  const t2 = performance.now();
  for (let i = 0; i < 100000; i++) api.canonicalize(site, 'https://x.com/alice/status/123?s=20&t=x');
  const canonicalizeMs = performance.now() - t2;
  return { blankMs, nonShareMs, shareMs, canonicalizeMs };
})()
'''

doc = f'''<!doctype html><html><head><base href="https://x.com/"></head><body>
<script>window.__SPT_TEST_MODE__=true;</script>{body}<script>{source.replace('</script>', '<\\/script>')}</script></body></html>'''

with tempfile.TemporaryDirectory(prefix='spt-perf-', ignore_cleanup_errors=True) as td:
    debug_port = mod._free_port()
    profile = Path(td) / 'profile'
    cmd = [
        chromium, '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
        '--disable-background-networking', '--disable-default-apps', '--disable-extensions', '--disable-sync',
        '--metrics-recording-only', '--mute-audio', '--no-first-run', '--remote-allow-origins=*',
        f'--remote-debugging-port={debug_port}', f'--user-data-dir={profile}', 'about:blank'
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws = None
    try:
        target = None
        deadline = time.time() + 10
        while time.time() < deadline:
            try:
                import requests
                targets = requests.get(f'http://127.0.0.1:{debug_port}/json', timeout=.4).json()
                target = next((x for x in targets if x.get('type') == 'page' and x.get('webSocketDebuggerUrl')), None)
                if target: break
            except Exception:
                pass
            time.sleep(.1)
        if not target:
            raise SystemExit('CDP target unavailable')
        import websocket
        ws = websocket.create_connection(target['webSocketDebuggerUrl'], timeout=10, origin=f'http://127.0.0.1:{debug_port}')
        call_id = 1
        mod._cdp_call(ws, 'Page.enable', {}, call_id); call_id += 1
        tree = mod._cdp_call(ws, 'Page.getFrameTree', {}, call_id); call_id += 1
        frame_id = tree['result']['frameTree']['frame']['id']
        mod._cdp_call(ws, 'Page.setDocumentContent', {'frameId': frame_id, 'html': doc}, call_id); call_id += 1
        response = mod._cdp_eval(ws, bench, call_id)
        result = response['result']['result']['value']
        print(json.dumps(result, indent=2))
        # Smoke thresholds only: detect accidental document-scale work in the hot path.
        if result['blankMs'] > 500 or result['nonShareMs'] > 1500 or result['shareMs'] > 1500 or result['canonicalizeMs'] > 2000:
            raise SystemExit('performance smoke threshold exceeded')
    finally:
        if ws:
            try: ws.close()
            except Exception: pass
        proc.terminate()
        try: proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill(); proc.wait(timeout=2)
