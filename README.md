<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/qruto/nuxt-backend/main/.github/assets/hero-dark.svg">
  <img src="https://raw.githubusercontent.com/qruto/nuxt-backend/main/.github/assets/hero-light.svg" alt="nuxt-backend — the all-in-one SaaS backend for Nuxt, built on Convex" width="560">
</picture>

# nuxt-backend

[![Nuxt][nuxt-src]][nuxt-href]
[![Convex][convex-src]][convex-href]
[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Tests][tests-src]][tests-href]
[![Coverage][coverage-src]][coverage-href]
[![License][license-src]][license-href]

The all-in-one SaaS backend for [Nuxt](https://nuxt.com) on [Convex](https://convex.dev) — **auth** ([Better Auth](https://www.better-auth.com), passwordless: OTP + passkeys), workspaces with **emailed invitations** end-to-end, **billing** ([Polar](https://polar.sh)) with feature gating, prepaid credits, and **gift purchases**, **transactional email** ([Resend](https://resend.com)) with delivery tracking, one-call **webhook wiring**, **metered AI** actions and persisted streams, an OAuth-protected **MCP endpoint** where agents act as the signed-in user, rate limiting, durable workflows, migrations, aggregates, and full-text search. One module, great defaults, every setting customizable.

It even ships the pages: `/login`, `/pricing`, `/settings`, `/profile`, `/security`, and `/accept-invitation` mount out of the box — headless components with a neutral stylesheet, customizable at every level (CSS tokens → `app.config` content → slots → shadow the route with your own page) without ever ejecting.

`nuxt-backend` ships two halves that work as one:

- a **Nuxt module** — the SaaS composables, scaffolding, env preflight, and `#backend/*` aliases; and
- a **Convex backend** — a scaffolded `convex.config.ts` that mounts the package's all-in-one `backend` component (auth tables + adapter, email with the provider component nested inside, the billing entitlement cache, and gifts) plus the upstream Polar, rate limiter, workflow, migrations, aggregate, and persistent-text-streaming components, with a `nuxt-backend/*` setup helper for each.

The generic Convex ⇄ Nuxt integration underneath (live queries, mutations, SSR, auth plumbing, DevTools, Convex-aware CSP) comes from [`nuxt-convex-module`](https://github.com/qruto/nuxt-convex-module) — installed and configured automatically. Use that package directly if you only want Convex bindings without the SaaS layer.

> 📖 **Full documentation:** **[nuxt-backend.dev](https://nuxt-backend.dev)** (docs · playground) covers installation, every composable, the bundled backend components, and the complete API reference.

**Requirements:** Nuxt ≥ 4.1 and Node ≥ 24.11.

**Stability:** [STABILITY.md](./STABILITY.md) — what the 0.x line promises, the experimental tier, and how upstream releases map to this package's versions.

## Quick start

### 1. Install

```bash
npx nuxi@latest module add nuxt-backend
```

This is the only package you install — the Convex integration and all bundled components ship as its dependencies.

> Using **strict** pnpm? Add `publicHoistPattern: ['@convex-dev/*']` to `pnpm-workspace.yaml` (or set `nodeLinker: hoisted`) so Convex can resolve the bundled component definitions. See the [installation docs](https://nuxt-backend.dev/getting-started/installation#using-strict-pnpm).

### 2. Add the module

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-backend'],
})
```

### 3. Run it — no configuration

```bash
npx convex dev   # terminal 1 — provisions a dev deployment + codegen
npm run dev      # terminal 2 — scaffolds backend/, derives the Convex URLs,
                 # and provisions the dev deployment env for you
```

That's it — sign in right away (with no email provider connected yet, the
OTP code prints in the `convex dev` console), read live data with `useQuery`,
gate features with `useFeatures`, and protect pages with the `auth`
middleware. There is nothing to copy into `.env`: the Convex URLs derive from
the `CONVEX_DEPLOYMENT` slug, `AUTH_SECRET` is generated, and `SITE_URL`
defaults to localhost on dev deployments.

### 4. Connect services when you're ready

Add provider keys to `.env.local` as you connect email and billing, then sync
them to the deployment:

```bash
npx nuxt-backend env push
```

Only `AUTH_SECRET` and `SITE_URL` are required to deploy; everything else is
optional and degrades in a designed, `nuxt-backend doctor`-visible way until
configured (email sends no-op, billing panels stay empty). Declare your plans,
credit packs, and meters in `backend/billing.catalog.ts` and push the catalog
with `npx nuxt-backend billing sync`.

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
- `useAiStream` — drive a metered, persisted AI token stream (reload mid-stream and the text keeps flowing)
- `useSearch` — debounced full-text search
- `useAggregate` / `useCount` — aggregate-component reads

**Core (from `nuxt-convex-module`)** — `useQuery`, `useQueries`, `useMutation`, `useAction`, `usePaginatedQuery`, `usePreloadedQuery`, `useConvexAuth`, `useConvexConnectionState`, `useUpload`, `useUploadQueue`, `useStorageUrl`, `useConvex`, and friends.

### Components

`<Authenticated>` / `<Unauthenticated>` / `<AuthLoading>` / `<AuthBoundary>` — render by auth state · `<RoleBoundary>` / `<FeatureBoundary>` — gate UI by role or billing entitlement · `<AcceptInvitation>` — the workspace-invitation accept/decline UI (also served by the auto-registered `/accept-invitation` page) · `<GiftClaimBanner>` — surface unclaimed gifts · `<CheckoutLink>` / `<CustomerPortalLink>` — billing links

### Server (Nitro)

`fetchQuery` / `fetchMutation` / `fetchAction` · `preloadQuery` / `preloadedQueryResult` · `convexAuth(event)` — an authenticated, request-scoped Convex client. Plus the same-origin `/api/auth/**` Better Auth proxy and the opt-in `auth` route middleware.

### Agents (MCP)

An OAuth-protected `/mcp` endpoint (Better Auth's OIDC provider + `@nuxtjs/mcp-toolkit`), on by default: an agent signs in through the normal consent flow and every tool call runs your Convex functions **as that signed-in user** — `ctx.auth`, workspace, and billing entity resolve exactly like a web session. Built-in tools cover profile, billing (reads and checkout links — never payments), and workspaces; `defineBackendMcpTool` adds your own. `backend.mcp: false` turns the whole surface off. **Experimental**: the MCP authorization profile and the toolkit are still moving, so this surface may change shape in a 0.x minor (see [STABILITY.md](./STABILITY.md)).

### Nuxt DevTools

A **Backend** tab in Nuxt DevTools: the deployment you're talking to, the env contract's status, the scaffolded files, and the routes — with jump-to-source for your backend functions.

### Aliases

`#backend`, `#backend/api`, `#backend/server`, `#backend/dataModel`, `#backend/_generated` — typed imports for your Convex functions dir (fallback types keep a fresh project compiling before the first `convex dev`).

### Env preflight

On dev startup the module checks your environment — missing site URL, weak `AUTH_SECRET`, malformed `SITE_URL` — and prints actionable hints. The Convex deployment itself enforces the full env at push time: a deploy fails until every required variable is set.

### Module dependencies

`nuxt-convex-module` (the Convex integration, with Better Auth + Polar force-enabled and this package's passwordless auth client) and [`nuxt-security`](https://nuxt-security.vercel.app) (Convex-aware CSP in production) are installed as true module dependencies — deduplicated if your app lists them too, configurable through their own `convex` / `security` keys.

### The Convex side

The scaffolded `backend/` files compose the backend from `nuxt-backend/*`:

- `convex.config.ts` — the explicit app definition, scaffolded for you: declares the env contract (`backendEnv` from `nuxt-backend/app`), mounts the all-in-one `backend` component (auth + email + billing cache + gifts, with the email provider nested inside) and the upstream components one `app.use` each, and forwards the email config
- `setupAuth` — passwordless Better Auth (OTP + passkey plugins), workspaces with emailed invitations, email templates included
- `setupBilling` — products, checkout, webhook handlers, entitlement cache, prepaid credits (`spendCredits`), and gift purchases (`giftCheckout` / `claimGift`)
- `setupAi` (`nuxt-backend/ai`) — metered actions and persisted token streams: rate-limited, prepaid-credit-metered with reserve → run → settle (a failed run costs nothing), usage ingested into the billing provider
- `registerBackendRoutes` — one call mounts every inbound route: auth routes, `/billing/events`, `/email/events`, `/ai/stream`, and the agent token exchange at `/mcp/exchange`
- `setupEmail`, `setupRateLimiter`, `setupWorkflows`, `setupMigrations`, `withTriggers` (aggregates), `defineSearch`

### CLI

`npx nuxt-backend <command>` — `init` scaffolds the backend files, `.env.example`, and the `nuxt.config` wiring (re-run to restore missing files); `doctor` checks the project and deployment configuration (`--fix` repairs what it can); `env push` syncs `.env.local` to the Convex deployment; `billing sync` pushes your `billing.catalog.ts` to the billing provider and writes the id map.

## Documentation

Everything is on [nuxt-backend.dev](https://nuxt-backend.dev) — the site (docs · playground) is the [`website/`](./website) app of this repository, and `pnpm dev` at the root serves it.

| Section | What's inside |
|---|---|
| [Getting Started](https://nuxt-backend.dev/getting-started/introduction) | Introduction, quickstart, installation, configuration, architecture, examples |
| [Client Guide](https://nuxt-backend.dev/guide/authentication) | Auth, queries & mutations, server & SSR, file storage, aliases, customization |
| [Platform](https://nuxt-backend.dev/platform/overview) | Auth, workspaces, authorization, billing & credits, AI, email, webhooks, workflows, rate limiting, migrations, aggregates, search |
| [Agents](https://nuxt-backend.dev/agents/mcp-server) | The OAuth-protected MCP endpoint, built-in and custom tools, consent, connecting a client |
| [API Reference](https://nuxt-backend.dev/api-reference/composables) | Composables, server utilities, client, entrypoints, module options |
| [Developer Experience](https://nuxt-backend.dev/tooling/cli) | CLI, DevTools, testing, local installation |
| [Production](https://nuxt-backend.dev/production/deployment) | Deployment, launch checklist, security, troubleshooting |

## Examples

- [`examples/minimal`](./examples/minimal) — the exact `nuxt-backend init` scaffold, zero custom backend code: passwordless auth, workspace invitations, billing, credits, and gifts out of the box
- [`examples/advanced`](./examples/advanced) — every customization point in one app: local component install, custom email templates, custom webhook paths and hooks, a customized `convex.config.ts` (extra env, an unmounted component), and a custom invitation accept page

## Contributing

1. Clone this repository
2. Install dependencies using `pnpm install`
3. Prepare for development using `pnpm dev:prepare`
4. Start development server using `pnpm dev`

We follow conventional commits (Dependabot PRs do too). See [CONTRIBUTING.md](./CONTRIBUTING.md) and [RELEASE.md](./RELEASE.md) for the full workflow.

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

[nuxt-src]: https://img.shields.io/badge/Nuxt-020420?logo=nuxt&style=plastic
[nuxt-href]: https://nuxt.com

[convex-src]: https://img.shields.io/badge/Convex-020420?logo=convex&style=plastic
[convex-href]: https://convex.dev
