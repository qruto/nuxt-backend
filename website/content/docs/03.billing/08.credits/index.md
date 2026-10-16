---
title: Credits & top-ups
description: Prepaid credits on provider meters — useCredits, top-ups, and the reserve → run → settle spend that never charges for a failed run.
kind: how-to
navigation:
  icon: i-lucide-coins
---

Credits are the provider's native model: a **credit pack** is a one-time product whose meter-credit benefit tops up a **meter balance**; a **plan** can grant credits every cycle the same way. Both are declared in the [catalog](/docs/billing/catalog). The balance is drawn down by server-side spends, and the reactive cache inside the `backend` component keeps every balance live in the app.

## Reading and buying credits

```vue
<script setup lang="ts">
const { products } = useBilling()
const credits = useCredits('credits')   // a catalog meter key (or a raw meter id); default: the entity's first meter
</script>

<template>
  <p>{{ credits.balance.value ?? '—' }} left · {{ credits.credited.value }} credited · {{ credits.consumed.value }} consumed</p>
  <button v-if="products?.credits500" @click="credits.topUp(products.credits500.id)">Buy 500 credits</button>
  <button @click="credits.refresh()">Refresh</button>
</template>
```

::field-group
  :::field{name="balance / credited / consumed" type="ComputedRef<number | undefined>"}
  The meter's remaining, granted, and consumed units — `undefined` while loading, `0` when the meter has no grants yet.
  :::

  :::field{name="overage" type="ComputedRef<number | undefined>"}
  Units consumed past what was credited — what a pay-as-you-go meter has run up this cycle and the provider will invoice. `0` for a meter still in prepaid credit.
  :::

  :::field{name="cycle" type="ComputedRef<{ start?, end? } | null | undefined>"}
  The billing period the credited units belong to — the granting subscription's current period, since a meter has no period of its own in the provider's model. `null` for credits bought as a one-time pack, which have no cycle at all.
  :::

  :::field{name="expiresAtCycleEnd" type="ComputedRef<boolean | undefined>"}
  Whether the remaining balance is lost at `cycle.end`. Only `true` when the granting meter-credit benefit is known **not** to roll over — the provider reports rollover on the benefit, which is read on the syncs that refresh benefit metadata, so an unknown rollover reads as `false` rather than a guess.
  :::

  :::field{name="meterId" type="ComputedRef<string | undefined>"}
  The resolved provider meter id — pass it to a raw `spendCredits({ meterId })` if you don't name meters.
  :::

  :::field{name="isLoading" type="ComputedRef<boolean>"}
  `true` until the balances have loaded.
  :::

  :::field{name="topUp(productIds, options?)"}
  A checkout for the pack(s) — the same `CheckoutOptions` as `useBilling().checkout`; opens in a new tab unless `redirect: true`.
  :::

  :::field{name="gift(productIds, { recipientEmail, message? })"}
  Buy a pack for someone else — see [Gifts](/docs/billing/credits/gifts).
  :::
::

Two shipped components sit on top of it: `<CreditsLowBanner>` nudges a top-up once the balance falls under `appConfig.backend.billing.lowCreditsThreshold` (or its own `threshold` prop), and `<UsageHistory meter="credits" />` renders the consumption history from `useUsage()` — the provider's own event log, since this package keeps no local usage ledger.

::field-group

  :::field{name="refresh()"}
  Runs `syncEntitlements` to re-read the provider state (throttled by the `billingSync` limit when a `rateLimiter` is configured).
  :::
::

Balances arrive through the `benefit_grant.*` / `customer.state_changed` webhooks, so after a top-up the balance updates on its own; `refresh()` is the on-demand fallback (and what makes a mid-configuration deployment without `BILLING_WEBHOOK_SECRET` still usable).

## Spending

Credits are spent on the server, never from the browser: see [Spend credits in your functions](/docs/billing/credits/spending).

## The settings page

`<WorkspaceSettings>` (the `/settings` page) renders the credits section — balance, the packs from `appConfig.backend.billing.packs`, and a top-up button per pack — over exactly these composables; replace it through its `credits` slot.

::playground-link{to="/playground/platform/credits" label="credits"}
::

::playground-link{to="/playground/platform/history" label="usage history and the low-credits banner"}
::
