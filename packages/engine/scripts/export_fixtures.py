"""Export recorded golden traces as fixtures for packages/viz (its harness and tests).

The viz is developed against recorded traces, independently of the engine (SPEC §6).
"""

from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "tests" / "snapshots"
DEST = ROOT.parents[1] / "packages" / "viz" / "fixtures"


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    for f in sorted(SRC.glob("*.json")):
        shutil.copy(f, DEST / f.name)
        print("fixture:", f.name)


if __name__ == "__main__":
    main()
