#!/bin/sh
# The Notepad++ plugin zips, as Plugins Admin wants them (NcDev.dll at the root of each), from the DLLs in dist-sea/
# (npm run standalone or scripts/build-native.sh). Writes NcDev.zip (64-bit) and NcDev-x86.zip (32-bit) to the
# repository root, or to the folder given. CI and the Release workflow use it; scripts/npp-plugin-list.mjs checks them.
set -e
cd "$(dirname "$0")/.."
out=$(mkdir -p "${1:-.}" && cd "${1:-.}" && pwd)
rm -f "$out/NcDev.zip" "$out/NcDev-x86.zip"
(cd dist-sea && zip -q -X "$out/NcDev.zip" NcDev.dll)
tmp=$(mktemp -d)
cp dist-sea/NcDev-x86.dll "$tmp/NcDev.dll"
(cd "$tmp" && zip -q -X "$out/NcDev-x86.zip" NcDev.dll)
rm -rf "$tmp"
