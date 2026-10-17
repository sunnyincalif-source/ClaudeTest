"""Desktop app (Phase 17): start-at-login entries per OS, tray menu, single instance."""

from __future__ import annotations

import plistlib
import socket
import sys
import threading
import time
import types
from pathlib import Path
from typing import Any

import httpx
import pytest

from leettrace.desktop import app as desktop_app
from leettrace.desktop import autostart, tray
from leettrace.server.session import read_session

# ------------------------------------------------------------------ autostart


def test_launch_command_dev_and_frozen(monkeypatch: pytest.MonkeyPatch) -> None:
    assert autostart.launch_command()[-3:] == ["leettrace", "app", "--background"]
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", "/opt/LeetTrace/LeetTrace")
    monkeypatch.delenv("APPIMAGE", raising=False)
    assert autostart.launch_command() == ["/opt/LeetTrace/LeetTrace", "app", "--background"]
    # An AppImage must point at the .AppImage file, not its temporary mount.
    monkeypatch.setenv("APPIMAGE", "/home/me/Apps/LeetTrace.AppImage")
    assert autostart.launch_command()[0] == "/home/me/Apps/LeetTrace.AppImage"


def test_linux_autostart_entry(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))
    cmd = ["/home/me/My Apps/LeetTrace.AppImage", "app", "--background"]
    assert not autostart.is_enabled("linux")
    autostart.enable(cmd, "linux")
    path = tmp_path / "autostart" / "leettrace.desktop"
    text = path.read_text(encoding="utf-8")
    assert "Exec='/home/me/My Apps/LeetTrace.AppImage' app --background" in text
    assert "Terminal=false" in text
    assert autostart.is_enabled("linux")
    autostart.disable("linux")
    assert not path.exists() and not autostart.is_enabled("linux")
    autostart.disable("linux")  # idempotent


def test_macos_launch_agent(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(Path, "home", staticmethod(lambda: tmp_path))
    cmd = ["/Applications/LeetTrace.app/Contents/MacOS/LeetTrace", "app", "--background"]
    autostart.enable(cmd, "darwin")
    path = tmp_path / "Library" / "LaunchAgents" / "dev.leettrace.agent.plist"
    data = plistlib.loads(path.read_bytes())
    assert data["Label"] == "dev.leettrace.agent"
    assert data["ProgramArguments"] == cmd
    assert data["RunAtLoad"] is True and data["KeepAlive"] is False
    assert autostart.is_enabled("darwin")
    autostart.disable("darwin")
    assert not autostart.is_enabled("darwin")


class FakeWinreg(types.SimpleNamespace):
    """Just enough of winreg for the Run key."""

    def __init__(self) -> None:
        super().__init__(HKEY_CURRENT_USER="HKCU", KEY_SET_VALUE=2, REG_SZ=1, values={}, keys=set())

    class _Key:
        def __init__(self, reg: FakeWinreg, path: str) -> None:
            self.reg, self.path = reg, path

        def __enter__(self) -> FakeWinreg._Key:
            return self

        def __exit__(self, *_: object) -> None:
            return None

    def CreateKey(self, _root: str, path: str) -> FakeWinreg._Key:  # noqa: N802 — winreg API
        self.keys.add(path)
        return self._Key(self, path)

    def OpenKey(self, _root: str, path: str, *_: Any) -> FakeWinreg._Key:  # noqa: N802
        if path not in self.keys:
            raise OSError("no key")
        return self._Key(self, path)

    def SetValueEx(self, key: Any, name: str, _r: int, _t: int, value: str) -> None:  # noqa: N802
        self.values[(key.path, name)] = value

    def QueryValueEx(self, key: Any, name: str) -> tuple[str, int]:  # noqa: N802
        if (key.path, name) not in self.values:
            raise OSError("no value")
        return self.values[(key.path, name)], 1

    def DeleteValue(self, key: Any, name: str) -> None:  # noqa: N802
        if self.values.pop((key.path, name), None) is None:
            raise OSError("no value")


def test_windows_run_key(monkeypatch: pytest.MonkeyPatch) -> None:
    reg = FakeWinreg()
    monkeypatch.setattr(autostart, "_winreg", lambda: reg)
    cmd = [r"C:\Program Files\LeetTrace\LeetTrace.exe", "app", "--background"]
    assert not autostart.is_enabled("win32")
    autostart.enable(cmd, "win32")
    assert reg.values[(autostart.RUN_KEY, "LeetTrace")] == (
        r'"C:\Program Files\LeetTrace\LeetTrace.exe" app --background'
    )
    assert autostart.is_enabled("win32")
    autostart.disable("win32")
    assert not autostart.is_enabled("win32")
    autostart.disable("win32")  # idempotent


# ------------------------------------------------------------------ tray


def test_menu_model() -> None:
    menu = tray.menu_model("1.1.0", "http://127.0.0.1:47823", autostart=True)
    labels = [m.label for m in menu]
    assert labels[0] == "LeetTrace 1.1.0 — running"
    assert "127.0.0.1:47823 · local only" in labels
    actions = [m.action for m in menu if m.action]
    assert actions == ["open", "extension", "autostart", "quit"]
    assert next(m for m in menu if m.action == "autostart").checked is True
    assert next(m for m in menu if m.action == "open").default


def test_icon_image_is_the_gradient_mark() -> None:
    img = tray.icon_image(64)
    assert img.size == (64, 64) and img.mode == "RGBA"
    px = img.load()
    opaque = [px[x, y] for y in range(64) for x in range(64) if px[x, y][3] > 0]
    assert 300 < len(opaque) < 64 * 64 / 2  # strokes, not a filled square
    blues = {p[:3] for p in opaque}
    assert any(b > 240 for (_r, _g, b) in blues)  # blue→cyan, no purple
    assert all(r < 120 for (r, _g, _b) in blues)


# ------------------------------------------------------------------ the app


class FakeTray:
    def __init__(self) -> None:
        self.stopped = threading.Event()
        self.ran = threading.Event()

    def run(self) -> None:
        self.ran.set()
        self.stopped.wait(30)

    def stop(self) -> None:
        self.stopped.set()

    def refresh(self) -> None:
        pass


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _wait_health(timeout: float = 20.0) -> Any:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        s = read_session()
        if s is not None:
            try:
                r = httpx.get(
                    f"{s.base_url}/health",
                    headers={"Authorization": f"Bearer {s.token}"},
                    timeout=1,
                )
                if r.status_code == 200:
                    return s
            except httpx.HTTPError:
                pass
        time.sleep(0.1)
    raise AssertionError("engine did not come up")


@pytest.fixture
def desktop_home(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> list[str]:
    monkeypatch.setenv("LEETTRACE_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path / "config"))
    monkeypatch.setattr(Path, "home", staticmethod(lambda: tmp_path))
    opened: list[str] = []
    monkeypatch.setattr(desktop_app.webbrowser, "open", lambda url: opened.append(url))
    return opened


def test_app_first_run_tray_quit(monkeypatch: pytest.MonkeyPatch, desktop_home: list[str]) -> None:
    fake = FakeTray()
    actions: dict[str, Any] = {}

    def make_tray(**kw: Any) -> FakeTray:
        actions.update(kw)
        return fake

    monkeypatch.setattr(desktop_app, "make_tray", make_tray)
    port = _free_port()
    t = threading.Thread(target=desktop_app.run_app, kwargs={"port": port}, daemon=True)
    t.start()
    session = _wait_health()
    assert fake.ran.wait(10)
    # First launch: start-at-login on, welcome page opened in "first run" mode.
    assert autostart.is_enabled()
    assert desktop_home and desktop_home[0].endswith("&first=1")
    assert desktop_home[0].startswith(f"http://127.0.0.1:{port}/#t=")
    # A second launch is a no-op that just reopens the welcome page (single instance).
    desktop_app.run_app()
    assert desktop_home[-1] == session.welcome_url()
    # "Quit" in the tray stops the engine and the icon.
    actions["on_action"]("quit")
    t.join(15)
    assert not t.is_alive() and fake.stopped.is_set()
    assert read_session() is None


def test_app_stop_from_welcome_page_removes_tray(
    monkeypatch: pytest.MonkeyPatch, desktop_home: list[str]
) -> None:
    fake = FakeTray()
    monkeypatch.setattr(desktop_app, "make_tray", lambda **_kw: fake)
    port = _free_port()
    t = threading.Thread(
        target=desktop_app.run_app, kwargs={"port": port, "background": True}, daemon=True
    )
    t.start()
    s = _wait_health()
    assert desktop_home == []  # --background: no browser tab (login item)
    r = httpx.post(f"{s.base_url}/shutdown", headers={"Authorization": f"Bearer {s.token}"})
    assert r.status_code == 200
    t.join(15)
    assert not t.is_alive() and fake.stopped.is_set()


def test_app_without_a_tray_still_serves(
    monkeypatch: pytest.MonkeyPatch, desktop_home: list[str]
) -> None:
    monkeypatch.setattr(desktop_app, "make_tray", lambda **_kw: None)
    port = _free_port()
    t = threading.Thread(
        target=desktop_app.run_app, kwargs={"port": port, "background": True}, daemon=True
    )
    t.start()
    s = _wait_health()
    httpx.post(f"{s.base_url}/shutdown", headers={"Authorization": f"Bearer {s.token}"})
    t.join(15)
    assert not t.is_alive()
