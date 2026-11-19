#!/usr/bin/env bash
# Vercel's own build of the workbench preview (vercel.json at the repository root; the nucleus-workbench-preview
# project, its root directory the repository root). Every pushed branch gets a preview built with the core of the same
# commit (src/core at the repository root); claude/next-release (the next release, that branch's own preview) links
# the `test-build` pre-release on its tools page. --preview: no search indexing, What's new shows Unreleased, no
# live-site counts.
set -euo pipefail
cd "$(dirname "$0")"
BRANCH="${VERCEL_GIT_COMMIT_REF:-main}"
echo "Building $BRANCH (the workbench and its core from the same commit)"
rm -rf .hubdata
(cd ../.. && npm ci --no-audit --no-fund)
npm ci --no-audit --no-fund
# Every Hub handler, from our own copy (the data branch).
git clone -q --depth 1 --branch data https://github.com/Snailedlt/nucleus-devtools.git .hubdata
EXTRA=()
[ "$BRANCH" = claude/next-release ] && EXTRA=(--test-build)
# Live vote counts from the real site (read only: previews never send votes).
export FEEDBACK_COUNTS_GOATCOUNTER="${FEEDBACK_COUNTS_GOATCOUNTER:-nucleus-workbench}"
node build.mjs --hub-data .hubdata --preview "${EXTRA[@]}"
