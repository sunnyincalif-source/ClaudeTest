"""Start LeetTrace at login, per OS (SPEC-PRODUCT §5).

- macOS: a per-user LaunchAgent (~/Library/LaunchAgents/dev.leettrace.agent.plist), which
  System Settings lists under Login Items → "Allow in the Background".
- Windows: the per-user Run key (HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run).
- Linux: an XDG autostart entry (~/.config/autostart/leettrace.desktop).

Every entry launches `<app> app --background`: the engine + tray icon, no browser tab.
Nothing here needs admin rights, and `disable()` removes exactly what `enable()` wrote.
"""

from __future__ import annotations

import os
import plistlib
import shlex
import sys
from pathlib import Path
from typing import Any

LABEL = "dev.leettrace.agent"
RUN_VALUE = "LeetTrace"
RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
BACKGROUND_ARGS = ["app", "--background"]


def launch_command() -> list[str]:
    """How to start the desktop app from a login item.

    Frozen builds point at the installed executable. An AppImage points at the .AppImage
    file itself ($APPIMAGE), not the temporary mount it runs from.
    """
    if getattr(sys, "frozen", False):
        exe = os.environ.get("APPIMAGE") or sys.executable
        return [exe, *BACKGROUND_ARGS]
    return [sys.executable, "-m", "leettrace", *BACKGROUND_ARGS]


# ------------------------------------------------------------------ macOS


def mac_plist_path() -> Path:
    return Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist"


def mac_plist(command: list[str]) -> bytes:
    data: dict[str, Any] = {
        "Label": LABEL,
        "ProgramArguments": command,
        "RunAtLoad": True,
        "KeepAlive": False,
        "ProcessType": "Interactive",
        "StandardOutPath": "/dev/null",
        "StandardErrorPath": "/dev/null",
    }
    return plistlib.dumps(data)


# ------------------------------------------------------------------ Linux


def linux_desktop_path() -> Path:
    base = os.environ.get("XDG_CONFIG_HOME") or str(Path.home() / ".config")
    return Path(base) / "autostart" / "leettrace.desktop"


def linux_desktop_entry(command: list[str]) -> str:
    return (
        "[Desktop Entry]\n"
        "Type=Application\n"
        "Name=LeetTrace\n"
        "Comment=Local trace engine for LeetCode practice\n"
        f"Exec={shlex.join(command)}\n"
        "Icon=leettrace\n"
        "Terminal=false\n"
        "X-GNOME-Autostart-enabled=true\n"
        "NoDisplay=true\n"
    )


# ------------------------------------------------------------------ Windows


def windows_command_line(command: list[str]) -> str:
    return " ".join(f'"{part}"' if " " in part or not part else part for part in command)


def _winreg() -> Any:
    import winreg  # type: ignore[import-not-found,unused-ignore]

    return winreg


# ------------------------------------------------------------------ API


def is_enabled(platform: str = sys.platform) -> bool:
    if platform == "darwin":
        return mac_plist_path().exists()
    if platform == "win32":
        reg = _winreg()
        try:
            with reg.OpenKey(reg.HKEY_CURRENT_USER, RUN_KEY) as key:
                reg.QueryValueEx(key, RUN_VALUE)
            return True
        except OSError:
            return False
    return linux_desktop_path().exists()


def enable(command: list[str] | None = None, platform: str = sys.platform) -> None:
    cmd = command or launch_command()
    if platform == "darwin":
        path = mac_plist_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(mac_plist(cmd))
    elif platform == "win32":
        reg = _winreg()
        with reg.CreateKey(reg.HKEY_CURRENT_USER, RUN_KEY) as key:
            reg.SetValueEx(key, RUN_VALUE, 0, reg.REG_SZ, windows_command_line(cmd))
    else:
        path = linux_desktop_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(linux_desktop_entry(cmd), encoding="utf-8")


def disable(platform: str = sys.platform) -> None:
    if platform == "darwin":
        mac_plist_path().unlink(missing_ok=True)
    elif platform == "win32":
        reg = _winreg()
        try:
            with reg.OpenKey(reg.HKEY_CURRENT_USER, RUN_KEY, 0, reg.KEY_SET_VALUE) as key:
                reg.DeleteValue(key, RUN_VALUE)
        except OSError:
            pass
    else:
        linux_desktop_path().unlink(missing_ok=True)


def refresh(platform: str = sys.platform) -> None:
    """If start-at-login is on, point it at this copy of the app (moved, upgraded or
    reinstalled apps keep starting at login, from the right place)."""
    if is_enabled(platform):
        enable(platform=platform)
