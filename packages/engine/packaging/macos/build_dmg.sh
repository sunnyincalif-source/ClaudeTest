#!/usr/bin/env bash
# Wrap dist-bin/LeetTrace.app into a drag-to-Applications .dmg whose window shows the
# one-time first-launch step (SPEC-PRODUCT §10). Signs + notarizes when the Apple secrets are
# set (see RELEASING.md); unsigned otherwise.
set -euo pipefail
cd "$(dirname "$0")/../.."
ARCH="$1"
OUT="dist-bin/LeetTrace-macos-$ARCH.dmg"
APP=dist-bin/LeetTrace.app

# --- optional: sign the app (secrets: APPLE_DEVELOPER_ID, APPLE_CERT_P12_BASE64, APPLE_CERT_PASSWORD)
if [ -n "${APPLE_DEVELOPER_ID:-}" ] && [ -n "${APPLE_CERT_P12_BASE64:-}" ]; then
  echo "signing LeetTrace.app as $APPLE_DEVELOPER_ID"
  KEYCHAIN=build/signing.keychain-db
  echo "$APPLE_CERT_P12_BASE64" | base64 --decode > build/cert.p12
  security create-keychain -p ci "$KEYCHAIN"
  security set-keychain-settings -lut 3600 "$KEYCHAIN"
  security unlock-keychain -p ci "$KEYCHAIN"
  security import build/cert.p12 -k "$KEYCHAIN" -P "${APPLE_CERT_PASSWORD:-}" -T /usr/bin/codesign
  security set-key-partition-list -S apple-tool:,apple: -s -k ci "$KEYCHAIN" >/dev/null
  security list-keychains -d user -s "$KEYCHAIN" $(security list-keychains -d user | tr -d '"')
  codesign --deep --force --options runtime --timestamp --sign "$APPLE_DEVELOPER_ID" "$APP"
  rm -f build/cert.p12
else
  echo "no Apple signing secrets: building an unsigned app (first launch: right-click → Open)"
fi

STAGE=build/dmg-stage
rm -rf "$STAGE" "$OUT" && mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
cp "packaging/macos/First time - read me.txt" "$STAGE/"
BG=build/dmg-background.png
uv run python packaging/macos/make_background.py "$BG"

if command -v create-dmg >/dev/null; then
  # Styled window: background with the instructions, app → Applications arrow.
  create-dmg --volname "LeetTrace" --background "$BG" --window-size 640 400 \
    --icon-size 104 --icon "LeetTrace.app" 170 190 --app-drop-link 470 190 \
    --icon "First time - read me.txt" 560 60 --hide-extension "LeetTrace.app" \
    --no-internet-enable "$OUT" "$STAGE" ||
    { echo "create-dmg failed; falling back to a plain dmg"; rm -f "$OUT"; }
fi
if [ ! -f "$OUT" ]; then
  ln -s /Applications "$STAGE/Applications"
  hdiutil create -volname "LeetTrace" -srcfolder "$STAGE" -ov -format UDZO "$OUT"
fi

# --- optional: notarize + staple (secrets: APPLE_ID, APPLE_TEAM_ID, APPLE_APP_PASSWORD)
if [ -n "${APPLE_DEVELOPER_ID:-}" ] && [ -n "${APPLE_ID:-}" ]; then
  codesign --force --timestamp --sign "$APPLE_DEVELOPER_ID" "$OUT"
  xcrun notarytool submit "$OUT" --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" \
    --password "$APPLE_APP_PASSWORD" --wait
  xcrun stapler staple "$OUT"
fi
echo "built: $OUT"
