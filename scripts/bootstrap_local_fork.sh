#!/usr/bin/env bash
set -euo pipefail

DEST="${1:-Voidfox-Firefox}"
OVERLAY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -e "$DEST" ]]; then
  echo "Destination already exists: $DEST" >&2
  exit 2
fi

git clone --filter=blob:none https://github.com/mozilla-firefox/firefox.git "$DEST"
python3 "$OVERLAY_DIR/scripts/apply_voidfox.py" "$DEST"

echo
echo "Voidfox source checkout created at: $DEST"
echo "Next: cd \"$DEST\" && ./mach gradle fenix:assembleDebug"
