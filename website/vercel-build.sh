#!/bin/sh
# Vercel's build command (vercel.json → buildCommand). A script rather than an
# inline command: Vercel caps buildCommand at 256 characters and vercel.json
# allows no comments. website/README.md explains each step.
set -eu

# The docs date each page by its last commit (modules/docs-pages.ts), and
# Vercel clones only the newest commits: a page last changed before them
# would show no date, and the sitemap no lastmod. So the rest of the history
# comes first, from the public repository by its URL (the clone's own remote
# may carry no credentials). If it cannot, those pages go undated, never
# wrongly dated, and the build goes on.
if [ "$(git rev-parse --is-shallow-repository 2>/dev/null || true)" = true ]; then
  repository=$(node -p "require('../package.json').repository.url.replace(/^git\+/, '')")
  git fetch --quiet --unshallow "$repository" \
    || echo 'vercel-build: could not fetch the full history; pages last changed before the clone show no date.' >&2
fi

# The package the site runs on, built from the repository root: the module
# and the Convex component, all the site loads. `prepare` writes the root's
# .nuxt/tsconfig.json, which the module build reads its compiler options
# from. Not `dev:prepare:lib` + `build`: the stub and the component that
# `dev:prepare:lib` builds are thrown away by the module build's own clean of
# dist/, and `build` also builds the DevTools panel, which only a dev server
# serves (src/devtools/serve.ts).
pnpm --dir .. exec nuxt-module-build prepare
pnpm --dir .. run build:nuxt-module
pnpm --dir .. run build:convex-component

# Only a production build deploys the backend. Vercel's Convex integration puts
# CONVEX_DEPLOY_KEY into every environment, and a preview must never push its
# branch to the live deployment. The deploy passes the deployment's URL to the
# site build as NUXT_PUBLIC_BACKEND_URL.
if [ "${VERCEL_ENV:-}" = production ] && [ -n "${CONVEX_DEPLOY_KEY:-}" ]; then
  pnpm exec convex deploy --cmd 'pnpm exec nuxt build' --cmd-url-env-var-name NUXT_PUBLIC_BACKEND_URL
else
  pnpm exec nuxt build
fi

# After every build Vercel packs node_modules into a build cache: about a
# minute of billed post-build time for ~280 MB that no build restores, as
# VERCEL_FORCE_NO_BUILD_CACHE is set (website/README.md says why). The site's
# output in .vercel/output is self-contained, so the dependency trees go
# first and that step has next to nothing to pack. Only on Vercel: a local
# run keeps its node_modules.
if [ -n "${VERCEL:-}" ]; then
  rm -rf ../node_modules node_modules ../devtools-client-app/node_modules
fi
