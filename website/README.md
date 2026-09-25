# The documentation site

The Nuxt app behind the docs, the landing page and the live playground.

It deploys to Vercel. The `vercel.json` next to this file is its whole configuration, because the
Vercel project's **Root Directory** is set to `website`.

## Why `buildCommand` isn't just `nuxt build`

The site depends on `nuxt-backend` and loads it as a Nuxt module. pnpm links the repository root
into `node_modules`, but that link points at a package whose `dist/` is gitignored. On a fresh
clone the build dies before rendering anything (`Failed to load tsconfig '../.nuxt/tsconfig.json'`,
then `Cannot resolve module "nuxt-backend"`). So the command builds the package first:

- `dev:prepare:lib` generates the repository root's `.nuxt/tsconfig.json`, the module stub and
  the Convex component. Without it `nuxt-module-build` can't resolve compiler options.
- `build` then replaces the stub with a real build — the module, the component and the DevTools
  panel. The stub symlinks `dist/runtime` at `src/`, fine for development, not for a deploy.
- Then the site's own build, in one of two ways:
  - **production** (`VERCEL_ENV=production` and a `CONVEX_DEPLOY_KEY`): `convex deploy --cmd 'nuxt build'
    --cmd-url-env-var-name NUXT_PUBLIC_BACKEND_URL` pushes `website/backend/` to the playground's
    production deployment, regenerates `backend/_generated` against it and builds the site with
    `NUXT_PUBLIC_BACKEND_URL` set to that deployment — the [Convex + Vercel](https://docs.convex.dev/production/hosting/vercel)
    pattern.
  - **anything else**: a plain `nuxt build`, even when a deploy key is present. Vercel's Convex
    integration writes `CONVEX_DEPLOY_KEY` into every environment; checking `VERCEL_ENV` keeps a
    pull-request preview from ever pushing its code to the live deployment. The site's `backend/_generated` is committed
    (regenerated and diff-checked by CI's `website` job), so the build needs no deployment; the
    playground renders its offline state (`/playground/offline`, via
    `middleware/playground-offline.global.ts` — without it the module's `auth` middleware fails
    the gated pages on the server).

The steps live in `vercel-build.sh`, which `vercel.json` runs: Vercel caps `buildCommand` at 256
characters, and `vercel.json` allows no comments — its schema rejects unknown properties,
including `$comment`. That's what this file and the script's comments are for.

## Settings that live in Vercel, not here

| Setting | Value | Why |
| --- | --- | --- |
| Root Directory | `website` | The app isn't at the repository root |
| Include source files outside the Root Directory | **on** | The package is built from the repo root |
| Node.js version | 24.x | `engines.node` |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` | Uses the `packageManager` pin instead of Vercel's own pnpm |
| `VERCEL_FORCE_NO_BUILD_CACHE` | `1` (preview + production) | No restored `node_modules`: with the hoisted linker, a cached tree plus a changed lockfile fails `pnpm install` with `ERR_PNPM_EEXIST` on the nested `node_modules` it tries to rename — every dependency PR's preview was red for that alone. The install costs a minute more and is deterministic |
| Production env | `CONVEX_DEPLOY_KEY` (the playground's production deployment — the Convex integration sets it), `NUXT_SITE_URL=https://nuxt-backend.dev` | The live playground's Convex project and the canonical origin. `NUXT_PUBLIC_BACKEND_URL` is not set here: the build injects the deployment's URL (the `.convex.site` twin is derived from it — `NUXT_PUBLIC_BACKEND_SITE_URL` only for a custom domain) |
| Preview env | **nothing Convex-related** — remove the `CONVEX_DEPLOY_KEY` the integration adds to Preview and Development | A preview renders the docs and the playground's offline state. The build command ignores a key outside production anyway; removing it keeps the key where it is needed |
| Deployment Protection → Vercel Authentication | **off** | A preview nobody can open isn't a preview; this is a public docs site |

The playground's production deployment (`determined-horse-300`, created by the Convex integration)
is configured from a checkout, with its production deploy key — Vercel → Settings → Environment
Variables → `CONVEX_DEPLOY_KEY` (Production). Check the key first: `echo "${CONVEX_DEPLOY_KEY%%|*}"`
must print `prod:determined-horse-300`. Then, from the repository root, after `pnpm build`:

1. `AUTH_SECRET` and `SITE_URL` directly — `.env.local` has no `AUTH_SECRET`, and its `SITE_URL` is
   the local origin: `npx convex env set AUTH_SECRET "$(openssl rand -base64 32)"` and
   `npx convex env set SITE_URL https://nuxt-backend.dev`.
2. The rest from `.env.local` — `pnpm cli env push --prod`. It never replaces a value already set,
   so step 1 survives. **Never `--force all`** from a dev `.env.local`: it would overwrite
   `SITE_URL` with the local origin. `BILLING_ENVIRONMENT` stays `sandbox` — the live playground
   bills against the provider's sandbox, never its production.
3. The webhook secrets belong to the production endpoints (`https://determined-horse-300.convex.site/billing/events`
   and `/email/events`, registered in the Polar sandbox and Resend dashboards), not to the dev ones
   `env push` copies: set each with `npx convex env set`.
4. `npx convex run billing:syncProducts`, then `pnpm cli doctor --prod`.

Every `npx convex` above runs with the key in the environment; prefix it per command rather than
exporting it into a shell you keep using.

## The two previews on a pull request

| Preview | What it shows | Convex |
| --- | --- | --- |
| **Vercel** — `nuxt-backend-git-<branch>-razum.vercel.app` | The website as that branch would ship it: docs, landing, API reference | none — the playground renders its offline state |
| **StackBlitz** — from the pkg.pr.new comment | `examples/minimal`, a real Nuxt app running the PR's *package build* | **yours** — `npx convex dev` in the StackBlitz terminal |

## Running it locally

```sh
pnpm dev          # from the repository root — convex dev + the component watcher + nuxt dev
```
