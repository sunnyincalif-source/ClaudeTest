"""Render the app icons (Windows .ico, macOS .icns, Linux .png) from the brand mark.

    uv run python packaging/make_icons.py      # -> packaging/icons/

A dark rounded tile (design token bg-elev) with a hairline border and the blue→cyan mark.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

from leettrace.desktop.tray import icon_image

OUT = Path(__file__).parent / "icons"
TILE = (14, 16, 20, 255)  # --bg-elev #0e1014
BORDER = (43, 49, 58, 255)  # --border-strong #2b313a


def app_icon(size: int = 1024) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pad = round(size * 0.08)
    radius = round(size * 0.22)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(
        (pad, pad, size - pad, size - pad),
        radius=radius,
        fill=TILE,
        outline=BORDER,
        width=max(2, size // 128),
    )
    mark_size = round(size * 0.62)
    mark = icon_image(mark_size)
    off = (size - mark_size) // 2
    img.alpha_composite(mark, (off, off))
    return img


def main() -> None:
    OUT.mkdir(exist_ok=True)
    big = app_icon(1024)
    big.save(OUT / "leettrace.png")
    big.resize((256, 256), Image.LANCZOS).save(OUT / "leettrace-256.png")
    big.save(
        OUT / "leettrace.ico",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    big.save(OUT / "leettrace.icns")
    print(f"icons -> {OUT}")


if __name__ == "__main__":
    main()
