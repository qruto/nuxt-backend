# Stability

What a version number of `nuxt-backend` promises, which parts are still moving, and how upstream releases translate into releases here.

## The 0.1 line

`0.1.x` is the **complete pack, not yet production-tested**: every capability the package is designed to ship (passwordless auth, workspaces and invitations, billing with entitlements, credits and gifts, email with delivery tracking, webhooks, metered AI, the agent endpoint, rate limiting, workflows, migrations, aggregates, search, the pages, the CLI, the DevTools tab) is present, live-verified against real provider sandboxes, and covered by the test suite — but it has not yet carried real production traffic. `1.0` is the **same promise after production use**: no new surface is required to get there, only the miles.

Within the 0.1 line, patch releases (`0.1.x`) never change the surfaces below. Minor releases (`0.2`, `0.3`, …) may — each change goes through the deprecation cycle and is called out in the changelog. From `1.0`, the same surfaces follow semver strictly: patch and minor releases are additive; removals wait for a major.

## The four surfaces

Everything not listed here — file layout under `dist/`, the internals reachable only through `#backend/*` codegen, the shipped page markup, CLI output wording — may change in any release.

### 1. Package subpaths and what they export

Every `nuxt-backend/<subpath>` in the package `exports` map, and every value and type reachable from one, is public API:

- `nuxt-backend` — the Nuxt module (default export) and its `ModuleOptions`
- `nuxt-backend/app` · `nuxt-backend/auth` · `nuxt-backend/auth.config` · `nuxt-backend/authorization` · `nuxt-backend/http` · `nuxt-backend/functions` · `nuxt-backend/billing` · `nuxt-backend/email` · `nuxt-backend/rate-limit` · `nuxt-backend/migrations` · `nuxt-backend/aggregate` · `nuxt-backend/search` · `nuxt-backend/workflows` — the Convex-side setup helpers
- `nuxt-backend/ai` and `nuxt-backend/mcp` — experimental, see below
- `nuxt-backend/component/convex.config` · `nuxt-backend/component/schema` · `nuxt-backend/component/_generated/component` · `nuxt-backend/component/email` · `nuxt-backend/component/billing` · `nuxt-backend/component/gifts` · `nuxt-backend/component/ai` · `nuxt-backend/component/webhooks` — the all-in-one `backend` component and its function modules (the local-install scaffold re-exports them)
- `nuxt-backend/test` — the convex-test registration helper
- `nuxt-backend/ui.css` · `nuxt-backend/auth.css` · `nuxt-backend/*.css` — the neutral stylesheets and their `data-*` hooks

Anything tagged `@internal` in the source is stripped from the published declarations and is not part of this surface; the surface test (`test/nuxt/public-surface.test.ts`) keeps the tag off everything an entry re-exports and freezes each entry's export list.

### 2. Configuration names

- `ModuleOptions` (`backend` in `nuxt.config`): `url`, `siteUrl`, `authRoute`, `installation`, `scaffold`, `pages`, `loginPath`, `css`, `autoEnv`, `mcp`, `devtools` — and the page keys under `pages`: `login`, `pricing`, `settings`, `profile`, `security`, `acceptInvitation`
- `appConfig.backend` — the content layer: `billing.plans`, `billing.packs`, `brand.name`, `brand.logo`, `labels.auth`, `labels.pricing`, `labels.settings`, `labels.profile`, `labels.security`
- `runtimeConfig.public.backend` — `pages`, the resolved mount path per page key (`''` when disabled)
- the `#backend/*` aliases: `#backend`, `#backend/api`, `#backend/server`, `#backend/dataModel`, `#backend/_generated`

### 3. The auto-import and component registry

The names the module registers, exactly as `src/module.ts` installs them:

- **Composables** — `useAuth`, `useAuthState`, `useConnectionState`, `useLoginFlow`, `useOrganization`, `useSearch`, `useAggregate`, `useCount`, `useBilling`, `useFeatures`, `useCredits`, `useGifts`, `usePasskeys`, `useSessions`, `describeUserAgent`, `unwrapAuth`, `useBackendConfig`, `useEmailStatus`, `useWorkflowStatus`, `useAiStream`
- **Components** — `AuthForm`, `RoleBoundary`, `OrganizationBoundary`, `FeatureBoundary`, `AcceptInvitation`, `GiftClaimBanner`, `PricingTable`, `WorkspaceSettings`, `ProfileSettings`, `SecuritySettings`
- **Server (Nitro) imports** — `backendAuth`, `useBackendMcp`, `defineBackendMcpTool`

The core data composables and components (`useQuery`, `useMutation`, `<Authenticated>`, …) are `nuxt-convex-module`'s surface and follow that package's guarantees.

### 4. The scaffold export contract

The composables bind to deployment functions by name, so the scaffolded `backend/` files must keep exporting them. `src/contract.ts` is that contract — `nuxt-backend doctor` verifies it against the deployment, and the tests pin it to the scaffold templates:

- `auth.ts` — `getAuthUser`, `authConfig`, `listWorkspaces`, `listWorkspaceMembers`, `updateProfile`
- `billing.ts` — `generateCheckoutLink`, `generateCustomerPortalUrl`, `getConfiguredProducts`, `listAllProducts`, `listAllSubscriptions`, `changeCurrentSubscription`, `cancelCurrentSubscription`, `giftCheckout`, `getCurrentSubscription`, `getFeatures`, `getCredits`, `syncEntitlements`, `syncProducts`, `getReceivedGifts`, `claimGift`, `getWebhookDeliveries`
- `email.ts` — `getEmailStatus`

A name is only ever added to this contract in a minor release, and the scaffold ships it in the same release, so `doctor` never fails a project that keeps its scaffolded files current.

## The experimental tier

Tagged `@experimental` in the source and in the API reference. These may change shape in a minor release of the 0.x line without the deprecation cycle; from `1.0` they either graduate into the promise or keep the tag:

- `nuxt-backend/mcp` — the whole agent-surface entry (`useBackendMcp`, `defineBackendMcpTool`, the built-in tool vocabulary). The MCP authorization profile and `@nuxtjs/mcp-toolkit` are both still moving.
- `nuxt-backend/ai` — `setupAi`: the reserve → run → settle metering model over provider meter events.
- `useAiStream` — paired with `nuxt-backend/ai`.
- `useWorkflowStatus` — tracks the upstream workflow component's pre-1.0 status shape.

## Deprecation

A public name is never removed in the release that replaces it. It is marked `@deprecated` naming the replacement, the old and new names both work for **at least one minor release**, and the removal lands in the following breaking release with a changelog entry. Renames of configuration keys, aliases, or registry names follow the same cycle.

## Upstream versions

`nuxt-backend` composes `nuxt-convex-module`, Better Auth, and the `@convex-dev/*` components over the `convex` peer range in `package.json`. Those packages are mostly pre-1.0 and ship breaking changes in minor releases, so their versions map to ours like this:

- A **breaking change in a `better-auth` or `@convex-dev/*` minor** — an API that consumers of this package touch (auth plugin options, component function signatures, schema shape) — is a **major here** (a minor on the 0.x line, announced as breaking). The dependency ranges stay pinned to the last compatible line until then.
- A non-breaking upstream update is a patch here.
- `convex` follows its peer range (`>=1.42.2 <2`); a Convex major is a major here.
- Nuxt majors are majors here. `nuxt-convex-module` is a true dependency, installed and configured for you; its own stability policy applies to the core composables it registers.

`test/unit/peer-ranges.test.ts` keeps the declared ranges honest against the installed versions and against what the upstreams declare for each other.
