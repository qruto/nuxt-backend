---
title: "Billing and credits"
description: "Plans, credit packs and feature benefits declared as code and synced to Polar, with checkout, webhooks, a live entitlement cache, gates and credit spends."
kind: landing
playground: /playground/platform/billing
api: /docs/reference/api/billing
source: src/convex/integrations/billing.ts
navigation:
  title: Overview
  icon: i-lucide-compass
---

Billing runs on [Polar](https://polar.sh) through its Convex component, linked to your auth users. You declare meters, plans, credit packs and feature benefits in one TypeScript file. The provider hosts checkout and the customer portal, grants the benefits, and keeps the record of orders, invoices and usage. The package keeps a reactive cache of each customer's plans, benefits and credit balances inside the `backend` component, so they read live in the app with nothing added to your schema.

By default the active workspace pays: its members share one plan and one credit balance. Set `billTo: 'user'` on `setupBilling` to bill each signed-in user instead, for apps without shared billing. See [Server setup](/docs/billing/subscriptions#server-setup).

## How it fits together

1. **Catalog.** Declare meters, plans, packs and features in `backend/billing.catalog.ts` with `defineBillingCatalog`. A plan's credits and features become benefits attached to its product: the provider grants plan credits every billing cycle and a pack's credits once at purchase. See [Declare](/docs/billing/catalog#declare).
2. **Sync.** `npx nuxt-backend billing sync` creates what the provider is missing, writes the id map to `backend/billing.generated.ts` so provider ids stay out of your code, and provisions the `/billing/events` webhook endpoint. It only creates: nothing remote is updated or deleted. See [Sync](/docs/billing/catalog#sync).
3. **Checkout.** `useBilling().checkout()` opens the provider's checkout for a plan, `useCredits().topUp()` for a credit pack, and `portal()` opens the customer portal for payment methods and invoices. The `/pricing` page lists plans and packs with prices read live. See [Checkout, portal, plan changes](/docs/billing/subscriptions/checkout).
4. **Webhook.** The provider posts order, subscription and benefit-grant events to `/billing/events`, verified with `BILLING_WEBHOOK_SECRET`. Until the secret is set the endpoint answers `503` and entitlements refresh only on demand. See [Webhooks](/docs/ship/production/webhooks).
5. **Entitlement cache.** Each event refreshes the paying entity's active plans, granted benefits and meter balances in the `backend` component, and every query that reads them updates. See [Where grants come from](/docs/billing/feature-gating#where-grants-come-from).
6. **Gate and spend.** `useFeatures()` and `<FeatureBoundary>` gate the UI by feature key or plan, and your functions check the same cache before doing the work. Server code draws down a prepaid balance with `spendCredits`, or splits the spend into reserve, run and settle so a failed run is released and costs nothing. See [Feature gating](/docs/billing/feature-gating) and [Spending on the server](/docs/billing/credits/spending).

For metered AI calls, [`ai.meteredAction`](/docs/ai/metered-actions) wraps the same spend with rate limiting.

## In this section

::card-group
  :::card{icon="i-lucide-file-code-2" title="Catalog as code" to="/docs/billing/catalog"}
  Declare meters, plans, packs and features, push them with `billing sync`, and read the generated id map.
  :::

  :::card{icon="i-lucide-lock-keyhole-open" title="Feature gating" to="/docs/billing/feature-gating"}
  Gate UI and functions by granted benefits and active plans with `useFeatures` and `<FeatureBoundary>`.
  :::

  :::card{icon="i-lucide-credit-card" title="Subscriptions" to="/docs/billing/subscriptions"}
  Set up `setupBilling`, read subscription state, and run checkout, the portal, plan changes and order history.
  :::

  :::card{icon="i-lucide-coins" title="Credits & top-ups" to="/docs/billing/credits"}
  Read balances with `useCredits`, sell top-ups, and spend credits with reserve, run and settle.
  :::

  :::card{icon="i-lucide-gift" title="Gifts" to="/docs/billing/credits/gifts"}
  Buy a credit pack for someone else by email; they sign in and claim it into their own account.
  :::
::

## Not covered here

- **Per-seat pricing.** A subscription belongs to the paying workspace or user as a whole; the package does not bill per member.
- **A local ledger.** Orders, invoices and usage history are read live from the provider; the package keeps no order or usage table of its own.
- **Editing provider objects from code.** `billing sync` never updates or deletes. A product whose name or price no longer matches the catalog is reported as drift: change prices in the provider's dashboard, or rename the key to publish a new product.
