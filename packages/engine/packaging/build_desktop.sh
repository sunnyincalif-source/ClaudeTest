#!/usr/bin/env bash
# Build the desktop app + its installer for the current OS (SPEC-PRODUCT §5).
#   packaging/build_desktop.sh [arch-label]      (run from anywhere; needs the web UI built)
# Outputs in packages/engine/dist-bin/:
#   Windows: LeetTrace-Setup-windows-x64.exe   (NSIS installer: Program Files + Start menu)
#   macOS:   LeetTrace-macos-<arch>.dmg         (drag LeetTrace.app to Applications)
#   Linux:   LeetTrace-linux-x86_64.AppImage    (chmod +x and run; registers autostart)
set -euo pipefail
cd "$(dirname "$0")/.."
test -f src/leettrace/web_dist/index.html || { echo "build the web UI first"; exit 1; }
VERSION=$(sed -n 's/^__version__ = "\(.*\)"/\1/p' src/leettrace/__init__.py)
case "$(uname -s)" in
  Darwin) OS=macos ;;
  MINGW* | MSYS* | CYGWIN* | Windows_NT) OS=windows ;;
  *) OS=linux ;;
esac
ARCH="${1:-$(uname -m)}"
echo "LeetTrace $VERSION desktop build for $OS ($ARCH)"

uv run python packaging/make_icons.py
rm -rf dist-bin/LeetTrace dist-bin/LeetTrace.app build/pyi
LT_TARGET=$OS uv run pyinstaller --noconfirm --clean --distpath dist-bin --workpath build/pyi \
  packaging/leettrace.spec

case "$OS" in
  windows) bash packaging/windows/build_installer.sh "$VERSION" ;;
  macos) bash packaging/macos/build_dmg.sh "$ARCH" ;;
  linux) bash packaging/linux/build_appimage.sh "$VERSION" ;;
esac
