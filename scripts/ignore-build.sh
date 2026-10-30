#!/bin/sh
# Vercel "Ignored Build Step". Exit 0 = skip the build, 1 = build.
# New posts only change live post data (data/2026+ month files, data/entries.json).
# api/data.js reads that at request time, so such commits need no deploy.
# Skip only when we can prove that, against the last successful deploy of this
# branch (VERCEL_GIT_PREVIOUS_SHA); when in doubt, build.
base="$VERCEL_GIT_PREVIOUS_SHA"
if [ -z "$base" ]; then echo "No previous deploy for this branch; building."; exit 1; fi
if ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  git fetch -q --depth=50 origin "$base" 2>/dev/null || true
fi
if ! git cat-file -e "$base^{commit}" 2>/dev/null; then echo "Previous deploy commit not available; building."; exit 1; fi
if ! git merge-base --is-ancestor "$base" HEAD 2>/dev/null; then echo "History was rewritten; building."; exit 1; fi

changed=$(git diff --name-only "$base" HEAD | grep -Ev '^data/(20(2[6-9]|[3-9][0-9])-[0-9]{2}\.json|entries\.json)$')
if [ -z "$changed" ]; then
  echo "Only live post data changed since $base; no deploy needed (api/data.js serves it)."
  exit 0
fi
echo "Code or archive changed; building."
exit 1
