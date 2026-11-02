---
title: Deploy to production
description: Ship the Convex backend and the Nuxt app with one build command on any host, split the env between them, set BACKEND_ENVIRONMENT to production, switch the providers over, make the first administrator and gate the launch on `doctor --prod`.
kind: how-to
capability: hosting
related:
  - /docs/services
  - /docs/ship/deploy/vercel
  - /docs/ship/checklist
navigation:
  icon: i-lucide-rocket
---

One build command ships both halves of your app: it pushes the backend to your production Convex deployment, then builds the Nuxt app against it. This page walks the first deploy by hand, on any host. [One-command production](/docs/ship/deploy/one-command) takes the same path in one command, and writes the app's env into a Vercel project for you.

A production app has two halves:

- **The Convex deployment** runs your functions, the packaged `backend` component and the official components beside it. It holds an env of its own.
- **The Nuxt app** runs on your host, server-rendered, and talks to that deployment.

## Where it runs

The package has no host-specific code. The Nuxt app deploys like any Nuxt 4 app, and Nitro picks the preset. Vercel is the host the package is built and tested on first, and a few capabilities use what it gives ([Deploy to Vercel](/docs/ship/deploy/vercel)). These are the hosts the package checks:

| Host | Status | Nitro preset | What to know |
|---|---|---|---|
| Vercel | Verified: nuxt-backend.dev runs there | `vercel`, picked for you | Vercel's edge sets `x-forwarded-for` and `x-real-ip`. Bot protection runs as BotID. |
| A Node server | Verified: CI builds the starter and serves it from `.output` on every pull request | `node-server` | A proxy of your own must set `x-forwarded-for`, or every visitor shares one rate-limit bucket. Bot protection runs as a challenge. |
| Any other host Nitro deploys to (Netlify, Cloudflare and others) | Not checked by the package | the host's | The build command and the env split below are all it needs. Bot protection runs as a challenge. |

The app's auth proxy (`/api/auth`) forwards each request to the deployment, and Convex writes the address that connects, your app's server, into `x-forwarded-for`. So the app's server signs the visitor's address (the first of `x-forwarded-for`, as your host wrote it) into the request under `PROTECTION_PROOF_SECRET`, and the deployment's per-address limits read that. Without the secret on both sides, every visitor through the app shares one address ([Rate limits](/docs/ship/security/rate-limits#privileged-routes)).

## The first deploy

::steps{level="3"}

### Get a production deploy key

Every Convex project has a production deployment. In the Convex dashboard, open its settings and generate a **production deploy key** ([Convex](/docs/services/convex#go-to-production)). Keep it in the host's env as `CONVEX_DEPLOY_KEY`, and export it in your shell for the commands below. The package's commands that write production refuse a dev or preview key, so they never write to the wrong deployment. Below, `<slug>` is the deployment's name, as it appears in its URL.

### Set the values production holds on its own

`env push` forwards `.env.local`, which holds the dev deployment's values, and leaves every name production already has alone. Set what differs first, each value on stdin:

```bash
openssl rand -base64 32 | npx convex env set --prod AUTH_SECRET          # never the dev one
printf %s https://app.example.com | npx convex env set --prod SITE_URL # the origin your app answers on
npx convex env set --prod BILLING_ACCESS_TOKEN                            # asks for the production token
npx convex env set --prod EMAIL_API_KEY                                   # asks for the production key
```

Then read the plan, and push the rest:

```bash
npx nuxt-backend env push --prod --dry-run   # what it forwards, and what is MISSING
npx nuxt-backend env push --prod             # forwards it, and fails on a missing required variable
```

`--prod` sets `BACKEND_ENVIRONMENT=production`, never invents a secret and never forwards a value only development uses. A name already set stays as it is unless you name it: `--force BILLING_WEBHOOK_SECRET` replaces it with the local value. A bare `--force` is refused here, since `.env.local` holds development's values ([`env push`](/docs/reference/cli#env-push)).

### Deploy both halves

Set the host's build command to the [one below](#one-command-on-any-host), add the host's env from [the env split](#the-env-split), then deploy:

```bash
npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name NUXT_PUBLIC_BACKEND_URL
```

The backend goes first, and the app builds against it.

### Switch the providers to production

Each provider keeps production apart from its sandbox, with its own settings and its own webhook. Each [service page](/docs/services) walks its own, with the findings that check it:

- **Billing** ([Polar](/docs/services/polar#go-to-production)). `npx nuxt-backend billing sync --env production` creates the catalog in Polar's production environment. It provisions the webhook at production's `/billing/events`, stores its secret there and loads the products into the backend you deployed in the step before. It writes production's ids to `backend/billing.generated.ts`, which production reads only from a push: commit the file and deploy again.
- **Email** ([Resend](/docs/services/resend#go-to-production)). Verify your sending domain in Resend, set `EMAIL_FROM` to an address on it, and point a webhook at production's `/email/events` with `EMAIL_WEBHOOK_SECRET`.
- **Bot protection, AI and monitoring.** Production's own proof secret or challenge keys ([Bot protection](/docs/services/bot-protection)), a model route ([AI gateway](/docs/services/ai-gateway)), and the DSN ([Sentry](/docs/services/sentry)).

### Make the first administrator

Sign in to the live app once with your address. Then run `npx nuxt-backend doctor --fix --prod` at a terminal, and enter that address when it asks ([Make the first administrator](/docs/build/auth/admin#make-the-first-administrator)). In a script, give the account the `admin` role yourself:

```bash
npx convex run --prod functions:setUserRole '{"email":"you@example.com","role":"admin"}'
```

Until an account holds the role, nobody can open `/admin`. `doctor` reports it as `admin-bootstrap`.

### Gate the launch

```bash
npx nuxt-backend doctor --prod
```

It fails on what a live product cannot run without, reads the values production's env names alone cannot show, and probes the live site. [Prepare for launch](/docs/ship/checklist) has every finding, and the list of what no command can see.

::

## One command on any host

Set the host's build command to:

```bash
npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name NUXT_PUBLIC_BACKEND_URL
```

Keep a **production deploy key** in the host's environment as `CONVEX_DEPLOY_KEY`. It comes from the production deployment's settings in the Convex dashboard. `convex deploy` pushes `backend/` to production, then runs `npm run build` with `NUXT_PUBLIC_BACKEND_URL=https://<slug>.convex.cloud` set. `--cmd-url-env-var-name` writes the name you give it, so give it the one this package reads.

| Host | Build command | Env |
|---|---|---|
| Vercel | Project, Settings, Build and Deployment, Build Command | Settings, Environment Variables |
| Netlify | Site configuration, Build and deploy, Build settings | Site configuration, Environment variables |
| Cloudflare | The Pages project's build configuration, or the Worker's build settings | Variables and Secrets |

The push fails until the deployment holds `AUTH_SECRET` and `SITE_URL`. [The first deploy](#the-first-deploy) sets them first.

## The env split

Each half has an env of its own. The Nuxt host gets the backend's URL and the few keys its server signs or reports with. The Convex deployment gets the rest. [Environment variables](/docs/reference/configuration/environment-variables) lists every name with what its absence does.

### On the Nuxt host

| Variable | Value |
|---|---|
| `NUXT_PUBLIC_BACKEND_URL` | `https://<slug>.convex.cloud`: written by `--cmd-url-env-var-name` above, or set by hand |
| `CONVEX_DEPLOY_KEY` | The production deploy key, for `convex deploy` at build time |
| `PROTECTION_PROOF_SECRET` | On Vercel: production's own bot-check secret, the same value as the deployment's ([Bot protection](/docs/services/bot-protection#link-it)) |
| `NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY` | Off Vercel: the challenge's site key ([Bot protection](/docs/services/bot-protection#link-it)) |
| `MONITORING_DSN` | Where the browser and the Nuxt server report errors. Set it on Vercel too: Sentry's integration sets only the source-map names the package reads ([Sentry](/docs/services/sentry#keys-and-environment)) |

The app derives the deployment's HTTP-actions origin, `https://<slug>.convex.site`, from `NUXT_PUBLIC_BACKEND_URL`. The auth proxy, the AI stream and the health check talk to that origin. A custom domain or a self-hosted backend breaks the derivation: [Self-host and add domains](/docs/ship/deploy/self-hosting) covers both. Instead of the URL, you can set `CONVEX_DEPLOYMENT=prod:<slug>` on the host. The module then derives both origins from the slug, as it does from `dev:<slug>` in `.env.local`.

### On the Convex deployment

`backendEnv` reads this contract. The push fails until the required pair is set. Each other group degrades as its row says until you set it:

| Group | Variables | While absent |
|---|---|---|
| Backend | `AUTH_SECRET`, `SITE_URL` | The push fails |
| Backend | `BACKEND_ENVIRONMENT` | `env push --prod` sets it to `production`, and `doctor --prod` fails a production deployment without it |
| Email | `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_WEBHOOK_SECRET` | Nothing is sent, and sign-in codes to real addresses are refused · the onboarding sender · delivery events are refused |
| Billing | `BILLING_ACCESS_TOKEN`, `BILLING_WEBHOOK_SECRET` | Pricing is empty and checkout fails · billing events are refused |
| AI | `AI_GATEWAY_API_KEY` | Needed only where the Convex AI Gateway is not available. With neither route, every `provider/model` call is refused |
| Protection | `PROTECTION_PROOF_SECRET` (on Vercel), `PROTECTION_CHALLENGE_SECRET_KEY` (elsewhere) | Nothing checks for bots |
| Notifications | `PUSH_PUBLIC_KEY`, `PUSH_PRIVATE_KEY` | Web push is off. `env push` generates the pair |
| Monitoring | `MONITORING_DSN` | The backend reports nothing, and jobs never check in |

`SITE_URL` is the app's public origin, such as `https://app.example.com`. It is the auth base URL, the **only** trusted browser origin, the base of every emailed link and the CORS origin of `/ai/stream`.

`BACKEND_ENVIRONMENT` is `production` here, and every provider leaves its test mode with it: email delivers to real addresses and billing charges real cards. A demo or a staging app sets `sandbox` instead, to run in production mode on the test modes ([Deploy a demo or staging app](/docs/ship/deploy/staging)). [Environments](/docs/start/concepts/environments#backend_environment) has the whole table.

## Related

- [Service map](/docs/services#provider-setup): each service, per environment, with the findings that check it.
- [Deploy to Vercel](/docs/ship/deploy/vercel): what an app gets on Vercel, and this site's own setup.
- [Deploy a demo or staging app](/docs/ship/deploy/staging): production mode on the providers' test modes.
- [Preview environments](/docs/ship/deploy/previews): a backend per branch, with its own env.
- [Self-host and add domains](/docs/ship/deploy/self-hosting): a self-hosted backend, and custom domains.
- [Prepare for launch](/docs/ship/checklist): what `doctor --prod` checks, and what it can't.
- [CLI](/docs/reference/cli#env-push): `env push` and `billing sync`, flag by flag.
