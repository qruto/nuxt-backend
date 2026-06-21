# nuxt-backend

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Tests][tests-src]][tests-href]
[![Coverage][coverage-src]][coverage-href]
[![Minified size][min-size-src]][size-href]
[![Minzipped size][minzip-size-src]][size-href]
[![License][license-src]][license-href]
[![GitHub stars][stars-src]][stars-href]
[![Nuxt][nuxt-src]][nuxt-href]

Integrate [Convex](https://convex.dev) with [Nuxt](https://nuxt.com) — one package that ships a **Nuxt module** and a **Convex auth component** with [Better Auth](https://www.better-auth.com) built in.

`nuxt-backend` is a Vue/Nuxt port of the official Convex + Better Auth React/Next integration. It keeps the same core pieces — the Better Auth Convex plugin, Convex auth config, server helpers, auth-aware preloading, and client auth state — but preconfigures the route wiring and component setup so new Nuxt apps do less manual installation work.

> 📖 **Full documentation:** the **[docs site](./website)** (homepage · docs · playground, one Nuxt app) covers installation, the integration guide, every composable and server helper, the bundled backend components, and the complete API reference.

## How it plugs into Nuxt

Listing `nuxt-backend` in your `modules` array wires Convex into every layer of the app — through the same `@nuxt/kit` integration points any module uses. Everything below is registered for you; nothing needs importing or manual wiring. Signatures and full options live in the [API reference](./docs/content/5.api-reference).

### Auto-imported composables · `addImports`

Use these in any `<script setup>` without an import — Nuxt resolves them globally. Each also has a `useConvex*`-prefixed alias to avoid name clashes.

**Data**
- `useQuery` / `useConvexQuery` — reactive live query (plus `useQuery_experimental`, the 1.39 result/error split)
- `useQueries` / `useConvexQueries` — several live queries over one subscription
- `useMutation` / `useConvexMutation` — call a Convex mutation
- `useAction` / `useConvexAction` — call a Convex action
- `usePaginatedQuery` — cursor pagination (plus `usePaginatedQuery_experimental`, dual-overload)
- `useSearch` / `useConvexSearch` — full-text search
- `useAggregate` / `useCount` — aggregate-component reads
- `usePreloadedQuery` — hydrate an SSR-preloaded query on the client
- `useConvexConnectionState` — live WebSocket connection status
- `useConvex` — the underlying Convex client

**Files**
- `useUpload` / `useConvexUpload` / `uploadFile` — upload to Convex storage
- `useUploadQueue` / `useConvexUploadQueue` — multi-file upload queue
- `useStorageUrl` / `useConvexStorageUrl` — resolve a stored file's URL

**Auth**
- `useAuth` — Better Auth session, sign-in/out
- `useConvexAuth` / `provideConvexAuth` — Convex auth state
- `usePreloadedAuthQuery` — hydrate an SSR-preloaded authenticated query

**Backend components**
- `useBilling` / `useConvexBilling` — Polar billing & checkout state
- `useCredits` / `useConvexCredits` — prepaid credit balance
- `useFeatures` / `useConvexFeatures` — feature / entitlement flags
- `useEmailStatus` — Resend delivery status
- `useWorkflowStatus` — workflow run status

**App API wiring**
- `provideBackendApi` / `useBackendApi` / `useBackendNamespace` — provide and consume the generated `api`

### Auto-imported components · `addComponent`

Drop straight into templates, no import:
- `<Authenticated>` / `<Unauthenticated>` / `<AuthLoading>` — render by auth state
- `<CheckoutLink>` / `<CustomerPortalLink>` — Polar billing links

### Server (Nitro) auto-imports · `addServerImports`

Available in any server route, API handler, or SSR context:
- `fetchQuery` / `fetchMutation` / `fetchAction` — one-shot Convex calls
- `preloadQuery` / `preloadedQueryResult` — SSR preload and the client hydration handoff
- `backendAuth(event)` — an authenticated, request-scoped Convex client

### Server handler · `addServerHandler`

- `/api/auth/**` — same-origin Better Auth proxy to your Convex deployment (route configurable via `backend.authRoute`)

### Route middleware · `addRouteMiddleware`

- `auth` — opt-in and non-global; protect a page with `definePageMeta({ middleware: 'auth' })`

### Plugins · `addPlugin` / `addPluginTemplate`

- **client auth plugin** — boots the Convex client and auth state in the browser
- **server auth plugin** — prefetches the auth token for SSR hydration
- **provide-api plugin** — auto-provides the generated `api` app-wide (templated and filesystem-guarded: a no-op until `convex dev` has emitted `_generated/`, then regenerated with the real wiring)

### Runtime config & import aliases

- **Runtime config** (`backend` key): public `backend.url` / `backend.siteUrl`, private `backend.siteUrl`
- **Aliases** (Vite + Nitro): `#backend`, `#backend/api`, `#backend/server`, `#backend/dataModel`, `#backend/_generated`

### Module dependency · `moduleDependencies`

- Installs and configures [`nuxt-security`](https://nuxt-security.vercel.app), applying a Convex-aware CSP in production — `connect-src`, `img-src`, and `media-src` scoped to your deployment. Configure it through the `security` key; it can't be disabled.

### Zero-config scaffold

- On the first `dev` run, writes the minimum Convex files under your functions dir to mount the auth component and register routes.

## Quick start

### 1. Install

```bash
npx nuxi@latest module add nuxt-backend
```

This is the only package you install — the bundled Convex components ship as its dependencies.

> Using **strict** pnpm? Add `public-hoist-pattern[]=@convex-dev/*` to `.npmrc` (or set `node-linker=hoisted`) so Convex can resolve the bundled component definitions. See the [installation docs](./website/content/1.getting-started/2.installation.md#using-strict-pnpm).

### 2. Add the module

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-backend'],
})
```

### 3. Configure environment variables

```bash
# .env.local (Nuxt app)
NUXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
NUXT_PUBLIC_CONVEX_SITE_URL=https://your-deployment.convex.site
```

```bash
# Convex deployment
npx convex env set BETTER_AUTH_SECRET=$(openssl rand -base64 32)
npx convex env set SITE_URL https://nuxt-backend.localhost
```

### 4. Start the app, then Convex

```bash
npm run dev      # first run scaffolds the Convex files under backend/
npx convex dev
```

That's it — sign in with `useAuth()`, read live data with `useQuery`, and protect pages with the `auth` middleware. See the [getting-started guide](./website/content/1.getting-started/2.installation.md) for the full walkthrough.

## A taste

```vue
<script setup lang="ts">
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

const { session } = useAuth()
const currentUser = useQuery(api.auth.getAuthUser, {})
</script>

<template>
  <p>Signed in as {{ session.data?.user.email }}</p>
  <pre>{{ currentUser }}</pre>
</template>
```

A complete working example lives in the [`website/`](./website) app — the product homepage, the full documentation, and an interactive playground are one Nuxt app, built with [Docus](https://docus.dev).

## Documentation

The site (homepage · docs · playground) lives in [`website/`](./website):

```bash
cd website
pnpm dev        # local preview at http://localhost:3000
pnpm generate   # static build
```

| Section | What's inside |
|---|---|
| [Getting Started](./website/content/1.getting-started) | Introduction, installation, configuration, architecture |
| [Guide](./website/content/2.guide) | Auth, queries & mutations, server & SSR, file storage, import aliases |
| [Backend Components](./website/content/3.backend-components) | Email, billing & credits, rate limiting, workflows, migrations, aggregates, search |
| [Convex Backend](./website/content/4.convex-backend) | Auth setup, customizing auth, local installation, testing |
| [API Reference](./website/content/5.api-reference) | Composables, server utilities, client, entrypoints, module options |

## Contributing

1. Clone this repository
2. Install dependencies using `pnpm install`
3. Prepare for development using `pnpm dev:prepare`
4. Start development server using `pnpm dev`

We follow conventional commits (Renovate PRs do too). See [CONTRIBUTING.md](./CONTRIBUTING.md) and [RELEASING.md](./RELEASING.md) for the full workflow.

## License

[MIT](./LICENSE)

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/nuxt-backend/latest.svg?style=plastic&colorA=020420&colorB=00DC82
[npm-version-href]: https://npmjs.com/package/nuxt-backend

[npm-downloads-src]: https://img.shields.io/npm/dm/nuxt-backend.svg?style=plastic&colorA=020420&colorB=00DC82
[npm-downloads-href]: https://npm.chart.dev/nuxt-backend

[license-src]: https://img.shields.io/npm/l/nuxt-backend.svg?style=plastic&colorA=020420&colorB=00DC82
[license-href]: https://npmjs.com/package/nuxt-backend

[tests-src]: https://img.shields.io/github/actions/workflow/status/qruto/nuxt-backend/ci.yml?branch=main&style=plastic&colorA=020420&label=tests
[tests-href]: https://github.com/qruto/nuxt-backend/actions/workflows/ci.yml

[coverage-src]: https://img.shields.io/codecov/c/github/qruto/nuxt-backend?style=plastic&colorA=020420&label=coverage
[coverage-href]: https://codecov.io/gh/qruto/nuxt-backend

[min-size-src]: https://img.shields.io/bundlephobia/min/nuxt-backend?style=plastic&colorA=020420&colorB=00DC82&label=min
[minzip-size-src]: https://img.shields.io/bundlephobia/minzip/nuxt-backend?style=plastic&colorA=020420&colorB=00DC82&label=min%2Bgzip
[size-href]: https://bundlephobia.com/package/nuxt-backend

[stars-src]: https://img.shields.io/github/stars/qruto/nuxt-backend?style=plastic&logo=github&logoColor=white&colorA=181717&colorB=181717
[stars-href]: https://github.com/qruto/nuxt-backend

[nuxt-src]: https://img.shields.io/badge/Nuxt-020420?logo=nuxt&style=plastic
[nuxt-href]: https://nuxt.com
