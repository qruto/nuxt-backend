---
name: nuxt-backend-ship
description: Testing and shipping a Nuxt app on nuxt-backend. Convex function tests with defineBackendTestApp and asUser, page tests over a mock backend, the lint preset, deploying the Convex backend and the Nuxt app together with convex deploy, the env split between the host and the deployment, pushing production and preview env with env push, the production catalog sync, doctor --prod and the launch checklist, webhooks, rate limits and custom domains. Use when writing tests, setting up CI or a host's build, deploying, preparing a production launch, rotating a secret, or debugging a production setup. Read the nuxt-backend core skill first.
---

# nuxt-backend: test and ship

A production deploy is two things: the **Convex deployment** (functions, components, its own env)
and the **Nuxt app** on its host, pointed at that deployment. The `nuxt-backend` core skill holds
the rules every change follows. Commands that write production run only when the user asks.

## Test and lint

- `defineBackendTestApp(schema, modules)` from `nuxt-backend/test` builds the app in
  `convex-test`; `asUser(t, { role, workspace, agent })` signs a caller in with real claims and a
  personal workspace.
- Page tests: `createBackendMock()` and `backendTestAliases()` from `nuxt-backend/test-utils`.
- `backendEslint()` from `nuxt-backend/eslint` applies Convex's lint rules to `backend/`:
  `export default withNuxt(backendEslint())`. It needs `@convex-dev/eslint-plugin` installed.

## Deploy

Set the host's build command to

```bash
npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name NUXT_PUBLIC_BACKEND_URL
```

with a production deploy key, `CONVEX_DEPLOY_KEY`, in the host's environment (the user creates
it in the Convex dashboard). `convex deploy` pushes `backend/` to the production deployment, then runs
the build with `NUXT_PUBLIC_BACKEND_URL` set. Nothing in the package is host-specific.

- **On the host:** `NUXT_PUBLIC_BACKEND_URL` (injected above; the `.convex.site` origin derives from
  it, and `NUXT_PUBLIC_CONVEX_SITE_URL`, the base module's own name, sets a custom domain or a
  self-hosted deployment) and `CONVEX_DEPLOY_KEY`.
- **On the deployment:** `AUTH_SECRET` and `SITE_URL` (required: the push fails without them),
  then `BACKEND_ENVIRONMENT` (`env push` derives it) and the optional `EMAIL_*` and `BILLING_*`. `SITE_URL` is the app's public origin: the only
  trusted browser origin and the base of every emailed link.

## Deploy in one command

`npx nuxt-backend deploy` takes production from nothing to a passing `doctor --prod`: it links or
creates the production deployment, sets `BACKEND_ENVIRONMENT=production` (it keeps a `sandbox`;
`--sandbox` sets one), generates production's own `AUTH_SECRET` and proof secret, pushes the
backend, syncs the billing catalog, registers both webhooks, writes the app's env into the linked
Vercel project and runs `doctor --prod`. Run `--dry-run` first. A key only the user holds
(`SITE_URL`, `BILLING_ACCESS_TOKEN`, `EMAIL_API_KEY`) comes from the shell or a terminal prompt;
under `--json` or in CI that step is skipped. Never paste a secret into its arguments.
`deploy --build` is the host's build command for an app that starts on the host (the deploy template).

## Push the production env

```bash
CONVEX_DEPLOY_KEY=prod:... npx nuxt-backend env push --prod --dry-run   # the plan
CONVEX_DEPLOY_KEY=prod:... npx nuxt-backend env push --prod             # forward
```

`--prod` forwards what `.env.local` holds, invents no value but `BACKEND_ENVIRONMENT` (`production`,
derived from the deployment), and fails on missing required env. A value already set stays unless
`--force <NAME>` names it (`--prod` refuses a bare `--force`). Values go on stdin, never as
arguments. Never print a secret; rotate one with `npx nuxt-backend env rotate`, never by pasting a
new `AUTH_SECRET`, which signs everyone out.

Billing in production is its own object set: with the production token and
`BACKEND_ENVIRONMENT=production`, `npx nuxt-backend billing sync --env production` creates its
products, webhook and secret. Only `production` leaves the test modes; a demo or staging app sets
`sandbox`.

## Check production

```bash
CONVEX_DEPLOY_KEY=prod:... npx nuxt-backend doctor --prod
```

`--prod` checks the production deployment and turns the optional tier's designed degradations
into failures: no email transport, no billing token, a webhook route that refuses every event, the
dev-only origin flag left set. It reads what the names alone cannot say: test mode, the billing
environment and the sender left at their unset defaults fail (set to test mode or the sandbox on
purpose, they warn), and production reports its sending domain, bounces and quota itself. Then it
probes the live site `SITE_URL` names: HTTPS and HSTS, the CSP, the deployment the page talks to,
a gated page, the docs for agents and the health endpoint (`status --prod` too). It refuses a dev
or preview deploy key. For an agent, `npx nuxt-backend mcp --prod`
serves the same reads as MCP tools, with production's logs and insights and every write refused
(https://nuxt-backend.dev/docs/develop/agents/developer-mcp). Fix each failure with its fix line, then walk
the launch list: https://nuxt-backend.dev/docs/ship/checklist. Every printed message has its fix in
https://nuxt-backend.dev/docs/ship/operate/troubleshooting.

## Measure the bundles

`npx nuxt-backend analyze` measures the Convex bundle (the alpha `@convex-dev/bundle-analyzer`, pointed
at `backend/`; an optional peer, so install it once with `npm install -D @convex-dev/bundle-analyzer@0.1.0`)
and the Nuxt client and server bundles: the largest packages, the share `nuxt-backend` and the app's own
code take, and insights such as a package bundled twice. `--only convex` answers in
seconds and skips the Nuxt build. For CI, `--max-convex 8MB --max-client 350kB --max-server 3MB` exits `1`
over a budget and names what grew; `--json` prints the report. It needs `backend/_generated/`; `doctor` reads its last run.

## Previews and custom domains

- A preview starts with an empty env and fails its first push without `AUTH_SECRET` and
  `SITE_URL`. Fill them in the build with `npx nuxt-backend env push --preview --site-url
  <origin>`, or once with `npx nuxt-backend env push --defaults preview --site-url <origin>`.
  `SITE_URL` is never guessed.
- On custom domains nothing is derived: set both `NUXT_PUBLIC_BACKEND_*` URLs on the host, and
  point the provider webhooks (`/billing/events`, `/email/events`) at the custom HTTP-actions
  origin.

## Monitor

With `@sentry/nuxt` installed and a DSN set (`MONITORING_DSN`, or the `NEXT_PUBLIC_SENTRY_DSN` Sentry's Vercel
integration sets), the module wires the SDK: the browser and the Nuxt server (`backendAuth(event)`'s
calls included) report errors, tagged `backend.function` and `backend.code` for a failed backend
call. `MONITORING_DSN` on the deployment lets the backend's actions report (`reportError`,
`reportingErrors` from `nuxt-backend/monitoring`, experimental) and its jobs check in
(`checkIn`; a mutation job schedules an action that checks in as its last step). Reports carry
`BACKEND_ENVIRONMENT`; only `production` and `sandbox` check jobs in. A refusal is never reported. Point an uptime check at `/api/backend/health`. In dev without a DSN, DevTools › Monitoring
lists a local error log. Never invent or print a DSN.

## Flags and kill switches

Declare feature flags in `backend/flags.ts` with `defineFlags` (a default and a description
each) and `setupFlags(components, { flags, audit, billing })` from `nuxt-backend/flags`. Guard a
function with `await flags.requireFlag(ctx, key)` (`forbidden`, reason `flag_off`) or branch on
`flags.isEnabled(ctx, key)`; in a page, `useFlag(key).isEnabled`, server-rendered and live. An
administrator overrides a flag in the admin console's Flags tab: on or off for everyone, or, while
off, on for account ids, workspace ids, catalog plan keys and a stable rollout percentage. The
package's own flags `pause_signups`, `pause_checkout` (checkouts, plan switches, gifts) and
`pause_ai` refuse those calls as `unavailable` (reason `<service>_paused`); `maintenance` shows
the `maintenance` notice of `<BackendNotices>` on every page. App keys never start with `pause_` or `backend_`. Pass
`setupFlags` the same `adminRoles` and `adminUserIds` as `setupAdmin`. Every change takes a
recent sign-in and records `flag.changed`. Never flip a switch in production unless the user asks.

## Tasks

<!-- generated:tasks -->
**Services**

- [Convex](https://nuxt-backend.dev/docs/services/convex): Set up the Convex deployment the backend runs on: the account, the region, dev and production deployments, and the keys the app and the CLI read.
- [Polar](https://nuxt-backend.dev/docs/services/polar): Set up Polar, the billing provider and merchant of record: the sandbox organization, the access token, the webhook, and the move to production.
- [Resend](https://nuxt-backend.dev/docs/services/resend): Set up Resend for email: the account, the API key, the sending domain and its DNS records, the region, sending subdomains and the webhook.
- [AI gateway](https://nuxt-backend.dev/docs/services/ai-gateway): Set up the AI gateway the AI features call models through: the Convex AI Gateway on a paid plan or a Vercel AI Gateway key, the spend cap, EU inference, and what development costs.
- [Vercel](https://nuxt-backend.dev/docs/services/vercel): Set up Vercel to host the Nuxt app: the account, the project, its environments, preview deployments, the function region and the env it needs from the backend.
- [Sentry](https://nuxt-backend.dev/docs/services/sentry): Set up Sentry for errors, logs, replays, feedback, alerts and uptime: the account and its data region, the project, the DSN for the app and the deployment, source maps, cron monitors, the alert rules and the health monitor.
- [Bot protection](https://nuxt-backend.dev/docs/services/bot-protection): Set up the bot check that guards sign-in and sign-up: Vercel BotID on Vercel, or a Cloudflare Turnstile challenge on any other host, with its keys.

**Develop**

- [Test pages over a mock backend](https://nuxt-backend.dev/docs/develop/testing/pages): Render your pages and the packaged components over a mock backend and session in Vitest: signed in, signed out, loading and failed, with no deployment and no network.
- [Test backend functions](https://nuxt-backend.dev/docs/develop/testing/functions): Run your Convex functions in convex-test with every component the scaffold mounts, call them as a signed-in person in a workspace, and assert each refusal by its code.
- [Run end-to-end tests](https://nuxt-backend.dev/docs/develop/testing/e2e): Drive the real app in a browser with Playwright: sign in with a code read from the dev inbox as JSON, pay with the test card in Polar's sandbox, and assert what people see.
- [Check every change in CI](https://nuxt-backend.dev/docs/develop/testing/ci): Run lint, the type check and the function and page tests on every pull request with no secrets, then the end-to-end suite on an account-free deployment, and gate the release on doctor.
- [Load-test before launch](https://nuxt-backend.dev/docs/develop/testing/load): Find out what your backend handles before launch: which paths to load, a deployment made for the test, a k6 script, the limits that refuse first, and how to read the results.
- [Lint backend functions](https://nuxt-backend.dev/docs/develop/testing/linting): Convex's official lint rules for your functions directory, as one ESLint preset.
- [Test your app](https://nuxt-backend.dev/docs/develop/testing): Which test fits which change: backend functions in convex-test, pages over a mock backend, the real app end to end with Playwright, all of it in CI, and a load test before launch.

**Ship**

- [Deploy to Vercel](https://nuxt-backend.dev/docs/ship/deploy/vercel): What an app gets on Vercel, the host the package is built on first: BotID, Sentry's integration, the AI Gateway and the project's env, then this site's own setup as a reference: Web Analytics and Speed Insights without cookies, Firewall rate limits and a keyless model for the docs assistant.
- [Deploy in one command](https://nuxt-backend.dev/docs/ship/deploy/one-command): `nuxt-backend deploy` links the production deployment, pushes its env, deploys the backend, syncs the billing catalog, registers both webhooks, writes the app's env into the Vercel project and runs `doctor --prod`, step by step and safe to run again.
- [Start from the deploy template](https://nuxt-backend.dev/docs/ship/deploy/template): A new app deployed to Vercel from its first commit: the starter as a Vercel template, with Convex added through the Vercel Marketplace, running on the providers' test modes until `nuxt-backend deploy` switches it to production.
- [Set up preview environments](https://nuxt-backend.dev/docs/ship/deploy/previews): Give a branch's preview build a backend of its own, with a generated auth secret, the branch's exact origin as SITE_URL and BACKEND_ENVIRONMENT set to preview, from the build or from the project's env defaults.
- [Deploy a demo or staging app](https://nuxt-backend.dev/docs/ship/deploy/staging): Run a public demo or a staging copy of your app in production mode while every provider stays in its test mode, with BACKEND_ENVIRONMENT set to sandbox, a Convex project of its own, Polar's sandbox and Resend's test addresses.
- [Self-host and add domains](https://nuxt-backend.dev/docs/ship/deploy/self-hosting): Point the app at a self-hosted Convex backend or at custom domains for the deployment, where the HTTP-actions origin cannot be derived, and move the provider webhooks with it.
- [Deploy to production](https://nuxt-backend.dev/docs/ship/deploy): Ship the Convex backend and the Nuxt app with one build command on any host, split the env between them, set BACKEND_ENVIRONMENT to production, switch the providers over, make the first administrator and gate the launch on `doctor --prod`.
- [Production checklist](https://nuxt-backend.dev/docs/ship/checklist): What `doctor --prod` fails on, what it reads off production and probes on the live site, and the list for what no command can see, from auth, email and billing to privacy, monitoring and a launch in phases.
- [Tune rate limits](https://nuxt-backend.dev/docs/ship/security/rate-limits): Throttle sign-in code sends and checks, passkey sign-in challenges, billing syncs, metered AI calls, admin actions, invitations and your own endpoints with Convex's rate-limiter component, pre-seeded with the package defaults. Reach for `nuxt-backend/rate-limit`.
- [Register webhooks](https://nuxt-backend.dev/docs/ship/security/webhooks): One call mounts every inbound route on the deployment: the auth routes, the billing and email webhooks with their signatures verified once, the metered AI stream and the health check. Then point Polar and Resend at them and read the delivery log. Reach for `nuxt-backend/http`.
- [Rotate secrets](https://nuxt-backend.dev/docs/ship/security/secrets): `nuxt-backend env rotate` replaces the auth secret, the session signing keys and the webhook secrets without signing anyone out or dropping a delivery: the new value beside the old, then the old retired.
- [Secure your supply chain](https://nuxt-backend.dev/docs/ship/security/supply-chain): Keep the dependencies your app installs trustworthy: lockfiles, install cooldowns, install scripts by name, trust checks, reviewed agent and editor config, and a CI that cannot be turned against you.
- [Make your app accessible under EU law](https://nuxt-backend.dev/docs/ship/compliance/accessibility): What the European Accessibility Act asks of an app sold to consumers in the EU, what the packaged pages already meet, what your own pages still owe, and the accessibility statement. Not legal advice.
- [Disclose AI-generated content](https://nuxt-backend.dev/docs/ship/compliance/ai-transparency): What Article 50 of the AI Act asks of an app that generates content or chats with people, who answers for each duty, and how to label output for people and machines. Not legal advice.
- [Moderate user content](https://nuxt-backend.dev/docs/ship/compliance/moderation): What the DSA and the TAKE IT DOWN Act ask of an app that hosts what people upload: a notice form anyone can use, statements of reasons, an appeal, reports of crimes and the 48-hour removal. Not legal advice.
- [Follow email law](https://nuxt-backend.dev/docs/ship/compliance/email-law): Consent, one-click unsubscribe, sender identity and a postal address under the mailbox providers' sender rules, CAN-SPAM, GDPR and ePrivacy, and which parts the package handles. Not legal advice.
- [Follow subscription law](https://nuxt-backend.dev/docs/ship/compliance/subscriptions): The EU withdrawal right and button, renewal consent and reminders, online cancellation and refunds, and which of them the merchant of record handles for you. Not legal advice.
- [Set a minimum age](https://nuxt-backend.dev/docs/ship/compliance/age): Choose the minimum age your app accepts, ask for it at sign-up and refuse anyone younger, and what COPPA and GDPR Art. 8 ask when children could sign up. Not legal advice.
- [Monitor errors and uptime](https://nuxt-backend.dev/docs/ship/operate/monitoring): Report errors from the browser, the Nuxt server and the backend's actions with personal data scrubbed, send log lines, replay sessions after consent, take feedback, check crons in, raise alerts on the email quota, AI spend and Convex usage, and see what AI costs per person. Sentry once a DSN is set; a local error log in dev. Reach for `nuxt-backend/monitoring`.
- [Roll out features and pause services](https://nuxt-backend.dev/docs/ship/operate/flags): Declare feature flags in code and read them inside queries and mutations, target them by account, workspace, plan or a stable percentage, and pull the kill switches: pause sign-ups, checkout or AI, or put up a maintenance notice. Reach for `nuxt-backend/flags`.
- [Respond to incidents](https://nuxt-backend.dev/docs/ship/operate/runbooks): Runbooks for what breaks in production: webhooks that fail, arrive late or arrive twice, an erasure that stopped, a maintenance cron that fails, a rate-limit spike, credits held by a reservation, a leaked secret and a provider outage, each with what degrades and what to do.
- [Replay a webhook delivery](https://nuxt-backend.dev/docs/ship/operate/replay): Pick a delivery from the webhook log and have Polar or Resend send it again, signed, through their own redelivery, from the admin console, DevTools or your own admin code, with each replay recorded. Reach for `setupWebhooks()` from `nuxt-backend/admin`.
- [Back up, restore and roll back](https://nuxt-backend.dev/docs/ship/operate/backup): Take snapshots of the production deployment, the components' tables with yours, restore one and bring the billing and email providers back in step, and roll back a deploy across a schema change without breaking the data.
- [Get help](https://nuxt-backend.dev/docs/ship/operate/help): Where to ask a question, report a bug or report a vulnerability, and what to include so it can be answered at once: doctor's JSON, the versions, and the kind of deployment.
- [Monitor production](https://nuxt-backend.dev/docs/ship/operate): Where to look once the app is live: each capability's state, error reports and uptime, cron check-ins, the deployment's logs and their codes, the webhook delivery log, the activity trail and the providers' own dashboards, with what each tells you.
<!-- /generated:tasks -->

## The API

[references/api.md](references/api.md) lists the import paths of this area and the `doctor` and
`env push` flags, each with its doc comment's first sentence.
