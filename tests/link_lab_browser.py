#!/usr/bin/env python3
from __future__ import annotations

import contextlib
import json
import sys
from pathlib import Path

from chrome_cdp import ChromeController
import ui_browser_smoke as smoke

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'


def evaluate_source(ws, source: str, call_id: int) -> int:
    expression = f'(0, eval)({json.dumps(source)})'
    result = smoke.mod._cdp_eval(ws, expression, call_id)
    if result.get('result', {}).get('exceptionDetails'):
        raise RuntimeError(result['result']['exceptionDetails'])
    return call_id + 1


def submit_value(ws, raw: str, call_id: int):
    expression = f'''(() => {{
      const input = document.querySelector('#source-url');
      input.value = {json.dumps(raw)};
      document.querySelector('#link-lab-form').dispatchEvent(new Event('submit', {{ bubbles: true, cancelable: true }}));
      return {{
        hidden: document.querySelector('#lab-results').hidden,
        clean: document.querySelector('#clean-output').value,
        cleanDisabled: document.querySelector('#clean-output').disabled,
        preview: document.querySelector('#preview-output').value,
        previewDisabled: document.querySelector('#preview-output').disabled,
        previewMeta: document.querySelector('#preview-meta').textContent,
        reader: document.querySelector('#reader-output').value,
        readerDisabled: document.querySelector('#reader-output').disabled,
        readerMeta: document.querySelector('#reader-meta').textContent,
        readerState: document.querySelector('#reader-state').textContent,
        status: document.querySelector('#lab-status').textContent,
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }};
    }})()'''
    return smoke.value(ws, expression, call_id)


def report(checks: dict[str, bool], failures: list[str]) -> None:
    for name, ok in checks.items():
        print(('PASS' if ok else 'FAIL'), name)
        if not ok:
            failures.append(name)


def main() -> int:
    required = [SITE / 'link-lab.html', SITE / 'link-lab.js', SITE / 'social-post-core.js']
    if not all(path.is_file() for path in required):
        print('FAIL link-lab-browser-site-missing')
        return 1

    browser = smoke.mod.find_browser()
    if not browser:
        print('SKIP: Chromium/Chrome not found', file=sys.stderr)
        return 77

    core_source = (SITE / 'social-post-core.js').read_text(encoding='utf-8')
    lab_source = (SITE / 'link-lab.js').read_text(encoding='utf-8')
    failures: list[str] = []

    with ChromeController(browser, prefix='spt-link-lab-', startup_timeout=30.0) as controller:
        target = None
        ws = None
        try:
            target, ws = controller.connect_page('about:blank')
            call_id = 1
            smoke.mod._cdp_call(ws, 'Page.enable', {}, call_id); call_id += 1
            smoke.mod._cdp_call(ws, 'Emulation.setDeviceMetricsOverride', {
                'width': 360, 'height': 800, 'deviceScaleFactor': 1, 'mobile': True,
            }, call_id); call_id += 1
            frame = smoke.mod._cdp_call(ws, 'Page.getFrameTree', {}, call_id); call_id += 1
            frame_id = frame['result']['frameTree']['frame']['id']

            call_id = smoke.set_document(ws, frame_id, smoke.page_document('link-lab.html'), call_id)
            call_id = evaluate_source(ws, core_source, call_id)
            call_id = evaluate_source(ws, lab_source, call_id)

            x_result, call_id = submit_value(ws, 'https://twitter.com/alice/status/123?s=20&t=tracking', call_id)
            report({
                'link-lab-x-results-visible': bool(x_result and not x_result['hidden']),
                'link-lab-x-clean-canonical': bool(x_result and x_result['clean'] == 'https://x.com/alice/status/123'),
                'link-lab-x-preview-fixupx': bool(x_result and x_result['preview'] == 'https://fixupx.com/alice/status/123' and 'FixupX' in x_result['previewMeta']),
                'link-lab-x-reader-xcancel': bool(x_result and x_result['reader'] == 'https://xcancel.com/alice/status/123' and 'XCancel' in x_result['readerMeta']),
                'link-lab-mobile-no-overflow': bool(x_result and x_result['scrollWidth'] <= x_result['width'] + 1),
            }, failures)

            threads_result, call_id = submit_value(ws, 'https://threads.net/@bob/post/Ab_C-9?xmt=tracking', call_id)
            report({
                'link-lab-threads-clean-canonical': bool(threads_result and threads_result['clean'] == 'https://www.threads.com/@bob/post/Ab_C-9'),
                'link-lab-threads-preview-vxthreads': bool(threads_result and threads_result['preview'] == 'https://vxthreads.net/@bob/post/Ab_C-9' and 'vxThreads' in threads_result['previewMeta']),
                'link-lab-threads-reader-unavailable': bool(threads_result and threads_result['reader'] == '' and threads_result['readerDisabled'] and threads_result['readerState'] == 'Unavailable'),
            }, failures)

            alias_result, call_id = submit_value(ws, 'https://www.threads.com/share/ABC_123/?xmt=tracking', call_id)
            report({
                'link-lab-alias-keeps-alias': bool(alias_result and alias_result['clean'] == 'https://www.threads.com/share/ABC_123'),
                'link-lab-alias-does-not-invent-preview': bool(alias_result and alias_result['preview'] == '' and alias_result['previewDisabled']),
                'link-lab-alias-network-silent-message': bool(alias_result and 'network-silent' in alias_result['status']),
            }, failures)
        except Exception as exc:
            print('FAIL link-lab-browser', exc)
            failures.append('link-lab-browser')
        finally:
            with contextlib.suppress(Exception):
                if ws:
                    ws.close()
            controller.close_target(target.get('id') if isinstance(target, dict) else None)

    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(main())
