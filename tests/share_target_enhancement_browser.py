#!/usr/bin/env python3
from __future__ import annotations

import contextlib
import json
import sys
import time
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


def set_clean_url(ws, value: str, call_id: int):
    expression = f'''(() => {{
      document.querySelector('#clean-url').textContent = {json.dumps(value)};
      return true;
    }})()'''
    _, call_id = smoke.value(ws, expression, call_id)
    time.sleep(0.05)
    result, call_id = smoke.value(ws, '''(() => {
      const link = document.querySelector('#open-link-lab');
      return {
        hidden: link.hidden,
        href: link.getAttribute('href'),
      };
    })()''', call_id)
    return result, call_id


def report(checks: dict[str, bool], failures: list[str]) -> None:
    for name, ok in checks.items():
        print(('PASS' if ok else 'FAIL'), name)
        if not ok:
            failures.append(name)


def main() -> int:
    required = [SITE / 'share-target.html', SITE / 'share-target-enhancements.js', SITE / 'social-post-core.js']
    if not all(path.is_file() for path in required):
        print('FAIL share-target-enhancement-browser-site-missing')
        return 1

    browser = smoke.mod.find_browser()
    if not browser:
        print('SKIP: Chromium/Chrome not found', file=sys.stderr)
        return 77

    core_source = (SITE / 'social-post-core.js').read_text(encoding='utf-8')
    enhancement_source = (SITE / 'share-target-enhancements.js').read_text(encoding='utf-8')
    failures: list[str] = []

    with ChromeController(browser, prefix='spt-share-lab-', startup_timeout=30.0) as controller:
        target = None
        ws = None
        try:
            target, ws = controller.connect_page('about:blank')
            call_id = 1
            smoke.mod._cdp_call(ws, 'Page.enable', {}, call_id); call_id += 1
            frame = smoke.mod._cdp_call(ws, 'Page.getFrameTree', {}, call_id); call_id += 1
            frame_id = frame['result']['frameTree']['frame']['id']
            call_id = smoke.set_document(ws, frame_id, smoke.page_document('share-target.html'), call_id)
            call_id = evaluate_source(ws, core_source, call_id)
            call_id = evaluate_source(ws, enhancement_source, call_id)

            initial, call_id = smoke.value(ws, '''(() => {
              const link = document.querySelector('#open-link-lab');
              return { hidden: link.hidden, href: link.getAttribute('href') };
            })()''', call_id)
            report({
                'share-link-lab-initially-hidden': bool(initial and initial['hidden']),
                'share-link-lab-initial-fallback': bool(initial and initial['href'] == './link-lab.html'),
            }, failures)

            x_result, call_id = set_clean_url(ws, 'https://x.com/alice/status/123', call_id)
            report({
                'share-link-lab-x-visible': bool(x_result and not x_result['hidden']),
                'share-link-lab-x-fragment': bool(x_result and x_result['href'] == './link-lab.html#url=https%3A%2F%2Fx.com%2Falice%2Fstatus%2F123'),
            }, failures)

            threads_result, call_id = set_clean_url(ws, 'https://www.threads.com/share/ABC_123', call_id)
            report({
                'share-link-lab-threads-alias-visible': bool(threads_result and not threads_result['hidden']),
                'share-link-lab-threads-alias-fragment': bool(threads_result and threads_result['href'] == './link-lab.html#url=https%3A%2F%2Fwww.threads.com%2Fshare%2FABC_123'),
            }, failures)

            evil_result, call_id = set_clean_url(ws, 'https://evil.example/x.com/alice/status/123', call_id)
            report({
                'share-link-lab-evil-hidden': bool(evil_result and evil_result['hidden']),
                'share-link-lab-evil-clears-target': bool(evil_result and evil_result['href'] == './link-lab.html'),
            }, failures)
        except Exception as exc:
            print('FAIL share-target-enhancement-browser', exc)
            failures.append('share-target-enhancement-browser')
        finally:
            with contextlib.suppress(Exception):
                if ws:
                    ws.close()
            controller.close_target(target.get('id') if isinstance(target, dict) else None)

    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(main())
