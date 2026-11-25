#!/usr/bin/env bash
# Release pending changesets (run by the Release workflow on every push to main).
#
# PRs carry only their own commits plus changeset files. After a merge, if main has
# pending changesets, this:
#   1. runs `changeset version` (bumps package.json, writes CHANGELOG.md) and syncs the
#      lockfile's version,
#   2. commits "chore: release vX.Y.Z" to main and tags it vX.Y.Z (one atomic push),
#   3. fast-forwards the `production` branch to that commit. Vercel's production branch
#      is `production`, so this is what deploys (main only gets previews),
#   4. creates a GitHub Release with that version's changelog section.
#
# Merges without changesets release nothing; they ship with the next release.
# If main moves while this runs, it retries on top of the new main.
set -euo pipefail

pending_count() {
  find .changeset -maxdepth 1 -name '*.md' ! -name README.md | wc -l | tr -d ' '
}

released=""
for attempt in 1 2 3; do
  git fetch --quiet --tags origin main
  git checkout --quiet -B main origin/main

  if [ "$(pending_count)" -eq 0 ]; then
    echo "[release] no pending changesets on main; nothing to release"
    exit 0
  fi

  npx --no-install changeset version
  # changeset bumps package.json only; keep package-lock.json's version in step.
  npm install --package-lock-only --ignore-scripts --no-audit --no-fund >/dev/null
  version=$(node -p "require('./package.json').version")
  tag="v$version"
  if git rev-parse --quiet --verify "refs/tags/$tag" >/dev/null; then
    echo "[release] tag $tag already exists; refusing to release over it" >&2
    exit 1
  fi

  git add -A
  git commit --quiet -m "chore: release $tag"
  git tag -a "$tag" -m "$tag"

  if git push --quiet --atomic origin HEAD:main "refs/tags/$tag"; then
    released="$tag"
    break
  fi
  echo "[release] main moved during release (attempt $attempt); retrying on the new main"
  git tag -d "$tag" >/dev/null
done

if [ -z "$released" ]; then
  echo "[release] could not push the release commit after 3 attempts" >&2
  exit 1
fi
echo "[release] committed and tagged $released"

# Deploy: fast-forward production to the release commit. Not forced, so a production
# branch that somehow diverged fails loudly instead of being overwritten.
git push --quiet origin "$released^{commit}:refs/heads/production"
echo "[release] production -> $released"

# Release notes: this version's section of CHANGELOG.md. Non-fatal; the deploy is done.
notes=$(awk -v v="## ${released#v}" '$0 == v { on = 1; next } on && /^## / { exit } on' CHANGELOG.md)
if command -v gh >/dev/null && [ -n "${GH_TOKEN:-}" ]; then
  gh release create "$released" --title "$released" --notes "$notes" --verify-tag ||
    echo "[release] warning: could not create the GitHub Release for $released" >&2
fi
