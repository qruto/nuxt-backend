---
name: nuxt-backend
description: The core skill for Nuxt apps on nuxt-backend, the all-in-one SaaS backend on Convex (passwordless auth, workspaces, billing with credits and gifts, email, metered AI). Read it first in any app that depends on nuxt-backend or has a backend/ folder that convex.json points at, when installing nuxt-backend, and for `npx nuxt-backend` commands, env vars or doctor findings. It holds the rules every change follows, the install and version checks, the names that don't exist, and which task skill covers each feature (nuxt-backend-auth, -billing, -growth, -email, -ai, -data, -ui, -ship, -upgrade).
---

# nuxt-backend

`nuxt-backend` is one npm package with two halves:

- a **Nuxt module**: composables, components, pages, a same-origin auth proxy, server utilities;
- an **all-in-one Convex component**, `backend`: the auth tables, email, the billing cache,
  gifts, AI metering and the webhook log.

The app's own Convex functions live in `backend/`, and each scaffolded file there re-exports the
package's setup. Docs: https://nuxt-backend.dev, and for agents https://nuxt-backend.dev/llms.txt;
any docs page answers as Markdown with `.md` added to its URL. The docs MCP server (read-only,
no sign-in): https://mcp.nuxt-backend.dev/mcp.

## Install and version

- **Not installed yet?** No `nuxt-backend` in `package.json`, or no Nuxt app at all: follow
  [references/install.md](references/install.md) first.
- **Which version.** `version` in `node_modules/nuxt-backend/package.json` is the one the app
  runs. The skills in `node_modules/nuxt-backend/skills/` match it; a copy from the site or
  `npx skills add` can be ahead.
  `npx nuxt-backend init --agents` copies the installed version's skills into `.agents/skills/`,
  and `npx nuxt-backend doctor` warns (`agent-files`) while those copies or the `AGENTS.md`
  section belong to another version.
- **After an upgrade**, run `npx nuxt-backend upgrade` first; the `nuxt-backend-upgrade`
  skill has the steps and every renamed name.

## Ground rules

- **Neutral names.** The public API says `auth`, `billing`, `email`, `backend`, never a provider
  name. Keep provider names out of app code, UI labels and env var names.
- **Never edit `backend/_generated/`.** `convex dev` rewrites it. Import from `#backend/api`,
  `#backend/dataModel` and `#backend/server` in the app, and from `./_generated/*` inside `backend/`.
- **Keep the scaffolded exports.** The composables call functions by name (`getAuthUser` in
  `auth.ts`, `getCurrentSubscription` in `billing.ts`).
  Add yours beside them; never rename or delete them. `npx nuxt-backend doctor` checks the
  contract against the deployment.
- **Convex rules apply** inside `backend/`: validators on every function's `args`, indexes over
  `.filter()`, no `process.env` outside the env contract. `npx convex ai-files install` writes
  Convex's own guidelines.
- **User-scoped functions use the builders** `backend/functions.ts` exports (`authed`, `workspace`,
  `admin`), never the bare `query` and `mutation`.
- **Refusals are codes:** a `ConvexError` with a stable code. Read it with `getBackendError(error)`;
  refuse from your own functions with `backendError(code, data)` from `nuxt-backend/functions`.
- **App data goes in app tables**, keyed by user id; the component owns its own schema.

## Task skills

Each feature has a task skill in `node_modules/nuxt-backend/skills/<name>/`, and in
`.agents/skills/<name>/` once `init` copies them. Read the one a task needs first.

<!-- generated:router -->
- `nuxt-backend-auth`: sign-in, sessions, passkeys, roles, user-scoped functions, workspaces and invitations, invite codes and the waitlist, the admin console with impersonation, the activity trail, consents, and account export and deletion. 22 tasks; reach for `useLoginFlow()`, `nuxt-backend/auth`, `useHumanCheck()`.
- `nuxt-backend-billing`: the catalog, plans, checkout, the portal, feature gates, plan quotas and credits. 11 tasks; reach for `nuxt-backend/billing`, `usePricing()`, `useBilling()`.
- `nuxt-backend-growth`: launch phases, offers, referrals, gifts, lifecycle email and the funnel. 14 tasks; reach for `useBilling()`, `useCampaign()`, `useGifts()`.
- `nuxt-backend-email`: transactional email, templates, delivery tracking, the dev inbox and notifications. 15 tasks; reach for `useSandboxInbox()`, `nuxt-backend/email`, `useEmailStatus()`.
- `nuxt-backend-ai`: metered AI actions, streams and the job queue. 12 tasks; reach for `nuxt-backend/ai`, `useAiStream()`.
- `nuxt-backend-data`: the function tiers, queries and mutations, errors, search, workflows, uploads, share links, retention, tokens and the Convex components for counts, queues, cached actions, crons and migrations. 12 tasks; reach for `nuxt-backend/functions`, `nuxt-backend/search`, `nuxt-backend/workflows`.
- `nuxt-backend-ui`: the packaged pages and components, their parts, theming, labels, translation, slots, the headless composables and eject. 10 tasks; reach for `useLabels()`.
- `nuxt-backend-ship`: provider setup, tests, deploying, production checks, monitoring, flags and kill switches, webhooks and rate limits. 39 tasks; reach for `nuxt-backend/rate-limit`, `nuxt-backend/http`, `nuxt-backend/monitoring`.
- `nuxt-backend-upgrade`: moving an app to a new version, and every name a release renamed or removed. 2 tasks.
<!-- /generated:router -->

This skill's own tasks:
<!-- generated:tasks -->
[Installation](https://nuxt-backend.dev/docs/start/installation), [Templates & examples](https://nuxt-backend.dev/docs/start/templates), [Try the demo](https://nuxt-backend.dev/docs/start/playground), [Run the dev loop](https://nuxt-backend.dev/docs/develop/dev-loop), [Develop on real sandboxes](https://nuxt-backend.dev/docs/develop/sandboxes), [DevTools](https://nuxt-backend.dev/docs/develop/devtools), [Diagnose your setup with doctor](https://nuxt-backend.dev/docs/develop/doctor), [See what is inside your bundles](https://nuxt-backend.dev/docs/develop/analyze), [Docs MCP](https://nuxt-backend.dev/docs/develop/agents/docs-mcp), [Build with a coding agent](https://nuxt-backend.dev/docs/develop/agents).
<!-- /generated:tasks -->

## Names that don't exist

Common guesses that don't exist here; write the name after the arrow. For 0.1 names, see the
`nuxt-backend-upgrade` skill.

<!-- generated:wrong-names -->
- **Composables:** `useUser()` → `useAuth().user`; `useSession()` → `useAuth()` (`useSessions()` lists devices); `useSignIn()` → `useLoginFlow()`; `useLogout()` → `useAuth().signOut`; `useOrganization()` → `useWorkspace()`; `useWorkspaces()` → `useWorkspace().workspaces`; `useMembers()` → `useWorkspace().members`; `useInvitations()` → `useWorkspace().invitations`; `useSubscription()` → `useBilling().subscription`; `useCheckout()` → `useBilling().checkout`; `usePlans()` → `useBilling().products`; `useCreditBalance()` → `useCredits().balance`; `useEntitlements()` → `useFeatures()`; `useBackendError()` → `getBackendError(error)`.
- **Components:** `<SignIn>` → `<AuthForm>`; `<LoginForm>` → `<AuthForm>`; `<PricingPlans>` → `<PricingTable>`; `<CheckoutButton>` → `<BillingCheckoutLink>`; `<CustomerPortalButton>` → `<BillingPortalLink>`; `<AuthGuard>` → `<Gate>` (a page: `definePageMeta({ auth: true })`); `<Paywall>` → `<Gate>` (with `feature`); `<UserProfile>` → `<ProfileSettings>`.
- **Env:** `BETTER_AUTH_SECRET` → `AUTH_SECRET`; `BETTER_AUTH_URL` → `SITE_URL`; `RESEND_API_KEY` → `EMAIL_API_KEY`; `RESEND_WEBHOOK_SECRET` → `EMAIL_WEBHOOK_SECRET`; `POLAR_ACCESS_TOKEN` → `BILLING_ACCESS_TOKEN`; `POLAR_WEBHOOK_SECRET` → `BILLING_WEBHOOK_SECRET`; `POLAR_SERVER` → `BACKEND_ENVIRONMENT` (sandbox everywhere but production).
- **Commands (`npx nuxt-backend …`):** `setup` → `init`; `check` → `doctor`; `sync` → `billing sync`.
- **Imports:** `nuxt-backend/server` → `#backend/server`; `nuxt-backend/better-auth` → `nuxt-backend/auth`; `nuxt-backend/polar` → `nuxt-backend/billing`; `nuxt-backend/resend` → `nuxt-backend/email`; `nuxt-backend/convex` → `nuxt-backend/convex.config`.
<!-- /generated:wrong-names -->

## Commands

| Command | What it does |
|---|---|
| `npx nuxt-backend init` | Scaffolds `backend/`, `convex.json`, `.env.example` and the agent files (`AGENTS.md`, `.mcp.json`, these skills in `.agents/skills/`), and adds the module to `nuxt.config`. `--agents`: only the agent files, after an upgrade |
| `npx nuxt-backend dev` | The `dev` script: creates a dev deployment on first run, pushes its env, runs Convex and Nuxt together. `--anonymous`: an account-free local deployment |
| `npx nuxt-backend doctor` | Checks env, codegen, routes, the function contract, webhooks, the catalog and agent files. `--fix` repairs what it can, `--prod` checks production, `--only <capability>` one capability |
| `npx nuxt-backend status` | Each capability as live, test, missing or failing. `--prod` checks production |
| `npx nuxt-backend env push` | Syncs `.env` and `.env.local` to the deployment |
| `npx nuxt-backend billing sync` | Turns `backend/billing.catalog.ts` into products and `backend/billing.generated.ts` |
| `npx nuxt-backend inbox [address]` | Prints the codes a dev deployment sent to a test address |
| `npx nuxt-backend mcp` | The MCP server `.mcp.json` runs: project state, docs, provider consoles; writes ask first |

No command prompts. `--json` prints one JSON document with progress on stderr, exit code `1`
means refused or failed, and `--help` ends with what the command may change. Run a command that
writes production only when the user asks for it.

## Environment

The deployment holds the env, not Nuxt. `AUTH_SECRET` and `SITE_URL` are required. The `EMAIL_*` and `BILLING_*` names are optional: each missing one degrades a
feature, as documented. `AI_GATEWAY_API_KEY` keeps the AI Gateway's own
name: set it once the backend names a `provider/model` id. `BACKEND_ENVIRONMENT` decides every provider's mode: `env push` derives it. The Nuxt side reads `NUXT_PUBLIC_BACKEND_URL`, usually derived for you. `CONVEX_DEPLOYMENT`, `CONVEX_SITE_URL` and `CONVEX_SELF_HOSTED_URL` belong
to the Convex CLI: read them, never write or rename them. `MONITORING_DSN` receives
errors and cron check-ins; the `NEXT_PUBLIC_SENTRY_DSN` Sentry's Vercel integration sets fills it. Put
values in `.env.local`, then run `npx nuxt-backend env push`. Never print or set `AUTH_SECRET`: `env rotate AUTH_SECRET` replaces it.

## The API at a glance

Each import path and its main functions; [references/api.md](references/api.md) has every public
name, [references/surface.json](references/surface.json) the same as data.

<!-- generated:api -->
- `nuxt-backend`
- `nuxt-backend/auth`: `resolveSignInMethod`, `storesLastSignInCookie`
- `nuxt-backend/http`: `registerBackendRoutes`
- `nuxt-backend/functions`: `backendError`, `getBackendError`
- `nuxt-backend/app`: `backendEnvironment`
- `nuxt-backend/billing`: `defineBillingCatalog`, `setupReferrals`
- `nuxt-backend/email`: `setupEmail`, `escapeHtml`
- `nuxt-backend/rate-limit`: `setupRateLimiter`
- `nuxt-backend/search`: `search`, `defineSearch`
- `nuxt-backend/audit`: `defineActivation`, `setupAudit`
- `nuxt-backend/access`: `setupAccess`, `setupWaitlist`
- `nuxt-backend/account`: `setupAccount`
- `nuxt-backend/admin`: `setupWebhooks`, `setupAdmin`
- `nuxt-backend/flags`: `setupFlags`, `defineFlags`
- `nuxt-backend/workflows`: `setupWorkflows`, `defineEmailSequence`
- `nuxt-backend/ai`: `priceTokens`, `setupAi`
- `nuxt-backend/storage`: `setupStorage`, `sniffContentType`
- `nuxt-backend/notifications`: `setupNotifications`
- `nuxt-backend/monitoring`: `isReportable`, `reportError`
- `nuxt-backend/convex.config`
- `nuxt-backend/auth.config`: `defineBackendAuthConfig`
- `nuxt-backend/test`: `register`, `defineBackendTestApp`
- `nuxt-backend/test-utils`: `backendTestAliases`, `renderEmail`
- `nuxt-backend/eslint`: `backendEslint`
<!-- /generated:api -->
