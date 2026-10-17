---
title: Subscriptions
description: Plans, checkout, the customer portal, and plan changes — powered by the Polar component and linked to your auth users, with the reactive entitlement cache inside the backend component.
kind: how-to
playground: /playground/platform/billing
api: /docs/reference/api/use-billing
source: src/convex/integrations/billing.ts
navigation:
  icon: i-lucide-credit-card
---

`setupBilling(components, { email })` wires subscriptions, discounts, **prepaid credits**, and **gift purchases** via the [Polar](https://www.convex.dev/components/polar) component, linked to your auth users. The reactive **feature + credit cache** and the gift records live inside the all-in-one `backend` component (`components.backend.billing` / `components.backend.gifts`), so **you add nothing to your schema**. This page covers subscriptions; the siblings cover the [catalog](/docs/billing/catalog), [credits](/docs/billing/credits), [gifts](/docs/billing/credits/gifts), and [feature gating](/docs/billing/feature-gating).

## Server setup

`setupBilling` needs **one option**, `email`, the app's `setupEmail` instance, which sends the gift notification. The access token, environment, and webhook secret default to the `BILLING_ACCESS_TOKEN` / `BILLING_ENVIRONMENT` / `BILLING_WEBHOOK_SECRET` env vars, and the billing entity resolves from identity claims — the active workspace by default (`billTo: 'organization'`, so members share the workspace's plan and credits), or the signed-in user with `billTo: 'user'` for B2C apps. The scaffolded `billing.ts`, as generated:

```ts [backend/billing.ts]
import { setupBilling, type DiscountInput } from 'nuxt-backend/billing'
import { v } from 'convex/values'
import { components } from './_generated/api'
import { internalAction } from './_generated/server'
import { catalog } from './billing.generated'
import { email } from './email'

// The catalog id map (plans, packs, credit meters) comes from billing.generated.ts,
// written by `npx nuxt-backend billing sync`. Exported for ai.ts (metered actions spend through it).
export const billing = setupBilling(components, { catalog, email })

export const {
  generateCheckoutLink,
  generateCustomerPortalUrl,
  getConfiguredProducts,
  listAllProducts,
  listAllSubscriptions,
  changeCurrentSubscription,
  cancelCurrentSubscription,
  giftCheckout,
} = billing.api
export const {
  getCurrentSubscription,
  getFeatures,
  getCredits,
  syncEntitlements,
  syncProducts,
  getReceivedGifts,
  claimGift,
  getWebhookDeliveries,
  // Subscription lifecycle — each resolves the caller's own billing entity,
  // so a client can only ever act on its own subscription.
  updateSubscription,
  cancelSubscription,
  uncancelSubscription,
  pauseSubscription,
  resumeSubscription,
  // Order history, invoices and metered usage, read live from the provider —
  // this package keeps no local order or usage table.
  getOrders,
  getInvoiceUrl,
  getUsageHistory,
  // Admin-tier: gated by `setupBilling({ requireAdmin })`, which defaults to
  // an `admin` role claim on the caller's identity.
  refundOrder,
} = billing.functions
export const { webhookEvents } = billing

// Discounts are privileged — an internalAction, run from ops:
//   npx convex run billing:createDiscount '{"name":"Launch","percent":20}'
export const createDiscount = internalAction({
  args: { name: v.string(), percent: v.number(), code: v.optional(v.string()) },
  handler: async (ctx, { name, percent, code }) => {
    const basisPoints = Math.round(Math.min(Math.max(percent, 0), 100) * 100)
    const discount: DiscountInput = { type: 'percentage', name, code, duration: 'once', basisPoints }
    return billing.discounts.create(discount)
  },
})
```

::warning
Keep these exports. The composables bind to them by name (`useBilling` → `getConfiguredProducts` / `listAllSubscriptions` / `getCurrentSubscription` / `generateCheckoutLink` / …), and `npx nuxt-backend doctor` verifies the contract against the deployment — a trimmed export degrades the matching composable to `undefined`s.
::

`email` is the one required option; every other option overrides a default:

| Option | Effect |
|---|---|
| `email` | Required. The app's `setupEmail` instance: a paid gift's recipient hears of it through its `gift` [template](/docs/email/templates). `setupBilling` checks it when it runs, so an `email` that arrives undefined — an import cycle through `email.ts` does that despite the type — fails the deploy instead of the first paid gift. |
| `accessToken` · `environment` · `webhookSecret` | Override the `BILLING_ACCESS_TOKEN` / `BILLING_ENVIRONMENT` / `BILLING_WEBHOOK_SECRET` env vars. |
| `billTo` | Who owns subscriptions and credits: `'organization'` (the default — members share the workspace's plan and credits) or `'user'` (B2C apps without shared billing). |
| `resolveEntity` | Resolve the billing entity yourself, in place of the claims `billTo` reads: `(ctx) => Promise<{ userId, email } \| null>`, where `ctx` has `auth` and `runQuery`. One resolver serves every context — the reactive reads, checkout and the portal, spends and the subscription lifecycle. Return `null` when nobody is signed in: reads answer `null` and provider operations refuse. |
| `catalog` | The environment-keyed id map from `billing.generated.ts` — fills `products` and `credits` for the active `BILLING_ENVIRONMENT`. |
| `products` · `credits` | An explicit product map (catalog key → product id) and named credit meters (`spendCredits({ meter: 'credits' })`, `useCredits('credits')`). Explicit entries win over `catalog`. |
| `rateLimiter` | Your `setupRateLimiter(...)` instance. Throttles **every client-callable function that reaches the live provider** — `syncEntitlements`, `syncProducts`, checkout, the subscription-lifecycle actions, order history and invoices — against the `billingSync` limit (10/min, keyed by the workspace or user), so a caller can't loop one to amplify the provider fan-out. `giftCheckout` counts against the same limit, keyed by the purchaser. Omit to leave them unthrottled. |
| `multipleSubscriptions` | Let one entity hold several live subscriptions at once (a plan plus add-ons). Switches `getCurrentSubscription` to the array-first `CurrentSubscriptions` shape — `subscriptions` leads, and the primary subscription's fields ride alongside so `subscription.productId` / `.status` keep reading unchanged — and makes `subscriptionId` the way the lifecycle actions pick their target. Off, the upstream single-subscription read throws the moment a second one exists. |
| `requireAdmin` | Gate for the admin-tier actions (`refundOrder` — moving real money): throw to refuse. The default requires an `admin` role claim on the caller's identity; supply your own to check permissions, a workspace role, or an allowlist. |
| `events` | Webhook handlers keyed by the provider's own event names (`'order.paid'`, `'subscription.active'`, …). They run **after** the built-in entitlement-cache refresh and gift fulfilment, so features and credits read fresh inside them; events outside the built-in refresh set are mounted too. |
| `onUnknownEvent` | Called for an **authentic** (signature-verified) webhook event whose type the installed provider SDK cannot parse — one newer than the package, say. The delivery is acknowledged with 202 either way, so an unknown type never puts the endpoint into a retry loop. |

`setupBilling(...)` returns:

::field-group
  :::field{name="api"}
  Checkout / portal / product / subscription functions to re-export, plus `giftCheckout` (a checkout billed to someone else's email). `listAllSubscriptions` is wrapped to return `null` instead of throwing for claimless callers.
  :::

  :::field{name="functions"}
  Reactive functions to re-export so the composables work with zero wiring: `getCurrentSubscription` (→ `useBilling`), `getFeatures` (→ `useFeatures`), `getCredits` (→ `useCredits`), `getReceivedGifts` / `claimGift` (→ `useGifts`), `syncEntitlements` (refresh the cache on demand), `syncProducts` (pull the provider's product catalog into the reactive products table — fresh deployments render empty pricing until it runs once; webhooks keep it fresh afterwards), `getWebhookDeliveries` (the delivery log behind DevTools; admins only, `null` for anyone else), the subscription lifecycle actions `updateSubscription` / `cancelSubscription` / `uncancelSubscription` / `pauseSubscription` / `resumeSubscription`, the live provider reads `getOrders` / `getInvoiceUrl` (→ `useOrders`, `<BillingHistory>`) and `getUsageHistory` (→ `useUsage`, `<UsageHistory>`), and the admin-tier `refundOrder`.
  :::

  :::field{name="forgetEntity"}
  `forgetEntity(ctx, userId)` drops one entity's cached entitlements (plans, benefits, credit balances, reservations) — the app-side erasure step for account deletion, called from the `onUserDeleted` auth hook with the deleted user's id, or with a dissolved workspace's id. The provider's customer record is untouched.
  :::

  :::field{name="webhookEvents / webhookHandler"}
  Typed handlers over the provider's full event catalog that keep the cache fresh (subscriptions, benefit grants, credit balances), patch benefit metadata, and fulfil gifts — and the guarded endpoint [`registerBackendRoutes`](/docs/ship/production/webhooks) mounts at `/billing/events`.
  :::

  :::field{name="spendCredits · reserveCredits · settleSpend · releaseSpend · refundCredits"}
  The prepaid-credit primitives — see [Credits & top-ups](/docs/billing/credits).
  :::

  :::field{name="updateSubscription · cancelSubscription · uncancelSubscription · pauseSubscription · resumeSubscription"}
  The same lifecycle operations as server-side methods, for your own actions. These accept the full `proration` set (`invoice`, `prorate`, `next_period`, `reset`); the registered action deliberately accepts only `invoice` / `prorate` from a client, because `next_period` and `reset` hand over a new plan immediately while deferring or waiving the charge.
  :::

  :::field{name="getOrders · getInvoiceUrl · getUsageHistory · refundOrder"}
  Order history, invoice URLs and metered consumption, read live from the provider — there is no local order or usage table, because the provider already is the ledger. Each returns `null` when no access token is configured. `refundOrder` is admin-tier (`requireAdmin`).
  :::

  :::field{name="getCustomerState · resolveEntity · discounts"}
  Live customer state, the caller's billing entity resolved the way every billing function resolves it, and discount management (`discounts.create` / `.list` / `.remove` — privileged, so server-side methods rather than registered functions).
  :::
::

## Reading subscription state

```vue
<script setup lang="ts">
const billing = useBilling()
// billing.products      — configured products keyed by catalog key (name, id, prices live from the provider)
// billing.subscription  — the active subscription, null on the free plan, undefined while loading
// billing.subscriptions — every subscription incl. ended/expired trials
// billing.isSubscribed / billing.isFree / billing.isLoading
// billing.status        — the provider status (active, trialing, past_due, paused, …)
// billing.cancelAtPeriodEnd / billing.trialEnd / billing.isTrialing / billing.isPaused
</script>

<template>
  <p v-if="billing.isSubscribed.value">On {{ billing.subscription.value?.productId }}</p>
</template>
```

Signed-out visitors are simply on the free plan: the user-scoped queries are skipped and `subscription` resolves to `null`.

## One email, one billing profile

The billing provider keys its customers by email, and checkout resolves the paying entity's customer from the email of the member who starts it: the customer already mapped to the entity, else the one carrying that email, else a new one. The first entity to check out under an email owns its customer — every customer the package binds carries the entity's id in its metadata.

In workspace mode one member's email can stand behind several workspaces, and a customer shared between two of them would merge them: one set of benefits and credits, and a single-subscription read that throws once both subscribe. So a checkout never adopts a customer that already pays for another entity. It refuses with `forbidden` (reason `customer_taken`) and a message the UI can show — the email already pays for another workspace, and a checkout from a member with a different email gives this one its own. The same holds per account with `billTo: 'user'`, where it only meets an email that moved between accounts. One customer per billing entity, keyed by the entity rather than the email, is planned for a later release.

## Environment

| Variable | Purpose |
|---|---|
| `BILLING_ACCESS_TOKEN` | The provider organization access token — unset, billing queries return empty and checkout actions fail on invocation |
| `BILLING_WEBHOOK_SECRET` | Verifies webhooks on `/billing/events` — unset, events are rejected (503) and entitlements refresh only on demand |
| `BILLING_ENVIRONMENT` | `sandbox` (the default) or `production` |

All three are optional at deploy time and forwarded from `.env.local` by `npx nuxt-backend env push`; see the [configuration reference](/docs/reference/configuration/environment-variables#convex-deployment-variables).

## Next

::card-group
  :::card{icon="i-lucide-shopping-cart" title="Open checkout and the portal" to="/docs/billing/subscriptions/checkout"}
  Subscribe, top up, change or cancel a plan.
  :::

  :::card{icon="i-lucide-ticket-percent" title="Offer discounts" to="/docs/billing/subscriptions/discounts"}
  Mint discounts on the server; customers type codes at checkout.
  :::

  :::card{icon="i-lucide-receipt" title="Show orders, invoices and usage" to="/docs/billing/subscriptions/orders"}
  Past charges, invoice links, metered consumption and refunds.
  :::
::
