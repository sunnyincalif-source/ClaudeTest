"""Tray / menu-bar icon (SPEC-PRODUCT §5): status, Open LeetTrace, Add the extension,
Start at login, Quit. Uses pystray when a desktop session is available; `make_tray` returns
None otherwise (headless Linux, CI), and the app simply runs without an icon.
"""

from __future__ import annotations

import contextlib
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

# Brand colors for the icon (tokens from packages/design: accent → accent-2).
ACCENT = (77, 159, 255)
ACCENT_2 = (34, 211, 238)


@dataclass(frozen=True)
class MenuEntry:
    label: str
    action: str | None  # None = a disabled status line
    checked: bool | None = None
    default: bool = False


def menu_model(version: str, base_url: str, autostart: bool) -> list[MenuEntry]:
    """The menu as data (unit-tested without a GUI)."""
    return [
        MenuEntry(f"LeetTrace {version} — running", None),
        MenuEntry(base_url.replace("http://", "") + " · local only", None),
        MenuEntry("Open LeetTrace", "open", default=True),
        MenuEntry("Add the browser extension", "extension"),
        MenuEntry("Start at login", "autostart", checked=autostart),
        MenuEntry("Quit LeetTrace", "quit"),
    ]


def icon_image(size: int = 64) -> Any:
    """The LeetTrace mark (focus brackets + dot) in the blue→cyan gradient."""
    from PIL import Image, ImageDraw

    scale = size / 24
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    w = max(2, round(2.4 * scale))
    for (x1, y1), (x2, y2), (x3, y3) in (
        ((8, 4), (4, 4), (4, 8)),
        ((16, 4), (20, 4), (20, 8)),
        ((8, 20), (4, 20), (4, 16)),
        ((16, 20), (20, 20), (20, 16)),
    ):
        pts = [(x1 * scale, y1 * scale), (x2 * scale, y2 * scale), (x3 * scale, y3 * scale)]
        d.line(pts, fill=255, width=w, joint="curve")
    r = 3.4 * scale
    c = 12 * scale
    d.ellipse((c - r, c - r, c + r, c + r), outline=255, width=w)
    grad = Image.new("RGBA", (size, size))
    px = grad.load()
    assert px is not None
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = (
                round(ACCENT[0] + (ACCENT_2[0] - ACCENT[0]) * t),
                round(ACCENT[1] + (ACCENT_2[1] - ACCENT[1]) * t),
                round(ACCENT[2] + (ACCENT_2[2] - ACCENT[2]) * t),
                255,
            )
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(grad, (0, 0), mask)
    return out


class Tray:
    def __init__(self, icon: Any) -> None:
        self._icon = icon

    def run(self) -> None:
        """Blocks (on the main thread) until stop() is called."""
        self._icon.run()

    def stop(self) -> None:
        with contextlib.suppress(Exception):
            self._icon.stop()

    def refresh(self) -> None:
        with contextlib.suppress(Exception):
            self._icon.update_menu()


def make_tray(
    *,
    version: str,
    base_url: str,
    autostart: Callable[[], bool],
    on_action: Callable[[str], None],
) -> Tray | None:
    try:
        import pystray
    except Exception:  # no GUI backend (e.g. headless Linux): run without an icon
        return None

    def item(entry: MenuEntry) -> Any:
        if entry.action is None:
            return pystray.MenuItem(entry.label, None, enabled=False)
        action = entry.action

        def handler(_icon: Any, _item: Any) -> None:
            on_action(action)

        if entry.checked is not None:
            return pystray.MenuItem(entry.label, handler, checked=lambda _i: autostart())
        return pystray.MenuItem(entry.label, handler, default=entry.default)

    entries = menu_model(version, base_url, autostart())
    status, where, *actions = entries
    menu = pystray.Menu(
        item(status),
        item(where),
        pystray.Menu.SEPARATOR,
        *[item(e) for e in actions[:-1]],
        pystray.Menu.SEPARATOR,
        item(actions[-1]),
    )
    try:
        icon = pystray.Icon("LeetTrace", icon_image(), "LeetTrace", menu)
    except Exception:
        return None
    return Tray(icon)
