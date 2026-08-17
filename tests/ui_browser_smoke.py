#!/usr/bin/env python3
from __future__ import annotations

import contextlib
import importlib.util
import json
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
RUNNER = ROOT / 'tests' / 'run-fixtures.py'

spec = importlib.util.spec_from_file_location('fixture_runner', RUNNER)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def page_document(name: str) -> str:
    html = (SITE / name).read_text(encoding='utf-8')
    framework = (SITE / 'assets/vendor/pico.conditional.min.css').read_text(encoding='utf-8')
    product = (SITE / 'assets/app.css').read_text(encoding='utf-8')
    html = re.sub(r'<meta[^>]+http-equiv="Content-Security-Policy"[^>]*>', '', html, flags=re.I)
    html = re.sub(r'<link[^>]+href="\./assets/vendor/pico\.conditional\.min\.css(?:\?[^\"]*)?"[^>]*>', f'<style id="spt-framework-test">{framework}</style>', html, flags=re.I)
    html = re.sub(r'<link[^>]+href="\./assets/app\.css(?:\?[^\"]*)?"[^>]*>', f'<style id="spt-product-test">{product}</style>', html, flags=re.I)
    html = re.sub(r'<script\b[^>]*>.*?</script>', '', html, flags=re.I | re.S)
    return html


def set_document(ws, frame_id: str, html: str, call_id: int) -> int:
    response = mod._cdp_call(ws, 'Page.setDocumentContent', {'frameId': frame_id, 'html': html}, call_id)
    call_id += 1
    if response.get('error'):
        raise RuntimeError(f'Page.setDocumentContent failed: {response["error"]}')
    deadline = time.time() + 5
    while time.time() < deadline:
        result = mod._cdp_eval(ws, 'document.readyState', call_id); call_id += 1
        if result.get('result', {}).get('result', {}).get('value') == 'complete':
            return call_id
        time.sleep(.03)
    raise RuntimeError('document did not become ready')


def value(ws, expression: str, call_id: int):
    result = mod._cdp_eval(ws, expression, call_id)
    return result.get('result', {}).get('result', {}).get('value'), call_id + 1


def report(checks: dict[str, bool], failures: list[str]) -> None:
    for name, ok in checks.items():
        print(('PASS' if ok else 'FAIL'), name)
        if not ok:
            failures.append(name)


def main() -> int:
    required = [
        SITE / 'index.html', SITE / 'install.html', SITE / 'settings.html',
        SITE / 'assets/vendor/pico.conditional.min.css', SITE / 'assets/app.css',
    ]
    if not all(path.is_file() for path in required):
        print('FAIL ui-browser-site-missing')
        return 1
    browser = mod.find_browser()
    if not browser:
        print('SKIP: Chromium/Chrome not found', file=sys.stderr)
        return 77

    failures: list[str] = []
    with tempfile.TemporaryDirectory(prefix='spt-ui-', ignore_cleanup_errors=True) as td:
        debug_port = mod._free_port()
        proc = subprocess.Popen([
            browser, '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
            '--disable-background-networking', '--disable-default-apps', '--disable-extensions', '--disable-sync',
            '--metrics-recording-only', '--mute-audio', '--no-first-run', '--remote-allow-origins=*',
            f'--remote-debugging-port={debug_port}', f'--user-data-dir={Path(td) / "profile"}', 'about:blank',
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        ws = None
        try:
            target = None
            deadline = time.time() + 10
            while time.time() < deadline:
                if proc.poll() is not None:
                    break
                try:
                    with mod.urllib.request.urlopen(f'http://127.0.0.1:{debug_port}/json', timeout=.4) as response:
                        targets = json.load(response)
                    target = next((item for item in targets if item.get('type') == 'page' and item.get('webSocketDebuggerUrl')), None)
                    if target:
                        break
                except Exception:
                    pass
                time.sleep(.1)
            if not target:
                raise RuntimeError('CDP page target unavailable')

            import websocket
            ws = websocket.create_connection(target['webSocketDebuggerUrl'], timeout=10, origin=f'http://127.0.0.1:{debug_port}')
            call_id = 1
            mod._cdp_call(ws, 'Page.enable', {}, call_id); call_id += 1
            mod._cdp_call(ws, 'Emulation.setDeviceMetricsOverride', {
                'width': 360, 'height': 800, 'deviceScaleFactor': 1, 'mobile': True,
            }, call_id); call_id += 1
            mod._cdp_call(ws, 'Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5}, call_id); call_id += 1
            frame = mod._cdp_call(ws, 'Page.getFrameTree', {}, call_id); call_id += 1
            frame_id = frame['result']['frameTree']['frame']['id']

            call_id = set_document(ws, frame_id, page_document('index.html'), call_id)
            landing, call_id = value(ws, r'''(() => {
              const install = document.querySelector('#install-app');
              const primary = [...document.querySelectorAll('a[role="button"],button')];
              return {
                width: document.documentElement.clientWidth,
                scrollWidth: document.documentElement.scrollWidth,
                installHidden: Boolean(install?.hidden),
                installDisplay: install ? getComputedStyle(install).display : null,
                frameworkRules: document.querySelector('#spt-framework-test')?.sheet?.cssRules?.length || 0,
                productRules: document.querySelector('#spt-product-test')?.sheet?.cssRules?.length || 0,
                primaryCount: primary.length,
                emptyLabels: primary.filter((el) => !(el.textContent || '').trim()).length,
                installDialog: Boolean(document.querySelector('#install-dialog')),
                diagnostics: document.querySelectorAll('#install-dialog .install-diagnostics dd').length,
              };
            })()''', call_id)
            report({
                'mobile-no-horizontal-overflow': bool(landing and landing['scrollWidth'] <= landing['width'] + 1),
                'install-cta-visible-with-manual-fallback': bool(landing and not landing['installHidden'] and landing['installDisplay'] != 'none'),
                'framework-css-parsed': bool(landing and landing['frameworkRules'] > 0),
                'product-css-parsed': bool(landing and landing['productRules'] > 0),
                'primary-actions-have-labels': bool(landing and landing['primaryCount'] > 0 and landing['emptyLabels'] == 0),
                'install-dialog-present': bool(landing and landing['installDialog'] and landing['diagnostics'] >= 4),
            }, failures)

            android_layout, call_id = value(ws, r'''(() => {
              document.documentElement.dataset.sptPlatform = 'android';
              const install = document.querySelector('#install-app');
              const browserCta = document.querySelector('.browser-setup-cta');
              const browserSection = document.querySelector('.browser-userscript-section');
              const androidOption = document.querySelector('.android-browser-option');
              const androidLabel = install?.querySelector('.android-only');
              const desktopLabel = install?.querySelector('.not-android');
              return {
                installDisplay: install ? getComputedStyle(install).display : null,
                browserCtaDisplay: browserCta ? getComputedStyle(browserCta).display : null,
                browserSectionDisplay: browserSection ? getComputedStyle(browserSection).display : null,
                androidOptionDisplay: androidOption ? getComputedStyle(androidOption).display : null,
                androidLabelDisplay: androidLabel ? getComputedStyle(androidLabel).display : null,
                desktopLabelDisplay: desktopLabel ? getComputedStyle(desktopLabel).display : null,
                scrollWidth: document.documentElement.scrollWidth,
                width: document.documentElement.clientWidth,
              };
            })()''', call_id)
            report({
                'android-install-cta-visible': bool(android_layout and android_layout['installDisplay'] != 'none'),
                'android-browser-setup-demoted': bool(android_layout and android_layout['browserCtaDisplay'] == 'none' and android_layout['browserSectionDisplay'] == 'none'),
                'android-userscript-still-discoverable': bool(android_layout and android_layout['androidOptionDisplay'] != 'none'),
                'android-install-label-selected': bool(android_layout and android_layout['androidLabelDisplay'] != 'none' and android_layout['desktopLabelDisplay'] == 'none'),
                'android-layout-no-overflow': bool(android_layout and android_layout['scrollWidth'] <= android_layout['width'] + 1),
            }, failures)

            call_id = set_document(ws, frame_id, page_document('install.html'), call_id)
            install_page, call_id = value(ws, r'''(() => ({
              width: document.documentElement.clientWidth,
              scrollWidth: document.documentElement.scrollWidth,
              managerCards: document.querySelectorAll('.manager-card').length,
              managerLinks: [...document.querySelectorAll('.manager-card a')].map((a) => a.href),
              primaryInstall: document.querySelector('a[href="./install/social-post-tools.user.js"]')?.textContent?.trim() || '',
            }))()''', call_id)
            report({
                'browser-setup-mobile-no-overflow': bool(install_page and install_page['scrollWidth'] <= install_page['width'] + 1),
                'browser-setup-manager-choices': bool(install_page and install_page['managerCards'] == 2),
                'browser-setup-userscript-cta': bool(install_page and 'Install Social Post Tools Userscript' in install_page['primaryInstall']),
            }, failures)

            call_id = set_document(ws, frame_id, page_document('settings.html'), call_id)
            settings, call_id = value(ws, r'''(() => ({
              width: document.documentElement.clientWidth,
              scrollWidth: document.documentElement.scrollWidth,
              disclosures: document.querySelectorAll('details.settings-group').length,
              openDisclosures: document.querySelectorAll('details.settings-group[open]').length,
              labels: document.querySelectorAll('label').length,
              unlabeledSelects: [...document.querySelectorAll('select')].filter((el) => !el.closest('label') && !el.labels?.length).length,
            }))()''', call_id)
            report({
                'settings-mobile-no-overflow': bool(settings and settings['scrollWidth'] <= settings['width'] + 1),
                'settings-progressive-disclosure': bool(settings and settings['disclosures'] >= 4 and settings['openDisclosures'] == 0),
                'settings-selects-labeled': bool(settings and settings['labels'] > 0 and settings['unlabeledSelects'] == 0),
            }, failures)

            for scheme in ('light', 'dark'):
                mod._cdp_call(ws, 'Emulation.setEmulatedMedia', {
                    'features': [{'name': 'prefers-color-scheme', 'value': scheme}],
                }, call_id); call_id += 1
                colors, call_id = value(ws, "(() => { const s=getComputedStyle(document.body); return {bg:s.backgroundColor, fg:s.color}; })()", call_id)
                ok = bool(colors and colors['bg'] and colors['fg'] and colors['bg'] != 'rgba(0, 0, 0, 0)')
                report({f'{scheme}-scheme-computed-colors': ok}, failures)
        except Exception as exc:
            print('FAIL ui-browser-smoke', exc)
            failures.append('ui-browser-smoke')
        finally:
            with contextlib.suppress(Exception):
                if ws:
                    ws.close()
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill(); proc.wait(timeout=2)

    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(main())
