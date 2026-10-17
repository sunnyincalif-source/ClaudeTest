#!/usr/bin/env bash
# Build a standalone `leettrace` binary (no Python needed on the target machine).
# Run from packages/engine after building the web UI (pnpm --filter @leettrace/web build).
# Output: dist-bin/leettrace (or leettrace.exe). Build on each OS you ship for.
set -euo pipefail
cd "$(dirname "$0")/.."
test -f src/leettrace/web_dist/index.html || { echo "build the web UI first"; exit 1; }
uv run pyinstaller --noconfirm --clean --onefile --name leettrace \
  --distpath dist-bin --workpath build/pyinstaller --specpath build \
  --collect-data leettrace \
  --collect-data textual \
  --collect-submodules leettrace \
  --collect-submodules uvicorn \
  --collect-submodules websockets \
  --hidden-import watchfiles \
  packaging/entry.py
echo "built: dist-bin/$(ls dist-bin)"
