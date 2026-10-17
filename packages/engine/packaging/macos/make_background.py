"""Render the .dmg window background: drag-to-Applications + the one-time first-launch step.

uv run python packaging/macos/make_background.py <out.png>
"""

from __future__ import annotations

import sys

from PIL import Image, ImageDraw, ImageFont

W, H = 640, 400
BG = (8, 9, 12)  # --bg
FG = (236, 238, 242)  # --fg
MUTED = (152, 160, 171)  # --fg-muted
ACCENT = (77, 159, 255)  # --accent


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in ("/System/Library/Fonts/Helvetica.ttc", "/System/Library/Fonts/SFNS.ttf"):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


def main(out: str) -> None:
    img = Image.new("RGB", (W * 2, H * 2), BG)  # @2x for Retina
    d = ImageDraw.Draw(img)
    s = 2
    d.text(
        (W * s // 2, 46 * s),
        "Drag LeetTrace to Applications",
        fill=FG,
        font=font(22 * s),
        anchor="mm",
    )
    # arrow between the app (x=170) and the Applications link (x=470), icons at y=190
    y = 190 * s
    d.line((250 * s, y, 390 * s, y), fill=ACCENT, width=4 * s)
    d.polygon([(392 * s, y), (378 * s, y - 9 * s), (378 * s, y + 9 * s)], fill=ACCENT)
    d.text(
        (W * s // 2, 318 * s),
        "First time only: in Applications, right-click LeetTrace > Open > Open",
        fill=FG,
        font=font(14 * s),
        anchor="mm",
    )
    d.text(
        (W * s // 2, 344 * s),
        "(macOS 15+: System Settings > Privacy & Security > Open Anyway)",
        fill=MUTED,
        font=font(12 * s),
        anchor="mm",
    )
    d.text(
        (W * s // 2, 372 * s),
        "LeetTrace is open source and not yet signed by Apple, so macOS asks once.",
        fill=MUTED,
        font=font(12 * s),
        anchor="mm",
    )
    img.save(out, dpi=(144, 144))


if __name__ == "__main__":
    main(sys.argv[1])
