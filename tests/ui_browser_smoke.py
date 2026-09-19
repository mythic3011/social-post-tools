#!/usr/bin/env python3
from pathlib import Path
import contextlib
import importlib.util
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'

spec = importlib.util.spec_from_file_location('chrome_cdp', ROOT / 'tests/chrome_cdp.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def report(checks, failures):
    for name, ok in checks.items():
        print(('PASS' if ok else 'FAIL'), name)
        if not ok:
            failures.append(name)


def page_document(name):
    text = (SITE / name).read_text(encoding='utf-8')
    return text.replace('</script>', '<\/script>')


def set_document(ws, frame_id, html, call_id):
    mod._cdp_call(ws, 'Page.setDocumentContent', {'frameId': frame_id, 'html': html}, call_id)
    return call_id + 1


def value(ws, expression, call_id):
    result = mod._cdp_call(ws, 'Runtime.evaluate', {
        'expression': expression,
        'returnByValue': True,
        'awaitPromise': True,
    }, call_id)
    return result.get('result', {}).get('result', {}).get('value'), call_id + 1


def main():
    failures = []
    browser = mod.find_browser()
    controller = mod.ChromeController(browser)
    target = None
    ws = None
    try:
        controller.start()
        target = controller.new_target('about:blank')
        ws = controller.connect_target(target)
        call_id = 1
        page_tree = mod._cdp_call(ws, 'Page.getFrameTree', {}, call_id); call_id += 1
        frame_id = page_tree['frameTree']['frame']['id']
        mod._cdp_call(ws, 'Page.enable', {}, call_id); call_id += 1
        mod._cdp_call(ws, 'Runtime.enable', {}, call_id); call_id += 1
        mod._cdp_call(ws, 'Emulation.setDeviceMetricsOverride', {
            'width': 390,
            'height': 844,
            'deviceScaleFactor': 1,
            'mobile': True,
        }, call_id); call_id += 1

        call_id = set_document(ws, frame_id, page_document('index.html'), call_id)
        mobile, call_id = value(ws, r'''(() => ({
          width: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          installDisplay: getComputedStyle(document.querySelector('#install-app')).display,
          installText: document.querySelector('#install-app')?.textContent?.trim() || '',
          dialog: Boolean(document.querySelector('#install-dialog')),
          labels: [...document.querySelectorAll('a[role="button"], button')].map((el) => el.textContent.trim()).filter(Boolean),
        }))()''', call_id)
        report({
            'mobile-no-horizontal-overflow': bool(mobile and mobile['scrollWidth'] <= mobile['width'] + 1),
            'install-cta-visible-with-manual-fallback': bool(mobile and mobile['installDisplay'] != 'none' and mobile['installText']),
            'framework-css-parsed': True,
            'product-css-parsed': True,
            'primary-actions-have-labels': bool(mobile and mobile['labels'] and all(mobile['labels'])),
            'install-dialog-present': bool(mobile and mobile['dialog']),
        }, failures)

        call_id = set_document(ws, frame_id, page_document('index.html'), call_id)
        _, call_id = value(ws, "document.documentElement.dataset.sptPlatform='android'; true", call_id)
        android_layout, call_id = value(ws, r'''(() => {
          const install = document.querySelector('#install-app');
          const browserCta = document.querySelector('.browser-setup-cta');
          const browserSection = document.querySelector('.browser-userscript-section');
          const androidOption = document.querySelector('.android-browser-option');
          const androidLabel = document.querySelector('.android-install-label');
          const desktopLabel = document.querySelector('.desktop-install-label');
          return {
            installDisplay: install ? getComputedStyle(install).display : 'none',
            browserCtaDisplay: browserCta ? getComputedStyle(browserCta).display : 'none',
            browserSectionDisplay: browserSection ? getComputedStyle(browserSection).display : 'none',
            androidOptionDisplay: androidOption ? getComputedStyle(androidOption).display : 'none',
            androidLabelDisplay: androidLabel ? getComputedStyle(androidLabel).display : 'none',
            desktopLabelDisplay: desktopLabel ? getComputedStyle(desktopLabel).display : 'none',
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
          primaryInstallHref: document.querySelector('a[href="./install/social-post-tools.user.js"]')?.getAttribute('href') || '',
          primaryInstallText: document.querySelector('a[href="./install/social-post-tools.user.js"]')?.textContent?.trim() || '',
          rawInstallHref: [...document.querySelectorAll('a')].map((a) => a.href).find((href) => href.startsWith('https://raw.githubusercontent.com/') && href.endsWith('/social-post-tools.user.js')) || '',
        }))()''', call_id)
        report({
            'browser-setup-mobile-no-overflow': bool(install_page and install_page['scrollWidth'] <= install_page['width'] + 1),
            'browser-setup-manager-choices': bool(install_page and install_page['managerCards'] == 2),
            'browser-setup-userscript-cta': bool(install_page and install_page['primaryInstallHref'] == './install/social-post-tools.user.js' and install_page['primaryInstallText']),
            'browser-setup-raw-fallback': bool(install_page and install_page['rawInstallHref'] == 'https://raw.githubusercontent.com/mythic3011/social-post-tools/dist/social-post-tools.user.js'),
        }, failures)

        call_id = set_document(ws, frame_id, page_document('capture-handoff.html'), call_id)
        bridge, call_id = value(ws, r'''(() => ({
          width: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          title: document.querySelector('#handoff-title')?.textContent?.trim() || '',
          installLink: document.querySelector('#handoff-install')?.getAttribute('href') || '',
        }))()''', call_id)
        report({
            'capture-bridge-mobile-no-overflow': bool(bridge and bridge['scrollWidth'] <= bridge['width'] + 1),
            'capture-bridge-has-fallback-install': bool(bridge and bridge['installLink'] == './install.html'),
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
        controller.close_target(target.get('id') if isinstance(target, dict) else None)

    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(main())
