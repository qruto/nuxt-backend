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

The all-in-one SaaS backend for [Nuxt](https://nuxt.com) on [Convex](https://convex.dev) — **auth** ([Better Auth](https://www.better-auth.com), passwordless: OTP + passkeys), **billing** ([Polar](https://polar.sh)), **transactional email** ([Resend](https://resend.com)), rate limiting, durable workflows, migrations, aggregates, and full-text search. One module, great defaults, every setting customizable.

`nuxt-backend` ships two halves that work as one:

- a **Nuxt module** — the SaaS composables, scaffolding, env preflight, and `#backend/*` aliases; and
- a **Convex component** — a preassembled backend (`defineBackendApp`) that mounts Better Auth, Polar, Resend, the rate limiter, workflows, migrations, and aggregates for you.

The generic Convex ⇄ Nuxt integration underneath (live queries, mutations, SSR, auth plumbing, DevTools, Convex-aware CSP) comes from [`nuxt-convex-module`](https://github.com/qruto/nuxt-convex) — installed and configured automatically. Use that package directly if you only want Convex bindings without the SaaS layer.

> 📖 **Full documentation:** the **[docs site](./website)** (homepage · docs · playground, one Nuxt app) covers installation, every composable, the bundled backend components, and the complete API reference.

## Quick start

### 1. Install

```bash
npx nuxi@latest module add nuxt-backend
```

This is the only package you install — the Convex integration and all bundled components ship as its dependencies.

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
npx convex env set SITE_URL https://your-app.localhost

# optional — each integration is a graceful no-op until configured
npx convex env set RESEND_API_KEY re_...           # email
npx convex env set POLAR_ORGANIZATION_TOKEN ...    # billing
```

### 4. Start the app, then Convex

```bash
npm run dev      # first run scaffolds the Convex files under convex/
npx convex dev
```

That's it — sign in with `useAuth()`, read live data with `useQuery`, gate features with `useFeatures`, and protect pages with the `auth` middleware.

## A taste

```vue
<script setup lang="ts">
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

const { user, sendOtp, signInWithPasskey } = useAuth()
const { isSubscribed, checkout } = useBilling()
const messages = useQuery(api.messages.list, {})
</script>
```

## What the module wires up

Listing `nuxt-backend` in `modules` registers everything below — nothing needs importing or manual wiring.

### Composables (auto-imported, one name per concept)

**SaaS layer (this package)**

- `useAuth` — session + the passwordless flows: `signOut`, `sendOtp`, `signInWithOtp`, `signInWithPasskey`, `registerPasskey`, `changeEmail`, `deleteAccount`; the fully-typed Better Auth `client` for everything else
- `useBilling` — Polar subscription state, `checkout`, `portal`, `changePlan`, `cancel`
- `useFeatures` — entitlement / feature flags from active subscriptions
- `useCredits` — prepaid credit balances + `topUp`
- `useEmailStatus` — live Resend delivery status
- `useWorkflowStatus` — workflow run status
- `useSearch` — debounced full-text search
- `useAggregate` / `useCount` — aggregate-component reads

**Core (from `nuxt-convex-module`)** — `useQuery`, `useQueries`, `useMutation`, `useAction`, `usePaginatedQuery`, `usePreloadedQuery`, `useConvexAuth`, `useConvexConnectionState`, `useUpload`, `useUploadQueue`, `useStorageUrl`, `useConvex`, and friends.

### Components

`<Authenticated>` / `<Unauthenticated>` / `<AuthLoading>` / `<AuthBoundary>` — render by auth state · `<CheckoutLink>` / `<CustomerPortalLink>` — Polar billing links

### Server (Nitro)

`fetchQuery` / `fetchMutation` / `fetchAction` · `preloadQuery` / `preloadedQueryResult` · `convexAuth(event)` — an authenticated, request-scoped Convex client. Plus the same-origin `/api/auth/**` Better Auth proxy and the opt-in `auth` route middleware.

### Aliases

`#backend`, `#backend/api`, `#backend/server`, `#backend/dataModel`, `#backend/_generated` — typed imports for your Convex functions dir (fallback types keep a fresh project compiling before the first `convex dev`).

### Env preflight

On dev startup the module checks your environment — missing site URL, weak `BETTER_AUTH_SECRET`, malformed `SITE_URL` — and prints actionable hints. Unconfigured email/billing is by design a graceful no-op, never a warning.

### Module dependencies

`nuxt-convex-module` (the Convex integration, with Better Auth + Polar force-enabled and this package's passwordless auth client) and [`nuxt-security`](https://nuxt-security.vercel.app) (Convex-aware CSP in production) are installed as true module dependencies — deduplicated if your app lists them too, configurable through their own `convex` / `security` keys.

### The Convex side

The scaffolded `convex/` files compose the backend from `nuxt-backend/convex/*`:

- `defineBackendApp` — mounts the backend component (hybrid Better Auth + nested Resend) plus Polar, rate limiter, workflows, migrations, and aggregates
- `setupAuth` — passwordless Better Auth (OTP + passkey plugins), email templates included
- `setupBilling` — Polar products, checkout, webhook handlers, entitlement cache, prepaid credits (`spendCredits`)
- `setupEmail`, `setupRateLimiter`, `setupWorkflows`, `setupMigrations`, `withTriggers` (aggregates), `defineSearch`

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

1. Clone this repository (and its sibling [`nuxt-convex-module`](https://github.com/qruto/nuxt-convex) next to it — linked via `link:../nuxt-convex-module`)
2. Install dependencies using `pnpm install` (in both repos; run `pnpm dev:prepare` in `nuxt-convex-module` once)
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
