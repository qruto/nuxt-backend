# Stability

What a version number of `nuxt-backend` promises, which parts are still moving, and how upstream releases translate into releases here.

## The 0.x line

The 0.x line (from `0.2.0`; `0.1.0` was a throwaway test publish) is the **complete pack, not yet production-tested**: every capability the package is designed to ship (passwordless auth, workspaces and invitations, billing with entitlements, credits and gifts, email with delivery tracking, webhooks, metered AI, the agent endpoint, rate limiting, workflows, migrations, aggregates, search, the pages, the CLI, the DevTools tab) is present, live-verified against real provider sandboxes, and covered by the test suite — but it has not yet carried real production traffic. `1.0` is the **same promise after production use**: no new surface is required to get there, only the miles.

Within the 0.x line, patch releases (`0.2.x`) never change the surfaces below. Minor releases (`0.3`, `0.4`, …) may — each change goes through the deprecation cycle and is called out in the changelog. From `1.0`, the same surfaces follow semver strictly: patch and minor releases are additive; removals wait for a major.

## The five surfaces

Everything not listed here — file layout under `dist/`, the internals reachable only through `#backend/*` codegen, the shipped page markup, CLI output wording — may change in any release. The `create nuxt` templates and the examples (`templates/*`, `examples/*`) are documentation, not a surface: they track `nuxt-backend: latest`, change with the default branch, and an app created from one is yours from then on.

### 1. Package subpaths and what they export

Every `nuxt-backend/<subpath>` in the package `exports` map, and every value and type reachable from one, is public API:

- `nuxt-backend` — the Nuxt module (default export) and its `ModuleOptions`
- the Convex-side setup helpers:
  - `nuxt-backend/aggregate`
  - `nuxt-backend/app`
  - `nuxt-backend/auth`
  - `nuxt-backend/auth.config`
  - `nuxt-backend/authorization`
  - `nuxt-backend/billing`
  - `nuxt-backend/email`
  - `nuxt-backend/functions`
  - `nuxt-backend/http`
  - `nuxt-backend/migrations`
  - `nuxt-backend/rate-limit`
  - `nuxt-backend/search`
  - `nuxt-backend/workflows`
- `nuxt-backend/ai` and `nuxt-backend/mcp` — experimental, see below
- `nuxt-backend/convex.config` · `nuxt-backend/_generated/component` — the all-in-one `backend` component and the types of its API
- `nuxt-backend/test` — the convex-test registration helper
- `nuxt-backend/eslint` — the ESLint preset (`backendEslint`, `BACKEND_ESLINT_RULES`); its rule list and levels follow the upstream recommended set, so an upstream change to that set lands here in a minor release
- the `data-*` hooks the neutral stylesheet styles, and the `--bk-*` tokens it reads (the module adds the stylesheet itself), with their mapping onto `@nuxt/ui`'s tokens when an app has it

Anything tagged `@internal` in the source is stripped from the published declarations and is not part of this surface; the surface test (`test/nuxt/public-surface.test.ts`) keeps the tag off everything an entry re-exports and freezes each entry's export list.

### 2. Configuration names

- `ModuleOptions` (`backend` in `nuxt.config`):
  - `authRoute`
  - `autoEnv`
  - `devtools`
  - `mcp`
  - `pages`
  - `scaffold`
  - `siteUrl`
  - `url`
- the page keys under `pages`:
  - `acceptInvitation`
  - `agentConsent`
  - `login`
  - `pricing`
  - `profile`
  - `security`
  - `settings`
- `appConfig.backend`, the content layer:
  - `billing.lowCreditsThreshold`
  - `billing.packs`
  - `billing.plans`
  - `brand.logo`
  - `brand.name`
  - `labels.auth`
  - `labels.credits`
  - `labels.history`
  - `labels.pricing`
  - `labels.profile`
  - `labels.security`
  - `labels.settings`
  - `labels.usage`
- `runtimeConfig.public.backend` — `pages`, the mount path per page key, and `authRoute`, the same-origin auth route
- the `#backend/*` aliases:
  - `#backend`
  - `#backend/_generated`
  - `#backend/api`
  - `#backend/dataModel`
  - `#backend/server`

### 3. The auto-import and component registry

The names the module registers, exactly as `src/nuxt/registry.ts` writes them:

- **Composables**:
  - `describeUserAgent`
  - `unwrapAuth`
  - `useAgentConsent`
  - `useAggregate`
  - `useAiStream`
  - `useAuth`
  - `useAuthState`
  - `useBackendConfig`
  - `useBilling`
  - `useConnectionState`
  - `useCount`
  - `useCredits`
  - `useEmailChange`
  - `useEmailStatus`
  - `useFeatures`
  - `useGifts`
  - `useLoginFlow`
  - `useOrders`
  - `useOrganization`
  - `usePasskeys`
  - `useSandboxInbox`
  - `useSearch`
  - `useSessions`
  - `useUsage`
  - `useWorkflowStatus`
- **Components**:
  - `AcceptInvitation`
  - `AgentConsent`
  - `AuthForm`
  - `BillingCheckoutLink` — the neutral name of the base module's `CheckoutLink`, which stays registered too
  - `BillingHistory`
  - `BillingPortalLink` — the neutral name of the base module's `CustomerPortalLink`, which stays registered too
  - `CreditsLowBanner`
  - `FeatureBoundary`
  - `GiftClaimBanner`
  - `OrganizationBoundary`
  - `PricingTable`
  - `ProfileSettings`
  - `RoleBoundary`
  - `SecuritySettings`
  - `UsageHistory`
  - `WorkspaceSettings`
- **Server (Nitro) imports**:
  - `backendAuth`
  - `defineBackendMcpTool`
  - `useBackendMcp`
- **Route middleware** — `auth` (`definePageMeta({ middleware: 'auth' })`): the neutral name for the base module's guard, which it registers as `convex-auth`; both stay registered and point at the same file

The billing-history surface — `useOrders`, `useUsage`, `<BillingHistory>`, `<UsageHistory>`, `<CreditsLowBanner>` — ships **stable**, deliberately, not in the experimental tier: each one binds to a deployment function named in the scaffold contract below, which `nuxt-backend doctor` verifies, and each degrades to an empty state rather than an error when the backend has not deployed its half.

The core data composables and components (`useQuery`, `useMutation`, `<Authenticated>`, …) are `nuxt-convex-module`'s surface and follow that package's guarantees.

### 4. The scaffold export contract

The composables bind to deployment functions by name, so the scaffolded `backend/` files must keep exporting them. `src/contract.ts` is that contract — `nuxt-backend doctor` verifies it against the deployment, and the tests pin it to the scaffold templates:

- `auth.ts`:
  - `authConfig`
  - `getAuthUser`
  - `listSessions`
  - `listWorkspaceMembers`
  - `listWorkspaces`
  - `revokeSession`
  - `updateProfile`
- `billing.ts`:
  - `cancelCurrentSubscription`
  - `cancelSubscription`
  - `changeCurrentSubscription`
  - `claimGift`
  - `generateCheckoutLink`
  - `generateCustomerPortalUrl`
  - `getConfiguredProducts`
  - `getCredits`
  - `getCurrentSubscription`
  - `getFeatures`
  - `getInvoiceUrl`
  - `getOrders`
  - `getReceivedGifts`
  - `getUsageHistory`
  - `getWebhookDeliveries`
  - `giftCheckout`
  - `listAllProducts`
  - `listAllSubscriptions`
  - `pauseSubscription`
  - `refundOrder`
  - `resumeSubscription`
  - `syncEntitlements`
  - `syncProducts` (internal: for operations)
  - `uncancelSubscription`
  - `updateSubscription`
- `email.ts`:
  - `getEmailStatus`

A name is only ever added to this contract in a minor release, and the scaffold ships it in the same release, so `doctor` never fails a project that keeps its scaffolded files current.

### 5. Diagnostics and environment variables

`nuxt-backend doctor --json` is a contract for scripts and coding agents, described by [its JSON Schema](https://nuxt-backend.dev/schemas/doctor.json). Each finding's `id` and the `service` it belongs to (the name `--only` selects) are frozen; its title, message and fix hint are wording (see below). The ids, by service:

- `agents`:
  - `agent-consent-path`
  - `agent-login-path`
  - `mcp`
- `ai`:
  - `ai-stream-route`
- `auth`:
  - `auth-secret`
  - `deployment-auth-secret`
  - `deployment-auth-trust-local-origins`
  - `deployment-site-url`
  - `invitation-path`
  - `site-url`
- `billing`:
  - `billing-access`
  - `billing-benefit-grace`
  - `billing-feature-benefits`
  - `billing-meter-usage`
  - `billing-multiple-subscriptions`
  - `billing-organization`
  - `billing-portal`
  - `billing-proration`
  - `billing-trial-abuse`
  - `billing-webhook-route`
  - `billing-webhook-secret`
  - `deployment-billing-access-token`
  - `deployment-billing-environment`
  - `deployment-billing-webhook-secret`
- `deployment`:
  - `backend-site-url`
  - `deployment-env`
- `email`:
  - `deployment-email-api-key`
  - `deployment-email-from`
  - `deployment-email-test-mode`
  - `deployment-email-webhook-secret`
  - `email-transport`
  - `email-webhook-route`
  - `email-webhook-secret`
- `scaffold`:
  - `convex-codegen`
  - `dev-script`
  - `function-contract`

The environment variables the package reads, by name: the keys of `backendEnv` (`nuxt-backend/app`), `NUXT_BACKEND_LOG_OTP`, which dev tooling sets, and the Nuxt app's `NUXT_PUBLIC_BACKEND_*`:

- `AUTH_SECRET`
- `AUTH_TRUST_LOCAL_ORIGINS`
- `BILLING_ACCESS_TOKEN`
- `BILLING_ENVIRONMENT`
- `BILLING_WEBHOOK_SECRET`
- `EMAIL_API_KEY`
- `EMAIL_FROM`
- `EMAIL_TEST_MODE`
- `EMAIL_WEBHOOK_SECRET`
- `NUXT_BACKEND_LOG_OTP`
- `NUXT_PUBLIC_BACKEND_SITE_URL`
- `NUXT_PUBLIC_BACKEND_URL`
- `SITE_URL`

## The experimental tier

Tagged `@experimental` in the source and in the API reference. These may change shape in a minor release of the 0.x line without the deprecation cycle; from `1.0` they either graduate into the promise or keep the tag:

- `nuxt-backend/mcp` — the whole agent-surface entry (`useBackendMcp`, `defineBackendMcpTool`, the built-in tool vocabulary). The MCP authorization profile and `@nuxtjs/mcp-toolkit` are both still moving.
- `nuxt-backend/ai` — `setupAi`: the reserve → run → settle metering model over provider meter events.
- `useAiStream` — paired with `nuxt-backend/ai`.
- `useWorkflowStatus` — tracks the upstream workflow component's pre-1.0 status shape.
- `useSandboxInbox` — the sandbox inbox for demos, previews and e2e runs, together with the `setupEmail(…).api.getSandboxInbox` query behind it; its retention and the code it extracts may still change.

## Deprecation

A public name is never removed in the release that replaces it. It is marked `@deprecated` naming the replacement, the old and new names both work for **at least one minor release**, and the removal lands in the following breaking release with a changelog entry. Renames of configuration keys, aliases, or registry names follow the same cycle.

## Upstream versions

`nuxt-backend` composes `nuxt-convex-module`, Better Auth, and the `@convex-dev/*` components over the `convex` peer range in `package.json`. Those packages are mostly pre-1.0 and ship breaking changes in minor releases, so their versions map to ours like this:

- A **breaking change in a `better-auth` or `@convex-dev/*` minor** — an API that consumers of this package touch (auth plugin options, component function signatures, schema shape) — is a **major here** (a minor on the 0.x line, announced as breaking). The dependency ranges stay pinned to the last compatible line until then.
- A non-breaking upstream update is a patch here.
- `convex` follows its peer range (`>=1.46.0 <2` — the floor is what `nuxt-convex-module` 0.11 needs for `FunctionReference_future`, above the lowest version every bundled `@convex-dev/*` component and `convex-helpers` accept; `check:manifest` verifies it against the installed tree); a Convex major is a major here. `vue` is a peer too (`^3.5.41`, the floor the bundled MCP toolkit needs), satisfied by any Nuxt 4.1+ app. `@convex-dev/eslint-plugin` (`^5.0.0`) and `eslint` (`^9.0.0 || ^10.0.0`) are optional peers, needed only by `nuxt-backend/eslint`; a major of either is a minor here.
- Nuxt majors are majors here. `nuxt-convex-module` is a true dependency, installed and configured for you; its own stability policy applies to the core composables it registers.

`test/unit/peer-ranges.test.ts` keeps the declared ranges honest against the installed versions and against what the upstreams declare for each other. [Ecosystem](https://nuxt-backend.dev/docs/reference/ecosystem) lists every upstream package this one ships, bundles, supports or plans, and the docs contract keeps that page in step with `package.json`.

## Supported versions

Nuxt `^4.1.0` (Nuxt 4 from 4.1; not yet Nuxt 5, whose Nitro 3 the server handlers do not run on) and Node `>=24.11.0`, plus these `peerDependencies` ranges — `vue` and `convex` are required, the rest optional, needed only by the subpath that uses them:

| Package | Range | Needed by |
|---|---|---|
| `vue` | `^3.5.41` | every app |
| `convex` | `>=1.46.0 <2` | every app (the Convex CLI and client) |
| `convex-test` | `>=0.0.54` | `nuxt-backend/test` |
| `eslint` | `^9.0.0 \|\| ^10.0.0` | `nuxt-backend/eslint` |
| `@convex-dev/eslint-plugin` | `^5.0.0` | `nuxt-backend/eslint` |

The Backend tab works with the Nuxt DevTools that Nuxt 4 installs (3.x). CI installs the packed package into the starter and both examples with the newest Nuxt and Convex every week, builds them and serves a page from each, so the newest release in every range above is one this package has run on.

## Not covered

- The wording of the module's warnings, errors and preflight findings, of the deployment's log lines, and of the CLI's output may change in any release. [Troubleshooting](https://nuxt-backend.dev/docs/ship/operate/troubleshooting) documents them, with the code each log line starts with.
- The DevTools panel: its UI, its RPC and the in-page bridge it reads are internal to the panel.
- The layout of `dist/` beyond the files the `exports` map names.
- Generated template filenames and Nuxt payload keys.
- The docs site and the generated API reference's formatting.
