---
title: Setup helpers
description: "Every setup and define helper the package exports in 0.2.0: its import path, the file of yours that calls it, and what it gives you, then the helpers generated from the code today."
kind: reference
source: package.json
navigation:
  title: Setup helpers
  icon: i-lucide-blocks
---

The Convex side of the package is a set of helpers your `backend/` files call once each. This page says which file calls each helper, so you know where to edit when you change its options. Two verbs name them: `setupX(components, options)` wires an integration and returns `{ ...helpers, api }`, and `defineX(...)` declares data, such as a catalog, flags or a job queue. `createFunctions` and `registerBackendRoutes` keep their names.

```ts [backend/billing.ts]
import { setupBilling } from 'nuxt-backend/billing'
import { components } from './_generated/api'
import { catalog } from './billing.generated'
import { email } from './email'

export const billing = setupBilling(components, { email, catalog })
```

## Every helper

Each `setup*`, `define*`, `create*` and `register*` the package's Convex subpaths export. The other values they export, such as `backendError`, `verifyHuman`, `reportError` and `checkIn`, are on [Package entrypoints](/docs/reference/entrypoints#every-subpath).

### Called by the scaffold

`npx nuxt-backend init` writes these files, each calling its helper once ([Project files](/docs/reference/configuration/project-files)):

| Helper | Import | File | What it gives you | Unit |
|---|---|---|---|---|
| `setupAuth` | `nuxt-backend/auth` | `backend/auth.ts` | Sign-in by sign-in code and passkey, `canSignIn`, the account hooks, and the launch phases you pass as `access` | |
| `createFunctions` | `nuxt-backend/functions` | `backend/functions.ts` | Every access tier, called once: `authed`, `workspace`, `admin`, `withRole`, `withFeature` and `setUserRole` | SIMPLIFY |
| `registerBackendRoutes` | `nuxt-backend/http` | `backend/http.ts` | Every inbound route: auth, both webhooks, the AI stream and the health route | |
| `backendEnv` | `nuxt-backend/app` | `backend/convex.config.ts` | The typed env contract the deployment validates | |
| `defineBackendAuthConfig` | `nuxt-backend/auth.config` | `backend/auth.config.ts` | The Convex auth config that trusts the backend's tokens | |
| `defineBillingCatalog` | `nuxt-backend/billing` | `backend/billing.catalog.ts` | What the app sells: meters, plans, packs, features and promotions | |
| `setupBilling` | `nuxt-backend/billing` | `backend/billing.ts` | Subscriptions, credits, gifts and promotions, cached inside the component | |
| `setupEmail` | `nuxt-backend/email` | `backend/email.ts` | Sending and templates, the theme, topics and one-click unsubscribe, the contact form and inbound mail | PREFS |
| `setupRateLimiter` | `nuxt-backend/rate-limit` | `backend/rateLimiter.ts` | The rate limiter, seeded with `DEFAULT_LIMITS` | |
| `setupAudit` | `nuxt-backend/audit` | `backend/audit.ts` | The activity trail, and your own events on it | |
| `setupAccount` | `nuxt-backend/account` | `backend/account.ts` | Export, deletion with a grace period, and consents | |
| `setupAdmin` | `nuxt-backend/admin` | `backend/admin.ts` | The admin console: accounts, workspaces, impersonation and the report queue | SAFETY |
| `setupFlags`, `defineFlags` | `nuxt-backend/flags` | `backend/flags.ts` | Feature flags read in your functions, and the kill switches | |
| `setupAi` | `nuxt-backend/ai` | `backend/ai.ts` | Metered model calls and streams, through the Convex AI Gateway, and the moderation helpers | SAFETY |
| `setupWorkflows`, `defineEmailSequence` | `nuxt-backend/workflows` | `backend/workflows.ts` | Durable workflows, and email sequences on them | |

### Called by a file you add

A feature you use gets a file of yours. The composables read its `api` by default, and each takes an `api` option to point at another file:

| Helper | Import | File | What it gives you | Unit |
|---|---|---|---|---|
| `setupReferrals` | `nuxt-backend/billing` | `backend/referrals.ts` | The referral program: codes, the claim, rewards after a hold, and caps | |
| `setupAccess` | `nuxt-backend/access` | `backend/access.ts` | Launch phases, invite codes and access links, checked in the sign-in hooks of `setupAuth` | |
| `setupWaitlist` | `nuxt-backend/access` | `backend/waitlist.ts` | A double opt-in waitlist with public positions, launched in waves | |
| `setupNotifications` | `nuxt-backend/notifications` | `backend/notifications.ts` | The in-app inbox, and the `notify` option that turns events of your own into notifications; web push and the preferences behind both join it | PREFS |
| `setupStorage` | `nuxt-backend/storage` | `backend/storage.ts` | Checked uploads, storage refs with orphan cleanup, and share links | FILES |
| `defineJobQueue` | `nuxt-backend/ai` | `backend/jobs.ts` | A generation queue: tiers from plan features with a head start, running jobs per owner, dedicated slots and a daily budget; model limits that adapt; credits held until a job runs | JOBS |
| `defineRetention` | `nuxt-backend/functions` | `backend/retention.ts` | Rows of a table deleted after a lifetime, in bounded batches | RETAIN |
| `defineSearch` | `nuxt-backend/search` | A file of yours | A typed full-text search query over a search index | |
| `defineActivation` | `nuxt-backend/audit` | `backend/audit.ts` | The activation checklist: three to seven first tasks, each done when its event is recorded, passed to `setupAudit({ checklist })` | |

### Options the newest units add

The units planned on 2026-10-24 extend helpers above rather than add new ones:

| Helper | Option or return | What it does | Unit |
|---|---|---|---|
| `setupBilling` | `lifecycle: { saveOffers, abandonedCheckout, renewalReminders, withdrawal }` | Makes one save offer by cancellation reason before a cancellation, records an expired checkout for the lifecycle email, sends the annual renewal reminder Polar doesn't send for short cycles, and serves the EU withdrawal button where Polar doesn't. Checkout records the auto-renew consent, kept three years | LIFECYCLE |
| `setupStorage` | `stripMetadata`, `quota: { files, bytes }` | Strips EXIF and GPS from images, sniffs the content type, and caps each owner's files and bytes | FILES |
| `setupStorage` | `storage.signedUrl(ctx, id, { ttl })` | An expiring URL for a private file | FILES |
| `setupAi` | `provenance` | Signs a content-credentials manifest into generated images, and records the model, time and inputs on each job result | PROVENANCE |
| `setupAdmin` | `reports` | The report queue, with a statement of reasons to the person affected, an appeal, and a flag for suspected crimes | SAFETY |
| `setupEmail` | `lifecycle`, `caps: { perWeek, quietHours, sunsetAfterDays }` | The ready-made lifecycle flows on Resend Automations, and the frequency caps and sunset rule for non-transactional mail | ENGAGE |
| `defineJobQueue` | `guest: { perVisitor }` | One generation before sign-up, claimed at sign-up | JOBS |
| `defineFlags` | `{ key: { variants, weights, goal, guardrails, discounts } }` | An experiment: each person gets one variant, read with `useExperiment(key)` in a page and `flags.variant(ctx, key)` on the server, compared in the admin console's Experiments view | FUNNEL |
| `setupAudit` | `activation` | The event that counts as a person's activation in the growth funnel, recorded once as `account.activated` | FUNNEL |
| `setupAdmin` | `api.getFunnel` | The growth funnel for the admin console's Growth view | FUNNEL |

The helpers `0.2.0` removes (SIMPLIFY): `setupAuthorization` folds into `createFunctions`, and `setupMigrations`, `setupWorkpool`, `setupCounter`, `defineCache`, `setupCrons` and `defineBackendCrons` give way to the Convex components they wrapped, which you import directly ([Ecosystem](/docs/reference/ecosystem#what-changes)). The package's own maintenance runs inside its component, so your app registers no cron for it.

Each built helper's generated API page has its options and its return type; a planned one gets its page when its unit lands. The rest of this group covers what the helpers mount: the [component's functions](/docs/reference/backend/component), the [HTTP routes](/docs/reference/backend/http-routes), the [events](/docs/reference/backend/events) they react to, the [errors](/docs/reference/backend/errors) they refuse with, the [hooks](/docs/reference/backend/hooks) they call, and their [limits](/docs/reference/backend/limits).

## In the code today

Generated from the exports map, every `setup*`, `define*`, `create*` and `register*` the package's Convex subpaths export as they stand.

<!-- generated:setup-helpers (pnpm docs:lookups, from package.json and src/templates.ts) -->

| Helper | Import | Scaffold file | Tab | What it gives you |
|---|---|---|---|---|
| [`setupAuth`](/docs/reference/api/auth) | `nuxt-backend/auth` | `backend/auth.ts` | Auth | The app's auth, from one call: the auth instance factory, the functions the scaffold re-exports. |
| [`registerBackendRoutes`](/docs/reference/api/http) | `nuxt-backend/http` | `backend/http.ts` | Start | Mount every route the backend serves on the app's HTTP router: the auth routes, the billing and email webhooks, the metered AI stream, and the health. |
| [`createFunctions`](/docs/reference/api/functions) | `nuxt-backend/functions` | `backend/functions.ts` | Auth | Every access tier of your backend, from one call in `backend/functions.ts`: each a drop-in `{ query, mutation, action }` that checks the caller before the handler runs. |
| [`defineRetention`](/docs/reference/api/functions) | `nuxt-backend/functions` | none: call it yourself | Data | Delete a table's rows once they pass an age, a batch per transaction, until none is left. |
| [`defineBillingCatalog`](/docs/reference/api/billing) | `nuxt-backend/billing` | `backend/billing.catalog.ts` | Billing | Declare the billing catalog (typed identity: its keys stay literal, so `keyof typeof catalog.discounts` names its promotions). |
| [`setupBilling`](/docs/reference/api/billing) | `nuxt-backend/billing` | `backend/billing.ts` | Billing | Configure billing for subscriptions, discounts, prepaid credits, and gift purchases — linked to your auth users and cached reactively inside the `backend` component (so consumers add nothing to their own schema). |
| [`setupReferrals`](/docs/reference/api/billing) | `nuxt-backend/billing` | none: call it yourself | Billing | Set the referral program up in its own backend file (`backend/referrals.ts`). |
| [`setupEmail`](/docs/reference/api/email) | `nuxt-backend/email` | `backend/email.ts` | Email | App-facing email helper over the `backend` component's email module: both **transactional** email (send / status / cancel + webhook) and **marketing** email (segments / contacts / broadcasts via the provider SDK). |
| [`setupRateLimiter`](/docs/reference/api/rate-limit) | `nuxt-backend/rate-limit` | `backend/rateLimiter.ts` | Ship | Configure the [Rate Limiter](https://www.convex.dev/components/rate-limiter) component, pre-seeded with `DEFAULT_LIMITS`. |
| [`defineSearch`](/docs/reference/api/search) | `nuxt-backend/search` | none: call it yourself | Data | Define a ready-to-call Convex search query from a search-index config. |
| [`defineActivation`](/docs/reference/api/audit) | `nuxt-backend/audit` | none: call it yourself | Auth | The activation checklist: three to seven first tasks that lead to value, each done when one of your own events (or one the package records) is recorded for the person. |
| [`setupAudit`](/docs/reference/api/audit) | `nuxt-backend/audit` | `backend/audit.ts` | Auth | The shared event path: record an event of the package's catalog or of your own, read the activity trail back, and hear of every event. |
| [`setupAccess`](/docs/reference/api/access) | `nuxt-backend/access` | none: call it yourself | Auth | Launch your app in phases: early access with a waitlist, then invite only, then public. |
| [`setupWaitlist`](/docs/reference/api/access) | `nuxt-backend/access` | none: call it yourself | Auth | Run a waitlist for early access: joins proven by the sign-in code (the double opt-in), a place for everyone waiting, a boost for each friend who joins through their link, waves an administrator admits from the console's Waitlist tab, and a mirror of the people who asked for launch news to the email provider. |
| [`setupAccount`](/docs/reference/api/account) | `nuxt-backend/account` | `backend/account.ts` | Auth | Export and complete erasure of an account. |
| [`setupAdmin`](/docs/reference/api/admin) | `nuxt-backend/admin` | `backend/admin.ts` | Auth | The admin console's reads: every account and every workspace, for an administrator, read fresh from the auth tables. |
| [`setupWebhooks`](/docs/reference/api/admin) | `nuxt-backend/admin` | `backend/webhooks.ts` | Ship | The webhook delivery log and its replay, for administrators: the two functions `backend/webhooks.ts` re-exports, behind the admin console's Webhooks tab and DevTools' webhook feed. |
| [`defineFlags`](/docs/reference/api/flags) | `nuxt-backend/flags` | `backend/flags.ts` | Ship | Declare the app's flags: each key with its default and what it turns on. |
| [`setupFlags`](/docs/reference/api/flags) | `nuxt-backend/flags` | `backend/flags.ts` | Ship | Feature flags, evaluated inside your own queries and mutations, and the package's kill switches. |
| [`defineEmailSequence`](/docs/reference/api/workflows) | `nuxt-backend/workflows` | `backend/workflows.ts` | Email | A durable, multi-step email sequence (onboarding drips, cancellation follow-ups): each step sleeps its `after` delay durably (survives restarts and deploys via the workflow component), then sends through the backend component's email module — delivery-tracked like every other transactional email. |
| [`setupWorkflows`](/docs/reference/api/workflows) | `nuxt-backend/workflows` | `backend/workflows.ts` | Data | Configure the [Workflow](https://www.convex.dev/components/workflow) component for durable, long-running, multi-step functions. |
| [`defineJobQueue`](/docs/reference/api/ai) | `nuxt-backend/ai` | none: call it yourself | AI | Declare the app's generation queue, once, in `backend/jobs.ts`: kinds of jobs (`jobs.define`) run their steps (`jobs.step`) in a fair line with tiers from plan features, each model under a limit that adapts to `429`s, credits held while a job waits, charged when it starts and refunded when it fails, and each job's cost reported to the billing provider. |
| [`setupAi`](/docs/reference/api/ai) | `nuxt-backend/ai` | `backend/ai.ts` | AI | Configure the AI rails over billing + rate limiting + streaming. |
| [`setupStorage`](/docs/reference/api/storage) | `nuxt-backend/storage` | none: call it yourself | Data | Checked uploads, expiring private URLs and share links on Convex file storage, kept in the `backend` component's storage beside one owner record per file: the orphan sweep, an account's export and its erasure see every file the app keeps. |
| [`setupNotifications`](/docs/reference/api/notifications) | `nuxt-backend/notifications` | `backend/notifications.ts` | Email | The in-app inbox: what the backend recorded about a person, live, with the unread count and marking read, and the `notify` option that turns your own events into notifications. |
| [`defineBackendAuthConfig`](/docs/reference/api/auth-config) | `nuxt-backend/auth.config` | `backend/auth.config.ts` | Auth | The Convex auth config that trusts the backend's tokens: the session JWTs the `backend` component signs, verified against its JWKS on the deployment's site URL, under the auth route nuxt.config names (`backend.authRoute`). |

<!-- /generated:setup-helpers -->
