"""Assemble PNG frames into an optimized GIF.  uv run --with pillow python assemble.py <dir> <out.gif> [ms] [width]"""

import sys
from pathlib import Path

from PIL import Image

frames_dir, out = Path(sys.argv[1]), Path(sys.argv[2])
ms = int(sys.argv[3]) if len(sys.argv) > 3 else 600
width = int(sys.argv[4]) if len(sys.argv) > 4 else 960
frames = []
for p in sorted(frames_dir.glob("*.png")):
    im = Image.open(p).convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    frames.append(im.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
durations = [ms] * len(frames)
durations[-1] = ms * 4  # linger on the final state
frames[0].save(out, save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True, disposal=1)
print(f"{out} ({len(frames)} frames, {out.stat().st_size // 1024} KB)")
