---
title: "Ship to production"
description: "Test the backend, deploy both halves on any host with Vercel first, switch every provider from its test mode to production, gate the launch on doctor --prod, then run it: errors and uptime, flags and kill switches, runbooks, backups and releases."
kind: landing
navigation:
  title: Overview
  icon: i-lucide-compass
---

Everything you build on the other tabs runs first on your dev deployment. This tab takes your app to production and keeps it healthy there. Going live takes six steps, listed in [How it fits together](#how-it-fits-together): test, set production's env, deploy, switch the providers, pass `doctor --prod`, and run it. Start with [Deploy to production](/docs/ship/deploy).

## What it gives your app

| Part | What you get | Powered by | Before production | Start at |
|---|---|---|---|---|
| Tests | Your functions in `convex-test` with every component mounted and callers signed in; pages over a mock backend; Convex's lint rules | Vitest, `convex-test`, `@nuxt/test-utils` | The same tests, with no deployment and no provider | [Testing](/docs/develop/testing) |
| Hosting | One build command that ships the backend, then the app; the env split between them; previews, demos and custom domains; one-command production and a deploy template | Convex deployments, and Vercel or any host Nitro deploys to | A dev deployment and the Nuxt dev server | [Deploy to production](/docs/ship/deploy) |
| The launch gate | `doctor --prod` fails on what a live product cannot run without, reads production's values and probes the live site | The package's CLI | `doctor` against the dev deployment | [Prepare for launch](/docs/ship/checklist) |
| Protection | A Content Security Policy that knows the deployment, webhooks verified once that fail closed, rate limits on every route that sends mail or acts on others, bot checks | `nuxt-security`, the Convex rate limiter, Vercel BotID or Cloudflare Turnstile | Bot checks answer human; everything else as in production | [Security model](/docs/ship/security) |
| Compliance | Which laws reach a client app and who answers for what; in `0.2.0`, generated legal pages and a data map, a minimum age, a consent manager, the EU withdrawal button and AI-generated labels | Your counsel, with the providers' DPAs and Polar as merchant of record | The same pages, filled from your dev deployment's capabilities | [Compliance](/docs/ship/compliance) |
| Monitoring | Error reports from the browser, the Nuxt server and the backend, cron check-ins, and a health endpoint | Sentry | A local error log in DevTools | [Monitor errors and uptime](/docs/ship/operate/monitoring) |
| Flags | Feature flags read inside your functions, targeted by account, workspace, plan or percentage; kill switches; a maintenance notice | The backend component, on Convex | The same code, on the dev deployment | [Flags and kill switches](/docs/ship/operate/flags) |
| Operations | Runbooks, backups, the webhook delivery log with replay, secret rotation, and the provider settings `doctor --fix` applies | The package, Convex, Polar and Resend | The same tools, on the providers' test modes | [Monitor production](/docs/ship/operate) |
| Releases | Provenance, an attested tarball and an SBOM for every release, a stability promise, and an upgrade command | GitHub, npm and Sigstore | | [What's new in 0.2](/docs/ship/releases) |

Each part's state is detected, never configured: `npx nuxt-backend status --prod` shows each capability of production with its state ([Capabilities](/docs/start/concepts/capabilities)). The [demo](/docs/start/playground) runs as a sandbox deployment: its [strips page](/playground/strips) reads a flag as an experiment, and a spend limit turns on the `pause_ai` kill switch for the rest of a costly day.

## How it fits together

A production app has two halves. The **Convex deployment** runs your functions and the `backend` component, with an env of its own. The **Nuxt app** runs on your host, pointed at that deployment. One variable on the deployment, `BACKEND_ENVIRONMENT`, decides whether the providers run in their test modes or live ([Environments](/docs/start/concepts/environments)). Going live takes the same steps every time:

1. **Test and lint the backend.** `defineBackendTestApp` and `asUser` run your functions as the deployment would ([Testing](/docs/develop/testing)), and `backendEslint` applies Convex's rules ([Linting](/docs/develop/testing/linting)).
2. **Set production's env.** Production's own secrets and provider keys on the deployment, then `npx nuxt-backend env push --prod` for the rest. The host gets the backend URL and a production deploy key ([The env split](/docs/ship/deploy#the-env-split)).
3. **Deploy both halves.** `npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name NUXT_PUBLIC_BACKEND_URL` pushes the backend, then builds the app against it ([Deploy to production](/docs/ship/deploy)).
4. **Switch the providers to production.** `billing sync --env production`, `email sync --prod` with PREFS, a verified sending domain, both webhooks registered, production's bot-check keys, a model route and the error-reporting DSN ([Service map](/docs/services)).
5. **Gate the launch.** `npx nuxt-backend doctor --prod`, then the list of what it can't see, and the first administrator ([Prepare for launch](/docs/ship/checklist)).
6. **Run it.** Errors and uptime, flags and kill switches, the delivery log and the activity trail, with runbooks for when something breaks ([Monitor production](/docs/ship/operate)).

[One-command production](/docs/ship/deploy/one-command), arriving in `0.2.0`, runs steps 2 to 5 as one command, and writes the app's env into a Vercel project for you.

The webhooks here are the ones your app receives. API keys and outgoing webhooks, for apps that other systems call, wait for the next release ([Roadmap](/docs/start/roadmap)).

## What you get

What the package ships for this part of the app, generated from the code: each name links to its
reference entry.

::what-you-get{area="ship"}
::

## Deploy

Set up each service first: the [Service map](/docs/services) has the order, and a page per provider from sign-up to a passing `doctor`. Tests and linting run before every deploy ([Test your app](/docs/develop/testing)).

::card-group
  :::card{icon="i-lucide-rocket" title="Deploy to production" to="/docs/ship/deploy"}
  One build command on any host, the env split, and the first deploy step by step.
  :::

  :::card{icon="i-simple-icons-vercel" title="Deploy to Vercel" to="/docs/ship/deploy/vercel"}
  BotID, Sentry's integration and the AI Gateway, then this site's setup: analytics without cookies and edge rate limits.
  :::

  :::card{icon="i-lucide-wand-sparkles" title="One-command production" to="/docs/ship/deploy/one-command"}
  Planned: one command sets up production and writes the app's Vercel env.
  :::

  :::card{icon="i-lucide-layout-template" title="Deploy template" to="/docs/ship/deploy/template"}
  Planned: a new app on Vercel from its first commit, with Convex through the Marketplace.
  :::

  :::card{icon="i-lucide-git-branch" title="Previews" to="/docs/ship/deploy/previews"}
  A backend per branch, with its exact origin and every provider in its test mode.
  :::

  :::card{icon="i-lucide-server" title="Self-hosting and domains" to="/docs/ship/deploy/self-hosting"}
  A self-hosted backend, and custom domains for the deployment.
  :::

  :::card{icon="i-lucide-presentation" title="Demo and staging" to="/docs/ship/deploy/staging"}
  Production mode on the providers' test modes, with `BACKEND_ENVIRONMENT=sandbox`.
  :::
::

## Launch safely

::card-group
  :::card{icon="i-lucide-clipboard-check" title="Production checklist" to="/docs/ship/checklist"}
  What `doctor --prod` fails on, what it probes on the live site, and the list for what no command can see.
  :::

  :::card{icon="i-lucide-shield-check" title="Security model" to="/docs/ship/security"}
  The policy, the webhook edge, sign-in limits, step-up, administrator visits and what stays internal.
  :::

  :::card{icon="i-lucide-gauge" title="Rate limits" to="/docs/ship/security/rate-limits"}
  Every limit on a route that sends mail or acts on others, and how to tune it.
  :::

  :::card{icon="i-lucide-webhook" title="Webhooks" to="/docs/ship/security/webhooks"}
  The routes providers call, verified once and failing closed, with the delivery log.
  :::

  :::card{icon="i-lucide-rotate-ccw-key" title="Rotate secrets" to="/docs/ship/security/secrets"}
  Planned: every secret replaced without signing anyone out or dropping a delivery.
  :::

  :::card{icon="i-lucide-scan-search" title="Security surface" to="/docs/ship/security/surface"}
  Planned: everything an outsider can reach, reviewed as one checkpoint.
  :::

  :::card{icon="i-lucide-package-check" title="Supply chain" to="/docs/ship/security/supply-chain"}
  Lockfiles, an install cooldown, scripts allowed by name and reviewed agent config.
  :::

  :::card{icon="i-lucide-scale" title="Compliance" to="/docs/ship/compliance"}
  Which laws reach a client app: privacy, accessibility, AI labels, moderation, email and subscriptions.
  :::
::

## Operate

::card-group
  :::card{icon="i-lucide-radar" title="Monitor production" to="/docs/ship/operate"}
  Where to look once the app is live, and what each place tells you.
  :::

  :::card{icon="i-lucide-activity" title="Monitor errors and uptime" to="/docs/ship/operate/monitoring"}
  Error reports from every side, cron check-ins and the health endpoint.
  :::

  :::card{icon="i-lucide-toggle-right" title="Flags and kill switches" to="/docs/ship/operate/flags"}
  Roll features out by account, workspace, plan or percentage, and pause services in one switch.
  :::

  :::card{icon="i-lucide-siren" title="Respond to incidents" to="/docs/ship/operate/runbooks"}
  What to do first when something breaks.
  :::

  :::card{icon="i-lucide-refresh-cw" title="Replay deliveries" to="/docs/ship/operate/replay"}
  Planned: send a webhook delivery an endpoint missed again.
  :::

  :::card{icon="i-lucide-life-buoy" title="Troubleshooting" to="/docs/ship/operate/troubleshooting"}
  Symptoms, log codes and their fixes.
  :::

  :::card{icon="i-lucide-database-backup" title="Backup and restore" to="/docs/ship/operate/backup"}
  Snapshots of the deployment, a restore with the providers caught up, and a rollback.
  :::

  :::card{icon="i-lucide-message-circle-question" title="Get help" to="/docs/ship/operate/help"}
  Where to ask, what to include, and how a security report differs.
  :::
::

## Releases

::card-group
  :::card{icon="i-lucide-newspaper" title="What's new in 0.2" to="/docs/ship/releases"}
  The first release, capability by capability, and what is still experimental.
  :::

  :::card{icon="i-lucide-history" title="Changelog" to="/docs/ship/releases/changelog"}
  Every release, generated from the commits.
  :::

  :::card{icon="i-lucide-shield-check" title="Stability" to="/docs/ship/releases/stability"}
  What a minor or a patch release may change, and the experimental tier.
  :::

  :::card{icon="i-lucide-badge-check" title="Verify a release" to="/docs/ship/releases/verify"}
  npm's provenance, the attested tarball and its SBOM.
  :::

  :::card{icon="i-lucide-arrow-up-circle" title="Upgrade to a new version" to="/docs/ship/releases/upgrade"}
  Install a release, repair the scaffold and migrate the package's data in one command.
  :::
::
