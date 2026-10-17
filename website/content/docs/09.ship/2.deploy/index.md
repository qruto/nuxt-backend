---
title: Deployment
description: Ship the Convex backend and the Nuxt app together — `npx convex deploy --cmd`, the env split between the host and the deployment, and preview deployments.
kind: how-to
navigation:
  icon: i-lucide-rocket
---

A production deploy is two things: the **Convex deployment** (functions, components, its own env) and the **Nuxt app** (SSR on your host, pointed at that deployment). Convex's CLI ties them together — `npx convex deploy --cmd '<build>'` pushes the backend first, then runs your build with the production URL in the environment.

## One command on any host

Set the host's build command to:

```bash
npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name NUXT_PUBLIC_BACKEND_URL
```

with a **production deploy key** (`CONVEX_DEPLOY_KEY`, from the Convex dashboard) in the host's environment. `convex deploy` pushes `backend/` to the production deployment, then runs `npm run build` with `NUXT_PUBLIC_BACKEND_URL=https://<slug>.convex.cloud` injected. `--cmd-url-env-var-name` writes whatever name you give it, so name the one this package documents.

| Host | Where |
|---|---|
| Vercel | Project → Settings → Build & Development → Build Command; env in Environment Variables |
| Netlify | Site → Build & deploy → Build settings → Build command; env in Environment variables |
| Cloudflare Pages / Workers | Build configuration → Build command; env in Variables and Secrets |

The Nuxt app itself deploys like any Nuxt 4 app on those hosts (Nitro picks the preset). Nothing in `nuxt-backend` is host-specific.

## The env split

Two environments, two owners. The Nuxt host gets the **public URLs**; the Convex deployment gets the **backend contract**.

### On the Nuxt host

| Variable | Value |
|---|---|
| `NUXT_PUBLIC_BACKEND_URL` | `https://<slug>.convex.cloud` — injected by `--cmd-url-env-var-name` above, or set by hand |
| `NUXT_PUBLIC_BACKEND_SITE_URL` | `https://<slug>.convex.site` — the HTTP-actions origin the `/api/auth` proxy, the AI stream, and the agent exchange talk to. Derived from a `*.convex.cloud` backend URL when unset; set it explicitly for a custom domain or a self-hosted deployment |
| `CONVEX_DEPLOY_KEY` | The production deploy key, for `convex deploy` at build time |

Alternatively set `CONVEX_DEPLOYMENT=prod:<slug>` on the host: the module derives **both** URLs from the slug, exactly as it does from `dev:<slug>` in `.env.local`. `backend.url` / `backend.siteUrl` in `nuxt.config` win over either.

::note
The platform's own `NUXT_PUBLIC_CONVEX_URL` / `NUXT_PUBLIC_CONVEX_SITE_URL` still work — the underlying Convex module reads them directly, and an explicitly set one wins over a derived default. Use them if your host already sets them; the `NUXT_PUBLIC_BACKEND_*` names are what this package documents.
::

### On the Convex deployment

The two-tier contract from `backendEnv` — the deploy **fails** until the required pair is set:

| Tier | Variables | Absent |
|---|---|---|
| Required | `AUTH_SECRET`, `SITE_URL` | the push fails |
| Optional — email | `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_TEST_MODE`, `EMAIL_WEBHOOK_SECRET` | sends no-op, and codes and invitations to real addresses are refused · onboarding sender · test mode stays **on** · delivery events rejected |
| Optional — billing | `BILLING_ACCESS_TOKEN`, `BILLING_WEBHOOK_SECRET`, `BILLING_ENVIRONMENT` | billing empty, checkout fails · billing events rejected · **sandbox** |
| Dev-only | `AUTH_TRUST_LOCAL_ORIGINS` | never set in production |

`SITE_URL` is the app's public origin (`https://app.example.com`): the auth base URL, the **only** trusted browser origin, the base of every emailed link (invitations, gifts), and the CORS origin of `/ai/stream`.

Push them from `.env.local` with the deploy key in the environment:

```bash
CONVEX_DEPLOY_KEY=prod:... npx nuxt-backend env push --prod --dry-run   # the plan
CONVEX_DEPLOY_KEY=prod:... npx nuxt-backend env push --prod             # forward; fail on missing required vars
```

`--prod` never invents values, never forwards the dev-only variable, and leaves what is already set alone unless you name it — `--force BILLING_WEBHOOK_SECRET` (or `--force all`) replaces a live value with the local one, which is how a rotated secret gets there (see [`env push`](/docs/reference/cli#env-push)). Every value reaches the deployment on `convex env set`'s stdin, never as an argument. Or set them one by one, the same way: `openssl rand -base64 32 | npx convex env set --prod AUTH_SECRET`, and `npx convex env set --prod <NAME>` on its own asks for the value.

## Billing and email in production

The production billing environment is a separate object set with its own ids, kept beside the sandbox ones in `billing.generated.ts`. Give the production deployment its own token and environment first, then sync the catalog to it:

```bash
npx convex env set --prod BILLING_ACCESS_TOKEN            # asks for the production organization token
npx convex env set --prod BILLING_ENVIRONMENT production
read -rs BILLING_ACCESS_TOKEN && export BILLING_ACCESS_TOKEN   # the same token for billing sync, kept out of the shell history
npx nuxt-backend billing sync --env production
```

The shell's `BILLING_ACCESS_TOKEN` wins over the sandbox one in `.env.local`. `billing sync --env production` reads the production deployment first (`convex function-spec --prod`), provisions the webhook endpoint at its `.convex.site` URL — or at `NUXT_PUBLIC_BACKEND_SITE_URL` when the shell sets one (a custom domain), never at the dev URL in `.env.local` — and stores the endpoint's `BILLING_WEBHOOK_SECRET` on that deployment. It then loads the products there. With the token or `BILLING_ENVIRONMENT=production` missing it skips that step and says what to run; it refuses a dev or preview `CONVEX_DEPLOY_KEY`, and stops when it cannot read production, unless `--webhook <url>` says where the endpoint goes.

- Point the provider dashboards at the production site URL: `https://<slug>.convex.site/billing/events` and `/email/events` — see [Webhooks](/docs/ship/production/webhooks#point-the-provider-dashboards-at-them).
- Set `EMAIL_TEST_MODE=false` once the sending domain is verified.

The [checklist](/docs/ship/production) walks every item, and `npx nuxt-backend doctor --prod` verifies them.

## Preview deployments

Convex **preview deployments** give every branch its own backend. With a *preview* deploy key on the host's preview environment, the same build command creates (or reuses) a preview deployment named after the branch:

```bash
npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name NUXT_PUBLIC_BACKEND_URL --preview-run 'billing:syncProducts'
```

`--preview-run` runs a function after the push — seeding products is the usual one. `NUXT_PUBLIC_BACKEND_SITE_URL` for a preview is the preview deployment's `.convex.site` URL.

A new preview starts with an empty env, and its first push fails without `AUTH_SECRET` and `SITE_URL`. `convex deploy` runs `--cmd` after it creates the preview and before it pushes, so the build can fill them in with `npx nuxt-backend env push --preview`: a generated `AUTH_SECRET`, the branch's own origin as `SITE_URL` (`--site-url`), email in test mode and billing in the sandbox. Once, from your machine, `npx nuxt-backend env push --defaults preview --site-url <origin>` writes the same values as the project's preview env defaults, which Convex copies into every new preview. [Preview deployments](/docs/reference/cli#preview-deployments) on the CLI page has the Vercel build command and why `SITE_URL` is never guessed.

## Custom domains

The module derives the HTTP-actions origin from a `*.convex.cloud` backend URL only (`https://<slug>.convex.cloud` → `https://<slug>.convex.site`). Once the deployment answers on custom domains, nothing is derivable — set both on the host by hand:

| Variable | Value |
|---|---|
| `NUXT_PUBLIC_BACKEND_URL` | The custom domain that replaces `<slug>.convex.cloud` |
| `NUXT_PUBLIC_BACKEND_SITE_URL` | The custom domain that replaces `<slug>.convex.site` — the `/api/auth` proxy, the AI stream and the agent exchange all talk to it |

The webhook endpoints live on that HTTP-actions origin, so the provider dashboards move with it: `https://<your-http-actions-domain>/billing/events` and `/email/events` (`npx nuxt-backend billing sync --webhook <url>` provisions the billing endpoint at an explicit URL). `SITE_URL` is the app's origin and changes only when the app itself moves domain. `auth.config.ts` reads the deployment's own `CONVEX_SITE_URL` at runtime for its issuer and JWKS URL — there is nothing to edit there.

## Self-hosted Convex

With `CONVEX_SELF_HOSTED_URL` the module derives `url` from it; the HTTP-actions origin can't be predicted from a self-hosted URL, so set `NUXT_PUBLIC_BACKEND_SITE_URL` explicitly.

::tip
Prerendering: the docs/marketing pages of an app can prerender, but pages that open live Convex subscriptions must not (`routeRules: { '/app/**': { prerender: false } }`) — the crawler otherwise keeps WebSockets open and `nuxt build` never exits. See [Troubleshooting](/docs/ship/operate/troubleshooting#nuxt-build-or-generate-never-exits).
::
