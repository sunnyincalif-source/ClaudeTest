"""Installer check (SPEC-PRODUCT §5): install the built installer the way a user would, start
the app the way the OS would at login, and verify the engine runs with start-at-login set —
no terminal steps for the user. Standard library only (runs on bare CI runners).

    python scripts/install_check.py windows dist-bin/LeetTrace-Setup-windows-x64.exe
    python scripts/install_check.py macos   dist-bin/LeetTrace-macos-arm64.dmg
    python scripts/install_check.py linux   dist-bin/LeetTrace-linux-x86_64.AppImage
"""

from __future__ import annotations

import json
import os
import plistlib
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent


def check(cond: bool, what: str) -> None:
    print(("PASS " if cond else "FAIL ") + what, flush=True)
    if not cond:
        raise SystemExit(1)


def wait_engine(home: Path, timeout: float = 60) -> dict[str, object]:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            s = json.loads((home / "session.json").read_text(encoding="utf-8"))
            req = urllib.request.Request(  # noqa: S310 — loopback
                f"http://127.0.0.1:{s['port']}/health",
                headers={"Authorization": f"Bearer {s['token']}"},
            )
            with urllib.request.urlopen(req, timeout=2) as r:  # noqa: S310
                if r.status == 200:
                    return dict(s)
        except Exception:
            pass
        time.sleep(0.5)
    log = home / "app.log"
    if log.exists():
        print(log.read_text(encoding="utf-8", errors="replace")[-3000:])
    raise SystemExit("FAIL engine did not come up")


def shutdown(session: dict[str, object], home: Path) -> None:
    req = urllib.request.Request(  # noqa: S310 — loopback
        f"http://127.0.0.1:{session['port']}/shutdown",
        method="POST",
        headers={"Authorization": f"Bearer {session['token']}"},
    )
    with urllib.request.urlopen(req, timeout=5) as r:  # noqa: S310
        check(r.status == 200, "engine accepts shutdown")
    for _ in range(40):
        if not (home / "session.json").exists():
            break
        time.sleep(0.25)
    check(not (home / "session.json").exists(), "engine stopped cleanly")


def start_app(cmd: list[str], env: dict[str, str]) -> subprocess.Popen[bytes]:
    flags = 0
    if sys.platform == "win32":
        flags = subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
    return subprocess.Popen(
        cmd,
        env=env,
        stdin=subprocess.DEVNULL,
        creationflags=flags,
        start_new_session=sys.platform != "win32",
    )


def smoke(cli: str, env: dict[str, str]) -> None:
    r = subprocess.run([sys.executable, str(HERE / "smoke.py"), cli], env=env, check=False)
    check(r.returncode == 0, f"engine smoke test via the installed CLI ({cli})")


def windows(installer: Path, env: dict[str, str], home: Path) -> None:
    import winreg  # type: ignore[import-not-found,unused-ignore]

    root = Path(os.environ.get("PROGRAMW6432", r"C:\Program Files")) / "LeetTrace"
    r = subprocess.run([str(installer), "/S"], check=False)
    check(r.returncode == 0, "silent install (/S) succeeded")
    for _ in range(60):
        if (root / "LeetTrace.exe").exists():
            break
        time.sleep(0.5)
    check((root / "LeetTrace.exe").exists(), f"app installed to {root}")
    check((root / "leettrace.exe").exists(), "CLI installed alongside (leettrace.exe)")
    menu = Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData")) / (
        r"Microsoft\Windows\Start Menu\Programs\LeetTrace.lnk"
    )
    check(menu.exists(), "Start-menu shortcut created")
    proc = start_app([str(root / "LeetTrace.exe"), "app", "--background"], env)
    session = wait_engine(home)
    check(True, f"app started the engine on port {session['port']} (no console)")
    key = r"Software\Microsoft\Windows\CurrentVersion\Run"
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key) as k:
        value, _ = winreg.QueryValueEx(k, "LeetTrace")
    check("LeetTrace.exe" in value and "--background" in value, f"start at sign-in: {value}")
    print((home / "app.log").read_text(encoding="utf-8", errors="replace").strip()[-400:])
    shutdown(session, home)
    proc.wait(30)
    smoke(str(root / "leettrace.exe"), env)
    un = root / "Uninstall LeetTrace.exe"
    r = subprocess.run([str(un), "/S", f"_?={root}"], check=False)
    check(r.returncode == 0, "silent uninstall succeeded")
    check(not (root / "LeetTrace.exe").exists(), "app files removed")
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key) as k:
            winreg.QueryValueEx(k, "LeetTrace")
        removed = False
    except OSError:
        removed = True
    check(removed, "start-at-sign-in entry removed by the uninstaller")
    check(not menu.exists(), "Start-menu shortcut removed")


def macos(dmg: Path, env: dict[str, str], home: Path, user_home: Path) -> None:
    mnt = Path(tempfile.mkdtemp(prefix="lt-dmg-"))
    hdiutil = "/usr/bin/hdiutil"
    subprocess.run([hdiutil, "attach", "-nobrowse", "-mountpoint", str(mnt), str(dmg)], check=True)
    try:
        check((mnt / "Applications").is_symlink(), "dmg offers drag-to-Applications")
        check((mnt / "First time - read me.txt").exists(), "dmg shows the first-launch note")
        apps = user_home / "Applications"
        apps.mkdir(parents=True, exist_ok=True)
        shutil.copytree(mnt / "LeetTrace.app", apps / "LeetTrace.app", symlinks=True)
    finally:
        subprocess.run([hdiutil, "detach", str(mnt)], check=False)
    app = apps / "LeetTrace.app"
    info = plistlib.loads((app / "Contents/Info.plist").read_bytes())
    check(info.get("LSUIElement") is True, "menu-bar app (no Dock icon)")
    exe = app / "Contents/MacOS/LeetTrace"
    proc = start_app([str(exe), "app", "--background"], env)
    session = wait_engine(home)
    check(True, f"app started the engine on port {session['port']}")
    agent = user_home / "Library/LaunchAgents/dev.leettrace.agent.plist"
    check(agent.exists(), "login item (LaunchAgent) registered on first launch")
    args = plistlib.loads(agent.read_bytes())["ProgramArguments"]
    check(args == [str(exe), "app", "--background"], f"login item starts the app: {args}")
    shutdown(session, home)
    proc.wait(30)
    smoke(str(exe), env)


def linux(appimage: Path, env: dict[str, str], home: Path, cfg: Path) -> None:
    env = {**env, "APPIMAGE_EXTRACT_AND_RUN": "1"}
    appimage.chmod(0o755)
    proc = start_app([str(appimage), "app", "--background"], env)
    session = wait_engine(home)
    check(True, f"AppImage started the engine on port {session['port']}")
    entry = cfg / "autostart/leettrace.desktop"
    check(entry.exists(), "autostart entry registered on first launch")
    text = entry.read_text(encoding="utf-8")
    check(str(appimage.resolve()) in text, "autostart points at the AppImage file")
    shutdown(session, home)
    proc.wait(30)
    smoke(str(appimage), env)


def main() -> None:
    kind, artifact = sys.argv[1], Path(sys.argv[2]).resolve()
    tmp = Path(tempfile.mkdtemp(prefix="lt-install-"))
    home = tmp / "leettrace-home"
    env = {**os.environ, "LEETTRACE_HOME": str(home), "PYTHONUTF8": "1"}
    if kind == "windows":
        windows(artifact, env, home)
    elif kind == "macos":
        user_home = tmp / "user"
        env["HOME"] = str(user_home)
        macos(artifact, env, home, user_home)
    else:
        cfg = tmp / "config"
        env["XDG_CONFIG_HOME"] = str(cfg)
        linux(artifact, env, home, cfg)
    print("install check passed", flush=True)


if __name__ == "__main__":
    main()
