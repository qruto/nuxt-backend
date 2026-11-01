# Stability

What a version number of `nuxt-backend` promises, which parts are still moving, and how upstream releases translate into releases here.

## The 0.x line

The 0.x line (from `0.2.0`; `0.1.0` was a throwaway test publish) is the **complete pack, not yet production-tested**: every capability the package is designed to ship (passwordless auth, workspaces and invitations, billing with entitlements, credits and gifts, email with delivery tracking, webhooks, metered AI, the agent endpoint, rate limiting, workflows, queues, migrations, aggregates, counters, caches, search, the pages, the CLI, the DevTools tab) is present, live-verified against real provider sandboxes, and covered by the test suite — but it has not yet carried real production traffic. `1.0` is the **same promise after production use**: no new surface is required to get there, only the miles.

Within the 0.x line, patch releases (`0.2.x`) never change the surfaces below. Minor releases (`0.3`, `0.4`, …) may — each change goes through the deprecation cycle and is called out in the changelog. From `1.0`, the same surfaces follow semver strictly: patch and minor releases are additive; removals wait for a major.

## The five surfaces

Everything not listed here — file layout under `dist/`, the internals reachable only through `#backend/*` codegen, the shipped page markup, CLI output wording — may change in any release. The `create nuxt` templates and the examples (`templates/*`, `examples/*`) are documentation, not a surface: they track `nuxt-backend: latest`, change with the default branch, and an app created from one is yours from then on.

### 1. Package subpaths and what they export

Every `nuxt-backend/<subpath>` in the package `exports` map, and every value and type reachable from one, is public API:

- `nuxt-backend` — the Nuxt module (default export) and its `ModuleOptions`
- the Convex-side setup helpers:
  - `nuxt-backend/access`
  - `nuxt-backend/account`
  - `nuxt-backend/admin`
  - `nuxt-backend/app`
  - `nuxt-backend/audit`
  - `nuxt-backend/auth`
  - `nuxt-backend/auth.config`
  - `nuxt-backend/billing`
  - `nuxt-backend/email`
  - `nuxt-backend/flags`
  - `nuxt-backend/functions`
  - `nuxt-backend/http`
  - `nuxt-backend/notifications`
  - `nuxt-backend/rate-limit`
  - `nuxt-backend/search`
  - `nuxt-backend/storage`
  - `nuxt-backend/workflows`
- `nuxt-backend/ai` and `nuxt-backend/monitoring` — experimental, see below
- `nuxt-backend/convex.config` · `nuxt-backend/_generated/component` — the all-in-one `backend` component and the types of its API
- `nuxt-backend/test` — the convex-test registration helper (`register`); the test app and its callers are experimental, see below
- `nuxt-backend/test-utils` — the backend mock for an app's component and page tests (`createBackendMock`, `resetBackendMock`, `backendMockProvides`, `backendTestAliases`) and `renderEmail`; experimental, see below
- `nuxt-backend/eslint` — the ESLint preset (`backendEslint`, `BACKEND_ESLINT_RULES`); its rule list and levels follow the upstream recommended set, so an upstream change to that set lands here in a minor release
- the `data-*` hooks the neutral stylesheet styles, and the `--bk-*` tokens it reads (the module adds the stylesheet itself)

Anything tagged `@internal` in the source is stripped from the published declarations and is not part of this surface; the surface test (`test/nuxt/public-surface.test.ts`) keeps the tag off everything an entry re-exports and freezes each entry's export list.

The error catalog is part of this surface: every code `backendError` throws and `getBackendError` reads (`BACKEND_ERRORS` in `nuxt-backend/functions`), the data fields each code carries, the `forbidden`, `invalid_input`, `not_ready` and `unavailable` reasons the package throws, and the HTTP status an auth route answers each code with. A `forbidden` reason the reader maps from Better Auth's own 403 is Better Auth's error code, passed through as Better Auth names it, and is not covered. A code, a field or a reason is never renamed or removed outside the deprecation cycle; a minor release may add a code, an optional field or a reason. The English sentences are not part of it: the error's `message` and the `errors` labels may be reworded in any release. [Errors](https://nuxt-backend.dev/docs/reference/backend/errors) lists them.

So is who may call each function the scaffold ships, as [Decide who manages billing](https://nuxt-backend.dev/docs/build/billing/setup#who-may-buy-for-a-workspace) lists it for billing and AI: the access each one needs (anyone, a signed-in account, a member of the workspace, its owner and admins, an app admin), with membership and roles read fresh, and whether an impersonated session may call it. A minor release may refuse a caller it let through before, and says so in the changelog; it never lets through a caller it refused. The probe suite (`test/convex-component/authorization-probes.test.ts`) holds every function to its row.

So is the sensitive-action table, `SENSITIVE_ACTIONS` in `nuxt-backend/functions` ([Require a recent sign-in](https://nuxt-backend.dev/docs/build/auth/access/step-up#which-actions-ask) lists it): every auth route and every public write the scaffold ships, with how recent a sign-in it takes, whether an impersonated session may, and the limits it spends. So are the window a recent sign-in counts in, `RECENT_SIGN_IN_SECONDS` (ten minutes, which is also Better Auth's `session.freshAge`), the session token's `authTime` claim (epoch milliseconds), the `reauthentication_required` refusal, `requireRecentSignIn`, `recentSignIn` on `createFunctions`' builders and on `CallerRule`, and the re-authentication a sign-in marked by the `x-backend-reauthenticate` header makes: the same account only (`forbidden`, reason `other_account`), the active workspace kept, the old session signed out. A minor release may ask for a recent sign-in where it did not before, or shorten the window, and says so in the changelog; it never stops asking for one where it did, and session revocation never asks. `test/unit/sensitive-actions.test.ts` fails on a route or a public write without a row, and holds each route to it.

So are `defineRetention` and the token helpers of `nuxt-backend/functions` ([Delete old data on a schedule](https://nuxt-backend.dev/docs/build/data/retention)): a rule's options (`fn`, `table`, `index`, `match`, `ttl`, `batch`, `onDelete`), the optional `{ now }` its mutation takes and the `{ deleted, more }` it returns, the rule that an index is named by its fields (`by_status_and_updatedAt`), the `retention.batch_failed` log code, and `randomToken`, `sha256Hex` (lower-case hex of the UTF-8 text) and `normalizeEmail` (trimmed and lower-cased, nothing else). A minor release may add an option; the cutoff of a pass stays fixed when it starts, and a token is never shorter than 16 random bytes.

So is the event catalog, `BACKEND_EVENTS` in `nuxt-backend/audit` ([Events](https://nuxt-backend.dev/docs/reference/backend/events#backend-events) lists it): every kind's type, whether it belongs to an account or a workspace (who reads it: the account it is about, the workspace's owners and admins, the app's administrators), the fields its `data` carries, and the channels it derives; the `app.` namespace an app's own kinds live under; the row `onEvent` receives (`vBackendEvent`); and the channel matrix's rule that a billing, gift, referral or email kind never derives an email (a plan pass is a gift: its kinds live under `gift.`); a billing entity's kind (scope `entity`) names its workspace, or, with `billTo: 'user'`, the account billed on its own, and a free plan's own lifecycle records none. A kind, a field or a channel is never renamed or removed outside the deprecation cycle; a minor release may add a kind, an optional field or a channel, and a write point that records an existing kind. Rows hold ids, never an address or a name, and no release starts keeping one. How long a row is kept is in [Limits and retention](https://nuxt-backend.dev/docs/reference/backend/limits) with the other windows; what an account's erasure removes and what it pseudonymizes ([Record and review activity](https://nuxt-backend.dev/docs/build/auth/admin/audit-log#erasure)) only ever removes more.

So are an account's export and erasure ([Export and erase account data](https://nuxt-backend.dev/docs/build/auth/accounts/data)): `setupAccount` in `nuxt-backend/account` and the `AccountDataSource` an app's own tables join through; the registry of what the package keeps of a person, `ACCOUNT_DATA_SOURCES` (each participant's tables, what it holds, what it is found by, what an erasure does with it and how long it is kept otherwise), which the [Privacy and data inventory](https://nuxt-backend.dev/docs/ship/compliance/privacy) page lists; an account's deletion, scheduled after a recent sign-in with the account's address typed to confirm it (`invalid_input`, field `confirmation`), waiting out `graceMs` (30 days by default) during which the account works as before and the person can keep it, with the link in the email (`keepAccount` page) or `cancelAccountDeletion`, then erased everywhere; refused to the only owner of a workspace others belong to (`forbidden`, reason `sole_owner`) and under the per-account `accountDelete` limit; an administrator's removal, which skips the grace period; an export, one JSON file behind a link that expires within the hour, with the account's files as zip parts behind links that end with it, at most three a day (`rate_limited`, limit `accountExport`), never for an administrator acting as the account or an agent; and the retries of an erasure's participants, five with a growing wait, then `account.erasure_failed`. What an erasure removes and pseudonymizes only ever removes more; a minor release may add a participant, never drop one, and never lengthens a window an erasure leaves a row in.

So is the administrators' side of the auth layer ([Run the admin console](https://nuxt-backend.dev/docs/build/auth/admin)): the admin console's reads (`setupAdmin` in `nuxt-backend/admin`), each answering `null` to anyone who is not an administrator now (read fresh), to an administrator acting as someone and to every agent; an impersonation that lasts at most `IMPERSONATION_SESSION_SECONDS` (thirty minutes), whatever the app's own `admin.impersonationSessionDuration` asks; and an administrator's account never impersonated, whatever the app's roles grant (`forbidden`, reason `admin_target`). A minor release may shorten the window; it never lengthens it, and never lets an administrator's account be visited.

So is the language an account reads in: the account's `locale` field (`user.locale`, a language tag such as `de` or `pt-BR`, refused otherwise), set at sign-up from the request's `Accept-Language`, and the order an email the package sends picks its language in (the caller's `locale`, the recipient account's, the request's, the sender's, then `defaultLocale`). So is the shape of `setupEmail`'s `messages`: an app's i18n messages per locale, the package's keys under `backend.email`, an app's own at the root, a missing key read in English. A minor release may add a step to that order, never reorder it. The layout's markup and colours are not covered: like the shipped page markup, they may change in any release, and a test that pins an email's HTML renders it with `renderEmail` rather than comparing a fixed string.

So are the launch phases ([Launch in phases](https://nuxt-backend.dev/docs/build/growth/launch)): `setupAccess` in `nuxt-backend/access`, `access.invites.create` and `access.admit`, and the functions `access.api` gives `backend/access.ts` to re-export, `getAccessPhase`, `checkInvite`, `getAccessConsole`, `setAccessPhase`, `createInvite`, `revokeInvite` and `admitEmails`, and the internal `emailInvitations` that "Email them" schedules by name; the phases by name, `early-access`, `invite-only` and `public`; the kinds of ticket that admit a new address while the app is closed (`invite-code`, `access-link`, `invitation`, `waitlist`, `workspace-invitation`, `gift`, `domain`, `administrator`), which `canSignIn` receives as `ticket` and `access.ticket_used` records; an invite check's statuses (`valid`, `expired`, `used-up`, `revoked`, `unknown`); and the refusal of a new address without a ticket, `forbidden` with reason `ticket_required`, `phase` and `invite`. A minor release may add a kind of ticket, never rename one.

So is the waitlist ([Run a waitlist](https://nuxt-backend.dev/docs/build/growth/launch/waitlist)): `setupWaitlist` in `nuxt-backend/access`, the functions `waitlist.api` gives `backend/waitlist.ts` to re-export (`getWaitlistQuestions`, `joinWaitlist`, `waitlistStatus`, `leaveWaitlist`, `getWaitlistConsole`, `admitWaitlist`, `declineWaitlist`, `noteWaitlist` and `getWaitlistCaps`), `waitlist.launchAudience`; an entry's statuses (`waiting`, `admitted`, `declined`, `joined`); the signed status link, `/waitlist#<token>`, and the share link's `?ref=`; the `waitlist` place a `ticket_required` refusal carries; and the `waitlist.joined`, `waitlist.admitted`, `waitlist.declined` and `waitlist.left` events. A minor release may add a status, never rename one.

So is the referral program ([Run a referral program](https://nuxt-backend.dev/docs/build/growth/offers/referrals)): `setupReferrals` in `nuxt-backend/billing` and its options (`billing`, `rewards`, `hold`, `caps`); the functions `referrals.api` gives `backend/referrals.ts` to re-export (`getReferralCode`, `getReferrals`, `claimReferral`, `previewReferral`, `setReferralSharing`, `getReferralConsole`, `resolveReferral` and `runReferralSweep`); `referrals.codeFor`; a referral's states (`claimed`, `held`, `rewarded`, `voided`) and the refusals a claim answers (`invalid`, `own_code`, `already_claimed`, `too_late`, `self_referral`); the code's shape and the links `/r/<code>` and `?ref=<code>`; the `referral.claimed` and `referral.rewarded` events; and the hold's floor of 14 days. A minor release may add a state or a reason, never rename one.

So are consents and the age check ([Record consents](https://nuxt-backend.dev/docs/build/auth/accounts/consents)): `setupAccount({ consents, minimumAge })` in `nuxt-backend/account`, the kinds an app declares (a kind is lower-case words joined by `-` or `_`, with a `version`, a `url`, `required` and a `title`), and the kinds the package keeps for its own, `storage`, `age` and `launch-news`, which an app may not declare; `account.consented`, `account.requireConsent` and the functions `account.api` gives `backend/account.ts` to re-export (`getConsents`, `getConsentTerms`, `grantConsent`, `withdrawConsent` and `chooseStorage`); a row of the ledger as one decision (the kind, its version, granted or withdrawn, the time, and `sign-up`, `prompt`, `settings`, `waitlist` or `topic` as its source) that is never overwritten; the purposes of optional storage, `preferences`, `replay` and `analytics`, and the cookie that keeps a browser's choice, `backend.storage`; the refusals `forbidden` with reason `consent_required` (and `kind`), `age_required` and `under_age`; the sign-in body's `age` field; the `consent.granted` and `consent.withdrawn` events; and `storesLastSignInCookie`, the `beforeStoreCookie` an app's own `lastLoginMethod` passes so the cookie waits for the `preferences` purpose. A minor release may add a purpose or a source, never rename one.

So are feature flags and the kill switches ([Roll out features and pause services](https://nuxt-backend.dev/docs/ship/operate/flags)): `defineFlags`, `setupFlags`, `isEnabled` and `requireFlag` (`forbidden`, reason `flag_off`) in `nuxt-backend/flags`, and the scaffold's `getFlags`, `listFlags` and `setFlag`; how a flag is evaluated: an override's `enabled` over the code's default, and while that is off its account, workspace and plan targets and its rollout; the bucket a subject's id lands in for a flag's key (`flagBucket`), so raising a rollout only ever adds subjects and the same subject stays on the same side; the package's own flags by key, `pause_signups`, `pause_checkout`, `pause_ai` and `maintenance`, each off until an administrator turns it on, and the refusal of a paused call, `unavailable` with service `signups`, `checkout` or `ai` and reason `<service>_paused`; every change an administrator's in person with a recent sign-in, recorded as `flag.changed`. So are experiments: a flag's `variants` (the control first), `weights`, `goal`, `guardrails` and `discounts`; the variant a subject's id lands in while the flag is on for it (its own stable hash of the key and the id, apart from the rollout's), the control while it is off and for nobody signed in, and the `winner` an override shows everyone; `flags.variant(ctx, key)` and the scaffold's `exposeExperiment` and `getExperiments`; one `experiment.exposed` per account (or workspace) and experiment, and a goal or guardrail counted only after it. A minor release never changes which variant a subject's id lands in. So is the growth funnel: its steps (waitlist, admitted, sign-up, activation, trial, paid), counted from `waitlist.joined`, `waitlist.admitted` and `access.admitted`, `account.created`, `account.activated`, a trial's `billing.subscription_created` or `billing.trial_pass_started`, and the first `billing.order_paid`; `setupAudit({ activation })` and its default, an account's first `app.*` event of its own; the dimensions a step is broken down by (`invite`, `campaign`, `referral`, `promotion`, `answer`), first touch within a day of the sign-up, and weekly cohorts starting on Monday, 00:00 UTC; and the scaffold's `getFunnel`, `getSource` and `recordSource`. An erasure never changes a count. A minor release may add a flag of the package's own, off by default, and a service a kill switch pauses; such a flag is always named `pause_<service>` or `backend_<name>`, prefixes `defineFlags` refuses for an app's own keys, so an added flag never takes a key an app declared. A minor release never renames a key, nor changes a subject's bucket.

So are the checkout metadata keys the package reserves, which `generateCheckoutLink` and `giftCheckout` refuse from a client in any letter case: `userId`, `gift`, `giftId`, `phase`, `recipientEmail`, `purchaserUserId`, `giftRecipient` and the `utm_` prefix (where campaign attribution lands, as `utm_source`, `utm_medium`, `utm_campaign`, `utm_term` and `utm_content`). A minor release may reserve another key; a reserved key is freed only through the deprecation cycle.

So is the free plan: a catalog plan priced `{ month: 0 }` is a subscription at the provider that every billing entity the auth layer makes is put on (through the scaffold's workpool where the auth routes are mounted, by `billing:startFreePlan`'s name elsewhere), and that one whose paid plan ends goes back on, unless it no longer exists or the provider deleted its customer; a checkout of a paid plan upgrades it in place; it is never checked out, changed, cancelled or paused (`invalid_input`, reason `free_plan`); `useBilling()` reads it as a subscription marked `free: true`, with `isFree` true and `isSubscribed` false on it. And so are prices in several currencies: a per-currency `prices` or `price` is one native presentment price per currency on the same product, `getPricing` answers in the currency it is asked for where the catalog prices it, else the catalog's own (`currency`, `currencies`), and a checkout pays in the one it names. Neither is narrowed outside the deprecation cycle.

So are the catalog's promotions: a discount declared in the catalog's `discounts` is the provider's own discount, which `billing sync` finds again by its key and keeps in line in place (its amount and months only while nobody has redeemed it), and never ends unless the catalog marks it `retired`, which ends it and frees its code; a client names only a discount with a `code`, by its key, for a product it applies to (`invalid_input`, field `discount`, for any other and for one the provider no longer redeems), and server code names any (`billing.checkout`'s `discount`); `setupBilling`'s `checkoutDiscount` is asked on a checkout of a catalog plan that names no discount of its own, and a discount it picks that the provider no longer redeems is dropped, the checkout opening at the regular price; `billing.applyDiscount` replaces a subscription's discount from its next payment; and `getPricing` shows a public promotion asked for by its key or its code, never its code, with the real end as a date. None of it is narrowed outside the deprecation cycle.

So is how a feature gate names a benefit, on the server (`billing.hasFeature`, `billing.requireFeature` and the `withFeature` tier of `createFunctions`) and in the UI (`useFeatures().has()`, `<Gate feature>` and `<UpgradePrompt>`) alike: by the `key` in its metadata, else by its benefit id, and by nothing else; and so are the `plans` a `feature_required` refusal carries, the catalog keys of the plans on sale that include the feature, in pricing order, which `getPricing` lists as each plan's `featureKeys`. The match is never widened or narrowed outside the deprecation cycle.

Every name on this surface is brand-neutral: no export, value or type, and no registered name says the billing or the email provider. The same test pins it, down to the identifiers in the generated API reference. A provider appears only in prose, where a doc comment says what runs underneath, and in the component keys an app's own `convex.config.ts` chooses (`components.polar`).

### 2. Configuration names

- `ModuleOptions` (`backend` in `nuxt.config`):
  - `authRoute`
  - `css`
  - `devtools`
  - `pages`
  - `redirects`
  - `url`
- the page keys under `pages`:
  - `acceptInvitation`
  - `accessibility`
  - `admin`
  - `invite`
  - `keepAccount`
  - `login`
  - `pricing`
  - `privacy`
  - `profile`
  - `referral`
  - `security`
  - `settings`
  - `subprocessors`
  - `terms`
  - `waitlist`
- `appConfig.backend`, the content layer:
  - `billing.contact`
  - `billing.lowCreditsThreshold`
  - `billing.packs`
  - `billing.plans`
  - `brand.address`
  - `brand.logo`
  - `brand.name`
  - `consent.purposes`
  - `labels.access`
  - `labels.account`
  - `labels.activation`
  - `labels.admin`
  - `labels.ai`
  - `labels.announcement`
  - `labels.audit`
  - `labels.auth`
  - `labels.cancelFlow`
  - `labels.connection`
  - `labels.consent`
  - `labels.contact`
  - `labels.credits`
  - `labels.deletion`
  - `labels.errors`
  - `labels.feedback`
  - `labels.gift`
  - `labels.history`
  - `labels.impersonation`
  - `labels.invitation`
  - `labels.legal`
  - `labels.maintenance`
  - `labels.notifications`
  - `labels.onboarding`
  - `labels.pastDue`
  - `labels.preferences`
  - `labels.pricing`
  - `labels.profile`
  - `labels.quota`
  - `labels.reauthenticate`
  - `labels.referral`
  - `labels.report`
  - `labels.security`
  - `labels.settings`
  - `labels.shell`
  - `labels.source`
  - `labels.upgrade`
  - `labels.upload`
  - `labels.usage`
  - `labels.waitlist`
  - `labels.withdrawal`
  - `legal.address`
  - `legal.company`
  - `legal.contact`
  - `legal.dpo`
  - `legal.host`
  - `monitoring.feedback`
- the label keys: every group and key of `BackendLabels` (the `useLabels` types), the same names an app overrides as `labels.<group>.<key>` in `appConfig.backend` and translates as `backend.<group>.<key>` messages of `@nuxtjs/i18n`, and the `{param}` names each one fills in. A key or a param is never renamed or removed outside the deprecation cycle; a minor release may add a key, or a plural form to a message. `test/unit/label-keys.json` holds every key with its params, and a test fails when the labels and it differ. The English wording is not covered and may change in any release: pin a sentence by overriding its key. Every key is stable, the `email` group included, except the keys of a component in the experimental tier, which follow that component. [Change copy and labels](https://nuxt-backend.dev/docs/build/ui/customize/labels) lists the groups.
- `redirects.afterSignIn`, where the sign-in page sends a person without a usable `?redirect=`
- `runtimeConfig.public.backend` — `pages`, the mount path per page key, `authRoute`, the same-origin auth route, `redirects`, the bot check's `botDetection` (a build on Vercel) and `challengeSiteKey` (`NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY`), and `monitoring` (`dsn`, `environment`), where the browser reads the DSN it reports to
- the routes the module serves for the monitoring capability: `/api/backend/health` (its JSON shape: `status`, `capabilities` and, for an admin, `detail`), and on the deployment `registerBackendRoutes`' fixed `/backend/health`, the same shape
- the tags an error report about a backend call carries, from the browser, the Nuxt server or the backend: `backend.function`, `backend.code`, `backend.reason` and `backend.source` (also `MONITORING_TAGS` of the experimental `nuxt-backend/monitoring`, whose tags stay stable with the rest of this list)
- the `#backend/*` aliases:
  - `#backend`
  - `#backend/_generated`
  - `#backend/api`
  - `#backend/dataModel`
  - `#backend/server`

### 3. The auto-import and component registry

The names the module registers, exactly as it registers them (`src/module.ts` and `src/nuxt/`):

- **Composables**:
  - `getBackendError` — reads a refusal's catalog code out of anything a call threw or resolved with
  - `useAccessAdmin` — the admin console's Access tab as data: the phase, the invite codes and access links, the invitations by address, and the changes an administrator makes
  - `useAccessPhase` — the app's launch phase, rendered on the server and live
  - `useAccount` — the account itself: its profile, its export and its deletion, with the typed confirmation, the grace period it waits out (`deletion`) and `cancelDeletion()`
  - `useActivation` — the activation checklist `defineActivation` declares: the tasks with their label read in the person's language, how many are done, the progress, dismissing, and `readOnly` for an administrator's visit
  - `useAdmin` — the admin console's data and actions: every account or workspace a page at a time, one in full, and the administrator's writes
  - `useAiLabel` — `<AiLabel>` without its markup: its words, and the details a provenance record opens, as state and bindings
  - `useAiStream`
  - `useAnnouncements` — the announcements an administrator published that the signed-in person has not dismissed, live, and dismissing one
  - `useAnnouncementsAdmin` — the admin console's Announcements tab as data: every announcement with its notice and its broadcast, and the changes an administrator makes
  - `useAppShell` — `<AppShell>` without its markup: who is signed in, the account menu's links, signing out, and the workspace switcher with each workspace's role, the invitations waiting, switching and creating in place
  - `useAuditLog`
  - `useAuth`
  - `useBackendClient` — the imperative client, the neutral name of the base module's `useConvex`
  - `useBackendConfig`
  - `useBackendPagePath` — where a ready-made page lives, in the active locale
  - `useBilling`
  - `useCampaign` — a campaign link's discount code and UTM attribution, read from the address for checkout
  - `useChat` — a chat with a model, live: the person's threads, the open thread's messages with the reply streaming into them, and `send()`
  - `useConnectionState`
  - `useConsents` — what the signed-in person agreed to, by kind and version, granted and withdrawn, and the consent manager's choice of optional storage
  - `useContactForm` — `<ContactForm>` without its markup: a visitor's name and address or a signed-in account, the message, the honeypot, the bot check and the deployment's refusals
  - `useCredits`
  - `useEmailChange`
  - `useEmailPreferences` — the email topics the signed-in person receives and their notification channels kind by kind, live, with joining and leaving one topic (a double opt-in waits for its confirmation), leaving every one, and turning one channel of one kind on or off
  - `useEmailStatus`
  - `useExperiment` — the variant of a `defineFlags` experiment for whoever is looking, rendered on the server and live, recording the person's exposure on the first read of a running one
  - `useFeatures`
  - `useFlag` — whether a feature flag is on for whoever is looking, rendered on the server and live
  - `useFlagAdmin` — the admin console's Flags tab as data: every flag with its default and override, and the change an administrator makes
  - `useGifts`
  - `useHumanCheck` — a token for one call that `verifyHuman` checks on the deployment: a challenge answer, or a proof the app's server signs once its bot check passed
  - `useInboxAdmin` — the admin console's Inbox tab as data: the contact messages and inbound mail, and the replies an administrator sends to the support inbox
  - `useInvite` — check an invite code or an access link before signing up, and keep it for the tab's next sign-in
  - `useJob` — one queued job, live: its place in line, its progress, its result or the reason it failed, and `cancel()`
  - `useLabels` — a label group, resolved through the component prop, `appConfig.backend.labels`, `@nuxtjs/i18n` and English
  - `useLoginFlow`
  - `useNotificationInbox` — `<NotificationInbox>` without its markup: its state, the button's name with the unread count, and the bindings for a button and a list on the browser's popover
  - `useNotifications` — the signed-in account's in-app notifications, live and paged, worded in the active language, with the unread count and marking read
  - `useOnboarding` — the first run at `/welcome` without its markup: the steps in order, where the person is, moving between them, and the stamp that ends it
  - `useOrders`
  - `usePasskeys`
  - `usePricing` — the plans and packs on sale, from `getPricing`, rendered on the server
  - `usePushSubscription` — web push on this device for the signed-in person: whether the browser can take it, the permission, whether it must be installed first, and subscribing and unsubscribing it
  - `useReauthentication` — the app's "Confirm it's you": `withReauthentication(action)` signs the person in again when the server asks for a recent sign-in, then runs the action once more
  - `useReferralAdmin` — the admin console's Referrals tab as data: the totals, the top referrers, the flagged queue, and the decision an administrator makes on a flagged referral
  - `useReferrals` — a person's referral code and link, the share text that discloses the reward, the referrals it earned by state, copy and share, and the choice to carry the code on share pages
  - `useReturnPath` — where the person goes once a page that interrupted them is done: the `?redirect=` kept to this site, else the sign-in landing
  - `useSandboxInbox`
  - `useSearch`
  - `useSessions`
  - `useShareLink` — a row's share link: whether it is live and since when, and turning it on, rotating it and turning it off
  - `useUploadField` — `<UploadField>` without its markup: state, actions and bindings
  - `useUsage`
  - `useWaitlist` — join the waitlist, verify the address by a sign-in code, read the place in line live, and leave
  - `useWaitlistAdmin` — the admin console's Waitlist tab as data: the waiting people, and the changes an administrator makes
  - `useWorkflowStatus`
  - `useWorkspace`
- **Components**:
  - `AcceptInvitation`
  - `AccessDenied` — what the page guard's 403 shows, in the module's error page or an app's `error.vue`
  - `AccountData` — the account's export behind an expiring link, and its deletion once the person typed their address
  - `ActivationChecklist` — the first tasks that lead to value, with progress, a link per open task and a Dismiss button; it congratulates once when every task is done
  - `AdminUsers` — every account, for administrators: search, a drawer per account, its role, its ban, its sessions and impersonation
  - `AdminWorkspaces` — every workspace, read-only, for administrators: its members and open invitations, and impersonating a member
  - `AiLabel` — the visible "AI-generated" label beside generated content, opening what made it when given a provenance record
  - `AppShell` — the frame of a signed-in app: the header with the brand, the app's links, the workspace switcher and the account menu, the app-wide notices, and the page in the `main` landmark
  - `AuditLog` — the activity trail, a page at a time: an account's own, a workspace's, or every event
  - `AuthForm`
  - `BackendNotices` — one region for every app-wide notice: an administrator's visit, maintenance, a failed payment, a scheduled deletion, low credits and a gift to claim, each replaceable through its slot
  - `BillingCheckoutLink` — the package's checkout link, in place of the base module's `CheckoutLink`
  - `BillingHistory`
  - `BillingPortalLink` — the package's portal link, in place of the base module's `CustomerPortalLink`
  - `CancelFlow` — cancelling in one step, with one optional step before it where save offers are on: a question, and at most one offer by reason, with "Cancel my plan" on every screen
  - `ConnectionStatus` — the live connection's state in words, in the status region of every ready-made page
  - `ConsentPrompt` — the consents a person is asked to accept again, the age of an account that never gave it, and the consent manager's question about optional storage
  - `ContactForm` — a contact form for visitors and a feedback form for signed-in people: the bot check, a honeypot and a limit per sender, and a message stored before anything is sent to the team
  - `Gate` — its content only for the people its props admit: signed in, an app-wide role, a workspace or a workspace role, a plan feature, room in a quota (the quota check is experimental, below)
  - `HowDidYouHear` — one optional question after sign-up, "How did you hear about us?", kept next to the first campaign link the person arrived through, asked once
  - `NotificationInbox` — what the app told a person, in the app: a button with the unread count in its name and the list it opens, newest first
  - `OnboardingFlow` — the first run at `/welcome`: name and picture, the workspace, teammates and, when the catalog sells one, a plan, with steps of the app's own in named slots
  - `PricingTable`
  - `ProfileSettings`
  - `ReauthenticateDialog` — the "Confirm it's you" dialog `useReauthentication` opens; only the oldest one on a page opens
  - `ReferralCard` — a person's referral link with copy and share buttons, the reward disclosed beside it, the friends it brought and the choice to carry the code on share pages
  - `SecuritySettings`
  - `StorageImage` — an image from file storage, the neutral name of the base module's `ConvexImage`
  - `UpgradePrompt` — what someone whose plan lacks a feature sees: the plans on sale that include it, and a link to the first on the pricing page; with `cooldown`, a "Not now" that hides it that long
  - `UploadField` — a labelled file field that uploads, then hands the file to the app's claim, where the deployment checks it
  - `UsageHistory`
  - `WaitlistForm` — join the waitlist, confirm the address with a sign-in code and read the place in line, a link to share and a way to leave; a slot per step, around its parts
  - `WithdrawalButton` — the EU withdrawal button, "Withdraw from contract here", with its confirm step, for a purchase inside its 14 days
  - `WorkspaceSettings`
- **Parts** — each region of a packaged component, registered under its own name, so an app component of the same name replaces it everywhere, packaged pages included; its props are the parent's headless composable and the item it renders, typed in `#backend/parts` ([Parts](https://nuxt-backend.dev/docs/reference/components/parts)). A part's name and props are surface; a minor release may add a part, never rename one:
  - `AcceptInvitationActions`
  - `AccountDeletion`
  - `AccountExport`
  - `AccountMenu`
  - `AdminUserDrawer`
  - `AdminUsersTable`
  - `AdminWorkspaceDrawer`
  - `AdminWorkspacesTable`
  - `AuditLogEvent`
  - `AuthFormAge`
  - `AuthFormAgreement`
  - `AuthFormChoose`
  - `AuthFormCode`
  - `AuthFormEmail`
  - `AuthFormError`
  - `AuthFormHeader`
  - `AuthFormInviteCode`
  - `AuthFormPasskey`
  - `AuthFormPasskeyOffer`
  - `AuthFormRecover`
  - `AuthFormUndeliverable`
  - `AuthFormWaitlisted`
  - `BillingHistoryOrder`
  - `CancelFlowEnd`
  - `CancelFlowOffer`
  - `CancelFlowQuestion`
  - `NotificationInboxBell`
  - `NotificationInboxItem`
  - `OnboardingPlan`
  - `OnboardingProfile`
  - `OnboardingTeammates`
  - `OnboardingWorkspace`
  - `PricingCancelConfirm`
  - `PricingCurrencySelect`
  - `PricingEmailOptOut`
  - `PricingPackCard`
  - `PricingPeriodSwitch`
  - `PricingPlanCard`
  - `ProfileEmailSection`
  - `ProfileIdentity`
  - `ProfileLanguageSection`
  - `ProfileNameSection`
  - `ProfilePreferencesSection`
  - `ReauthenticateCode`
  - `ReauthenticatePasskey`
  - `SecurityAlerts`
  - `SecurityPasskeys`
  - `SecuritySessions`
  - `UsageHistoryEvent`
  - `WaitlistCode`
  - `WaitlistJoin`
  - `WaitlistPlace`
  - `WaitlistShare`
  - `WorkspaceBilling`
  - `WorkspaceCredits`
  - `WorkspaceList`
  - `WorkspaceSwitcher`
- **Server (Nitro) imports**:
  - `backendAuth`
- **Route middleware** — `backend-access`, global, the page guard behind `definePageMeta({ auth })`: the one page guard, so there is no named middleware to list
- **Page meta** — `auth`, `true` or its keys `role`, `workspace`, `feature` and `hidden`, and what the guard answers: a signed-out visitor goes to the sign-in page with `?redirect=`, a signed-in one who fails a rule gets a fatal 403 whose `data` is `{ reason, path }`, `reason` one of `role`, `workspace`, `feature` and `banned`, and a `hidden` page answers 404 to both instead, typed as `PageAccessRules`, `AccessDeniedReason` and `AccessDeniedData` from `nuxt-backend`. A key that names no rule refuses the page. An app with no `error.vue` of its own gets the module's error page, which shows a 403 with `<AccessDenied>` and anything else as Nuxt's own page does. A minor release may add a rule or a reason
- **Runtime hooks**:
  - `backend:error` (`{ error, cause }`): called when a composable's action fails, with the failure its `error` holds and what the call threw; never for a read, and never for the calls a step machine (`useLoginFlow`, `useEmailChange`) makes, which show in its own `error`
  - `backend:session-ended` (`{ route, to, preventDefault }`): called when a session ends on a page that asks for a sign-in (`definePageMeta({ auth })`), before the module sends the person to sign in

A composable's call shape and return shape are part of this surface, and so are the conventions they follow ([Composable conventions](https://nuxt-backend.dev/docs/reference/nuxt/conventions)): an options object with `MaybeRefOrGetter` inputs; a plain object of refs and actions; `isLoading` for a read, `isPending` for an action, and `error` as `{ code, data, message } | null`, a catalog refusal or `unavailable` with reason `unexpected` for a failure that carries no code; reads that never throw and actions that reject. The data composables (`useSearch`, `useWorkflowStatus`, `useEmailStatus`, `useSandboxInbox`, `useSessions`, `useAccount`), the billing composables (`useBilling`, `useCredits`, `useFeatures`, `useGifts`, `useOrders`, `usePricing`, `useUsage`, `useAiStream`), the auth composables (`useAuth`, `useWorkspace`, `usePasskeys`, `useHumanCheck`, `useReauthentication`), `useAuditLog`, `useAdmin`, `useFlag` and `useFlagAdmin` follow them; so do `useAuth()`'s `impersonating` and `useAdmin()`'s `stopImpersonating`; `useBilling`'s `pendingChange`, `resumesAt`, `canManage`, `saveOffers`, `isPastDue` and `isFinishingCheckout` are surface with the rest of its return shape, and so are a granted benefit's neutral `kind` values (`license_key`, `download`, `community`, `repository`, `shared_channel`, `custom`, `credits`, `feature`, `other`), which a minor release may add to, never rename. So is the return from checkout: the server sends every plan and pack checkout, and a gift's claim, back with `?checkout_return=` on its success URL, and the module's client plugin takes it off the address at once and refreshes the entitlements once, leaving an app's own `checkout_id` where it is. The auth actions resolve with their data, never the auth client's `{ data, error }` answer. `useLoginFlow` and `useEmailChange` are step machines: their actions never reject, and `error` and `retryAfter` say why a step failed; so are `useReauthentication`'s steps (`withPasskey`, `sendCode`, `verifyCode`), while its `reauthenticate` and `withReauthentication` resolve or reject. `<AuthForm>`'s slot names (`header`, `choose`, `request-code`, `verify-code`, `add-passkey`, `error`, `footer`) and their props, the whole `useLoginFlow()` return, are surface too. So are the values of the way a browser last signed in, `'passkey'` and `'email-otp'`, which `useLoginFlow()`'s `lastMethod` and the account's `lastLoginMethod` field hold: a minor release may add one, never rename one. So is every packaged component's side of the [component contract](https://nuxt-backend.dev/docs/reference/components#the-component-contract): its slot names and the props each slot receives (as the component's `$slots` type infers them), its event names and their arguments, its `data-*` family and the hook values its markup carries, and the states it renders. A slot, an event or a hook value is never renamed or removed outside the deprecation cycle; a minor release may add one. The roles, the named groups and the live regions the [Accessibility](https://nuxt-backend.dev/docs/build/ui/accessibility) page lists are kept; `test/nuxt/component-contract.ts` holds every component's row, and a test fails when a component and its row differ. So is the `labels` prop of every packaged component that renders copy (`<AuthForm>`, `<ReauthenticateDialog>`, `<ProfileSettings>`, `<SecuritySettings>`, `<AcceptInvitation>`, `<PricingTable>`, `<WorkspaceSettings>`, `<BillingHistory>`, `<UsageHistory>`, `<AuditLog>`, `<AccountData>`, `<AdminUsers>`, `<AdminWorkspaces>`, `<UpgradePrompt>`, `<CancelFlow>`, `<WithdrawalButton>`, `<Gate>`, `<AccessDenied>`, `<ConnectionStatus>`): its component's label group, with every key optional, winning over `appConfig.backend.labels`.

The billing-history surface — `useOrders`, `useUsage`, `<BillingHistory>`, `<UsageHistory>` — ships **stable**, deliberately, not in the experimental tier: each one binds to a deployment function named in the scaffold contract below, which `nuxt-backend doctor` verifies, and each degrades to an empty state rather than an error when the backend has not deployed its half.

The core data composables and components (`useQuery`, `useMutation`, `<Authenticated>`, …) are `nuxt-convex-module`'s surface and follow that package's guarantees. Its brand-named names are hidden from an app that uses this module: every auto-import and component of the base module whose name says Convex or Better Auth (`useConvex`, the `useConvex*` aliases, `useConvexAuth`, `provideConvexAuth`, `useBetterAuth`, `<ConvexImage>`, and `<ConvexProviderWithClerk>` or `<ConvexProviderWithAuth0>` when those integrations are on), its `<CheckoutLink>` and `<CustomerPortalLink>` components, the `convex-auth` middleware and the `convexAuth` and `convexBetterAuthNuxt` Nitro imports. Most have a neutral name above, or under the base module's own neutral one (`useQuery`, `useMutation`, …). The rest — `provideConvexAuth`, the Clerk and Auth0 providers and `convexBetterAuthNuxt` — have none, and need an explicit import from `nuxt-convex-module`, which still works for every hidden name; it is no longer an auto-import. In development, `<ConvexImage>`, `<CheckoutLink>` and `<CustomerPortalLink>` still render their replacement and warn once, naming it.

### 4. The scaffold export contract

The composables bind to deployment functions by name, so the scaffolded `backend/` files must keep exporting them. `src/contract.ts` is that contract — `nuxt-backend doctor` verifies it against the deployment, and the tests pin it to the scaffold templates:

- `auth.ts`:
  - `authConfig`
  - `getAuthUser`
  - `listSessions`
  - `listSignInAlerts`
  - `listWorkspaceMembers`
  - `listWorkspaces`
  - `revokeSession`
  - `updateProfile`
- `billing.ts`:
  - `acceptSaveOffer`
  - `cancelGift`
  - `cancelPendingChange`
  - `cancelSubscription`
  - `changeGiftRecipient`
  - `claimGift`
  - `generateCheckoutLink`
  - `generateCustomerPortalUrl`
  - `getBillingAccess`
  - `getConfiguredProducts`
  - `getCredits`
  - `getCurrentSubscription`
  - `getFeatures`
  - `getInvoiceUrl`
  - `getOrders`
  - `getPricing`
  - `getReceivedGifts`
  - `getSentGifts`
  - `getUsageHistory`
  - `getWithdrawal`
  - `giftCheckout`
  - `listAllSubscriptions`
  - `pauseSubscription`
  - `refundOrder`
  - `rescheduleGift`
  - `resendGift`
  - `resumeSubscription`
  - `runGiftSweep` (internal: woken by the component's cron, and scheduled for a gift dated for later)
  - `startFreePlan` (internal: run by the free plan's queue, and its backfill)
  - `syncEntitlements`
  - `syncProducts` (internal: for operations)
  - `uncancelSubscription`
  - `updateSubscription`
  - `withdraw`
- `email.ts`:
  - `cancelAnnouncement`
  - `confirmEmailTopic`
  - `dismissAnnouncement`
  - `endAnnouncement`
  - `getAnnouncements`
  - `getAnnouncementsConsole`
  - `getEmailLink`
  - `getEmailPreferences`
  - `getEmailStatus`
  - `getSuppressions`
  - `liftSuppression`
  - `previewAnnouncement`
  - `previewEmails`
  - `publishAnnouncement`
  - `recordTimeZone`
  - `sendAnnouncement`
  - `sendEmailPreview`
  - `setEmailTopic`
  - `syncEmail`
  - `unsubscribeAllTopics`
  - `unsubscribeByLink`
- `audit.ts`:
  - `dismissActivation` (the activation checklist, dismissed for good; refused to an administrator's visit)
  - `getActivation` (the checklist `setupAudit({ checklist })` serves: each task with whether its event landed, the progress, whether it was dismissed, and `readOnly` during a visit; no tasks without a checklist)
  - `listActivity`
  - `listAllActivity`
  - `listWorkspaceActivity`
- `notifications.ts`:
  - `deliverNotification` (internal: words and sends one notification's email or push, which the backend schedules by this name)
  - `getNotificationChannels`
  - `getPushConfig`
  - `getUnreadCount`
  - `listNotifications`
  - `markNotificationsRead`
  - `setNotificationChannel`
  - `subscribePush`
  - `unsubscribePush`
- `account.ts`:
  - `cancelAccountDeletion` (without `token`, the signed-in account keeps itself; with the `token` of the "keep my account" link, no sign-in)
  - `chooseStorage`
  - `completeOnboarding` (stamps `onboardedAt` once; refused to an administrator's visit)
  - `eraseAccountData` (internal: the providers' and the app's own part of an erasure, which an erasure runs by this name)
  - `exportAccountData`
  - `getAccountDeletion`
  - `getAccountExport`
  - `getConsentTerms`
  - `getConsents`
  - `getOnboarding` (`{ onboardedAt }`, epoch ms or `null`)
  - `grantConsent`
  - `withdrawConsent`
- `admin.ts`:
  - `getUser`
  - `getWorkspace`
  - `listUsers`
  - `listWorkspaces`
- `webhooks.ts`:
  - `getWebhookDeliveries`
  - `replayWebhookDelivery`

A name is only ever added to this contract in a minor release, and the scaffold ships it in the same release, so `doctor` never fails a project that keeps its scaffolded files current.

The components the scaffolded `convex.config.ts` mounts and the route groups its `http.ts` passes to `registerBackendRoutes` follow the same rule: one is added in a minor release, with the scaffold, and `doctor` reports what an older project lacks (`convex-config`) while `doctor --fix` adds it. A scaffold component an app leaves out on purpose is named in a `// nuxt-backend-unmounted: <name>` comment in `convex.config.ts`, and that marker is part of this contract. An optional component (`@convex-dev/crons`, an optional peer dependency that `setupCrons` needs) is never mounted by the scaffold; `doctor` expects it only once a backend file calls for it. An upgrade fixture (`test/unit/upgrade-fixture.test.ts`, over a snapshot of the last published starter) runs that repair on the starter as an earlier release shipped it.

The backend component's maintenance is part of this surface by its windows: what it deletes and after how long, as [Limits and retention](https://nuxt-backend.dev/docs/reference/backend/limits) lists them. A minor release may shorten or lengthen a window and says so in the changelog; a patch release never does. The email record windows are the app's to set (`setupEmail({ retention })`), and a release never overrides a window an app set. A secret email (a sign-in code) leaving no record is part of the promise too: no release starts keeping one.

### 5. Diagnostics and environment variables

`nuxt-backend doctor --json` is a contract for scripts and coding agents, described by [its JSON Schema](https://nuxt-backend.dev/schemas/doctor.json). Each finding's `id` and the `capability` it belongs to (the name `--only` selects) are frozen; its title, message and fix hint are wording (see below). The capabilities are `auth`, `data`, `jobs`, `billing`, `email`, `notifications`, `ai`, `protection`, `monitoring`, `flags`, `analytics`, `hosting` ([Capabilities](https://nuxt-backend.dev/docs/reference/capabilities)): a capability is only ever added in a minor release, and a finding never moves to another one. The ids, by capability:

- `ai`:
  - `ai-components`
  - `ai-spend-limit`
  - `ai-stream-route`
  - `deployment-ai-gateway-api-key`
  - `deployment-provenance-certificate`
  - `deployment-provenance-private-key`
- `auth`:
  - `admin-bootstrap`
  - `auth-secret`
  - `consent-urls`
  - `deployment-auth-secret`
  - `deployment-site-url`
  - `page-paths`
  - `site-auth-proxy`
  - `site-gated-page`
  - `site-url`
  - `site-url-origin`
- `billing`:
  - `billing-access`
  - `billing-benefit-grace`
  - `billing-catalog-production`
  - `billing-customer-emails`
  - `billing-feature-benefits`
  - `billing-gift-twins`
  - `billing-meter-usage`
  - `billing-multiple-subscriptions`
  - `billing-organization`
  - `billing-pass-products`
  - `billing-portal`
  - `billing-promotion-limits`
  - `billing-promotion-portal`
  - `billing-proration`
  - `billing-provider-sdk`
  - `billing-team-customers`
  - `billing-trial-abuse`
  - `billing-webhook-enabled`
  - `billing-webhook-events`
  - `billing-webhook-route`
  - `billing-webhook-secret`
  - `deployment-billing-access-token`
  - `deployment-billing-webhook-secret`
- `data`:
  - `agent-files`
  - `backend-site-url`
  - `brand-file`
  - `bundle-duplicates`
  - `convex-codegen`
  - `convex-config`
  - `deployment-backend-environment`
  - `deployment-env`
  - `deployment-removed-env`
  - `dev-script`
  - `env-defaults`
  - `function-contract`
  - `name-collisions`
  - `paths-file`
- `email`:
  - `deployment-email-api-key`
  - `deployment-email-dev-inbox`
  - `deployment-email-from`
  - `deployment-email-webhook-secret`
  - `email-flows`
  - `email-key-permission`
  - `email-marketing-from`
  - `email-postal-address`
  - `email-quota`
  - `email-region`
  - `email-reputation`
  - `email-sender-domain`
  - `email-topics`
  - `email-transport`
  - `email-webhook-enabled`
  - `email-webhook-events`
  - `email-webhook-route`
  - `email-webhook-secret`
- `notifications`:
  - `deployment-push-private-key`
  - `deployment-push-public-key`
  - `installable`
- `protection`:
  - `bot-protection`
  - `contact-bot-check`
  - `deployment-protection-challenge-secret-key`
  - `deployment-protection-proof-secret`
  - `protection-challenge-keys`
  - `protection-guest-jobs`
  - `protection-proof`
  - `waitlist-bot-check`
- `monitoring`:
  - `deployment-monitoring-dsn`
  - `monitoring-app`
  - `monitoring-backend-exceptions`
  - `monitoring-health`
  - `monitoring-source-maps`
  - `monitoring-usage-alerts`
- `analytics`:
  - `analytics-activation`
  - `analytics-metrics`
- `hosting`:
  - `agent-docs`
  - `site-backend-url`
  - `site-csp`
  - `site-https`

`nuxt-backend status --json` names the same layers, each in one of four states: `live`, `test`, `missing` or `failing`. The states and the report's shape are part of this contract; the reason given for a state is wording.

The environment variables the package reads, by name: the keys of `backendEnv` (`nuxt-backend/app`) and the Nuxt app's `NUXT_PUBLIC_BACKEND_*`. `BACKEND_ENVIRONMENT` takes `development`, `preview`, `sandbox` or `production`, and decides every provider's mode, so those four values and what each decides are part of this contract. Beside them it reads platform names as they are, never renamed and not covered here: `CONVEX_*`, `NUXT_PUBLIC_CONVEX_*` (the base module's own, such as `NUXT_PUBLIC_CONVEX_SITE_URL` for a custom domain), `VERCEL_*`, and the `SENTRY_*` names (`NEXT_PUBLIC_SENTRY_DSN`, which Sentry's Vercel integration sets and the app reports to without a `MONITORING_DSN`, and the source-map upload's `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT`):

- `AI_GATEWAY_API_KEY`
- `AUTH_SECRET`
- `BACKEND_ENVIRONMENT`
- `BILLING_ACCESS_TOKEN`
- `BILLING_WEBHOOK_SECRET`
- `EMAIL_API_KEY`
- `EMAIL_DEV_INBOX`
- `EMAIL_FROM`
- `EMAIL_MARKETING_FROM`
- `EMAIL_REGION`
- `EMAIL_WEBHOOK_SECRET`
- `MONITORING_DSN`
- `NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY`
- `NUXT_PUBLIC_BACKEND_URL`
- `PROTECTION_CHALLENGE_SECRET_KEY`
- `PROTECTION_PROOF_SECRET`
- `PROVENANCE_CERTIFICATE`
- `PROVENANCE_PRIVATE_KEY`
- `PUSH_PRIVATE_KEY`
- `PUSH_PUBLIC_KEY`
- `SITE_URL`

The CLI's command contracts are a surface too: each command's flags, the shape of its `--json` output, its exit codes, and the side effects it declares (`--help` ends with them; the [CLI page](https://nuxt-backend.dev/docs/reference/cli) lists them). A command never gains a side effect in a patch release. `nuxt-backend upgrade --json` is one of them: its shape and the values of `data.state` are kept, and it rewrites none of the app's code. The package's data migrations it runs are named in its report, and their names and descriptions are wording.

The package ships its agent guidance under `skills/`: the core skill, `skills/nuxt-backend/`, and a task skill per feature beside it. Two files in the core are data generated from the surfaces above, and their shape is a surface too: `references/surface.json`, every public name by kind (import paths and their exports, auto-imports, pages, CLI flags, error codes, finding ids, env names, the scaffold contract), and `references/renames.json`, the names a release renamed, reshaped or removed (every API name the Upgrade page lists as gone), each with its Upgrade page section. The docs site serves both with the core skill, for the release line it documents, at `/.well-known/skills/nuxt-backend/references/surface.json` and `/.well-known/skills/nuxt-backend/references/renames.json`. A release that breaks a surface adds its entries to the rename map. The skills' names are a surface too, since `init` copies them into an app and agents load them by name: a release that renames or drops one says so. The prose of each `SKILL.md` and the other references is wording. The docs site also answers as a read-only MCP server, at `https://mcp.nuxt-backend.dev/mcp`, for the release line it documents: its URL and its tool names are kept as the twins' URLs are, and what a tool returns is the docs, which change with every release.

## The experimental tier

Tagged `@experimental` in the source and in the API reference. These may change shape in a minor release of the 0.x line without the deprecation cycle; from `1.0` they either graduate into the promise or keep the tag:

- `nuxt-backend/monitoring` — `reportError`, `reportingErrors`, `checkIn` and `checkingIn`: error reports and cron check-ins from an app's own actions. Their options follow the monitoring service's cron monitors, which may still move. The tags a report carries and the health routes are stable (above).
- `nuxt-backend/ai` — `setupAi`: the reserve → run → settle metering model over provider meter events, and the models it calls: `provider/model` ids through the AI Gateway, the cost each call reports (`ReportedCost`), `ctx.model()` and `modelStatus`, and `getCosts` from `ai.api`, what each person's AI calls cost. A model call is refused, saying why, where no route answers it. `defineJobQueue`: the generation queue, its tiers, model limits and credit hold, and the functions `jobs.api` exports. `ai.chat` and `ai.knowledge`: chat threads and knowledge search on the Agent and RAG components (both pre-1.0), the functions each exports, and the EU inference pin (`inferenceRegion`).
- `useAiStream` — paired with `nuxt-backend/ai`.
- `useJob` — paired with `defineJobQueue`.
- `useInboxAdmin` — paired with the support inbox (`setupEmail({ inbound: { support } })`), which follows the email provider's Inboxes, new in October 2026; with `getInboxConsole`, `replyToInbox` and `syncInbound` of `setupEmail(…).api`, and the admin console's Inbox tab.
- `useChat` — paired with `ai.chat`, which follows the Agent component's pre-1.0 shapes.
- `useWorkflowStatus` — tracks the upstream workflow component's pre-1.0 status shape.
- `defineBackendTestApp`, `asUser` and `seedWorkspace` from `nuxt-backend/test` — the test app and its signed-in callers (`asUser`'s `signedInAt` sets when a caller's session signed in); the claims they carry follow the auth flows, which may still move.
- `nuxt-backend/test-utils` — `createBackendMock`, `resetBackendMock`, `backendMockProvides`, `backendTestAliases` and `renderEmail` (which renders an email as `setupEmail` with the same options would): the mock answers the way the auth and billing flows (and Better Auth) answer today, and its built-in answers, its state and the modules it aliases follow them as they move. It reaches two internals of `nuxt-convex-module` (`#convex/auth-client` and its session-token reset), held by a test until a supported seam lands.
- `setupEmail(…).devtools` — `previewEmails` and `sendEmailPreview`, the internal functions the DevTools Email tab runs with the Convex CLI on a dev deployment; `previews`, the sample set they render, and its entries (`EmailPreview`); and `forceColorScheme` from `nuxt-backend/email`, which shows a preview light or dark by rewriting the layout's media query, so it follows the layout's markup: the samples, the entries and what a preview carries may still change.
- `useSandboxInbox` — the dev inbox for demos, previews and e2e runs, which reads the mail a test address received back from the email provider's own log of sent email, together with the `setupEmail(…).api.getSandboxInbox` action behind it and the `nuxt-backend inbox` command that reads it on dev deployments; how far back it reads, how many bodies it fetches and the code it extracts may still change.
- `CatalogPlan.gift` — a plan offered as a gift pass: the lengths it is sold for, the private purchase and pass products `billing sync` makes, the claim that switches a free workspace to the pass, and the end date the sweep keeps. Whether a pass can start from a workspace with a trial, and how its end reads beside a paid plan, may still change.
- `CatalogQuota`, `BillingCatalog.quotas`, `CatalogPlan.quotas`, `BillingCatalogIds.quotas`, `BillingComponents.shardedCounter`, `billing.getQuota`, `billing.requireQuota`, `billing.releaseQuota`, `QuotaUsage`, `useFeatures().quotas`, `useFeatures().quota()`, `useFeatures().remaining()`, `PricedPlan.quotas`, `<Gate quota>` and `quota_exceeded` — plan quotas: the catalog's quotas and the `<plan>-quotas` benefit `billing sync` writes them to, the counts and the refusal, `getFeatures`' `quotas`, and `<Gate quota>` with its `quota` labels. Whether a quota counts claims or rows, and how a downgrade below what is held reads, may still change.

## Deprecation

A public name is never removed in the release that replaces it. It is marked `@deprecated` naming the replacement, the old and new names both work for **at least one minor release**, and the removal lands in the following breaking release with a changelog entry. Renames of configuration keys, aliases, or registry names follow the same cycle.

## Upstream versions

`nuxt-backend` composes `nuxt-convex-module`, Better Auth, and the `@convex-dev/*` components over the `convex` peer range in `package.json`. Those packages are mostly pre-1.0 and ship breaking changes in minor releases, so their versions map to ours like this:

- A **breaking change in a `better-auth` or `@convex-dev/*` minor** — an API that consumers of this package touch (auth plugin options, component function signatures, schema shape) — is a **major here** (a minor on the 0.x line, announced as breaking). The dependency ranges stay pinned to the last compatible line until then.
- A non-breaking upstream update is a patch here.
- `convex` follows its peer range (`>=1.46.0 <2` — the floor is what `nuxt-convex-module` 0.11 needs for `FunctionReference_future`, above the lowest version every bundled `@convex-dev/*` component and `convex-helpers` accept; `check:manifest` verifies it against the installed tree); a Convex major is a major here. `vue` is a peer too (`^3.5.41`, the floor the bundled MCP toolkit needs), satisfied by any Nuxt 4.6+ app. `@convex-dev/eslint-plugin` (`^5.0.0`) and `eslint` (`^9.0.0 || ^10.0.0`) are optional peers, needed only by `nuxt-backend/eslint`; a major of either is a minor here. So is `@sentry/nuxt` (`^11.0.0`), the error-reporting SDK the module wires once it is installed and a DSN is set.
- Nuxt majors are majors here. `nuxt-convex-module` is a true dependency, installed and configured for you; its own stability policy applies to the core composables it registers.

`test/unit/peer-ranges.test.ts` keeps the declared ranges honest against the installed versions and against what the upstreams declare for each other. [Ecosystem](https://nuxt-backend.dev/docs/reference/ecosystem) lists every upstream package this one ships, bundles, supports or plans, and the docs contract keeps that page in step with `package.json`.

## Supported versions

Nuxt `^4.6.2` (Nuxt 4 from 4.6.2, where the `nuxt/server` API the server code is written against arrived; not yet Nuxt 5, whose Nitro 3 the package's server code and nuxt-security do not run on yet) and Node `>=24.11.0`, plus these `peerDependencies` ranges — `vue` and `convex` are required, the rest optional, needed only by the subpath that uses them:

| Package | Range | Needed by |
|---|---|---|
| `vue` | `^3.5.41` | every app |
| `convex` | `>=1.46.0 <2` | every app (the Convex CLI and client) |
| `convex-test` | `>=0.0.54` | `nuxt-backend/test` |
| `eslint` | `^9.0.0 \|\| ^10.0.0` | `nuxt-backend/eslint` |
| `@convex-dev/eslint-plugin` | `^5.0.0` | `nuxt-backend/eslint` |
| `@convex-dev/crons` | `^0.2.3` | jobs an app schedules at runtime, imported directly (installed and mounted by the app) |
| `botid` | `^1.5.11` | the bot check on the app's server and in the browser on Vercel (Vercel BotID): wired on a Vercel build once it is installed; without it the module imports nothing of it |
| `@sentry/nuxt` | `^11.0.0` | error reports and traces from the browser and the Nuxt server (the monitoring layer): wired once it is installed and a DSN is set (`MONITORING_DSN`, or `NEXT_PUBLIC_SENTRY_DSN`); without it the module imports nothing of it |
| `ai` | `^7.0.129` | a model named in `nuxt-backend/ai` (`setupAi`'s `model`, `ctx.model()`): the AI SDK, with the Vercel AI Gateway provider it ships. The model types of `nuxt-backend/ai` (`AiModel`, `MeteredModel`) are the SDK's own: without `ai` installed they read as `any` under `skipLibCheck` (the Nuxt and Convex default), and a type check without it reports the missing module |
| `@convex-dev/ai-sdk-provider` | `^0.3.0` | a model id through the Convex AI Gateway (`nuxt-backend/ai`), tried first on Convex Cloud: Convex's own provider for it. Without it, ids go to the Vercel AI Gateway |
| `@modelcontextprotocol/sdk` | `^1.32.1` | `npx nuxt-backend mcp`, the developer MCP server: `init` adds it to the app's `devDependencies` beside the server it writes into `.mcp.json`; without it the command names the install |
| `@convex-dev/bundle-analyzer` | `0.1.0` | the Convex half of `npx nuxt-backend analyze`, pinned because it is in alpha; without it `analyze` names the install and still measures the Nuxt half |
| `@convex-dev/agent` | `^0.7.8` | chat threads (`ai.chat` in `nuxt-backend/ai`): Convex's Agent component, installed and mounted by the app (`app.use(agent)`). Loaded only when a chat runs |
| `@convex-dev/rag` | `^0.7.8` | knowledge search (`ai.knowledge` in `nuxt-backend/ai`): Convex's RAG component, installed and mounted by the app (`app.use(rag)`). Loaded only when a store runs |

The Backend tab works with the Nuxt DevTools that Nuxt 4 installs (3.x). CI installs the packed package into the starter and both examples with the newest Nuxt and Convex every week, builds them and serves a page from each, so the newest release in every range above is one this package has run on.

## Not covered

- The wording of the module's warnings, errors and preflight findings, of the deployment's log lines, and of the CLI's output may change in any release. [Troubleshooting](https://nuxt-backend.dev/docs/ship/operate/troubleshooting) documents them, with the code each log line starts with.
- The DevTools panel: its UI, its RPC and the in-page bridge it reads are internal to the panel.
- The layout of `dist/` beyond the files the `exports` map names.
- Generated template filenames and Nuxt payload keys.
- The docs site and the generated API reference's formatting.
