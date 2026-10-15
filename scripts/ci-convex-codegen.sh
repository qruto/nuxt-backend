#!/usr/bin/env bash
# CI only: generates `backend/_generated/` for the Convex app in the current
# directory and checks it is the typed, component-aware output.
#
# `convex codegen` refuses to run without a deployment, and the component
# graph makes the API types depend on one, so this lets `convex dev --once`
# provision an anonymous *local* deployment (no account, no credentials: the
# CLI downloads the local backend and runs it for the duration of the
# command) and push to it. The push is expected to fail at the end — the
# backend declares required env vars (AUTH_SECRET, SITE_URL) a throwaway
# deployment has no values for — but codegen is complete by then, and the
# checks below are what the step gates on: every generated file, the typed
# `api.d.ts` rather than the untyped placeholder the first codegen phase
# writes, and `components.backend` typed against the package's ComponentApi.
#
# Usage: scripts/ci-convex-codegen.sh [--committed]
#   --committed   also fail when the output differs from what git has, for an
#                 app that commits its codegen (the website)
set -euo pipefail

# The convex CLI the app installed: its own node_modules, or the workspace
# root's for the website (the generated files change shape between versions).
convex=''
dir=$PWD
while [ "$dir" != / ]; do
  if [ -x "$dir/node_modules/.bin/convex" ]; then
    convex="$dir/node_modules/.bin/convex"
    break
  fi
  dir=$(dirname "$dir")
done
if [ -z "$convex" ]; then
  echo "::error::no convex CLI installed at or above $PWD"; exit 1
fi

# Start without the generated files, so every check below is about what this
# run wrote: a push that fails before codegen must not pass on files already
# on disk (the website commits them).
generated_files=(api.d.ts api.js dataModel.d.ts server.d.ts server.js)
for generated in "${generated_files[@]}"; do
  rm -f "backend/_generated/$generated"
done

CONVEX_AGENT_MODE=anonymous "$convex" dev --once --typecheck disable \
  || echo "convex dev --once exited $? (expected: the push needs env vars this deployment does not have)"

for generated in "${generated_files[@]}"; do
  if [ ! -f "backend/_generated/$generated" ]; then
    echo "::error::codegen did not write backend/_generated/$generated"; exit 1
  fi
done
if grep -q 'AnyApi' backend/_generated/api.d.ts; then
  echo "::error::backend/_generated/api.d.ts is the untyped placeholder — the component-aware codegen phase did not run"; exit 1
fi
if ! grep -q 'nuxt-backend/_generated/component' backend/_generated/api.d.ts; then
  echo "::error::backend/_generated/api.d.ts does not type components.backend against the package's ComponentApi"; exit 1
fi
# A new file codegen wrote counts as a difference too: `git diff` alone only
# sees the tracked ones.
if [ "${1:-}" = '--committed' ] && [ -n "$(git status --porcelain -- backend/_generated)" ]; then
  git status --short -- backend/_generated
  git diff -- backend/_generated
  echo "::error::backend/_generated differs from what git has: commit the regenerated files"; exit 1
fi
