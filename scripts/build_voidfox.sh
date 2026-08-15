#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-.}"
cd "$ROOT"
if [[ ! -x "./mach" ]]; then
  echo "Run this from a Firefox source checkout (or pass its path)." >&2
  exit 2
fi
./mach gradle fenix:assembleDebug
echo
echo "Voidfox debug build completed. Search under mobile/android/fenix/app/build/outputs/apk/ for the APK."
