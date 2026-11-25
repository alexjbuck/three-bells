#!/usr/bin/env bash
# Version a pull request branch in place, so merging it deploys code, version and
# changelog together (Vercel deploys every push to main).
#
# Usage: scripts/version-pr.sh <branch>     (run from a clone with an "origin" remote)
#
# The PR branch ends with at most one live "chore: version packages [bot]" commit:
#   1. If the branch already has one, revert it. That restores its changeset files and
#      undoes its package.json/CHANGELOG.md edits. No force-push is needed.
#   2. Merge the latest origin/main, so the bump is computed on top of whatever has
#      merged since. This is what keeps parallel PRs from conflicting.
#   3. Run `changeset version` and commit the result.
#
# It skips branches with nothing to version, and branches whose bump is still current.
# Exit codes: 0 = done or nothing to do, 2 = merge conflict with main (needs a human).
set -euo pipefail

branch="${1:?usage: version-pr.sh <branch>}"
BOT_SUBJECT="chore: version packages [bot]"

git fetch --quiet origin main "$branch"
head="origin/$branch"

# Pending changesets in the branch's tree (README.md and config.json aren't changesets).
pending=$(git ls-tree --name-only "$head" .changeset/ | grep -E '\.md$' | grep -vc '^\.changeset/README\.md$' || true)

# Most recent bot commit on the branch that isn't on main. Each run reverts the previous
# one before adding a new one, so only the most recent is ever live.
live=""
while IFS=$'\t' read -r sha subject; do
  if [ "$subject" = "$BOT_SUBJECT" ]; then
    live="$sha"
    break
  fi
done < <(git log --format='%H%x09%s' "origin/main..$head")

if git merge-base --is-ancestor origin/main "$head"; then up_to_date=true; else up_to_date=false; fi

if [ "$pending" -eq 0 ] && [ -z "$live" ]; then
  echo "[version-pr] $branch: no changesets, nothing to version"
  exit 0
fi
if [ "$pending" -eq 0 ] && [ -n "$live" ] && $up_to_date; then
  echo "[version-pr] $branch: already versioned against current main"
  exit 0
fi

git checkout --quiet -B "$branch" "$head"

if [ -n "$live" ]; then
  echo "[version-pr] $branch: reverting previous version bump ${live:0:7}"
  git revert --no-edit "$live" >/dev/null
fi

if ! git merge --no-edit origin/main >/dev/null; then
  git merge --abort
  echo "[version-pr] $branch: merge conflict with main; resolve it on the branch" >&2
  exit 2
fi

pending=$(find .changeset -maxdepth 1 -name '*.md' ! -name README.md | wc -l | tr -d ' ')
if [ "$pending" -gt 0 ]; then
  npx --no-install changeset version
  git add -A
  git commit --quiet -m "$BOT_SUBJECT"
  echo "[version-pr] $branch: now at version $(node -p "require('./package.json').version")"
fi

if [ "$(git rev-parse HEAD)" != "$(git rev-parse "$head")" ]; then
  git push --quiet origin "HEAD:$branch"
  echo "[version-pr] $branch: pushed"
fi
