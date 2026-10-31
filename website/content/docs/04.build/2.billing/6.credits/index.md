---
title: Sell credits and top-ups
description: "Prepaid credits on provider meters: read balances with useCredits, sell packs as top-ups, warn before the balance runs out, and offer the right pack when a call is refused for lack of credits."
kind: how-to
capability: billing
demo: true
playground: /playground/settings
api: /docs/reference/api/use-credits
source: src/runtime/vue/composables/use-credits.ts
navigation:
  icon: i-lucide-coins
---

Credits let you charge for what people use: a generated strip, a render, an export. You sell them in packs, any plan (the [free plan](/docs/build/billing/catalog#the-free-plan) included) can grant an allowance every cycle, and your server spends them per action ([Spend credits in your functions](/docs/build/billing/credits/spending)).

- **Polar does natively:** meters that count usage events, and a Credits benefit that tops up a meter balance, once for a pack and every cycle for a plan, with optional rollover (checked on 2026-10-25).
- **The package adds:** packs and allowances declared in the [catalog](/docs/build/billing/catalog), a reactive balance in the `backend` component, a low-balance notice, and the pack that covers what a refused call needed.

A **credit pack** is a one-time product whose credit benefit tops up a **meter balance**, and a plan grants credits every cycle the same way.

::demo-credits

## Read the balance and buy a pack

`useCredits()` reads one meter's balance, live, and `topUp()` opens a checkout for a pack:

```vue [app/pages/credits.vue]
<script setup lang="ts">
const { products } = useBilling()
const credits = useCredits({ meter: 'credits' })   // a catalog meter key (or a raw meter id); default: the entity's first meter
</script>

<template>
  <p>{{ credits.balance.value ?? '…' }} left · {{ credits.credited.value }} credited · {{ credits.consumed.value }} used</p>
  <button v-if="products?.credits500" type="button" @click="credits.topUp(products.credits500.id)">Buy 500 credits</button>
  <button type="button" @click="credits.refresh()">Refresh</button>
</template>
```

::field-group
  :::field{name="balance / credited / consumed" type="ComputedRef<number | undefined>"}
  The meter's remaining, granted and consumed units: `undefined` while loading or when the read failed, `0` when the meter has no grants yet, the workspace no billing record, or nobody is signed in.
  :::

  :::field{name="overage" type="ComputedRef<number | undefined>"}
  Units consumed past what was credited: what a pay-as-you-go meter has run up this cycle, which the provider will invoice. `0` for a meter still in prepaid credit.
  :::

  :::field{name="cycle" type="ComputedRef<{ start?, end? } | null | undefined>"}
  The billing period the credited units belong to: the granting subscription's current period, since a meter has no period of its own in the provider's model. `null` for credits bought as a one-time pack, which have no cycle.
  :::

  :::field{name="expiresAtCycleEnd" type="ComputedRef<boolean | undefined>"}
  Whether the remaining balance is lost at `cycle.end`. `true` only when every benefit crediting the meter is known not to roll over: a pack bought on top of a plan's monthly allowance keeps its credits, so that balance never reads as expiring. The provider reports rollover on the benefit, which the syncs that refresh benefit metadata read, so an unknown rollover reads as `false` rather than a guess.
  :::

  :::field{name="meterId" type="ComputedRef<string | undefined>"}
  The resolved provider meter id. Pass it to a raw `spendCredits({ meterId })` if you don't name meters.
  :::

  :::field{name="isLoading / isPending" type="ComputedRef<boolean>"}
  `isLoading` is `true` until the balances have loaded (`false` once the read failed); `isPending` while `topUp` or `refresh` runs.
  :::

  :::field{name="error" type="ComputedRef<BackendError | null>"}
  Why the last action failed, else why the balances could not be read, else `null`, as [Composable conventions](/docs/reference/nuxt/conventions) describes. The balance read never throws; the actions reject with the failure and keep it here.
  :::

  :::field{name="topUp(productIds, options?)"}
  A checkout for the pack or packs, with the same `CheckoutOptions` as `useBilling().checkout`. Opens in a new tab unless `redirect: true`.
  :::

  :::field{name="refresh()"}
  Runs `syncEntitlements` to read the provider's state again, throttled by the `billingSync` limit when a `rateLimiter` is configured. Rejects with the package's setup sentence when the backend does not export it.
  :::
::

Balances arrive through the `benefit_grant.*` and `customer.state_changed` webhooks, so a balance updates on its own after a top-up. `refresh()` is the on-demand fallback, and what keeps a deployment without `BILLING_WEBHOOK_SECRET` usable, such as a local one the provider's webhooks can't reach. To buy a pack for someone else, see [Send and receive gifts](/docs/build/growth/offers/gifts).

## Warn before the balance runs out

The low-balance notice nudges a top-up once the balance falls under `appConfig.backend.billing.lowCreditsThreshold` (10 by default). Its button buys the smallest pack on sale that covers the gap to the threshold (`usePricing().packFor`), and only a member who buys credits for the workspace sees it.

```ts [app/app.config.ts]
export default defineAppConfig({
  backend: {
    billing: { lowCreditsThreshold: 25 },
  },
})
```

The low-credits notice of [`<BackendNotices>`](/docs/build/ui/notices), placed once in your layout, says when the balance runs low, with no code of yours. `<UsageHistory meter="credits" />` renders the consumption history from `useUsage()`, the provider's own event log, since the package keeps no usage ledger.

## Grant credits every month on a yearly plan

Polar can run a plan's meter on its own cycle, separate from the billing interval: its meter cycle (`meter_interval` on the product, released 2026-10-21, checked on 2026-10-25). A yearly plan then charges once a year and grants its credits every month. Declare it with `meterCycle` on the plan:

```ts [backend/billing.catalog.ts]
plans: {
  creator: {
    name: 'Creator',
    prices: { month: 1200, year: 12000 },
    credits: { meter: 'credits', units: 500 },   // 500 a month, on both prices
    meterCycle: 'month',                          // the yearly price grants monthly too
  },
},
```

`billing sync` sets the meter cycle on the plan's yearly product. At the end of each meter period, Polar does three things:

1. It invoices the period's usage past the allowance as a separate order, when the plan has a [usage price](/docs/build/billing/subscriptions/overage).
2. It resets the customer's meters.
3. It grants the Credits benefit again, carrying unused credits over when the benefit has `rollover`.

What changes for your app:

- **The yearly card reads per month.** `/pricing` shows "500 credits / month" on both prices, and `useCredits().cycle` is the meter period, not the year.
- **A switch to monthly no longer waits for the year's end.** Nothing was granted ahead, so a yearly subscriber changes plans like any other.
- **A failed payment pauses the cycle.** While the subscription is past due, Polar invoices nothing, resets nothing and grants nothing. Usage keeps being recorded, and the first period after recovery is invoiced and granted in one go.
- **Meter periods never end mid-renewal.** At renewal, the last period is invoiced with the base price, and the meter cycle starts again from the new billing period.

## Out of credits

A call refused for `insufficient_credits` carries `need` and `balance` ([Errors](/docs/reference/backend/errors#insufficient_credits)). Offer the smallest pack that covers the difference: `usePricing().packFor(need - balance)` picks it from the live prices.

```vue [app/components/OutOfCredits.vue]
<script setup lang="ts">
const props = defineProps<{ need: number, balance: number }>()
const { packFor } = usePricing()
const { topUp } = useCredits()
const { canManage } = useBilling()
const pack = computed(() => packFor(props.need - props.balance, 'credits'))
</script>

<template>
  <p role="alert">This generation needs {{ need }} credits, and {{ balance }} are left.</p>
  <button v-if="canManage && pack" type="button" @click="topUp(pack.productId)">Buy {{ pack.name }}</button>
  <NuxtLink v-else to="/pricing">See plans and credit packs</NuxtLink>
</template>
```

Read the refusal with `getBackendError(error)` where the call fails, and render the component when its `code` is `insufficient_credits`. A member who buys no credits for the workspace gets the link to the pricing page instead of a checkout.

## The settings page

`<WorkspaceSettings>` (the `/settings` page) renders a credits section over these composables: the balance, the packs from `appConfig.backend.billing.packs`, and a top-up button per pack. Replace it through its `credits` slot.

The demo's [settings page](/playground/settings) shows the balance, the packs and the usage history.

## What happens when…

- **A spend finds too few credits.** It is refused as [`insufficient_credits`](/docs/reference/backend/errors#insufficient_credits) with `need` and `balance`, and nothing is charged: see [Out of credits](#out-of-credits).
- **A top-up's webhook is late.** The balance reads the last state Polar reported. The return from checkout refreshes it once, and `refresh()` pulls it on demand.
- **The balance can't be read.** `balance` stays `undefined` and `error` says why. Nothing on the page offers a spend it can't check.
- **A pack is refunded with its benefits.** A refund with `revokeBenefits` revokes the pack's grant, and its credits leave the balance with the `benefit_grant.revoked` delivery ([Refunds](/docs/build/billing/subscriptions/orders#refunds)).

## Limits

- **No auto top-up.** A balance grows only when someone buys a pack.
- **No transfers.** Credits stay with the billing entity that holds them. A gift buys a pack for someone else instead ([Send, receive and manage gifts](/docs/build/growth/offers/gifts)).
- **Rollover is a benefit setting.** A changed rollover applies only to credits granted after the change (Polar, checked on 2026-10-25).
- **Credits are not money.** They are units of service on a Polar meter, never a stored value the app holds.

## Test it

`createBackendMock` from `nuxt-backend/test-utils` answers the balance read, so a page renders each state with no deployment:

```ts [test/app/credits.test.ts]
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { createBackendMock, resetBackendMock } from 'nuxt-backend/test-utils'
import { afterEach, expect, test } from 'vitest'
import CreditsPage from '~/pages/credits.vue'

afterEach(() => resetBackendMock())

test('the page shows what is left', async () => {
  createBackendMock({
    queries: {
      'billing:getCredits': { meters: [{ meterId: 'meter_1', name: 'credits', consumedUnits: 480, creditedUnits: 500, balance: 20 }] },
    },
  })
  const page = await mountSuspended(CreditsPage)
  expect(page.text()).toContain('20 left')
})
```

On Polar's sandbox, buy a pack on `/pricing` with the test card `4242 4242 4242 4242` and watch the balance move ([Develop with real sandboxes](/docs/develop/sandboxes#billing-on-polars-sandbox)).

## Related

- [Polar](/docs/services/polar): the account, the sandbox and its test card.
- [Spend credits in your functions](/docs/build/billing/credits/spending): `spendCredits`, reserve, run and settle, and refunds on a sum meter.
- [Choose a pricing model](/docs/build/billing/pricing-models#prepaid-credits): packs, allowances and usage beyond the plan.
- [Meter an AI action](/docs/build/ai/metered-actions): AI calls that spend credits, with rate limits and budgets.
- [`useCredits` reference](/docs/reference/api/use-credits): every field and option.
