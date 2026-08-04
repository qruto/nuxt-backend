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

The all-in-one SaaS backend for [Nuxt](https://nuxt.com) on [Convex](https://convex.dev) — **auth** ([Better Auth](https://www.better-auth.com), passwordless: OTP + passkeys), workspaces with **emailed invitations** end-to-end, **billing** ([Polar](https://polar.sh)) with feature gating, prepaid credits, and **gift purchases**, **transactional email** ([Resend](https://resend.com)) with delivery tracking, one-call **webhook wiring**, rate limiting, durable workflows, migrations, aggregates, and full-text search. One module, great defaults, every setting customizable.

`nuxt-backend` ships two halves that work as one:

- a **Nuxt module** — the SaaS composables, scaffolding, env preflight, and `#backend/*` aliases; and
- a **Convex backend** — a preassembled app definition (`defineBackendApp`) that mounts the package's all-in-one `backend` component (auth tables + adapter, email with the provider component nested inside, the billing entitlement cache, and gifts) plus the upstream Polar, rate limiter, workflow, migrations, and aggregate components for you.

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

All nine Convex deployment variables are **required** — a deploy fails until every one is set, so misconfiguration surfaces at push time instead of in production:

```bash
# Convex deployment
npx convex env set AUTH_SECRET "$(openssl rand -base64 32)"
npx convex env set SITE_URL https://your-app.localhost

# email (powered by Resend)
npx convex env set EMAIL_API_KEY re_...
npx convex env set EMAIL_FROM "Acme <hello@yourdomain.com>"
npx convex env set EMAIL_TEST_MODE true
npx convex env set EMAIL_WEBHOOK_SECRET whsec_...

# billing (powered by Polar)
npx convex env set BILLING_ACCESS_TOKEN ...
npx convex env set BILLING_WEBHOOK_SECRET ...
npx convex env set BILLING_ENVIRONMENT sandbox   # or production
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
- `useOrganization` — workspaces + the full invitation flow: `invite`, `acceptInvitation`, `declineInvitation`, `cancelInvitation`, `getInvitation`, `listReceivedInvitations`
- `useBilling` — subscription state, `checkout`, `gift`, `portal`, `changePlan`, `cancel`
- `useFeatures` — entitlement / feature flags from active subscriptions
- `useCredits` — prepaid credit balances + `topUp` and `gift`
- `useGifts` — gifts addressed to the signed-in user, auto-claimed on first sign-in (or explicit `claim`)
- `useEmailStatus` — live email delivery status
- `useWorkflowStatus` — workflow run status
- `useSearch` — debounced full-text search
- `useAggregate` / `useCount` — aggregate-component reads

**Core (from `nuxt-convex-module`)** — `useQuery`, `useQueries`, `useMutation`, `useAction`, `usePaginatedQuery`, `usePreloadedQuery`, `useConvexAuth`, `useConvexConnectionState`, `useUpload`, `useUploadQueue`, `useStorageUrl`, `useConvex`, and friends.

### Components

`<Authenticated>` / `<Unauthenticated>` / `<AuthLoading>` / `<AuthBoundary>` — render by auth state · `<RoleBoundary>` / `<FeatureBoundary>` — gate UI by role or billing entitlement · `<AcceptInvitation>` — the workspace-invitation accept/decline UI (also served by the auto-registered `/accept-invitation` page) · `<GiftClaimBanner>` — surface unclaimed gifts · `<CheckoutLink>` / `<CustomerPortalLink>` — billing links

### Server (Nitro)

`fetchQuery` / `fetchMutation` / `fetchAction` · `preloadQuery` / `preloadedQueryResult` · `convexAuth(event)` — an authenticated, request-scoped Convex client. Plus the same-origin `/api/auth/**` Better Auth proxy and the opt-in `auth` route middleware.

### Aliases

`#backend`, `#backend/api`, `#backend/server`, `#backend/dataModel`, `#backend/_generated` — typed imports for your Convex functions dir (fallback types keep a fresh project compiling before the first `convex dev`).

### Env preflight

On dev startup the module checks your environment — missing site URL, weak `AUTH_SECRET`, malformed `SITE_URL` — and prints actionable hints. The Convex deployment itself enforces the full env at push time: a deploy fails until every required variable is set.

### Module dependencies

`nuxt-convex-module` (the Convex integration, with Better Auth + Polar force-enabled and this package's passwordless auth client) and [`nuxt-security`](https://nuxt-security.vercel.app) (Convex-aware CSP in production) are installed as true module dependencies — deduplicated if your app lists them too, configurable through their own `convex` / `security` keys.

### The Convex side

The scaffolded `convex/` files compose the backend from `nuxt-backend/convex/*`:

- `defineBackendApp` — mounts the all-in-one `backend` component (auth + email + billing cache + gifts, with the email provider nested inside) plus the upstream Polar, rate limiter, workflow, migrations, and aggregate components, declares the required env vars, and forwards the email config
- `setupAuth` — passwordless Better Auth (OTP + passkey plugins), workspaces with emailed invitations, email templates included
- `setupBilling` — products, checkout, webhook handlers, entitlement cache, prepaid credits (`spendCredits`), and gift purchases (`giftCheckout` / `claimGift`)
- `registerBackendRoutes` — one call mounts every inbound webhook: auth routes, `/billing/events`, `/email/events`
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

## Examples

- [`examples/minimal`](./examples/minimal) — the exact `nuxt-backend init` scaffold, zero custom backend code: passwordless auth, workspace invitations, billing, credits, and gifts out of the box
- [`examples/advanced`](./examples/advanced) — every customization point in one app: local component install, custom email templates, custom webhook paths and hooks, a hand-written `defineApp` + `installBackend`, and a custom invitation accept page

## Contributing

1. Clone this repository (and its sibling [`nuxt-convex-module`](https://github.com/qruto/nuxt-convex) next to it — linked via `link:../nuxt-convex-module`)
2. Install dependencies using `pnpm install` (in both repos; run `pnpm dev:prepare` in `nuxt-convex-module` once)
3. Prepare for development using `pnpm dev:prepare`
4. Start development server using `pnpm dev`

We follow conventional commits (Dependabot PRs do too). See [CONTRIBUTING.md](./CONTRIBUTING.md) and [RELEASING.md](./RELEASING.md) for the full workflow.

## Security

Found a vulnerability? Report it privately via [GitHub Security Advisories](https://github.com/qruto/nuxt-backend/security/advisories/new) — not in a public issue. See [SECURITY.md](./SECURITY.md).

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
