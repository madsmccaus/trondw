#!/bin/sh
# Vercel "Ignored Build Step". Exit 0 = skip the build, 1 = build.
# New posts only change live post data (data/2026+ month files, data/entries.json).
# That data is read at request time by api/data.js, so those commits need no deploy.
LIVE=':(exclude,glob)data/20[2-9][0-9]-[0-9][0-9].json'
LOG=':(exclude)data/entries.json'
base="$VERCEL_GIT_PREVIOUS_SHA"
if [ -z "$base" ] || ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  base=$(git rev-parse -q --verify HEAD^) || exit 1
fi
# Paths that changed, minus live data. Archive months before 2026 still trigger a build.
changed=$(git diff --name-only "$base" HEAD -- . "$LIVE" "$LOG")
frozen=$(git diff --name-only "$base" HEAD -- 'data/20[01][0-9]-*.json' 'data/202[0-5]-*.json')
if [ -z "$changed" ] && [ -z "$frozen" ]; then
  echo "Only live post data changed; no deploy needed (api/data.js serves it)."
  exit 0
fi
echo "Code or archive changed; building."
exit 1
