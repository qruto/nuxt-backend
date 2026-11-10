# Changelog

## v0.4.0

[compare changes](https://github.com/qruto/nuxt-backend/compare/v0.3.0...v0.4.0)

What moving comics.my to 0.3 turned up. A job charged by what it made keeps its result when billing refuses the charge, and settles it later. Gifts sell from a form, and plan changes say what they do first. Photos are made ready in the browser, and a checked upload is accepted in one call. Member tickets credit their member as a referral. An install prompt and new UI tokens arrive. Fixes land in the CLI's `upgrade`, `doctor` and `deploy`, and in how an app page replaces a packaged one.

### Upgrading from 0.3

Each change, with the edit to make, is on the [Upgrade page](https://nuxt-backend.dev/docs/ship/releases/upgrade). In short:

- **`doctor --fix` asks before it syncs email.** At a terminal it asks; in CI it syncs only with `--yes`.
- **A deploy runs the package's migrations.** `npx nuxt-backend deploy` and `deploy --build` run the data migrations and the workpool's backfill after a production push. A migration that fails fails the deploy.
- **Dev modules come from `/_dev/`** on `nuxt dev`, unless the app sets `app.buildAssetsDir`. Match `/_dev/` in a dev proxy rule or test matcher that matched `/_nuxt/`.
- **A replaced page follows its shape.** A page of the packaged page's shape replaces it, `app/pages/r/[code].vue` included, where 0.3 registered both. A catch-all or optional one still doesn't, and the packaged page stays beside it.
- **Prices keep their currency's own digits.** JPY, KRW and the other zero-decimal currencies are whole units, where 0.3 divided them by 100. A whole USD price reads $99 in the renewal email. Without @nuxtjs/i18n, money and dates render in English for every visitor, where 0.3 used the visitor's own locale.
- **Plan switches ask first**, and bill the difference at once (`proration: 'invoice'`).
- **A job waits for billing to catch up.** A job whose first step finds billing not synced yet waits about five minutes and runs once billing syncs; only if it never does does it fail `not_ready`, where 0.3 failed `insufficient_credits` at once. A charge by output the provider refuses leaves the job `done`, retried in the background when the refusal may pass, given up at once when it won't.
- **Member tickets and referrals.** Pass `access.memberTickets({ referrals })` for each friend a ticket admits to count as its member's referral.

### New

- **AI jobs.**
  - A charge by output the provider refuses no longer fails the job, which ends `done`: a refusal that may pass leaves it owed and retried in the background under the hold's id, one that won't gives it up at once. `defineJobQueue({ onOwedCharge })` hears how it ends; the admin Queue tab offers "Retry the charge".
  - `job.charge(n, { metadata })` is checked against the provider's limits up front.
  - A step knows its job's owner (`ctx.job.owner`, `ctx.job.userId`).
  - Image refusals read as blocked, and an image call that drew nothing is tried once more.
  - The test kit adds `stubBillingProvider()`, `TEST_UNSAFE_CODE(codes)` and `fileExists`, and `drain` takes `{ until }`.
- **Billing.**
  - `useGiftForm()` and `<GiftForm>` sell gifts from the packaged `/gifts` page. They are experimental, like the gift lengths they sell. `useGiftList()` and `<GiftList>` are public.
  - `useBilling().changeOf(productId)` previews a plan change, trials included. The settings' plan section can change or pause a plan for 1 to 3 months.
  - `useWithdrawal()` reads the withdrawal window.
  - Pricing reads `?plan=` and `?interval=` from the address, takes a return URL per action (`successUrl`), and keeps the offer window on the page's clock.
- **Uploads.**
  - `storage.acceptUpload(ctx, storageId, { check, safety, about, keep })` runs the check, the content check and the keep in one call.
  - `preparePhoto(file, options)`, with `isPhotoFile` and `PhotoPrepError`, makes a photo ready in the browser: HEIC decoded (`heic-to`, an optional peer), turned upright, scaled, re-encoded, its metadata dropped.
- **Growth.**
  - Member tickets credit their member as a referral (`access.memberTickets({ referrals })`, `referrals.claimFor`).
  - `/invite` takes a typed code. `/waitlist` joins without a token and follows the launch phase.
  - `useReferralInvite().closed` and `useWaitlist().shareLink`.
- **UI.**
  - Tokens for tracking (`--bk-tracking-heading`, `--bk-tracking-control`, `--bk-tracking-label`), for outline widths (`--bk-border-width-surface`, `--bk-border-width-control`) and for a press (`--bk-shadow-control-hover`, `--bk-shadow-control-active`, `--bk-offset-control-hover`, `--bk-offset-control-active`, `--bk-transition-control`). Left unset, nothing looks different.
  - `useInstallPrompt()` for an app's own install button, and `backend.installable` takes `id`, `lang`, `orientation` and `browserBanner`.
  - `useReportAppeal()` is public, for an app's own report page.
  - A refusal from a service that is down reads its service's sentence (`errors.unavailable_<service>`).
- **CLI.**
  - `doctor` reports `.env.example` drift (`env-example`) for the capabilities the app uses, and warns when it cannot read the file.
  - On Vercel, an app with nuxt-site-config gets a preview's branch URL as its site and `indexable: false`, below its own `site` options.
- **Nuxt module.** A production build reloads a page once when its code fails to load before the app has started (`chunkRecovery`). `useLoginFlow()` adds `webAuthnSupported`.

### Fixed

- **CLI.**
  - `upgrade --dry-run` reads the app's own `nuxt.config` and `app.config`, where it showed `brand.generated.ts`, `labels.generated.ts` and moved page paths being emptied.
  - `backendEslint()` ignores the module's `*.generated.ts`.
- **Pages.**
  - The packaged sign-in replaces its history entry and never returns to `/login`.
  - With `pages.login: false`, the page guard and the session-ended watch send a visitor to `/login`.
  - The development defaults (no rate limiter, HSTS or `upgrade-insecure-requests`) survive the app's own `security` options.
- **Email.** On a `development` deployment, the contact form's copy for the team goes to the sandbox inbox. Elsewhere outside production, test mode holds it back, and the message waits in the admin console.
- **Billing.** Money is formatted by the currency's smallest unit, and money and dates in the app's locale, so a server render and its hydration agree.
- **Access.** The links the pages and composables build (share, ticket, referral, access, checkout) read the request's own `Host` on the server, never `X-Forwarded-Host`.

### 🚀 Enhancements

#### AI

- Jobs that bill like a print shop ([#234](https://github.com/qruto/nuxt-backend/pull/234))

#### Billing

- Buy gifts from a form, confirm plan changes, and read pricing from the address ([#236](https://github.com/qruto/nuxt-backend/pull/236))

#### UI

- Tracking, press and border tokens, an install prompt, and refusals worded by service ([#237](https://github.com/qruto/nuxt-backend/pull/237))

#### Uploads

- Accept a checked upload in one call, and prepare photos in the browser ([#235](https://github.com/qruto/nuxt-backend/pull/235))

#### Access

- Tickets carry the referral, and the growth pages follow the launch phase ([#238](https://github.com/qruto/nuxt-backend/pull/238))

### 🩹 Fixes

#### CLI

- Read the real config in upgrade --dry-run, confirm email sync, migrate on deploy ([#232](https://github.com/qruto/nuxt-backend/pull/232))

#### Nuxt module

- App pages decide what a replaced page keeps, and safe defaults for dev and a failed chunk ([#233](https://github.com/qruto/nuxt-backend/pull/233))

### 🏡 Chore

- Take nuxt-convex-module 0.14.1 and explain the glob alert after 0.3.0 ([#229](https://github.com/qruto/nuxt-backend/pull/229))

### ✅ Tests

#### Upgrade

- Upgrade from the 0.3.0 starter, and drift the repair tests' own copy ([#231](https://github.com/qruto/nuxt-backend/pull/231))

### 🤖 CI

- Run e2e in its own job, retry registry lag, give lychee more time ([#230](https://github.com/qruto/nuxt-backend/pull/230))

### ❤️ Contributors

- Slava Razum ([@slavarazum](https://github.com/slavarazum))

## v0.3.0

[compare changes](https://github.com/qruto/nuxt-backend/compare/v0.2.1...v0.3.0)

The work comics.my, the first app built on 0.2, had to do itself moves into the package: hearing when a job ends and charging for what it made, image models and pluggable moderation, welcome credits and a billing that waits to launch, member tickets, labels in emails, the report form and the legal pages, and test helpers. Under it: Better Auth 1.7 on nuxt-convex-module 0.14, which closes the Better Auth security advisories.

### Upgrading from 0.2

Each change, with the edit to make, is on the [Upgrade page](https://nuxt-backend.dev/docs/ship/releases/upgrade). In short:

- **Better Auth 1.7.** The package runs `better-auth` 1.7 (`>=1.7.16`), `@convex-dev/better-auth` 0.13 and `nuxt-convex-module` 0.14. A Better Auth plugin you add through `authOptions` must support 1.7, and `getIp` from `better-auth/api` is now `getIP`.
- **Deploy the backend, then upgrade.** The `backend` component gains tables and fields. Start `npx nuxt-backend dev` once, then run `npx nuxt-backend upgrade`; in production, run `npx nuxt-backend upgrade --prod --yes` after the deploy. It also runs the workpool's backfill in every pool.
- **Passkeys check the person.** Every passkey ceremony requires a fingerprint, face or PIN, so a passkey a security key with no PIN saved under 0.2 is refused. `resolveSignInMethod` is deprecated.
- **Labels reach the backend.** `upgrade` writes `backend/labels.generated.ts`. Pass its `labels` to `setupEmail` and drop the copy your `messages` repeated from app config.
- **Billing waits to launch.** A production deployment with no billing token or no production catalog reads "Plans open soon" and refuses a sale as `unavailable` (reason `not_launched`). Drop a sales switch of your own for `usePricing().launched`. `billing sync` wants a price in the organization's default currency.
- **Moderation verdicts** name shared categories. The classifier's own codes move to `codes`.
- **A job step** stops its model calls at its `timeout`, 3 minutes by default.
- **`@sentry/nuxt` `^11.10.0`**, for the browser's reports through the tunnel on the app's own origin.
- **`@polar-sh/checkout` 0.6** comes with the package. Pin it yourself only if you import it too, and then at `^0.6.0`.
- **`nuxt dev`** turns off `nuxt-security`'s rate limiter, `upgrade-insecure-requests` and HSTS. A `$development.security` block that did the same can go.

### New

- **AI jobs.**
  - `onJobEnd` runs once for every job that ends, however it ends, and app code can read and cancel jobs with `jobs.get` and `jobs.cancel`.
  - `job.charge(n)` bills what a job made, capped at the hold taken at enqueue, and refunds the rest. A job can run free.
  - `ctx.image()` draws with image models inside a step.
  - `setupAi({ gateway })` chooses the AI gateway, and `setupAi({ routes })` gives some models a gateway order of their own.
  - `retryable()` marks a failure worth another try.
- **Moderation.**
  - `setupAi({ moderation })` sets a policy: `block`, `escalate`, and how long flags are kept. The admin console lists the flags.
  - Providers plug in over the default classifier, Llama Guard 4 (text and images): Azure Content Safety, OpenAI moderation, and Arachnid Shield for known abuse imagery. Each decision is recorded as the statement of reasons.
- **Billing.** Welcome credits on the free plan (`credits: { meter, units, once: true }`). `usePricing().launched`. `PricedPlan.gift` lists a plan's gift lengths at live prices. `npx nuxt-backend billing resync` refreshes every entity's entitlements, paced under the provider's rate limit.
- **Growth.** `access.memberTickets` with `useMemberTicket()`, so members bring friends. The waitlist records the campaign source. `npx nuxt-backend access admit <email>`.
- **Email.** A `notification` template that an app can switch by kind.
- **UI.**
  - Font, border and shadow tokens, and one `[data-backend]` root attribute.
  - `useReportForm`, which sends a DSA notice, and `useSignInAlerts`.
  - `LegalProcessors`, `LegalStorage` and the other legal components, for Content pages.
  - PWA manifest colours and icons.
  - `useReferralInvite` and `useEmailLink` are auto-imported.
- **Data and tests.**
  - `nuxt-backend/test` adds `upload`, `seedCredits`, `seedBilling`, `drain` and `stubStorageFetch`.
  - `storage.expire`, `shareable({ onEnable })`, and `defineRetention({ schedule })`.
- **CLI.**
  - `doctor --prod` reads billing's launch state, checks for a `spendLimit`, and says where to set up an uptime monitor and each AI gateway's own cap.
  - `deploy --build` uses the project's package manager.
  - `upgrade` runs the workpool backfill.
- **Security.**
  - Other sites can load the og images and the logo.
  - `@nuxt/content`'s WASM is allowed.
  - Browser error reports go through Sentry's managed tunnel.

### From nuxt-convex-module 0.13 and 0.14

- The Better Auth client loads on first use: a page a signed-out visitor only reads downloads none of it, which makes the starter's entry about 11 kB (gzip) smaller.
- A failed server `fetchQuery`, `fetchMutation` or `fetchAction` names its function.
- The upload field runs on `useUploadQueue`. It tells a refusal from a failure, retries a failure from where it stopped, and takes a `prepare` step.
- A live connection stays signed in across auth changes, and a failed token refresh keeps the session's token.
- `useAsyncQuery` stops reporting a failed server read once the live query has a value.

### 🚀 Enhancements

#### AI

- Choose the AI gateway with setupAi({ gateway }) ([#193](https://github.com/qruto/nuxt-backend/pull/193))
- Hear of every job's end with onJobEnd, and read and cancel jobs from app code ([#206](https://github.com/qruto/nuxt-backend/pull/206))
- Charge a queued job for what it made, run one free, and read a cold balance at start ([#209](https://github.com/qruto/nuxt-backend/pull/209))
- Draw with image models in job steps, route some models per gateway, and bound each step ([#210](https://github.com/qruto/nuxt-backend/pull/210))
- Set a moderation policy, keep its flags, and list them in the admin console ([#211](https://github.com/qruto/nuxt-backend/pull/211))
- Moderate with pluggable providers over shared categories, and record each decision ([#218](https://github.com/qruto/nuxt-backend/pull/218))

#### Billing

- Welcome credits, a not-launched state for production, and gift lengths on plans ([#203](https://github.com/qruto/nuxt-backend/pull/203))

#### CLI

- Billing resync, access admit, deploy --build package manager, upgrade workpool backfill ([#202](https://github.com/qruto/nuxt-backend/pull/202))
- Doctor --prod reads billing's launch state, an uptime monitor and the AI gateway budget ([#214](https://github.com/qruto/nuxt-backend/pull/214))

#### Email

- Render notification emails through a notification template an app can switch by kind ([#215](https://github.com/qruto/nuxt-backend/pull/215))

#### UI

- Font, border and shadow tokens and one [data-backend] root ([#201](https://github.com/qruto/nuxt-backend/pull/201))
- UseReportForm, useSignInAlerts, legal and DSA components, PWA manifest options ([#205](https://github.com/qruto/nuxt-backend/pull/205))

#### Access

- Member tickets, and the waitlist records the campaign source ([#207](https://github.com/qruto/nuxt-backend/pull/207))

#### Base

- Adopt nuxt-convex-module 0.14, load the auth client on first use, retry a failed upload ([#217](https://github.com/qruto/nuxt-backend/pull/217))

#### Composables

- Register useReferralInvite and useEmailLink, and read the invite on the server ([#182](https://github.com/qruto/nuxt-backend/pull/182))

#### Data

- Test kit helpers, file expiry, share-link hooks and scheduled retention ([#197](https://github.com/qruto/nuxt-backend/pull/197))

#### Labels

- Carry app config labels to emails and notifications as labels.generated.ts ([#221](https://github.com/qruto/nuxt-backend/pull/221))

### 🩹 Fixes

- Address the CodeRabbit findings left on the 0.3.0 pull requests ([#216](https://github.com/qruto/nuxt-backend/pull/216))

#### AI

- Give a budget back what a run did not spend ([#184](https://github.com/qruto/nuxt-backend/pull/184))

#### Auth

- Take @convex-dev/better-auth 0.12.7 ([#185](https://github.com/qruto/nuxt-backend/pull/185))
- ⚠️  Move to Better Auth 1.7 and nuxt-convex-module 0.13 ([#188](https://github.com/qruto/nuxt-backend/pull/188))
- ⚠️  Require passkey user verification and name a ban's end ([#198](https://github.com/qruto/nuxt-backend/pull/198))

#### Billing

- Pace billing resync under the provider's rate limit, say what doctor skipped ([#222](https://github.com/qruto/nuxt-backend/pull/222))
- Attach missing plan benefits, require the org's currency, settle gifts on return ([#223](https://github.com/qruto/nuxt-backend/pull/223))

#### Playground

- Name the site's email languages, and document app config versus messages ([#224](https://github.com/qruto/nuxt-backend/pull/224))

#### Security

- Keep the limiter, the upgrade and HSTS off nuxt dev ([#180](https://github.com/qruto/nuxt-backend/pull/180))
- Let other sites load og images and the logo, allow Content's WASM ([#199](https://github.com/qruto/nuxt-backend/pull/199))

#### Labels

- Warn in development when titleYours shadows an override ([#183](https://github.com/qruto/nuxt-backend/pull/183))

#### Monitoring

- Let the browser's error reports through connect-src ([#181](https://github.com/qruto/nuxt-backend/pull/181))
- ⚠️  Send browser reports through Sentry's managed tunnel ([#200](https://github.com/qruto/nuxt-backend/pull/200))

#### Scripts

- Drop the reset steps that call functions 0.2.0 removed ([#220](https://github.com/qruto/nuxt-backend/pull/220))

### 📖 Documentation

- Describe built features as they are, drop the 0.2 preview upgrade notes ([#204](https://github.com/qruto/nuxt-backend/pull/204))

#### Docs

- Describe the code as it is, without 0.2.0 transition markers ([#192](https://github.com/qruto/nuxt-backend/pull/192))

#### Upgrade

- Add the passkey, ban and Better Auth 1.7 sections for 0.3 ([#226](https://github.com/qruto/nuxt-backend/pull/226))

### 🏡 Chore

#### Budgets

- Re-measure the tarball after the 0.3.0 lanes merged so far ([#212](https://github.com/qruto/nuxt-backend/pull/212))

#### Lint

- Run local lint on one worker with a cache, keep CI uncached ([#208](https://github.com/qruto/nuxt-backend/pull/208))

### 🤖 CI

- Cache the Convex local backend, fetched through the GitHub API ([#194](https://github.com/qruto/nuxt-backend/pull/194))
- Fall back to the CLI's download when the Convex backend archive is bad ([#196](https://github.com/qruto/nuxt-backend/pull/196))

#### Website

- Cut the Vercel build's billed minutes ([#219](https://github.com/qruto/nuxt-backend/pull/219))

#### Deps

- Bump the actions group across 1 directory with 2 updates ([#186](https://github.com/qruto/nuxt-backend/pull/186))
- Bump step-security/harden-runner from 2.22.3 to 2.22.4 ([#195](https://github.com/qruto/nuxt-backend/pull/195))

#### ⚠️ Breaking Changes

- **Auth:** ⚠️  Move to Better Auth 1.7 and nuxt-convex-module 0.13 ([#188](https://github.com/qruto/nuxt-backend/pull/188))
- **Auth:** ⚠️  Require passkey user verification and name a ban's end ([#198](https://github.com/qruto/nuxt-backend/pull/198))
- **monitoring:** ⚠️  Send browser reports through Sentry's managed tunnel ([#200](https://github.com/qruto/nuxt-backend/pull/200))

### ❤️ Contributors

- Slava Razum ([@slavarazum](https://github.com/slavarazum))

## v0.2.1

[compare changes](https://github.com/qruto/nuxt-backend/compare/v0.2.0...v0.2.1)

Fixes from the first apps built on 0.2.0, and the per-visitor sign-in limits behind an app's server.

### Upgrading from 0.2.0

- **Export `getCancelFlow` from `backend/billing.ts`** next to `cancelSubscription`. `<CancelFlow>`
  reads it to know ahead whether a save offer can stand; where none can, its button reads "Cancel my
  plan" and asks to confirm. Without the export the flow keeps "Continue" as before, and
  `nuxt-backend doctor` names it missing.
- **Set `PROTECTION_PROOF_SECRET` on both sides** (the app's server and the deployment, the same
  value) to limit sign-in by each visitor's address. Without it, every visitor behind the app's
  server shares one bucket, as before. Set it on the app first and deploy it, then on the
  deployment: a deployment that holds it refuses sign-in codes the app has not signed.
- **Overrides of the credit labels** (`credits`, `usage`, `settings`, `pricing`) now take `{unit}`
  in place of the word "credits". Old overrides still render; development warns that `{unit}` is
  missing.
- **Overrides of a notification's `title` or `body`, with `billTo: 'user'`.** A kind about the
  reader's own plan, credits or gift now reads `titleYours` and `bodyYours` first. Where the package
  words one, an override of the plain `title` or `body` stops showing, in the inbox and the email,
  and the packaged words read instead. Override `titleYours` or `bodyYours` as well. The release
  after 0.2.1 warns about it in development, when the inbox reads such a notification.

### New

- `meters: { <name>: { unit: { one, other } } }` in the billing catalog names what a meter counts,
  and the packaged labels say it ("50 pages left").
- `setupNotifications({ kinds })` lists only the notification kinds an app sends. Without it, the
  kinds of gifts, passes, reverse trials and referrals stay off the list until the deployment has
  used the feature.
- Notifications about the reader's own plan, credits or gift say "your" in apps that bill the
  person (`billTo: 'user'`), in all five languages.
- `useAuth().isReady`, and `nuxt-backend billing reset` for billing data of another provider
  organization.

### 🚀 Enhancements

#### Billing

- Detect billing data of another organization, reset it with billing reset ([#176](https://github.com/qruto/nuxt-backend/pull/176))

### 🔥 Performance

#### Auth

- Keep the admin and organization error tables out of every page ([#164](https://github.com/qruto/nuxt-backend/pull/164))

### 🩹 Fixes

#### AI

- Check images alone on the convex gateway, time the check out, refuse with a code ([#166](https://github.com/qruto/nuxt-backend/pull/166))

#### Auth

- Limit by each visitor's address behind the app's auth proxy ([#162](https://github.com/qruto/nuxt-backend/pull/162))
- Expose useAuth().isReady for signed-in reads ([#168](https://github.com/qruto/nuxt-backend/pull/168))

#### Billing

- Take the provider's customer session token off the checkout return ([#167](https://github.com/qruto/nuxt-backend/pull/167))
- Refuse a customer mapping of another provider organization with its own code ([#169](https://github.com/qruto/nuxt-backend/pull/169))
- Confirm a cancel no offer can follow, and name a meter's unit in the labels ([#178](https://github.com/qruto/nuxt-backend/pull/178))

#### Email

- Pace email sync to the provider's rate limit and retry a 429 ([#170](https://github.com/qruto/nuxt-backend/pull/170))

#### Notifications

- Send transactional kinds past the weekly cap and quiet hours ([#165](https://github.com/qruto/nuxt-backend/pull/165))
- Word a person's own plan as theirs, list only the kinds an app sends ([#177](https://github.com/qruto/nuxt-backend/pull/177))

#### UI

- Keep the token defaults in a layer below every other ([#174](https://github.com/qruto/nuxt-backend/pull/174))

#### Website

- Serve Markdown twins as Markdown without a trailing slash ([#175](https://github.com/qruto/nuxt-backend/pull/175))

### ❤️ Contributors

- Slava Razum ([@slavarazum](https://github.com/slavarazum))

## v0.2.0

[compare changes](https://github.com/qruto/nuxt-backend/compare/v0.1.0...v0.2.0)

The first real release. `0.1.0` was a throwaway test publish and is deprecated on npm.

One Nuxt module gives a client app its complete backend on Convex: sign-in, workspaces, plans and
credits, email, notifications, metered AI and the pages that use them. Development runs on the
providers' own test modes (Polar's sandbox, Resend's test addresses, sign-in codes in your
terminal), and nothing is simulated.

**Start:** `npm create nuxt@latest my-app -- -t gh:qruto/nuxt-backend/templates/starter`, or
`npx nuxt module add nuxt-backend` in an app you have. The
[Quickstart](https://nuxt-backend.dev/docs/start/quickstart) takes it from there, and the
[tutorial](https://nuxt-backend.dev/docs/start/tutorial) builds Panels, the comic-strip maker the
[public demo](https://nuxt-backend.dev/playground) runs.

### Highlights

- **Sign-in without passwords:** email codes bound to the browser that asked, passkeys, passkey-only
  accounts, a recent sign-in for sensitive actions, launch phases with invite codes and a waitlist.
- **Billing as code:** a catalog in `backend/billing.catalog.ts`, synced to Polar; monthly and yearly
  plans, a real free plan, prices in several currencies, server-rendered pricing, server-enforced
  feature gates and quotas, prepaid credits spent with reserve, run and settle; gifts, plan passes,
  referrals, promotions, a cancel flow with save offers, and the EU withdrawal button.
- **Email that respects people:** one template registry, themed, in each recipient's language, with
  delivery tracking, suppressions, preferences, one-click unsubscribe, lifecycle flows and inbound mail.
- **AI, metered:** model calls and generation jobs through the Convex AI Gateway that hold credits
  until they run, a daily spend limit that pauses AI, moderation, and AI-generated labels.
- **A UI you can own:** packaged pages and components with tokens in `@layer nuxt-backend`, labels in
  five languages, slots, part swapping, headless composables, `css: false` and `nuxt-backend eject`.
- **Operations:** an admin console (users, workspaces, billing, revenue, email suppressions, webhooks
  with replay, flags, reports, waitlist, queues), Sentry, rate limits, bot checks, `doctor --prod`
  and one-command deploys to Vercel.
- **For coding agents:** version-locked skills, a developer MCP server and a docs MCP.

### Coming from a preview of `main`

`npx nuxt-backend upgrade` repairs the scaffold and migrates data; it rewrites none of your code.
The [Upgrade page](https://nuxt-backend.dev/docs/ship/releases/upgrade) lists every rename between
the previews with the edit to make. Its preview sections leave the page with the next release.

### Behaviour changes in testing

- Over `createBackendMock()`, a one-shot query nothing has answered yet now stays loading, as it
  does against a real backend. It used to read as an `unavailable` error, so a page test that
  asserted that error for a missing answer now sees `isLoading` instead: give the query its
  answer in `state.queries` (or with `stub`) when the test needs data.

### Requirements

Nuxt ≥ 4.6.2 (not yet Nuxt 5), Node ≥ 24.11, Convex ≥ 1.46.

The full pre-release history, every pull request since the `0.1.0` test publish, is in the compare view above.

### ❤️ Contributors

- Slava Razum ([@slavarazum](https://github.com/slavarazum))

## v0.1.0

A throwaway test publish (2026-06-15). The first real release is `v0.2.0`; once it is live, `0.1.0` is deprecated on npm, so installing it warns to upgrade.
