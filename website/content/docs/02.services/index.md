---
title: Service map
description: "Every capability against the service that powers it: required or optional, free tiers, env names, the order to set them up in, and the recommended settings."
kind: landing
capability: hosting
navigation:
  title: Service map
  icon: i-lucide-map
---

nuxt-backend composes a few services: Convex runs the backend, and each other service powers one or more [capabilities](/docs/start/concepts/capabilities). You need Convex to start. Everything else can wait until the feature that needs it, and each one has a free tier or a sandbox for development.

## The map

Free tiers checked on 2026-10-25. Each service page has the full costs and limits.

| Capability | Service | Needed | Free to start | Env names | Page |
|---|---|---|---|---|---|
| `data`, `jobs` | Convex | Always | Free plan: 1M function calls a month | `CONVEX_DEPLOYMENT`, `NUXT_PUBLIC_BACKEND_URL`, `CONVEX_DEPLOY_KEY` | [Convex](/docs/services/convex) |
| `auth` | Better Auth, inside your Convex deployment | Always | No account | `AUTH_SECRET`, `SITE_URL`, `BACKEND_ENVIRONMENT` | [Convex](/docs/services/convex#keys-and-environment) |
| `email` | Resend | In production, for sign-in codes | 3,000 emails a month, 100 a day | `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_WEBHOOK_SECRET` | [Resend](/docs/services/resend) |
| `billing`, `analytics` | Polar | To take payments | The sandbox is free; production takes 5% + 50¢ per sale | `BILLING_ACCESS_TOKEN`, `BILLING_WEBHOOK_SECRET` | [Polar](/docs/services/polar) |
| `ai` | The Convex AI Gateway, or the Vercel AI Gateway | For AI features | None on Convex's route: paid plans only | `AI_GATEWAY_API_KEY`, only for Vercel's route | [AI gateway](/docs/services/ai-gateway) |
| `hosting` | Vercel, or any host that runs Nuxt | To go live | Hobby, for non-commercial apps | `CONVEX_DEPLOY_KEY` on the host | [Vercel](/docs/services/vercel) |
| `protection` | Vercel BotID, or Cloudflare Turnstile | Before launch | Free on both | `PROTECTION_PROOF_SECRET`, or the two challenge keys | [Bot protection](/docs/services/bot-protection) |
| `monitoring` | Sentry | Before launch | 5,000 errors a month, one person | `MONITORING_DSN` | [Sentry](/docs/services/sentry) |
| `notifications` | The browsers' push services | For web push | No account | `PUSH_PUBLIC_KEY`, `PUSH_PRIVATE_KEY`, generated | [Notifications](#notifications) |
| `flags` | Convex | Always there | No account | None | [Roll out features](/docs/ship/operate/flags) |

Brands stop at this tab: your code and env use the package's neutral names, so a page under Build never needs to know which service sends an email.

## Setup order

1. **Convex,** first. `npx nuxt-backend dev` creates the dev deployment, and sign-in works at once: codes print in your terminal.
2. **Resend,** when you want codes in a real inbox or start sending your own email. Add the sending domain early: DNS can take a day.
3. **Polar,** when you add plans or credits. Work in its sandbox, and start the production account review a week or two before launch.
4. **An AI gateway,** when you add an AI feature. Set its spend cap first.
5. **Vercel,** or your own host, when you deploy. Pick the function region next to your Convex region.
6. **Bot protection and Sentry,** before launch. `doctor --prod` warns until both are in place.

Each service has a test mode or a sandbox, and `BACKEND_ENVIRONMENT` decides which side email and billing run on: `development`, `preview` and `sandbox` keep both on their test modes, `production` takes both live at once ([Environments and deployments](/docs/start/concepts/environments#backend_environment)).

::card-group
  :::card{icon="i-simple-icons-convex" title="Convex" to="/docs/services/convex"}
  Set up the Convex deployment the backend runs on: the account, the region, dev and production deployments, and the keys the app and the CLI read.
  :::

  :::card{icon="i-lucide-credit-card" title="Polar" to="/docs/services/polar"}
  Set up Polar, the billing provider and merchant of record: the sandbox organization, the access token, the webhook, and the move to production.
  :::

  :::card{icon="i-lucide-mail" title="Resend" to="/docs/services/resend"}
  Set up Resend for email: the account, the API key, the sending domain and its DNS records, the region, sending subdomains and the webhook.
  :::

  :::card{icon="i-lucide-sparkles" title="AI gateway" to="/docs/services/ai-gateway"}
  Set up the AI gateway the AI features call models through: the Convex AI Gateway on a paid plan or a Vercel AI Gateway key, the spend cap, EU inference, and what development costs.
  :::

  :::card{icon="i-simple-icons-vercel" title="Vercel" to="/docs/services/vercel"}
  Set up Vercel to host the Nuxt app: the account, the project, its environments, preview deployments, the function region and the env it needs from the backend.
  :::

  :::card{icon="i-lucide-activity" title="Sentry" to="/docs/services/sentry"}
  Set up Sentry for errors and uptime: the account and its data region, the project, the DSN for the app and the deployment, source maps, cron monitors and the health monitor.
  :::

  :::card{icon="i-lucide-shield" title="Bot protection" to="/docs/services/bot-protection"}
  Set up the bot check that guards sign-in and sign-up: Vercel BotID on Vercel, or a Cloudflare Turnstile challenge on any other host, with its keys.
  :::
::

## Provider setup

Each service in development and in production, side by side, with the `doctor` findings that check it. `npx nuxt-backend doctor --only <capability>` runs one capability's checks, and [Diagnostics](/docs/reference/cli/diagnostics) has the fix for every id. Set a deployment's values with `npx convex env set [--prod] NAME`, which asks for the value, or forward them from `.env.local` with [`env push`](/docs/reference/cli#env-push).

| Service | Development | Production | Checked by `doctor --only` |
|---|---|---|---|
| [Convex](/docs/services/convex#go-to-production) | A dev deployment per developer, made by `npx nuxt-backend dev` | The production deployment, its deploy key on the host, its own `AUTH_SECRET` | `data` |
| [Polar](/docs/services/polar#go-to-production) | A sandbox organization's token; `billing sync` | A production organization that passed review; `billing sync --env production` | `billing` |
| [Resend](/docs/services/resend#go-to-production) | A development team's key; test addresses only | A production team's key, a verified domain, `email sync --prod` | `email` |
| [AI gateway](/docs/services/ai-gateway#go-to-production) | The same models, at their real cost | Production's own spend cap, and key if you use one | `ai` |
| [Vercel](/docs/services/vercel#go-to-production) | `npx nuxt-backend dev` on your machine | The project's production environment, on Pro | `hosting` |
| [Bot protection](/docs/services/bot-protection#go-to-production) | The dev server answers human | Production's own proof secret, or the widget's keys | `protection` |
| [Sentry](/docs/services/sentry#go-to-production) | A local error log in DevTools | `MONITORING_DSN` on the deployment and the host | `monitoring` |

Give each stage its own account or team where the service allows it: production's webhooks then never receive test events, and a leaked development key never reaches production.

### Notifications

Web push needs no account: the browsers' push services deliver it, signed with a key pair of the deployment's own. `npx nuxt-backend env push` generates `PUSH_PUBLIC_KEY` and `PUSH_PRIVATE_KEY` for the dev deployment, and `env push --prod` a pair of production's own, never copied from `.env.local` ([Send web push notifications](/docs/build/email/notifications/web-push)).

[Deploy in one command](/docs/ship/deploy/one-command), arriving in `0.2.0`, runs the production column of this table in one command, and reports each step under its capability.

## Recommended settings

`doctor --fix` applies the billing settings its findings recommend, after you confirm each one, and keeps the webhook endpoints of Polar and Resend healthy. Your catalog relies on settings that live in your Polar organization, not in your code: whether one customer can start the same trial twice, whether customers hear before a trial ends, whether the webhook endpoint is still enabled. `doctor` reads them and warns where one works against the app, and `doctor --fix` changes the ones it may through Polar's API.

### Before you start

- Billing set up against Polar's sandbox or production, with a token that may change the organization's settings ([Polar](/docs/services/polar#keys-and-environment)).
- A run of `npx nuxt-backend doctor --only billing` to see what it finds.

### What doctor reads

The billing findings read the organization's settings and warn, never fail. Each says what to change:

| Finding | Polar setting | Recommended |
|---|---|---|
| [`billing-trial-abuse`](/docs/reference/cli/diagnostics#billing-trial-abuse) | **Settings**, **Subscriptions**, prevent trial abuse | On, when a plan has a trial |
| [`billing-portal`](/docs/reference/cli/diagnostics#billing-portal) | Customer portal, plan changes | On |
| [`billing-proration`](/docs/reference/cli/diagnostics#billing-proration) | Default proration: invoice, prorate or next period | The one you mean: a choice, not a mistake |
| [`billing-benefit-grace`](/docs/reference/cli/diagnostics#billing-benefit-grace) | Benefit revocation after a failed payment: at once, or after 2 to 21 days | At once, so the package's past-due notice and the benefits agree |
| [`billing-multiple-subscriptions`](/docs/reference/cli/diagnostics#billing-multiple-subscriptions) | Allow multiple subscriptions per customer | Off |
| [`billing-promotion-portal`](/docs/reference/cli/diagnostics#billing-promotion-portal) | A forever discount on some plans, while the portal changes plans | Fix the discount's scope |

Polar's renewal reminders go out only for billing cycles of six months or more, and trial reminders three days before a trial ends ([Subscriptions](https://polar.sh/docs/features/subscriptions/introduction)).

### Let doctor fix them

```bash
npx nuxt-backend doctor --fix          # the dev deployment's provider accounts
npx nuxt-backend doctor --prod --fix   # production's
```

It names each change it would make, and applies one only once you confirm it at a terminal. Like every command, it runs unattended when told to: `--yes` confirms every change for a script or CI, and without a terminal or `--yes` each change is listed and left as it is. It needs the `BILLING_ACCESS_TOKEN` of the organization visible where it runs (the process env alone under `--prod`):

```bash
npx nuxt-backend doctor --fix --yes    # unattended
```

The changes it may make:

- **Trial abuse prevention** on, when a plan has a trial, so one customer cannot start the same trial again.
- **Trial reminders** on, so a customer hears from Polar before a trial turns into a charge.
- **Polar's customer emails** (receipts, renewals, payment failures, cancellations) back on, when one was turned off. It never turns one off: the package sends none of them ([Customer emails and notifications](/docs/build/billing/events/customer-emails)).

Everything else stays yours. It never touches seat settings, and the findings that report a choice rather than a mistake, such as proration, keep warning and say what each choice does.

### Healthy webhook endpoints

Two more checks, for Polar and for Resend alike:

- **The endpoint is enabled** ([`billing-webhook-enabled`](/docs/reference/cli/diagnostics#billing-webhook-enabled), [`email-webhook-enabled`](/docs/reference/cli/diagnostics#email-webhook-enabled)). Polar disables an endpoint after 10 failed deliveries in a row, and Resend one that keeps failing. `--fix` turns it back on only once its route on the deployment answers the probe, so an endpoint is never re-enabled into the same failure. It then points you to [replay](/docs/ship/operate/replay) what the provider held back while it was off.
- **The endpoint hears every event the package handles** ([`billing-webhook-events`](/docs/reference/cli/diagnostics#billing-webhook-events), [`email-webhook-events`](/docs/reference/cli/diagnostics#email-webhook-events)). One subscribed to fewer is reported with the events it misses, and `--fix` subscribes it to them after you confirm (for Resend, `email sync` does it).

Each is a finding of its own, under the `billing` and `email` capabilities, with its entry on [Diagnostics](/docs/reference/cli/diagnostics); the ids land with the feature. The same run also warns when a catalog product carries a Polar checkout link of its own, which would sell it outside the package's checkout.

### Re-sync every entitlement

The backend caches each billing entity's plans, features and credit balances, and keeps the cache fresh from Polar's events. After a [restore](/docs/ship/operate/backup), an import or a long webhook outage, a bulk re-sync reads every entity's state from Polar again, in batches, so nobody waits for their next event to see what they paid for. Backup, restore and import run it, and you can run it yourself; the exact command lands with the feature.

### Check it works

Run `npx nuxt-backend doctor --only billing` again: the findings it fixed pass.

### Related

- [Polar](/docs/services/polar): the account, the token and the webhook.
- [Diagnostics](/docs/reference/cli/diagnostics#billing): every billing finding, what it checks and its fix.
- [Set up billing](/docs/build/billing/setup#go-live): the production checklist these settings belong to.
- [Replay a webhook delivery](/docs/ship/operate/replay): send what an endpoint missed again.
- [Back up, restore and roll back](/docs/ship/operate/backup): where the bulk re-sync fits after a restore.
