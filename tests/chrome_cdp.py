#!/usr/bin/env python3
from __future__ import annotations

import contextlib
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

import websocket


class ChromeLaunchError(RuntimeError):
    pass


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


def cdp_call(ws, method: str, params: dict | None, call_id: int) -> dict:
    payload = {'id': call_id, 'method': method}
    if params is not None:
        payload['params'] = params
    ws.send(json.dumps(payload))
    while True:
        message = json.loads(ws.recv())
        if message.get('id') == call_id:
            return message


def cdp_eval(ws, expression: str, call_id: int) -> dict:
    return cdp_call(ws, 'Runtime.evaluate', {
        'expression': expression,
        'returnByValue': True,
        'awaitPromise': True,
    }, call_id)


class ChromeController:
    """Small CDP launcher for deterministic local/CI browser tests.

    Chrome chooses the debugging port itself (`--remote-debugging-port=0`),
    avoiding a free-port TOCTOU race. A fresh, non-default profile is always
    used because modern Chrome requires that for remote debugging.
    """

    def __init__(self, browser: str, *, prefix: str = 'spt-chrome-', startup_timeout: float = 30.0):
        self.browser = browser
        self.prefix = prefix
        self.startup_timeout = startup_timeout
        self._tmp: tempfile.TemporaryDirectory[str] | None = None
        self._stderr_file = None
        self.proc: subprocess.Popen | None = None
        self.profile: Path | None = None
        self.port: int | None = None

    def __enter__(self) -> 'ChromeController':
        self._tmp = tempfile.TemporaryDirectory(prefix=self.prefix, ignore_cleanup_errors=True)
        root = Path(self._tmp.name)
        self.profile = root / 'profile'
        stderr_path = root / 'chrome.stderr.log'
        self._stderr_file = stderr_path.open('w+', encoding='utf-8')
        cmd = [
            self.browser,
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
            '--remote-debugging-port=0',
            f'--user-data-dir={self.profile}',
            'data:,',
        ]
        self.proc = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=self._stderr_file,
            text=True,
        )
        try:
            self.port = self._wait_for_debug_port()
            self._wait_for_http_ready()
        except Exception:
            self.close()
            raise
        return self

    def _wait_for_debug_port(self) -> int:
        assert self.profile is not None
        assert self.proc is not None
        active_port = self.profile / 'DevToolsActivePort'
        deadline = time.monotonic() + self.startup_timeout
        last_error = 'DevToolsActivePort not created yet'
        while time.monotonic() < deadline:
            if self.proc.poll() is not None:
                raise ChromeLaunchError(
                    f'Chrome exited during startup with code {self.proc.returncode}. {self.stderr_tail()}'
                )
            try:
                lines = active_port.read_text(encoding='utf-8').splitlines()
                if lines and lines[0].strip().isdigit():
                    return int(lines[0].strip())
            except (OSError, ValueError) as exc:
                last_error = str(exc)
            time.sleep(0.1)
        raise ChromeLaunchError(
            f'Chrome debugging port unavailable after {self.startup_timeout:.0f}s: {last_error}. {self.stderr_tail()}'
        )

    def _wait_for_http_ready(self) -> None:
        assert self.port is not None
        assert self.proc is not None
        deadline = time.monotonic() + self.startup_timeout
        last_error = 'CDP HTTP endpoint not ready'
        while time.monotonic() < deadline:
            if self.proc.poll() is not None:
                raise ChromeLaunchError(
                    f'Chrome exited before CDP became ready with code {self.proc.returncode}. {self.stderr_tail()}'
                )
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{self.port}/json/version', timeout=0.75) as response:
                    data = json.load(response)
                if data.get('webSocketDebuggerUrl'):
                    return
            except Exception as exc:
                last_error = str(exc)
            time.sleep(0.1)
        raise ChromeLaunchError(
            f'CDP HTTP endpoint unavailable after {self.startup_timeout:.0f}s: {last_error}. {self.stderr_tail()}'
        )

    def new_page(self, url: str = 'about:blank') -> dict:
        assert self.port is not None
        encoded = urllib.parse.quote(url, safe=':/?=&%#')
        request = urllib.request.Request(
            f'http://127.0.0.1:{self.port}/json/new?{encoded}',
            method='PUT',
        )
        deadline = time.monotonic() + 10.0
        last_error: Exception | None = None
        while time.monotonic() < deadline:
            try:
                with urllib.request.urlopen(request, timeout=1.0) as response:
                    target = json.load(response)
                if target.get('type') == 'page' and target.get('webSocketDebuggerUrl'):
                    return target
            except Exception as exc:
                last_error = exc
                time.sleep(0.1)
        raise ChromeLaunchError(f'Could not create CDP page target: {last_error}. {self.stderr_tail()}')

    def connect_page(self, url: str = 'about:blank'):
        assert self.port is not None
        target = self.new_page(url)
        ws = websocket.create_connection(
            target['webSocketDebuggerUrl'],
            timeout=10,
            origin=f'http://127.0.0.1:{self.port}',
        )
        return target, ws

    def close_target(self, target_id: str | None) -> None:
        if not target_id or self.port is None:
            return
        with contextlib.suppress(Exception):
            urllib.request.urlopen(
                f'http://127.0.0.1:{self.port}/json/close/{urllib.parse.quote(target_id)}',
                timeout=1.0,
            ).read()

    def stderr_tail(self, max_chars: int = 4000) -> str:
        if self._stderr_file is None:
            return ''
        try:
            self._stderr_file.flush()
            self._stderr_file.seek(0)
            text = self._stderr_file.read()
            return text[-max_chars:].strip()
        except Exception:
            return ''

    def close(self) -> None:
        if self.proc is not None and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=4)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                with contextlib.suppress(subprocess.TimeoutExpired):
                    self.proc.wait(timeout=2)
        if self._stderr_file is not None:
            with contextlib.suppress(Exception):
                self._stderr_file.close()
            self._stderr_file = None
        if self._tmp is not None:
            with contextlib.suppress(Exception):
                self._tmp.cleanup()
            self._tmp = None

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()
