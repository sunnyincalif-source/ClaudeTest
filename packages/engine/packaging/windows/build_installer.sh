#!/usr/bin/env bash
# Wrap dist-bin/LeetTrace (PyInstaller onedir) into the NSIS installer.
set -euo pipefail
cd "$(dirname "$0")/../.."
VERSION="$1"
MAKENSIS=$(command -v makensis || true)
for candidate in "/c/Program Files (x86)/NSIS/makensis.exe" "/c/Program Files/NSIS/makensis.exe"; do
  [ -z "$MAKENSIS" ] && [ -x "$candidate" ] && MAKENSIS="$candidate"
done
if [ -z "$MAKENSIS" ]; then
  echo "makensis not found; installing NSIS via Chocolatey"
  choco install nsis -y --no-progress >/dev/null
  MAKENSIS="/c/Program Files (x86)/NSIS/makensis.exe"
fi
to_win() { if command -v cygpath >/dev/null; then cygpath -w "$1"; else echo "$1"; fi; }
OUT="dist-bin/LeetTrace-Setup-windows-x64.exe"
"$MAKENSIS" -V2 \
  "-DVERSION=$VERSION" \
  "-DSRC=$(to_win "$PWD/dist-bin/LeetTrace")" \
  "-DOUT=$(to_win "$PWD/$OUT")" \
  "-DICON=$(to_win "$PWD/packaging/icons/leettrace.ico")" \
  "$(to_win "$PWD/packaging/windows/installer.nsi")"
echo "built: $OUT"
