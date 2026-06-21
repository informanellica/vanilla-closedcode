#!/usr/bin/env bash
# Developer ID code-sign a built macOS SEA package so it can be notarized.
#
# The SEA package (dist/closedcode-darwin-<arch>/) contains many Mach-O files
# beyond the main binary: native .node addons, node-pty's `spawn-helper`
# (no extension), and `.bare` dylibs. `notarytool` rejects the archive unless
# EVERY Mach-O is signed with a Developer ID cert + secure timestamp + hardened
# runtime — so we discover them by file type (not extension) and sign all of
# them, then re-sign the main binary last with the JIT/library entitlements.
#
# Usage:
#   CC_MAC_SIGN_ID="Developer ID Application: Name (TEAMID)" \
#     script/sign-mac.sh dist/closedcode-darwin-arm64
#   # or rely on the single Developer ID Application identity in the keychain.
#
# Run `script/build.js --sea` + `sea.js` first; foreign-arch prebuilds are
# pruned by build.js so only this arch's Mach-O remain to sign. After signing,
# zip the dir and submit it with `xcrun notarytool submit`.
set -euo pipefail

PKG_DIR="${1:?usage: sign-mac.sh <dist/closedcode-darwin-arch>}"
[ -x "$PKG_DIR/bin/closedcode" ] || { echo "no bin/closedcode under $PKG_DIR" >&2; exit 1; }

ENTITLEMENTS="$(cd "$(dirname "$0")/.." && pwd)/resources/entitlements.mac.plist"
[ -f "$ENTITLEMENTS" ] || { echo "missing entitlements: $ENTITLEMENTS" >&2; exit 1; }

# Resolve the Developer ID Application identity (explicit, or the sole one).
ID="${CC_MAC_SIGN_ID:-}"
if [ -z "$ID" ]; then
  ID="$(security find-identity -v -p codesigning | awk -F'"' '/Developer ID Application/{print $2; exit}')"
fi
[ -n "$ID" ] || { echo "no Developer ID Application identity (set CC_MAC_SIGN_ID)" >&2; exit 1; }
echo "signing identity: $ID"

# 1) every Mach-O sidecar (addons, spawn-helper, .bare dylibs), runtime+timestamp.
find "$PKG_DIR" -type f ! -path "*/bin/closedcode" -print0 \
  | while IFS= read -r -d '' f; do
      if file "$f" | grep -q "Mach-O"; then
        codesign --force --timestamp --options runtime --sign "$ID" "$f"
      fi
    done

# 2) the main binary last, with the Node/JIT entitlements.
codesign --force --timestamp --options runtime \
  --entitlements "$ENTITLEMENTS" --sign "$ID" "$PKG_DIR/bin/closedcode"

# 3) verify the main binary is valid and still launches.
codesign --verify --strict --verbose=2 "$PKG_DIR/bin/closedcode"
"$PKG_DIR/bin/closedcode" --version >/dev/null
echo "signed + verified: $PKG_DIR"
