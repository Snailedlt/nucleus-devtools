#!/bin/sh
# The files a release hands out besides the .vsix, built and tested the same way everywhere (CI on a pull request,
# the Release workflow): the standalone ncdev for each target, the Notepad++ plugin's zips and the checksums
# `ncdev update` checks. Run after npm ci. Output in the folder given (default: the repository root).
#   sh scripts/release-files.sh [targets] [out]     targets: scripts/sea.mjs's, default win-x64,linux-x64
set -e
cd "$(dirname "$0")/.."
TARGETS="${1:-win-x64,linux-x64}"
out=$(mkdir -p "${2:-.}" && cd "${2:-.}" && pwd)
npm run build
sh scripts/build-native.sh "$TARGETS"
case ",$TARGETS," in *,linux-x64,*) node scripts/smoke-standalone.mjs dist-sea/ncdev-linux-x64 ;; esac
for f in ncdev.exe ncdev-linux-x64; do
  if [ -f "dist-sea/$f" ]; then cp "dist-sea/$f" "$out/$f"; fi
done
grep -E ' (ncdev\.exe|ncdev-linux-x64)$' dist-sea/SHA256SUMS.txt > "$out/SHA256SUMS.txt"
sh scripts/npp-zips.sh "$out"
