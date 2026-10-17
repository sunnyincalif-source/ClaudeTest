#!/usr/bin/env bash
# macOS: build LeetTrace.app (double-clickable; starts the engine and opens the welcome page)
# and wrap it in a .dmg.  Usage: packaging/build_app.sh <arch-label>   (e.g. arm64, x64)
# Run from anywhere after building the web UI + extension (they're bundled into the app).
set -euo pipefail
cd "$(dirname "$0")/.."
ARCH="${1:-$(uname -m)}"
test -f src/leettrace/web_dist/index.html || { echo "build the web UI first"; exit 1; }
rm -rf dist-bin/LeetTrace.app dist-bin/LeetTrace "dist-bin/LeetTrace-macos-$ARCH.dmg"
uv run pyinstaller --noconfirm --clean --windowed --onedir --name LeetTrace \
  --osx-bundle-identifier dev.leettrace.app \
  --distpath dist-bin --workpath build/pyinstaller-app --specpath build \
  --collect-data leettrace \
  --collect-data textual \
  --collect-submodules leettrace \
  --collect-submodules uvicorn \
  --collect-submodules websockets \
  --hidden-import watchfiles \
  packaging/entry.py
# The CLI lives inside the bundle too: LeetTrace.app/Contents/MacOS/LeetTrace <command>
# Classic drag-to-install window: the app next to a shortcut to /Applications.
STAGE=build/dmg-stage
rm -rf "$STAGE" && mkdir -p "$STAGE"
cp -R dist-bin/LeetTrace.app "$STAGE/"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname LeetTrace -srcfolder "$STAGE" -ov -format UDZO \
  "dist-bin/LeetTrace-macos-$ARCH.dmg"
echo "built: dist-bin/LeetTrace-macos-$ARCH.dmg"
