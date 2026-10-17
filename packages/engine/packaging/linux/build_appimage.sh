#!/usr/bin/env bash
# Wrap dist-bin/LeetTrace (PyInstaller onedir) into an AppImage.
set -euo pipefail
cd "$(dirname "$0")/../.."
VERSION="$1"
APPDIR=build/LeetTrace.AppDir
OUT="dist-bin/LeetTrace-linux-x86_64.AppImage"
rm -rf "$APPDIR" "$OUT"
mkdir -p "$APPDIR/usr/lib" "$APPDIR/usr/share/icons/hicolor/256x256/apps"
cp -R dist-bin/LeetTrace "$APPDIR/usr/lib/leettrace"
cp packaging/linux/AppRun "$APPDIR/AppRun" && chmod +x "$APPDIR/AppRun"
sed "s/@VERSION@/$VERSION/" packaging/linux/leettrace.desktop > "$APPDIR/leettrace.desktop"
cp packaging/icons/leettrace-256.png "$APPDIR/leettrace.png"
cp packaging/icons/leettrace-256.png "$APPDIR/usr/share/icons/hicolor/256x256/apps/leettrace.png"
TOOL=build/appimagetool
if [ ! -x "$TOOL" ]; then
  curl -fsSL -o "$TOOL" \
    https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage
  chmod +x "$TOOL"
fi
# Containers/CI have no FUSE: run the tool extracted.
APPIMAGE_EXTRACT_AND_RUN=1 ARCH=x86_64 "$TOOL" --no-appstream "$APPDIR" "$OUT"
chmod +x "$OUT"
echo "built: $OUT"
