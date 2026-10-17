#!/usr/bin/env bash
# Wrap dist-bin/LeetTrace (PyInstaller onedir) into the NSIS installer. Signs the executables
# and the installer when the Windows signing secrets are set (see RELEASING.md).
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

# --- optional code signing (secrets: WINDOWS_CERT_PFX_BASE64, WINDOWS_CERT_PASSWORD)
sign() {
  [ -n "${WINDOWS_CERT_PFX_BASE64:-}" ] || return 0
  local signtool
  signtool=$(ls "/c/Program Files (x86)/Windows Kits/10/bin/"*/x64/signtool.exe 2>/dev/null | tail -1)
  [ -n "$signtool" ] || { echo "signtool not found"; return 1; }
  [ -f build/cert.pfx ] || echo "$WINDOWS_CERT_PFX_BASE64" | base64 --decode > build/cert.pfx
  "$signtool" sign /f "$(to_win "$PWD/build/cert.pfx")" /p "${WINDOWS_CERT_PASSWORD:-}" \
    /tr http://timestamp.digicert.com /td sha256 /fd sha256 "$(to_win "$1")"
}
if [ -n "${WINDOWS_CERT_PFX_BASE64:-}" ]; then
  sign dist-bin/LeetTrace/LeetTrace.exe
  sign dist-bin/LeetTrace/leettrace-cli.exe
else
  echo "no Windows signing secrets: building an unsigned installer (SmartScreen: More info → Run anyway)"
fi

OUT="dist-bin/LeetTrace-Setup-windows-x64.exe"
"$MAKENSIS" -V2 \
  "-DVERSION=$VERSION" \
  "-DSRC=$(to_win "$PWD/dist-bin/LeetTrace")" \
  "-DOUT=$(to_win "$PWD/$OUT")" \
  "-DICON=$(to_win "$PWD/packaging/icons/leettrace.ico")" \
  "-DREADME=$(to_win "$PWD/packaging/windows/readme.txt")" \
  "$(to_win "$PWD/packaging/windows/installer.nsi")"
sign "$OUT"
rm -f build/cert.pfx
echo "built: $OUT"
