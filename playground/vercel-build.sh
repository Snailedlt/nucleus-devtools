#!/usr/bin/env bash
# Vercel's own build of the workbench preview (vercel.json at the repo root; the nucleus-workbench-preview project).
# Every pushed branch gets a preview built with splitscreenme-vscode's branch of the same name when there is one,
# else its main; claude/next-release (the next release, nucleus-workbench-next.vercel.app) links the `test-build`
# pre-release on its tools page. --preview: no search indexing, What's new shows Unreleased, no live-site counts.
set -euo pipefail
cd "$(dirname "$0")"
BRANCH="${VERCEL_GIT_COMMIT_REF:-main}"
CORE_URL=https://github.com/Snailedlt/splitscreenme-vscode.git
# The exact branch: compare the ref field (ls-remote also matches refs that only end in the name).
if git ls-remote --heads "$CORE_URL" | awk -v r="refs/heads/$BRANCH" '$2 == r { f = 1 } END { exit !f }'; then CORE="$BRANCH"; else CORE=main; fi
echo "Building $BRANCH with splitscreenme-vscode@$CORE"
rm -rf .core .hubdata
git clone -q --depth 1 --branch "$CORE" "$CORE_URL" .core
(cd .core && npm ci --no-audit --no-fund)
npm ci --no-audit --no-fund
# Every Hub handler, from our own copy (the data branch).
git clone -q --depth 1 --branch data https://github.com/Snailedlt/nucleuscoop-handler-testbench.git .hubdata
EXTRA=()
[ "$BRANCH" = claude/next-release ] && EXTRA=(--test-build)
node build.mjs --core .core --hub-data .hubdata --preview "${EXTRA[@]}"
