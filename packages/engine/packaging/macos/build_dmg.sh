#!/usr/bin/env bash
# Wrap dist-bin/LeetTrace.app into a drag-to-Applications .dmg.
set -euo pipefail
cd "$(dirname "$0")/../.."
ARCH="$1"
OUT="dist-bin/LeetTrace-macos-$ARCH.dmg"
STAGE=build/dmg-stage
rm -rf "$STAGE" "$OUT" && mkdir -p "$STAGE"
cp -R dist-bin/LeetTrace.app "$STAGE/"
ln -s /Applications "$STAGE/Applications"
# The one-time unsigned-app step, visible right in the install window (SPEC-PRODUCT §10).
cp "packaging/macos/First time - read me.txt" "$STAGE/"
hdiutil create -volname "LeetTrace" -srcfolder "$STAGE" -ov -format UDZO "$OUT"
echo "built: $OUT"
