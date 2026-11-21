#!/bin/sh
# The skill's bundle (plugin/skills/nucleus-handler/scripts/nucleus.js, several MB) is committed only with a release,
# so the history doesn't grow by a bundle per change (AGENTS.md, Commands). This fails when a branch changes it
# without changing package.json's version. CI runs it on every pull request.
#   sh scripts/check-skill-bundle.sh <base ref>     e.g. origin/main
set -e
base="$1"
f=plugin/skills/nucleus-handler/scripts/nucleus.js
if git diff --quiet "$base"...HEAD -- "$f"; then exit 0; fi
was=$(git show "$(git merge-base "$base" HEAD)":package.json | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).version")
now=$(node -p "require('./package.json').version")
if [ "$was" = "$now" ]; then
  echo "::error file=$f::This branch changes the skill's bundle without a release (package.json is still $now). Leave it out: git checkout $base -- $f"
  exit 1
fi
