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
[![OpenSSF Scorecard][scorecard-src]][scorecard-href]

One [Nuxt](https://nuxt.com) module that gives a client app its complete backend: sign-in, workspaces, plans and credits, email, notifications, metered AI and the pages that use them. Install it, and your app is a product people can sign in to, pay for and create things in, before you write your first feature.

It composes [Convex](https://convex.dev), [Better Auth](https://www.better-auth.com), [Polar](https://polar.sh), [Resend](https://resend.com), [Vercel](https://vercel.com), [Sentry](https://sentry.io) and the [Convex AI Gateway](https://docs.convex.dev/ai-gateway/overview) into twelve [capabilities](https://nuxt-backend.dev/docs/start/concepts/capabilities), named for what they give your app. Your code calls `useCredits` and reads `BILLING_*`, never a provider's API, and nothing needs wiring up. In development each provider runs in its own test mode: Polar's sandbox, Resend's test addresses, and sign-in codes in your terminal.

## What you get

`0.2.0` gives a client app these, capability by capability:

- **Auth:** sign-in by email code and passkey (no passwords), launch phases with invite codes, access links and a waitlist, workspaces with invitations, consents, a recent sign-in for sensitive actions, page and function guards, the admin console with impersonation, an activity trail, and an account export with deletion after a grace period.
- **Data and jobs:** the realtime database with live queries from Vue and Nuxt server routes, server rendering, typed errors, full-text search, checked uploads, share links, retention rules, durable workflows, and a backend that prunes its own tables.
- **Billing:** a catalog in code synced to Polar: monthly and yearly plans, a real free plan, prices in several currencies, a server-rendered pricing page, checkout and the customer portal, server-enforced feature gates and quotas, prepaid credits spent with reserve, run and settle, promotions, campaign links, gifts, plan passes and referrals.
- **Email and notifications:** transactional and marketing email from one template registry, themed, in each recipient's language, with delivery tracking, preferences and one-click unsubscribe, sequences, announcements, inbound mail and contact forms; an in-app inbox and web push.
- **AI:** metered model calls and persisted streams through the Convex AI Gateway, generation jobs that hold credits until they run, chat and knowledge search, and moderation of prompts and uploads.
- **Protection, monitoring, flags and analytics:** bot checks (Vercel BotID, or a Turnstile challenge elsewhere) and rate limits; error reports, cron check-ins and a health endpoint; feature flags with targeting and kill switches; revenue metrics and growth funnels in the admin console.
- **Hosting:** one-command production on Vercel, a deploy template, and `doctor --prod` before launch; any host that runs Nuxt keeps working.
- **The pages:** `/login`, `/pricing`, `/settings`, `/profile`, `/security`, `/accept-invitation` and `/admin` mount out of the box. They are headless components on a neutral stylesheet, customizable at every level (CSS tokens, `app.config` content, slots, your own page at the route) without ever ejecting.
- **Developer tools:** `doctor` and `status` for every capability, a DevTools tab, a dev inbox, `upgrade` for every release, test utilities and lint rules, and for coding agents version-locked skills, a developer MCP server and a docs MCP.

Not all of it is built yet. The **[Feature map](https://nuxt-backend.dev/docs/start/feature-map)** lists every feature, capability by capability, as available, experimental, changing (built, with an API `0.2.0` reshapes) or planned. API keys, outgoing webhooks, an MCP endpoint for your users' agents and deeper workspaces wait for the next release, as the [Roadmap](https://nuxt-backend.dev/docs/start/roadmap) explains.

`nuxt-backend` ships two halves that work as one:

- a **Nuxt module** — the SaaS composables, scaffolding, env preflight, and `#backend/*` aliases; and
- a **Convex backend** — a scaffolded `convex.config.ts` that mounts the package's all-in-one `backend` component (auth tables + adapter, email with the provider component nested inside, the billing entitlement cache, gifts, and the activity trail) plus the upstream Polar, rate limiter, workflow, workpool, migrations, aggregate, sharded counter, action cache, and persistent-text-streaming components, with a `nuxt-backend/*` setup helper for each.

The generic Convex ⇄ Nuxt integration underneath (live queries, mutations, SSR, auth plumbing, DevTools, Convex-aware CSP) comes from [`nuxt-convex-module`](https://github.com/qruto/nuxt-convex-module) — installed and configured automatically. Use that package directly if you only want Convex bindings without the SaaS layer. [Ecosystem](https://nuxt-backend.dev/docs/reference/ecosystem) says which other Nuxt modules and Convex components ship with the package, work beside it, or are planned.

> 📖 **Full documentation:** **[nuxt-backend.dev](https://nuxt-backend.dev)** (docs · playground) — start with the [Introduction](https://nuxt-backend.dev/docs/start), then the [Quickstart](https://nuxt-backend.dev/docs/start/quickstart).

**Requirements:** Nuxt ≥ 4.6.2 (Nuxt 4; not yet Nuxt 5) and Node ≥ 24.11.

**Stability:** [STABILITY.md](./STABILITY.md) — what the 0.x line promises, the experimental tier, and how upstream releases map to this package's versions. **Release notes:** [CHANGELOG.md](./CHANGELOG.md).

<!-- START: Include on https://convex.dev/components -->

## Quick start

**With an AI agent:** paste this into Claude Code, Cursor, Codex or any agent that runs commands in your project. It installs the package's skill and follows its install guide, which starts the app on a local Convex deployment that needs no account; the agent asks before it logs in to Convex or touches your accounts.

```text
Install nuxt-backend, the all-in-one SaaS backend for Nuxt on Convex, in this project:
run `npx -y skills@1.7.0 add https://nuxt-backend.dev --skill nuxt-backend -y`,
then follow .agents/skills/nuxt-backend/references/install.md.
```

**By hand,** with no account anywhere: create the app from the starter, then start it on a local deployment.

```bash
npm create nuxt@latest my-app -- -t gh:qruto/nuxt-backend/templates/starter
cd my-app
npx nuxt-backend dev --anonymous   # or plain `npm run dev`, and pick "Start without an account"
```

In an app you already have, the first two lines are this one. Its install step installs `convex`, writes
the backend files, points the `dev` script at `nuxt-backend dev` and swaps `<NuxtWelcome />` for
`<NuxtPage />` (outside an interactive terminal, `npx nuxt-backend init` does the same):

```bash
npx nuxt module add nuxt-backend
```

Then open `http://localhost:3000/login` and sign in: with no email provider connected yet, the code
prints in the terminal. There is nothing to copy into `.env`: the first run generates `AUTH_SECRET`,
sets `SITE_URL` to localhost and `BACKEND_ENVIRONMENT` to `development`, and derives the backend's
URL from `CONVEX_DEPLOYMENT`. With a Polar sandbox token, `npx nuxt-backend billing sync` creates
the catalog in `backend/billing.catalog.ts` in Polar's sandbox: on the starter's `/app`,
**Buy 500 credits** pays with the test card and **Spend 1 credit** runs a metered action against the
balance. The [Quickstart](https://nuxt-backend.dev/docs/start/quickstart) walks through it, with the
first-run fixes.

> Until `0.2.0` is published, `nuxt-backend: latest` installs `0.1.0`, a throwaway test publish. Install the [preview build](https://nuxt-backend.dev/docs/start/templates#preview-builds-pkgprnew) of `main` over it in the meantime: `npm install https://pkg.pr.new/qruto/nuxt-backend@main`.

> Using **strict** pnpm? Add `publicHoistPattern: ['@convex-dev/*']` to `pnpm-workspace.yaml` (or set `nodeLinker: hoisted`) so Convex can resolve the bundled component definitions. See the [installation docs](https://nuxt-backend.dev/docs/start/installation#using-strict-pnpm).

**Connect services when you're ready.** Put a provider key in `.env.local` and forward it to the
deployment with `npx nuxt-backend env push`: an email key sends codes to Resend's test addresses, and
a Polar sandbox token turns billing on, where `npx nuxt-backend billing sync` creates the catalog
(plans, credit packs, meters and promotions). Only `AUTH_SECRET` and `SITE_URL` are required to deploy; everything else is optional and
degrades in a designed way until configured, and `npx nuxt-backend doctor` names what is missing.

## A taste

```vue
<script setup lang="ts">
import { api } from '#backend/api'

definePageMeta({ auth: true })

const { user, signOut } = useAuth()
const { isSubscribed, checkout } = useBilling()
const messages = useQuery(api.messages.list, {})
</script>
```

## What the module wires up

Listing `nuxt-backend` in `modules` registers everything below — nothing needs importing or manual wiring.

### Composables (auto-imported, one name per concept)

**SaaS layer (this package)**

<!-- generated:readme-composables (pnpm docs:lookups, from src/nuxt/registry.ts) -->

- `useAccessAdmin` — the admin console's Access tab, as data: the launch phase and its change, the invite codes and access links, and the invitations by address, through `backend/access.ts`
- `useAccessPhase` — the app's launch phase, so a page offers what a visitor can do now: join the waitlist in early access, bring an invite code while invite only, sign up once public
- `useAccount` — the account itself: its profile, its export and its deletion
- `useActivation` — the activation checklist without its markup: the first tasks `defineActivation` declares, which of them are done, the progress, and dismissing it
- `useAdmin` — the admin console's data and actions: a paged, searchable list of every account or every workspace, one account or workspace in full, and the administrator's actions on an account
- `useAiLabel` — the AI-generated label without its markup: its words, and with a provenance record the details it opens — the models, the date and a link to check the content credentials — as state and bindings
- `useAiStream` — drive a metered, persisted AI text stream (an `ai.stream(...)` definition from `nuxt-backend/ai`) (experimental)
- `useAnnouncements` — the announcements an administrator published that the signed-in person has not dismissed, live: what `<BackendNotices>`' `announcement` notice shows
- `useAnnouncementsAdmin` — the admin console's Announcements tab, as data: every announcement with its notice and its broadcast, and the changes an administrator makes, through `backend/email.ts`
- `useAppShell` — the app shell without its markup: who is signed in, the links of the account menu, signing out, and the workspace switcher
- `useAuditLog` — the activity trail, a page at a time: the signed-in account's own (sign-ins, passkeys, email and session changes, workspaces joined, an administrator's actions on it), the active workspace's for its owners and admins, or every event for administrators
- `useAuth` — who is signed in: the session, the app-wide role, whether an administrator is visiting, and signing out
- `useBackendConfig` — `appConfig.backend` with the package defaults merged in — the shipped components read content (plan catalog, labels, brand) through this, so a partial user config is always safe to destructure
- `useBackendPagePath` — where a ready-made page lives, for a link to it: the path the module mounted it at (the `pages` module option, else its default), in the active locale when the app uses `@nuxtjs/i18n` (through its `localePath`, so `/pricing` reads `/fr/pricing` under a prefix strategy)
- `useBilling` — reactive billing state plus the full subscription lifecycle — checkout, gift, portal, plan change and undoing a scheduled one, cancel/uncancel, pause/resume — linked to your auth user
- `useCampaign` — the campaign a visitor arrived with, read from the address: a campaign link's discount code and its UTM attribution, ready for checkout
- `useChat` — a chat with a model, live: the person's threads, the open thread's messages with the reply streaming into them, and sending (experimental)
- `useConsents` — what a signed-in person agreed to, and the consent manager for optional storage
- `useContactForm` — the contact form without its markup: a name and an address for a visitor, the message alone for a signed-in account (so the same form on a page behind sign-in is a feedback form), the bot check, a honeypot, and the deployment's refusals
- `useCredits` — reactive prepaid-credit balance for the current user, plus a `topUp()` checkout and a `refresh()` re-sync
- `useEmailChange` — the headless email change behind `<ProfileSettings>`: a code from the current address proves the person asking still holds it, a code from the new address proves they hold that one too
- `useEmailPreferences` — the email topics the signed-in person receives and their notification channels, kind by kind, live, and the actions that change them: the same choices as the profile's Email section, the unsubscribe page and the provider's own page, which all stay in step
- `useEmailStatus` — reactive delivery status for a sent email
- `useExperiment` — the variant of an experiment, a `defineFlags` flag with `variants`, for whoever is looking
- `useFeatures` — reactive feature-gating for the current user — the SaaS access primitive
- `useFlag` — whether a feature flag is on for whoever is looking: their account, their active workspace and their plan, as `backend/flags.ts` declares the flag and the admin console overrides it
- `useFlagAdmin` — the admin console's Flags tab, as data: every flag with its default and its override, and the change an administrator makes, through `listFlags` and `setFlag` of `backend/flags.ts`
- `useGifts` — gifts, from both sides
- `useHumanCheck` — proof that a person makes a call: the client half of `verifyHuman`, for the calls that reach the deployment over the live connection and never pass through the app's server (a waitlist join, a contact form, a referral claim)
- `useInboxAdmin` — the admin console's Inbox tab, as data: what people sent through the contact form and by email (reply addresses, workspace addresses, the support inbox), newest first, and the replies an administrator sends to the support inbox's threads, through `backend/email.ts` (experimental)
- `useInvite` — redeem an invite code or an access link on a page of your own: check it before anyone signs in, and keep it for the tab so the sign-in hands it over with the code
- `useJob` — one queued job, live: its status, what holds it and its place in line while it waits, its progress while it runs, and its result or the reason it failed (experimental)
- `useLabels` — the labels of one packaged component's group, resolved for the person reading them
- `useLoginFlow` — the headless login flow behind `<AuthForm>` — bring your own markup and wire these refs/actions to it
- `useNotificationInbox` — `<NotificationInbox>` without its markup: the notifications, where the inbox is, the button's name with the unread count in it, and the bindings for a button and a list that open on the browser's own popover
- `useNotifications` — the signed-in account's in-app notifications, live: newest first, paged with `loadMore`, with the unread count and the actions that mark them read
- `useOnboarding` — the first run at `/welcome` without its markup: the steps in order, where the person is, moving between them, and the stamp that ends it
- `useOrders` — the signed-in customer's billing history — past charges straight from the provider's orders API, plus the per-order invoice link
- `usePasskeys` — passkey management over the auth client — list, register, rename, remove
- `usePricing` — the app's plans and credit packs as a pricing page shows them — every plan with its monthly and yearly price, what a year saves, its trial and the credits it grants per cycle; every pack with its price per credit and which is the best value — read through the scaffolded `getPricing`, in the visitor's currency where the catalog prices it
- `usePushSubscription` — web push on this device, for the signed-in person: whether the browser can take it, whether this device is subscribed, the permission, and the actions that subscribe and unsubscribe it
- `useReauthentication` — asking the person to confirm it is them before a sensitive action: the client half of `requireRecentSignIn` and of the routes that take a recent sign-in
- `useReferralAdmin` — the admin console's Referrals tab, as data: the program's totals, the top referrers, the flagged queue and one referrer's history, through `backend/referrals.ts`, and the decision an administrator makes on a flagged referral
- `useReferrals` — a person's referral code, link and rewards: the data behind `<ReferralCard>`, for a page of your own
- `useReturnPath` — where the person goes once a page that interrupted them is done: the page they were headed for, from the `?redirect=` the sign-in and the first-run redirect carry (kept to a path on this site, so a link can never send them elsewhere), else where sign-in lands (`redirects.afterSignIn`, `/` without it)
- `useSandboxInbox` — the mail a test address received within the last hour, refreshed while the page is open — so a demo, a preview deployment or an e2e run can finish an email-code sign-in without a real mailbox (experimental)
- `useSearch` — reactive, debounced full-text search
- `useSessions` — device-session management: list, revoke one, revoke the rest
- `useShareLink` — one row's share link: whether it has a live one and since when, read live, and the actions that turn it on (or mint a new one) and off, through `getShareLink`, `enableShareLink` and `revokeShareLink` of `backend/storage.ts`
- `useUploadField` — the upload field without its markup: pick a file (by the button or by dropping it), upload it with the base module's `useUpload` through the upload URL `setupStorage` mints, then hand the storage id to your `claim`, where the deployment checks it
- `useUsage` — consumption history for a credit meter, read from the provider's events API — the events your server ingested when it spent credits
- `useWaitlist` — join the waitlist, and read a place in it, on markup of your own: the steps `<WaitlistForm>` runs
- `useWaitlistAdmin` — the admin console's Waitlist tab, as data: the waiting people (the oldest first, narrowed by a filter) with a count per status, and the changes an administrator makes, through `backend/waitlist.ts`
- `useWorkflowStatus` — reactively track a durable [Workflow](https://www.convex.dev/components/workflow)'s status (experimental)
- `useWorkspace` — workspace state and actions: the list, the switch, the members and the full invitation flow (invite / accept / decline / cancel — the packaged `AcceptInvitation` component and `/accept-invitation` page build on these)

<!-- /generated:readme-composables -->

**Core (from `nuxt-convex-module`)** — `useQuery`, `useQueries`, `useMutation`, `useAction`, `usePaginatedQuery`, `usePreloadedQuery`, `useUpload`, `useUploadQueue`, `useStorageUrl`, and friends, plus `useBackendClient` and `useConnectionState`, the neutral names of its brand-named composables. Those brand-named names are not auto-imported.

### Components

<!-- generated:readme-components (pnpm docs:lookups, from src/nuxt/registry.ts) -->

- `<AcceptInvitation>` — Accept/decline UI for a workspace-invitation link (`/accept-invitation?id=<invitationId>` — the URL invitation emails point at)
- `<AccessDenied>` — what a signed-in person sees when a page is not open to them: the page guard's 403 (`definePageMeta({ auth: { role, workspace, feature } })`) on the module's error page or your app's `error.vue`, or a refusal of your own
- `<AccountData>` — the account's data rights: download everything the app keeps of the account in one file, and delete the account, once the person typed their address to confirm it
- `<ActivationChecklist>` — the first tasks that lead to value, with progress, for a page of your app: the tasks `defineActivation` declares, each ticked off when its event is recorded, "2 of 4 done", a link per open task and a Dismiss button
- `<AdminUsers>` — every account of the app, for its administrators: a search by address, a page at a time (`AdminUsersTable`), and a drawer with one account in full (`AdminUserDrawer`): its role, its ban, its device sessions and workspaces, and "Impersonate"
- `<AdminWorkspaces>` — every workspace of the app, read-only, for its administrators: a search by name, a page at a time (`AdminWorkspacesTable`), and a drawer with one workspace's members and open invitations (`AdminWorkspaceDrawer`)
- `<AiLabel>` — the visible "AI-generated" label the EU AI Act (Art
- `<AppShell>` — the frame of a signed-in app, for your layout: a header with your brand and links, the workspace switcher, the notification bell and the account menu, then the app-wide notices, then your page in the `<main>` landmark, with the consent dialog and the connection status closing it
- `<AuditLog>` — the activity trail as a list, a page at a time: the signed-in account's own (`scope="mine"`, the default), the active workspace's for its owners and admins (`scope="workspace"`), or every event for administrators (`scope="all"`)
- `<AuthForm>` — the complete passwordless sign-in flow (passkeys + email OTP) in one component: semantic markup where every element carries a `data-auth` attribute, built from parts (`AuthFormChoose`, `AuthFormCode`, …) that a same-named component of the app's replaces, and a slot per step
- `<BackendNotices>` — one region for every notice that holds for the whole session, on every page: an administrator acting as the account, maintenance, a failed payment, a scheduled deletion, low credits, a gift to claim and announcements
- `<BillingCheckoutLink>` — a link that opens a checkout for the caller's billing entity
- `<BillingHistory>` — the customer's past charges with their invoice links — every row read live from the billing provider (this package stores no order ledger), so what renders is what the provider will show on the invoice
- `<BillingPortalLink>` — a link that opens the billing customer portal for the caller's billing entity, through the app's `generateCustomerPortalUrl`, on click
- `<CancelFlow>` — cancelling takes one step; a save offer is one optional step (LIFECYCLE)
- `<ConnectionStatus>` — the live connection's state, in words, for a person: nothing while it is up; "Reconnecting…" once a drop has lasted `delay`; "You're offline." as soon as the browser is; and how many changes wait to be sent meanwhile
- `<ConsentPrompt>` — asks for the consents a person has not given at their current version, and nothing else: the required kinds `setupAccount({ consents })` declares after a version rises (the page waits behind a dialog until they are accepted), the age of an account that never answered the minimum age, and, while the app uses optional storage, one question per browser with **Allow** and **Decline** of equal weight
- `<ContactForm>` — a contact form for visitors, and a feedback form for signed-in people: the same component
- `<Gate>` — renders its content only for the people every check it names admits: signed in (`signed-in`), an app-wide role (`role`), the active workspace or a role in it (`workspace`), a feature of the plan (`feature`), or room left on a quota (`quota`, `amount`)
- `<HowDidYouHear>` — one optional question after sign-up: "How did you hear about us?"
- `<NotificationInbox>` — what the app told a person, in the app: a button whose accessible name carries the unread count, and the list it opens on the browser's own popover, newest first
- `<OnboardingFlow>` — the first run a new account sees once, at `/welcome`: a few short steps
- `<PricingTable>` — a complete pricing table, rendered on the server: plan cards from the live pricing (`usePricing`, the scaffolded `getPricing`), a monthly / yearly switch with what a year saves, subscribe / switch / cancel actions, credit packs compared credit for credit, a contact card, and a customer-portal link
- `<ProfileSettings>` — account profile: identity chrome (avatar initials, verification / role / workspace badges), display-name editing, the email change, by a code from each address, and, with `@nuxtjs/i18n` and two locales or more, the person's language, which their emails are written in
- `<ReauthenticateDialog>` — "Confirm it's you": the dialog a sensitive action opens when the server refuses it as `reauthentication_required`
- `<ReferralCard>` — a person's referral link, with copy and share buttons and the disclosure of the reward: the link is `/r/<code>` on this site, made the first time the card is read
- `<SecuritySettings>` — everything that guards the account: passkey management (add / inline rename / remove), active device sessions (revoke one / revoke others), the latest sign-ins from a new device (each signs its session out while it lasts), and signing this browser out
- `<UpgradePrompt>` — what someone whose plan lacks a feature sees: a sentence naming the plans on sale that include it, in pricing order, and a link to the first of them on the pricing page (`/pricing?plan=<key>`)
- `<UploadField>` — a labelled file field that uploads through the upload URL `setupStorage` mints, then calls `claim`, where the deployment checks the file
- `<UsageHistory>` — metered consumption, event by event, straight from the provider's events API — the same records that drew the credit balance down
- `<WaitlistForm>` — join the waitlist: the address, your questions, the launch-news box (unticked), then the sign-in code that proves the address, then the person's place, a link to share and a way to leave
- `<WithdrawalButton>` — the EU withdrawal button (LIFECYCLE; Consumer Rights Directive Art
- `<WorkspaceSettings>` — workspace, plan, and credits management — the billing entity is the active workspace, so switching workspaces switches the subscription

<!-- /generated:readme-components -->

From the base module, under neutral names: `<Authenticated>`, `<Unauthenticated>`, `<AuthLoading>` and `<AuthBoundary>` render by auth state, and `<StorageImage>` shows an image from file storage.

Every packaged component keeps one [contract](https://nuxt-backend.dev/docs/reference/components): typed slots and events, a `data-*` hook on each element, a deliberate loading, empty, failed, busy and refused state, and the [accessibility](https://nuxt-backend.dev/docs/build/ui/accessibility) guarantees: repeated controls in named groups, live regions, busy buttons that keep focus. An axe-core smoke checks the starter's sign-in and pricing pages in both colour schemes.

### Server (Nitro)

- `backendAuth(event)` — an authenticated, request-scoped Convex client
- `fetchQuery` / `fetchMutation` / `fetchAction`
- `preloadQuery` / `preloadedQueryResult`

Plus the same-origin `/api/auth/**` Better Auth proxy and the opt-in `auth` route middleware.

### Agents (MCP)

An OAuth-protected `/mcp` endpoint (Better Auth's OIDC provider + `@nuxtjs/mcp-toolkit`): an agent signs in with PKCE, the person approves it on a consent page, and every tool call runs your Convex functions **as that signed-in user** — `ctx.auth`, workspace, and billing entity resolve exactly like a web session. Built-in tools cover profile, billing (reads and checkout links — never payments), and workspaces; `defineBackendMcpTool` adds your own. **Experimental**: the MCP authorization profile and the toolkit are still moving, so this surface may change shape in a 0.x minor (see [STABILITY.md](https://github.com/qruto/nuxt-backend/blob/main/STABILITY.md)).

### Nuxt DevTools

A **Backend** tab in Nuxt DevTools: a console of the capabilities, each lit by its state, the deployment you're talking to and every env name set here and on it, live checks with a copyable fix and `doctor` on demand, the signed-in account with its workspace, sessions and passkeys, the subscription, credits and catalog sync, email transport, delivery status and a preview of every email in each language, light and dark, the webhook delivery log, the agent endpoint, monitoring (the app's health and a local log of the errors it captured), and an activity log of sign-ins, plan changes, credit spend and webhook deliveries that also lands on the Vue DevTools timeline. File buttons open your backend functions in the editor.

### Monitoring

Errors from the browser, the Nuxt server and the backend's actions go to Sentry once `@sentry/nuxt` (an optional peer) is installed and a DSN is set, each report about a failed backend call tagged with the function it ran and its error code; refusals from the error catalog never are. The backend's maintenance cron checks in to a cron monitor, `checkIn` checks your own jobs in, and `GET /api/backend/health` answers every app layer's state for uptime checks. In dev without a DSN, a local error log in DevTools stands in.

### Testing

`nuxt-backend/test` runs your Convex functions in `convex-test` with every component mounted and callers signed in as a real session leaves them. `nuxt-backend/test-utils` puts a fake backend under the composables for page and component tests: `createBackendMock({ user, queries })`, with `backendTestAliases()` in the Vitest project, and no `vi.mock`; `renderEmail` renders an email the package sends, in a recipient's language, with no deployment. **Experimental** (see [Testing](https://nuxt-backend.dev/docs/develop/testing)).

### Linting

`nuxt-backend/eslint` adds Convex's official lint rules for `backend/` to the `@nuxt/eslint` config: `export default withNuxt(backendEslint())`.

### Aliases

`#backend`, `#backend/api`, `#backend/server`, `#backend/dataModel`, `#backend/_generated` — typed imports for your Convex functions dir (fallback types keep a fresh project compiling before the first `convex dev`).

### Env preflight

On dev startup the module checks your environment — missing site URL, weak `AUTH_SECRET`, malformed `SITE_URL` — and prints actionable hints. The Convex deployment itself enforces the full env at push time: a deploy fails until every required variable is set.

### Module dependencies

`nuxt-convex-module` (the Convex integration, with Better Auth + Polar force-enabled and this package's passwordless auth client) and [`nuxt-security`](https://nuxt-security.vercel.app) (Convex-aware CSP in production) are installed as true module dependencies — deduplicated if your app lists them too, configurable through their own `convex` / `security` keys.

### The Convex side

The scaffolded `backend/` files compose the backend from `nuxt-backend/*`:

- `convex.config.ts` — the explicit app definition, scaffolded for you: declares the env contract (`backendEnv` from `nuxt-backend/app`), mounts the all-in-one `backend` component (auth + email + billing cache + gifts, with the email provider nested inside) and the upstream components one `app.use` each, and forwards the email and monitoring config
- `setupAuth` — passwordless Better Auth (OTP + passkey plugins), workspaces with emailed invitations, its email sent through `setupEmail`
- `setupBilling` — products, checkout, webhook handlers, entitlement cache, prepaid credits (`spendCredits`), and gift purchases (`giftCheckout` / `claimGift`)
- `setupAi` (`nuxt-backend/ai`) — metered actions and persisted token streams: rate-limited, prepaid-credit-metered with reserve → run → settle (a failed run costs nothing), usage ingested into the billing provider; models named as `provider/model` ids reach the AI Gateway through the AI SDK (`ai`, an optional peer), each call charged at the cost it reports, through the Convex AI Gateway on a paid Convex plan or the Vercel AI Gateway with `AI_GATEWAY_API_KEY`
- `registerBackendRoutes` — one call mounts every inbound route: auth routes, `/billing/events`, `/email/events`, `/ai/stream`, the agent token exchange at `/mcp/exchange`, and the backend's health at `/backend/health`
- `setupEmail` — transactional and marketing email, and the templates of every email the package sends (auth and billing send through it), in one layout with your brand and in each recipient's language (`messages`, `user.locale`)
- `verifyHuman` (`nuxt-backend/functions`) — checks that a person makes a call of your own (a waitlist join, a form): a proof the app's server signed after its bot check, or a challenge answer verified on the deployment
- `nuxt-backend/monitoring` — `reportError`, `reportingErrors` and `checkIn`: error reports and cron check-ins from your own actions, posted with `fetch` (no SDK in the backend; experimental)
- `setupRateLimiter`, `setupWorkflows`, `defineSearch`. Counters, workpools, cached actions, aggregates, crons and migrations: import the Convex component directly

### CLI

`npx nuxt-backend <command>` — `init` scaffolds the backend files, `.env.example`, the `nuxt.config` wiring and the agent files, `AGENTS.md` and `.mcp.json` (re-run to restore missing files); `dev` runs Convex and Nuxt together (`--anonymous` on an account-free local deployment); `doctor` checks the project and deployment configuration (`--fix` repairs what it can; `--prod` also reads production's switches and email, and probes its live site); `status` shows each capability (auth, data, jobs, billing, email, ai, protection, monitoring, flags and the rest) as live, test, missing or failing; `upgrade` moves an app to the installed version (it repairs the scaffold and runs the package's data migrations, and rewrites none of your code); `env push` syncs `.env.local` to the Convex deployment; `billing sync` pushes your `billing.catalog.ts` to the billing provider, writes the id map, and stores the webhook secret on the deployment; `mcp` runs the developer MCP server `.mcp.json` names, which gives your coding agent the project's state, the docs and the provider consoles, and asks you before any change.

<!-- END: Include on https://convex.dev/components -->

## Documentation

Everything is on [nuxt-backend.dev](https://nuxt-backend.dev) — the site (docs · playground) is the [`website/`](./website) app of this repository, and `pnpm dev` at the root serves it.

| Tab | What's inside |
|---|---|
| [Start](https://nuxt-backend.dev/docs/start) | Introduction, quickstart, the feature map, installation, templates, the playground, concepts (capabilities, principles, environments), developing locally, DevTools |
| [Auth](https://nuxt-backend.dev/docs/build/auth) | Auth setup, sign-in, roles and permissions, workspaces and invitations |
| [Billing](https://nuxt-backend.dev/docs/build/billing) | Catalog as code, subscriptions, feature gating, prepaid credits, gifts |
| [Email](https://nuxt-backend.dev/docs/build/email) | Sending, templates, branding and languages, delivery tracking |
| [AI](https://nuxt-backend.dev/docs/build/ai) | Metered actions, streaming, models through the gateway |
| [Agents](https://nuxt-backend.dev/docs/develop/agents) | The OAuth-protected MCP endpoint, built-in and custom tools, consent, connecting a client, the agent skills |
| [Data](https://nuxt-backend.dev/docs/build/data) | Queries and mutations, server rendering, search, aggregates and counters, files, workflows, scheduled jobs, queues, cached actions, migrations |
| [UI](https://nuxt-backend.dev/docs/build/ui) | The packaged pages and the customization ladder |
| [Ship](https://nuxt-backend.dev/docs/ship) | Testing, deployment, the launch checklist, security, rate limits, webhooks, troubleshooting |
| [Reference](https://nuxt-backend.dev/docs/reference) | Configuration, the Nuxt app, entrypoints, the CLI, the generated API reference |

## Templates & examples

Each one is created with `create nuxt` (`pnpm create nuxt@latest my-app -t gh:qruto/nuxt-backend/<path>`) and runs against a Convex deployment of your own — see [Templates & Examples](https://nuxt-backend.dev/docs/start/templates).

- [`templates/starter`](./templates/starter) — the app to build on: the exact `nuxt-backend init` scaffold, zero custom backend code: passwordless auth, workspace invitations, billing, credits, and gifts out of the box
- [`templates/panels`](./templates/panels) — Panels, the app the tutorial builds and the [live playground](https://nuxt-backend.dev/playground) runs: an idea and a photo become a three-panel comic strip, with credits, a generation queue, moderation, share links and notifications
- [`examples/advanced`](./examples/advanced) — every customization point in one app: a customized `convex.config.ts` (extra env, an unmounted component), custom email templates, a custom invitation page, explicit billing config, custom webhook paths and hooks, a hand-rolled signup workflow and explicit gift claiming

## Contributing

1. Clone this repository
2. Install dependencies using `pnpm install`
3. Prepare for development using `pnpm dev:prepare`
4. Start development server using `pnpm dev`, or `pnpm try` for every feature on a local deployment with seeded personas ([Try everything](https://nuxt-backend.dev/docs/start/playground/try-everything))

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

[scorecard-src]: https://api.scorecard.dev/projects/github.com/qruto/nuxt-backend/badge
[scorecard-href]: https://scorecard.dev/viewer/?uri=github.com/qruto/nuxt-backend
