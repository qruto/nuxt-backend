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
| `npx nuxt-backend init` | Scaffolds `backend/`, `convex.json`, `.env.example`, AGENTS.md and `.mcp.json`, and adds the module to `nuxt.config`. `--installation local` copies the component in; `--no-agents` skips the agent files |
| `npx nuxt-backend dev` | The `dev` script: sets up a dev deployment on first run, provisions its env, then runs Convex and Nuxt together |
| `npx nuxt-backend doctor` | Checks env, codegen, the function contract, webhook routes and the billing catalog. `--fix` repairs what it can, `--prod` checks production |
| `npx nuxt-backend env push` | Syncs `.env` and `.env.local` to the deployment. Dev deployments also get `AUTH_SECRET` and `SITE_URL` generated |
| `npx nuxt-backend billing sync` | Creates the products in `backend/billing.catalog.ts` and writes `backend/billing.generated.ts` |

After `billing sync`, `npx convex run billing:syncProducts` loads the products into the deployment.

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
  mounts `/login`, `/pricing`, `/settings`, `/profile`, `/security` and `/accept-invitation`.
  `backend.pages` in `nuxt.config` moves or disables each one.
- **Functions:** `backend/functions.ts` exports pre-authorized builders:
  - `authed.query(...)` gets `ctx.user`;
  - `org.mutation(...)` adds `ctx.organization`;
  - `admin.*` requires the app-wide admin role;
  - `withRole('editor')` sets a custom tier.
  Use them instead of the bare `query` and `mutation` for anything user-scoped.
- **Server routes:** `backendAuth(event)` in Nitro runs Convex calls as the signed-in user.
- **Workspaces:** `useOrganization()`, `<WorkspaceSettings>` and `<RoleBoundary>`.
- **Billing:** declare meters, plans, packs and features in `backend/billing.catalog.ts`, then
  `billing sync`. Read state with `useBilling()`, `useFeatures()` and `useCredits()`, gate UI
  with `<FeatureBoundary>`, and render plans with `<PricingTable>`. Plan copy comes from
  `appConfig.backend.billing.plans` and `packs`.
- **Email:** transactional mail goes through `backend/email.ts` (`setupEmail`), and
  `useEmailStatus(id)` tracks delivery. Test mode is on until `EMAIL_TEST_MODE=false`.
- **Agents:** the app serves an OAuth-protected MCP endpoint at `/mcp`. Add tools with
  `defineBackendMcpTool` from `nuxt-backend/mcp`, one file each in `server/mcp/tools/`.
- **Tests:** register the component in `convex-test` with `nuxt-backend/test`
  (`backendTest.register(t)`).
- **Linting:** `backendEslint()` from `nuxt-backend/eslint` applies Convex's lint rules to
  `backend/`: `export default withNuxt(backendEslint())`. It needs `@convex-dev/eslint-plugin`
  installed. See https://nuxt-backend.dev/tooling/linting.

## Customizing, in order of reach

1. **CSS tokens**: the `--bk-*` custom properties and `data-*` hooks restyle every packaged
   component.
2. **Content**: `appConfig.backend` holds the brand, labels and the plan catalog copy.
3. **Slots**: keep a packaged component and replace only some regions, such as
   `<PricingTable>`'s `plan-action` or `<AuthForm>`'s `verify-code` step.
4. **Route shadowing**: an app page at a module page's path replaces it, and the module skips
   its own.
5. **Composables**: build your own UI on `useAuth`, `useBilling` and the rest.
6. **Local installation**: `init --installation local` copies the component into
   `backend/components/backend/` for schema-level changes.

Details: https://nuxt-backend.dev/guide/customization and
https://nuxt-backend.dev/tooling/local-installation.

## Where to look

- Composables and components: https://nuxt-backend.dev/api-reference/composables
- Every import path: https://nuxt-backend.dev/api-reference/entrypoints
- Module options: https://nuxt-backend.dev/api-reference/module-options
- CLI and doctor findings: https://nuxt-backend.dev/tooling/cli
- Deploying: https://nuxt-backend.dev/production/deployment
- Troubleshooting: https://nuxt-backend.dev/production/troubleshooting
