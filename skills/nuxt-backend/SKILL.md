---
name: nuxt-backend
description: Build and change Nuxt apps that use nuxt-backend, the all-in-one SaaS backend on Convex (passwordless auth, workspaces and invitations, billing with plans, credits and gifts, transactional email, webhooks, metered AI, an OAuth-protected agent endpoint). Use when installing nuxt-backend or starting a new app with it, when a project depends on nuxt-backend or has a backend/ folder with convex.json pointing at it, when adding pages or Convex functions to such an app, when wiring sign-in, pricing, credits, workspaces or email, when a user asks about `npx nuxt-backend` commands, env vars, the billing catalog or doctor findings, and when customizing the packaged pages.
---

# nuxt-backend

`nuxt-backend` is one npm package with two halves:

- a **Nuxt module**: composables, components, pages, a same-origin auth proxy, server utilities;
- an **all-in-one Convex component**, `backend`: the auth tables, email, the billing cache,
  gifts, AI metering and the webhook log.

The app's own Convex functions live in `backend/`, and each scaffolded file there re-exports the
package's setup. Docs: https://nuxt-backend.dev, and for agents https://nuxt-backend.dev/llms.txt.

## Not installed yet?

No `nuxt-backend` in `package.json`, or no Nuxt app at all: follow
[references/install.md](references/install.md) first. It covers a new app from the starter and an
existing one, the first deployment (a local one needs no account), and how to check the result.

## Ground rules

- **Neutral names.** The public API says `auth`, `billing`, `email`, `backend`, never a provider
  name. Keep provider names out of app code, UI labels and env var names.
- **Never edit `backend/_generated/`.** `convex dev` rewrites it. Import from `#backend/api`,
  `#backend/dataModel` and `#backend/server` in the app, and from `./_generated/*` inside `backend/`.
- **Keep the scaffolded exports.** The composables call functions by name (`getAuthUser` in
  `auth.ts`, `getCurrentSubscription` in `billing.ts`, `getEmailStatus` in `email.ts`, and more).
  Add functions beside them; don't rename or delete them. `npx nuxt-backend doctor` checks the
  contract against the deployment.
- **Convex rules apply** inside `backend/`: validators on every function's `args`, indexes over
  `.filter()`, no `process.env` outside the env contract. `npx convex ai-files install` writes
  Convex's own guidelines.

## Commands

| Command | What it does |
|---|---|
| `npx nuxt-backend init` | Scaffolds `backend/`, `convex.json`, `.env.example`, AGENTS.md and `.mcp.json`, and adds the module to `nuxt.config`. `--no-agents` skips the agent files |
| `npx nuxt-backend dev` | The `dev` script: sets up a dev deployment on first run, provisions its env, then runs Convex and Nuxt together |
| `npx nuxt-backend doctor` | Checks env, codegen, the function contract, webhook routes and the billing catalog. `--fix` repairs what it can, `--prod` checks production, `--json` prints findings with a `service` and a `docsUrl`, `--only billing` checks one service |
| `npx nuxt-backend env push` | Syncs `.env` and `.env.local` to the deployment. Dev deployments also get `AUTH_SECRET` and `SITE_URL` generated. `--preview <branch> --site-url <url>` fills a preview deployment, `--defaults preview --site-url <url>` writes the project's preview env defaults |
| `npx nuxt-backend billing sync` | Creates the products in `backend/billing.catalog.ts`, writes `backend/billing.generated.ts`, stores the webhook secret on the deployment and loads the products there. `--json` for a machine-readable outcome |
| `npx nuxt-backend inbox [address]` | Prints the sign-in codes a dev deployment sent to a sandbox address (`delivered+<label>@resend.dev`). Dev deployments only |

No command prompts. `--json` prints one JSON document with progress on stderr, exit code `1` means refused or failed, and `--help` ends with what the command may change: reads only, project files, the dev deployment, a preview, the project's env defaults, production or provider accounts. Run a command that writes production only when the user asks for it.

## Environment

The deployment holds the env, not Nuxt:

- **Required:** `AUTH_SECRET` and `SITE_URL`. A push fails without them.
- **Optional:**
  - `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_TEST_MODE` and `EMAIL_WEBHOOK_SECRET`;
  - `BILLING_ACCESS_TOKEN`, `BILLING_ENVIRONMENT` and `BILLING_WEBHOOK_SECRET`.
  Each missing one degrades a feature in a documented way.
- **Nuxt side:** `NUXT_PUBLIC_BACKEND_URL`, usually derived for you.
- **The Convex CLI's own:** `CONVEX_DEPLOYMENT`, `CONVEX_SITE_URL` and `CONVEX_SELF_HOSTED_URL`. Read
  them, never ask a user to write or rename them.

Put values in `.env.local`, then run `npx nuxt-backend env push`. With no email key in dev,
sign-in codes print in the terminal that runs `dev`.

## Building features

- **Auth:** `useAuth()` for the session, sign-out and roles, and `<AuthForm>` for sign-in with
  passkeys and email codes. `definePageMeta({ middleware: 'auth' })` protects a page. The module
  mounts `/login`, `/pricing`, `/settings`, `/profile`, `/security`, `/accept-invitation` and
  `/oauth/consent`, every one of them always. A path under `backend.pages` in `nuxt.config`
  moves a page (`pages: { pricing: '/plans' }`); an app page at a page's path replaces it. A page
  key takes a path only: `true` or `false` stops the build.
- **Caching:** keep `swr`, `isr` and `cache` route rules on public pages (`'/blog/**'`), never
  `'/**'`. A signed-in render carries the session's token, and the private pages opt out of
  caches at their exact paths only.
- **Functions:** `backend/functions.ts` exports pre-authorized builders:
  - `authed.query(...)` gets `ctx.user`;
  - `org.mutation(...)` adds `ctx.organization`;
  - `admin.*` requires the app-wide admin role;
  - `withRole('editor')` sets a custom tier.
  Use them instead of the bare `query` and `mutation` for anything user-scoped.
- **Errors:** a refusal is a `ConvexError` with a stable code (`unauthenticated`, `forbidden`,
  `no_workspace`, `rate_limited`, `insufficient_credits`, `invalid_input`, `not_ready`, `unavailable`),
  which production keeps where it hides a plain `Error` as "Server Error". Read one with the
  auto-imported `getBackendError(error)`: branch on `code`, show `message`. It reads auth
  results and the rate limiter's error too. Refuse from your own functions with
  `backendError(code, data)` from `nuxt-backend/functions`. Call your own limits with
  `throws: true` and still throw `rate_limited` when the result is `{ ok: false }`: the limiter
  throws only when it knows the wait. Codes: https://nuxt-backend.dev/docs/reference/backend/errors.
- **Data:** `useQuery`, `useMutation`, `useAction` and `usePaginatedQuery` with refs from
  `#backend/api`; `useBackendClient()` for a one-off imperative call; `<StorageImage>` for an
  image in file storage. The base module's brand-named composables and components are not
  auto-imported in a nuxt-backend app: use these neutral names.
- **Data composables:** `useSearch(query, { term })`, `useAggregate(query)`,
  `useWorkflowStatus(query, { workflowId })`, `useEmailStatus({ emailId })`,
  `useSandboxInbox({ address })` and `useSessions()` take an options object of values, refs or
  getters and return a plain object to destructure: `data` (or `results`, `messages`, `sessions`),
  `isLoading`, `isPending` for actions, and `error` as `{ code, data, message } | null`. A read
  never throws, so bind `error` instead of wrapping it in `try`; an action rejects and fills
  `error` too. `data` is `undefined` until the first read lands. Rules:
  https://nuxt-backend.dev/docs/reference/nuxt/conventions.
- **Server routes:** `backendAuth(event)` in Nitro runs Convex calls as the signed-in user.
- **Workspaces:** `useOrganization()`, `<WorkspaceSettings>` and `<RoleBoundary>`.
- **Billing:** declare meters, plans, packs and features in `backend/billing.catalog.ts`, then
  `billing sync`. Read state with `useBilling()`, `useFeatures()` and `useCredits()`, gate UI
  with `<FeatureBoundary>`, and render plans with `<PricingTable>`. Plan copy comes from
  `appConfig.backend.billing.plans` and `packs`.
  The server decides what is sold: checkout takes only catalog products, returns only to
  `SITE_URL` (or `setupBilling({ trustedOrigins })`), refuses the package's metadata keys
  (`userId`, `gift`, `giftId`, `phase`, `giftRecipient`, `recipientEmail`, `purchaserUserId`, `utm_*`) and a browser-chosen trial or `discountId`, each as
  `invalid_input`. A campaign passes `discountCode` and `utm`; a different trial (1 to 30 days, in days or weeks)
  or a discount by id goes through `billing.checkout(ctx, …)` in your own action, and the portal
  through `billing.portal(ctx, { returnUrl })`. Each workspace (or user, with `billTo: 'user'`) pays
  through a provider customer of its own, keyed by its id; a workspace's portal opens only for its
  owner (`forbidden`, reason `not_billing_manager`), and trials run once per owner.
  `<BillingCheckoutLink :product-ids>` and `<BillingPortalLink>` create their session on click.
  Gifts are credit packs by catalog key: `useCredits().gift('credits500', { recipientEmail })`
  buys the pack's private gift product on the purchaser's own account (after an earlier paid
  order, never for their own address); the recipient claims it with `useGifts().claim(giftId)`.
  `billing sync` creates the gift products.
- **Email:** transactional mail goes through `backend/email.ts` (`setupEmail`), and
  `useEmailStatus({ emailId })` tracks delivery (`isFailed` for a bounce). The package's own emails (sign-in codes, welcome,
  invitations, gifts) go through it too: restyle them with `setupEmail(components, { templates })`. Test mode is on until `EMAIL_TEST_MODE=false`.
  Never expose a public function that takes a recipient: the scaffolded `send` is an
  `internalAction`. Call it from server code with an address you trust, or use
  `admin.action` (like `sendAsAdmin`) when a person types the address.
- **Agents:** the app serves an OAuth-protected MCP endpoint at `/mcp`. Every agent uses PKCE
  and stops at the consent page, `/oauth/consent`, where the person approves or denies; there
  is no option to skip it. Add tools with `defineBackendMcpTool` from `nuxt-backend/mcp`, one
  file each in `server/mcp/tools/`.
- **Tests:** `defineBackendTestApp(schema, modules)` from `nuxt-backend/test` builds the app in
  `convex-test` with every component mounted, and `asUser(t, { role, workspace, agent })` signs
  a caller in as a real sign-in leaves one: role `user`, an own personal workspace, real claims.
- **Linting:** `backendEslint()` from `nuxt-backend/eslint` applies Convex's lint rules to
  `backend/`: `export default withNuxt(backendEslint())`. It needs `@convex-dev/eslint-plugin`
  installed. See https://nuxt-backend.dev/docs/ship/test/linting.

## Customizing, in order of reach

1. **CSS tokens**: the `--bk-*` custom properties and `data-*` hooks restyle every packaged
   component. With `@nuxt/ui` installed, the tokens already follow its neutrals, borders, card
   radius and dark mode: theme those through Nuxt UI's own variables, don't map them by hand.
2. **Content**: `appConfig.backend` holds the brand, labels and the plan catalog copy.
3. **Slots**: keep a packaged component and replace only some regions, such as
   `<PricingTable>`'s `plan-action` or `<AuthForm>`'s `verify-code` step.
4. **Route shadowing**: an app page at a module page's path replaces it, and the module skips
   its own.
5. **Composables**: build your own UI on `useAuth`, `useBilling` and the rest.

The `backend` component owns its schema: keep app data in app tables keyed by
the user id. Details: https://nuxt-backend.dev/docs/ui/customize.

## Where to look

- Composables and components: https://nuxt-backend.dev/docs/reference/nuxt/composables
- Composable conventions: https://nuxt-backend.dev/docs/reference/nuxt/conventions
- Error codes: https://nuxt-backend.dev/docs/reference/backend/errors
- Every import path: https://nuxt-backend.dev/docs/reference/entrypoints
- Module options: https://nuxt-backend.dev/docs/reference/configuration/module-options
- CLI and doctor findings: https://nuxt-backend.dev/docs/reference/cli
- Deploying: https://nuxt-backend.dev/docs/ship/deploy
- Troubleshooting: https://nuxt-backend.dev/docs/ship/operate/troubleshooting
