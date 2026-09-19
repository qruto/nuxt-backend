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
  - **production** (a `CONVEX_DEPLOY_KEY` is set): `convex deploy --cmd 'nuxt build'` pushes
    `website/backend/` to the playground's production deployment, regenerates `backend/_generated`
    against it and builds the site — the [Convex + Vercel](https://docs.convex.dev/production/hosting/vercel)
    pattern.
  - **preview** (no key): a plain `nuxt build`. The site's `backend/_generated` is committed
    (regenerated and diff-checked by CI's `website` job), so the build needs no deployment; the
    playground renders its offline state.

`vercel.json` has no comments in it because Vercel's schema rejects unknown properties, including
`$comment`. That's what this file is for.

## Settings that live in Vercel, not here

| Setting | Value | Why |
| --- | --- | --- |
| Root Directory | `website` | The app isn't at the repository root |
| Include source files outside the Root Directory | **on** | The package is built from the repo root |
| Node.js version | 24.x | `engines.node` |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` | Uses the `packageManager` pin instead of Vercel's own pnpm |
| `VERCEL_FORCE_NO_BUILD_CACHE` | `1` (preview + production) | No restored `node_modules`: with the hoisted linker, a cached tree plus a changed lockfile fails `pnpm install` with `ERR_PNPM_EEXIST` on the nested `node_modules` it tries to rename — every dependency PR's preview was red for that alone. The install costs a minute more and is deterministic |
| Production env | `CONVEX_DEPLOY_KEY` (the playground's production deployment), `NUXT_PUBLIC_BACKEND_URL`, `NUXT_SITE_URL=https://nuxt-backend.dev` | The live playground's Convex project and the canonical origin |
| Preview env | **nothing Convex-related** | A preview renders the docs and the playground's offline state; it can never push or create a Convex deployment |
| Deployment Protection → Vercel Authentication | **off** | A preview nobody can open isn't a preview; this is a public docs site |

The playground's production deployment is configured with the package's own tooling from a
checkout that has its `.env.local`: `npx nuxt-backend env push --prod` (with `BILLING_ENVIRONMENT=sandbox`
— the live playground bills against the provider's sandbox, never its production), then
`npx nuxt-backend doctor --prod`.

## The two previews on a pull request

| Preview | What it shows | Convex |
| --- | --- | --- |
| **Vercel** — `nuxt-backend-git-<branch>-razum.vercel.app` | The website as that branch would ship it: docs, landing, API reference | none — the playground renders its offline state |
| **StackBlitz** — from the pkg.pr.new comment | `examples/minimal`, a real Nuxt app running the PR's *package build* | **yours** — `npx convex dev` in the StackBlitz terminal |

## Running it locally

```sh
pnpm dev          # from the repository root — convex dev + the component watcher + nuxt dev
```
