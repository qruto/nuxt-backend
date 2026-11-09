#!/bin/sh
# Vercel's Ignored Build Step (vercel.json → ignoreCommand): exit 0 skips the
# deployment, exit 1 builds it. website/README.md explains the rule.
#
# A push to main skips the build when nothing the site is built from changed
# since the last deployment that went out: only CI, the tests, the templates
# and examples (the site's copy of Panels lives under website/, synced by
# scripts/sync-panels.mjs), the DevTools panel, the size budgets and repository
# notes the site does not render. Everything else builds, a path this list
# does not name included, and so does anything the script cannot decide.
set -u

base=${VERCEL_GIT_PREVIOUS_SHA:-}
[ -n "$base" ] || exit 1
cd "$(git rev-parse --show-toplevel)" || exit 1

# Vercel's clone is shallow: fetch the last deployed commit when it is not in
# it, from the public repository by its URL, as vercel-build.sh does. A diff of
# two commits needs only their trees, not the history between them.
if ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  repository=$(node -p "require('./package.json').repository.url.replace(/^git\+/, '')") || exit 1
  git fetch --quiet --depth=1 "$repository" "$base" || exit 1
fi

git diff --quiet "$base" HEAD -- . \
  ':(exclude).agents' \
  ':(exclude).claude' \
  ':(exclude).claude-plugin' \
  ':(exclude).coderabbit.yaml' \
  ':(exclude).fallowrc.jsonc' \
  ':(exclude).githooks' \
  ':(exclude).github' \
  ':(exclude)_typos.toml' \
  ':(exclude)AGENTS.md' \
  ':(exclude)CLAUDE.md' \
  ':(exclude)CONTRIBUTING.md' \
  ':(exclude)RELEASE.md' \
  ':(exclude)SECURITY.md' \
  ':(exclude)budgets.json' \
  ':(exclude)devtools-client-app' \
  ':(exclude)examples' \
  ':(exclude)lychee.toml' \
  ':(exclude)osv-scanner.toml' \
  ':(exclude)templates' \
  ':(exclude)test' \
  ':(exclude)vitest.config.ts'
status=$?

if [ "$status" -eq 0 ]; then
  echo "vercel-ignore: nothing the site is built from changed since ${base}; skipping the build."
  exit 0
fi
exit 1
