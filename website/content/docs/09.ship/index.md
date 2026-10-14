---
title: "Ship to production"
description: "Take an app from its dev deployment to production: test, split the env, register webhooks, deploy, and gate the launch on doctor --prod."
kind: landing
navigation:
  title: Overview
  icon: i-lucide-compass
---

A production deploy is two things: the Convex deployment, with its functions, components and its own env, and the Nuxt app on your host, pointed at that deployment. This section takes you from the dev deployment you build against to both halves in production, with billing and email switched to their production modes and the webhooks registered. `npx nuxt-backend doctor --prod` is the gate: configuration a live product can't run without fails there instead of warning. The production pages then cover the security model, rate limits and webhooks, and Troubleshooting indexes fixes by symptom.

## How it fits together

1. **Test and lint the backend.** Register the packaged `backend` component in `convex-test` with [Testing](/docs/ship/test), and apply Convex's lint rules to your functions directory with [Linting](/docs/ship/test/linting).
2. **Split the env.** The host gets the public URLs and a production deploy key; the deployment gets `AUTH_SECRET`, `SITE_URL` and the email and billing variables. `npx nuxt-backend env push --prod` forwards them from `.env.local` and fails on a missing required variable. See [The env split](/docs/ship/deploy#the-env-split).
3. **Switch the providers to production.** Sync the billing catalog with `billing sync --env production`, set `BILLING_ENVIRONMENT=production`, and set `EMAIL_TEST_MODE=false` once the sending domain is verified. See [Billing and email in production](/docs/ship/deploy#billing-and-email-in-production).
4. **Register the webhooks.** Point the billing and email provider dashboards at `/billing/events` and `/email/events` on the `.convex.site` origin, with signing secrets that match the deployment's. Until they match, both routes reject every delivery. See [Webhooks](/docs/ship/production/webhooks#point-the-provider-dashboards-at-them).
5. **Deploy both halves.** Set the host's build command to `npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name NUXT_PUBLIC_BACKEND_URL`. It pushes the backend first, then builds the app with the production URL in its environment. See [Deployment](/docs/ship/deploy#one-command-on-any-host).
6. **Gate the launch on `doctor --prod`.** It checks the production deployment, fails on a missing email transport, billing token or webhook secret, and probes the webhook routes. Then walk the rest of the [Checklist](/docs/ship/production), and review [Security](/docs/ship/production/security) and [Rate Limiting](/docs/ship/production/rate-limits) before you open sign-ups.
7. **Keep it running.** Run `doctor` again after every env change, and read the webhook delivery log when a purchase or an email looks stuck. See [After launch](/docs/ship/production#after-launch) and [Troubleshooting](/docs/ship/operate/troubleshooting).

## Test

::card-group
  :::card{icon="i-lucide-flask-conical" title="Testing" to="/docs/ship/test"}
  Register the backend component in `convex-test`, and test app code with `@nuxt/test-utils`.
  :::

  :::card{icon="i-lucide-list-checks" title="Linting" to="/docs/ship/test/linting"}
  Convex's official lint rules for your functions directory, as one ESLint preset.
  :::
::

## Deploy

::card-group
  :::card{icon="i-lucide-rocket" title="Deployment" to="/docs/ship/deploy"}
  One build command on any host, the env split, preview deployments, custom domains and self-hosted Convex.
  :::
::

## Production

::card-group
  :::card{icon="i-lucide-clipboard-check" title="Checklist" to="/docs/ship/production"}
  What `doctor --prod` fails on, and the pre-launch list for what it can't see.
  :::

  :::card{icon="i-lucide-shield-check" title="Security" to="/docs/ship/production/security"}
  The Content Security Policy, fail-closed webhooks, secret rotation, and what OAuth consent lets an agent do.
  :::

  :::card{icon="i-lucide-gauge" title="Rate Limiting" to="/docs/ship/production/rate-limits"}
  The default limits on sign-in codes, billing syncs, metered AI, agents, admin actions and invitations, and how to change them.
  :::

  :::card{icon="i-lucide-webhook" title="Webhooks" to="/docs/ship/production/webhooks"}
  Every inbound route mounted in one call, where to point the provider dashboards, and how to react to events.
  :::
::

## Operate

::card-group
  :::card{icon="i-lucide-life-buoy" title="Troubleshooting" to="/docs/ship/operate/troubleshooting"}
  Fixes indexed by symptom, from unresolved components to an OTP that never arrives.
  :::
::

## Releases

::card-group
  :::card{icon="i-lucide-history" title="Changelog" to="/docs/ship/releases/changelog"}
  Every release, newest first: what changed and what broke.
  :::

  :::card{icon="i-lucide-shield-check" title="Stability" to="/docs/ship/releases/stability"}
  What a version number promises, and which parts are still experimental.
  :::
::

## Migrate

::card-group
  :::card{icon="i-lucide-arrow-up-circle" title="Upgrade to 0.2" to="/docs/ship/migrate/upgrade"}
  Every change that needs an edit in your app, with the edit to make.
  :::
::
