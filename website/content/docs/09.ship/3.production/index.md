---
title: Prepare for launch
description: What `doctor --prod` fails on and what it can't see — the pre-launch list for auth, email, billing, webhooks, SITE_URL, and the agent surface.
kind: how-to
navigation:
  icon: i-lucide-list-checks
---

Run it first; then walk the rest.

```bash
CONVEX_DEPLOY_KEY=prod:... npx nuxt-backend doctor --prod
```

`--prod` turns the optional tier's *designed degradations* into failures — a live product without an email transport has broken sign-in. These findings escalate from `warn` to `fail`:

| Finding | What it means in production |
|---|---|
| `email-transport` / `deployment-email-api-key` | No `EMAIL_API_KEY` — sign-in codes to real addresses are refused. Nobody can sign in. |
| `email-webhook-secret` / `deployment-email-webhook-secret` | `/email/events` is fail-closed — delivery status never advances past `sent`. |
| `billing-access` / `deployment-billing-access-token` | No `BILLING_ACCESS_TOKEN` — pricing renders empty, checkout fails. |
| `billing-webhook-secret` / `deployment-billing-webhook-secret` | `/billing/events` is fail-closed — entitlements only refresh on demand. |
| `email-webhook-route` / `billing-webhook-route` | The probe found the route mounted but fail-closed (`503`), unreachable, or answering an unexpected status. |
| `deployment-auth-trust-local-origins` | The dev-only loopback trust flag is set on a non-dev deployment. Remove it: `npx convex env remove --prod AUTH_TRUST_LOCAL_ORIGINS`. |

Everything else keeps its normal severity: `deployment-auth-secret` / `deployment-site-url` always fail when missing, the route probes fail on `404` (not mounted) in any mode, `ai-stream-route` only ever warns on a `503`, `function-contract` fails on a trimmed scaffold export, and `invitation-path` on a Nuxt/Convex mismatch.

## The list

::steps{level="3"}

### Auth

- [ ] `AUTH_SECRET` is set on the production deployment and strong (32+ random bytes — never reuse the dev one). Rotating it later signs everyone out; see [Troubleshooting](/docs/ship/operate/troubleshooting#sessions-or-agent-tokens-fail-after-rotating-auth_secret).
- [ ] `SITE_URL` is the app's public origin (`https://app.example.com`) — the only trusted browser origin and the base of every emailed link.
- [ ] `AUTH_TRUST_LOCAL_ORIGINS` is **not** set.
- [ ] The first admin is minted: `npx convex run --prod functions:setUserRole '{"email":"you@example.com","role":"admin"}'`.

### Email

- [ ] `EMAIL_API_KEY` set; `EMAIL_FROM` is an address on a **verified** sending domain.
- [ ] `EMAIL_TEST_MODE=false` — otherwise only the provider's test addresses receive mail.
- [ ] The provider webhook points at `https://<slug>.convex.site/email/events` and `EMAIL_WEBHOOK_SECRET` matches its signing secret.

### Billing

- [ ] The catalog is synced to the production environment: `npx nuxt-backend billing sync --env production` (separate ids from sandbox; both live in `billing.generated.ts`).
- [ ] `BILLING_ENVIRONMENT=production` and a **production** organization access token in `BILLING_ACCESS_TOKEN`.
- [ ] The billing webhook points at `https://<slug>.convex.site/billing/events` and `BILLING_WEBHOOK_SECRET` matches (the sync provisions the endpoint and stores its secret on the production deployment).
- [ ] Pricing lists the products: the sync ran `billing:syncProducts` on production (if it reported it couldn't, run `npx convex run --prod billing:syncProducts`).
- [ ] `appConfig.backend.billing.plans` / `packs` keys match the catalog keys.

### Webhooks

- [ ] `doctor --prod` reports all three routes mounted and not fail-closed (`billing-webhook-route`, `email-webhook-route`, `ai-stream-route`).
- [ ] Custom `billingPath` / `emailPath` in `http.ts`? The dashboards point at the custom paths.
- [ ] Rotation plan: both secrets accept `new,old` comma lists — see [Security](/docs/ship/production/security#secret-rotation).

### Agents (MCP)

- [ ] Know the surface: an OAuth-protected `/mcp` endpoint where agents act as the signed-in user with consented scopes only.
- [ ] `SITE_URL` is correct: the OAuth flow, the consent page's redirects and the discovery documents are built on the app origin.
- [ ] An agent you connect yourself stops at the consent page, and a denial returns `access_denied` to it.

### App

- [ ] `NUXT_PUBLIC_BACKEND_URL` and `NUXT_PUBLIC_BACKEND_SITE_URL` on the host point at the production deployment (or `CONVEX_DEPLOYMENT=prod:<slug>`).
- [ ] Custom domains on the deployment? Both `NUXT_PUBLIC_BACKEND_*` URLs are set by hand (nothing derives from a custom domain) and the provider webhooks point at the custom HTTP-actions origin — see [Custom domains](/docs/ship/deploy#custom-domains).
- [ ] Pages that open live subscriptions are excluded from prerendering.
- [ ] No `swr`, `isr` or `cache` route rule covers the private pages: they are exempt at their exact paths only, and the module warns at startup when a wildcard rule reaches them (see [caches](/docs/ui/pages#caches)).
- [ ] With `@nuxtjs/robots` installed, the private pages answer `noindex`: `curl -sI https://app.example.com/settings | grep -i x-robots-tag` (see [search engines](/docs/ui/pages#search-engines)).
- [ ] `nuxt-security` is installed (it is, as a dependency of this package — the module registers it in every app) and the CSP was not disabled — see [Security](/docs/ship/production/security).

::

## After launch

`doctor` stays useful: run it against production after every env change, and read the DevTools Backend tab's webhook feed as an admin (or call `getWebhookDeliveries` as one) when a purchase or an email looks stuck — a `missing_secret`, `invalid_signature`, or `handler_error` outcome says exactly what to fix.
