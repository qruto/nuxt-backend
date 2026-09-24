#!/bin/sh
# Vercel's build command (vercel.json → buildCommand). A script rather than an
# inline command: Vercel caps buildCommand at 256 characters and vercel.json
# allows no comments. website/README.md explains each step.
set -eu

# The package the site runs on, built from the repository root.
pnpm --dir .. run dev:prepare:lib
pnpm --dir .. run build

# Only a production build deploys the backend. Vercel's Convex integration puts
# CONVEX_DEPLOY_KEY into every environment, and a preview must never push its
# branch to the live deployment. The deploy passes the deployment's URL to the
# site build as NUXT_PUBLIC_BACKEND_URL.
if [ "${VERCEL_ENV:-}" = production ] && [ -n "${CONVEX_DEPLOY_KEY:-}" ]; then
  exec pnpm exec convex deploy --cmd 'pnpm exec nuxt build' --cmd-url-env-var-name NUXT_PUBLIC_BACKEND_URL
fi
exec pnpm exec nuxt build
