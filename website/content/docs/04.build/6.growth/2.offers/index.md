---
title: Run a promotion
description: "Declare a discount in the catalog, as a public code or one only your server applies, push it with billing sync, apply it at checkout by its key, pick one per customer, put one on a subscription, and show its real terms on the pricing page."
kind: how-to
capability: billing
playground: /playground/pricing
api: /docs/reference/api/billing
source: src/convex/catalog.ts
navigation:
  title: Promotions
  icon: i-lucide-badge-percent
---

A promotion gives a group of customers a better price for a while: a launch offer for Panels, founder pricing, a win-back discount. You declare it in `backend/billing.catalog.ts` next to the plans it is for, and your code names it by its key.

- **Natively:** Polar's discounts take a percentage or an amount off one payment, some months or every payment. Polar counts redemptions, holds each customer to a per-customer limit (`max_redemptions_per_customer`) and closes a discount at its end date (checked on 2026-10-25).
- **The package adds:** promotions declared as code and pushed with `billing sync`, kept in line without rewriting what a customer holds, applied by key at checkout or on a subscription, picked per customer on the server, and shown with their real terms on the pricing page.

## Declare it

```ts [backend/billing.catalog.ts]
export default defineBillingCatalog({
  plans: {
    pro: { name: 'Pro', prices: { month: 2900, year: 29000 } },
    studio: { name: 'Studio', prices: { month: 9900 } },
  },
  discounts: {
    // Public: anyone with the code can use it, and a campaign link carries it.
    launch: {
      name: 'Launch offer',
      percentOff: 20,
      duration: { months: 3 },
      code: 'LAUNCH20',
      maxRedemptions: 500,
      perCustomer: 1,
      endsAt: '2027-01-31T23:59:59Z',
      products: { plans: ['pro'], interval: 'month' },
    },
    // Only your server applies it: no code to type or share.
    founder: {
      name: 'Founder pricing',
      percentOff: 30,
      duration: 'forever',
      perCustomer: 1,
      endsAt: '2027-03-01T00:00:00Z',
      products: { plans: ['pro', 'studio'] },
    },
  },
})
```

Each field maps to the provider's discount:

- **`percentOff` or `amountOff`**: a percentage with up to two decimals, or a fixed amount in cents. Give an amount per currency (`{ usd: 500, eur: 450 }`) when the products are priced in several: the provider takes nothing off in a currency the amount leaves out, so the sync refuses that.
- **`duration`**: `'once'` discounts the first payment, `'forever'` every payment while the subscription lasts, and `{ months: 3 }` the payments of the first three months. A yearly price is paid once a year, so `once` covers a whole year. A month count on a yearly price must be whole years (`12`, `24`), or limit the discount to monthly prices with `products.interval: 'month'`, as `launch` does.
- **`products`**: the plans (all their prices, or one `interval`) and the packs it applies to. A discount never applies to every product. A product it does not list, a gift product and a product made later are never discounted.
- **`code`**: 3 to 64 letters and digits. A discount with a code is public: a customer types it at checkout, a [campaign link](/docs/build/growth/offers/campaign-links) carries it, and a client may name it by its key. Without a code, only your server applies it.
- **`maxRedemptions`, `perCustomer`**: how often it may be redeemed in all, and by one customer. `perCustomer` is Polar's `max_redemptions_per_customer`. The provider matches a customer by id, by email without plus aliases, and by card.
- **`startsAt`, `endsAt`**: when it can first and last be redeemed, as ISO date-times. `endsAt` closes the offer, not the discount: whoever redeemed it keeps it for its duration.

## Push it

```bash
npx nuxt-backend billing sync
```

```text
  created      discount  launch (disc_…)
  updated      discount  launch (disc_…)  at most 1 per customer
  created      discount  founder (disc_…)
  updated      discount  founder (disc_…)  at most 1 per customer
```

The sync finds each discount again by its key and keeps it in line in place:

- **Patched**: its name, code, dates, `maxRedemptions`, per-customer limit and products, whenever the catalog moves them. Its amount and months too, while nobody has redeemed it.
- **Drift**: a changed type or duration, or an amount or month count changed after a redemption. The provider keeps those, so the sync reports them and changes nothing. Publish new terms under a new key and retire the old one.
- **Retired**: `retired: true` ends the discount now and frees its code, in the same run that can create a new key with that code. Whoever redeemed it keeps it for its duration.
- **Refused before anything is created**: a discount for no products, for the free plan, or for a plan that is retired or missing; a code that is not 3 to 64 letters and digits, or that two discounts share; a 100% forever discount with a code, which would give the plan away to whoever finds the code; months that are not whole years on a yearly price.
- **Warned**: a public code without `perCustomer`, `maxRedemptions` or `endsAt`, which coupon sites will find; an `endsAt` moved later after the promotion started, since a deadline that moves is not a real one.

`billing.generated.ts` then holds each promotion's id and terms per environment. Checkout applies a promotion by them, and the pricing page shows them. A discount whose key left the catalog stays redeemable and reads as `drift`, so retire it instead of deleting the key. `doctor` checks the same limits (`billing-promotion-limits`), and `doctor --prod` asks for each promotion's production id.

The provider's per-customer limit is newer than the provider SDK the package builds on. The sync sets it with one direct request to the provider's API, pinned to an API version that has it.

## Show it on the pricing page

```vue [app/pages/pricing.vue]
<template>
  <PricingTable discount="launch" />
</template>
```

Each price the promotion applies to shows what it takes off, for how long and the regular price after it ("20% off for 3 months, then $29/mo"), under the promotion's name. It also shows when the offer ends ("Offer ends Jan 31, 2027"). The regular price stays the price shown: no struck-through price that was never charged, no countdown and no count of what is left. The line shows between `startsAt` and `endsAt` by the page's own clock, and subscribing from a card it applies to checks out with it.

A paying subscriber reads no promotion. Their plan change goes through without a checkout, so nothing would apply it: [put one on their subscription](#put-one-on-a-subscription) instead.

Without a `discount`, a campaign link's code names the promotion: `/pricing?discount=LAUNCH20` shows the launch offer's terms, and its checkout applies the code. The page never shows the code itself, nor a discount only your server applies. With a `discount`, a campaign link's own code still goes with a checkout the promotion is not for, since a checkout takes one discount. For a page of your own, `usePricing({ discount: 'launch' })` returns the same `promotion`, and each price carries its `promotion` offer.

## Apply it at checkout

From the browser, name a public promotion by its key:

```vue [app/pages/launch.vue]
<script setup lang="ts">
const { plans } = usePricing()
const { checkout } = useBilling()
const pro = computed(() => plans.value?.find(plan => plan.key === 'pro')?.prices.month)
</script>

<template>
  <button v-if="pro" @click="checkout(pro.productId, { discount: 'launch' })">
    Start Pro at 20% off
  </button>
</template>
```

The server refuses some keys as `invalid_input` with `field: 'discount'`:

- a key that is no public promotion, a discount only your server applies included;
- a promotion that applies to none of the checkout's products;
- a promotion the provider no longer redeems: ended, used up, or redeemed by this customer as often as it allows.

Check out again without it to sell at the regular price, as `<PricingTable>` does on its own. A checkout takes one discount, so never send `discount` beside `discountCode`.

From your own server code, apply any discount of the catalog, after you decide the caller qualifies:

```ts [backend/partners.ts]
import { v } from 'convex/values'
import { backendError } from 'nuxt-backend/functions'
import { action } from './_generated/server'
import { billing } from './billing'

export const partnerCheckout = action({
  args: { productId: v.string(), origin: v.string(), successUrl: v.string() },
  handler: async (ctx, { productId, ...urls }) => {
    if (!(await cameThroughPartner(ctx))) throw backendError('forbidden', { reason: 'permission' })
    return billing.checkout(ctx, { productIds: [productId], ...urls, discount: 'founder' })
  },
})
```

`cameThroughPartner` is your own check. A discount without a code goes on locked: the customer can't swap it for a code typed at checkout.

## Pick one per customer

`checkoutDiscount` picks a discount for every checkout of a catalog plan that names none of its own, from the pricing page, `useBilling().checkout` and `billing.checkout` alike. It is where a cohort gets its price, such as founder pricing for accounts made before a launch:

```ts [backend/billing.ts]
const LAUNCH = Date.parse('2027-01-15T00:00:00Z')

export const billing = setupBilling(components, {
  catalog,
  email,
  audit,
  checkoutDiscount: async (ctx, { userId }) => {
    const createdAt = await ctx.runQuery(internal.users.createdAt, { userId })
    return createdAt !== null && createdAt < LAUNCH ? 'founder' : null
  },
})
```

It receives the person checking out (`userId`), the billing entity that pays (`entityId`), and the `plan`, `interval` and `productId`. Your function decides who qualifies; the provider still checks the discount's dates, caps and per-customer limit. A discount it picks that the provider no longer redeems is dropped: the checkout opens again at the regular price, and the deployment log says so (`billing.checkout_discount_dropped`). A discount that applies to none of the checkout's products is never sent, and a key the catalog does not have throws, naming it.

## Put one on a subscription

`billing.applyDiscount` puts a discount on a billing entity's subscription, from the next payment on: a win-back offer, a referral reward, a code a subscriber redeems in your own screen. It is server code only and checks nobody, so decide first:

```ts [backend/offers.ts]
import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { billing } from './billing'

export const offerWinBack = internalAction({
  args: { workspaceId: v.string() },
  handler: async (ctx, { workspaceId }) => {
    if (await ctx.runQuery(internal.offers.alreadyOffered, { workspaceId })) return
    await billing.applyDiscount(ctx, { entityId: workspaceId, discount: 'winback' })
    await ctx.runMutation(internal.offers.recordOffered, { workspaceId })
  },
})
```

What it does, and what it leaves to you:

- **One at a time**: it replaces any discount the subscription has, and `discount: null` removes it. A founder's forever discount replaced is gone for good once its offer has ended.
- **Your own guard**: the provider checks the dates, the total cap and the plan here, but never the per-customer limit. Keep your own record of who got it, as above.
- **Yearly payments**: a `once` discount, or one of 12 months or less, covers a whole yearly payment.
- **Refusals**: `invalid_input` for a key the catalog does not have, a discount for another plan or one the provider no longer redeems (`discount`), and the free plan (`subscriptionId`, reason `free_plan`).

The cancel flow offers a win-back promotion as a save offer, by cancellation reason, and applies it this way for you, once per billing entity in 12 months. Declare the promotion without a code and name it in the flow's offers ([Handle cancellations and win people back](/docs/build/growth/engage/cancel-flow)).

## After checkout

- **A discount follows its subscription across plan changes.** The provider checks a discount's products when it is redeemed, never later, so a customer who switches plans keeps it on the new plan. `doctor` warns (`billing-promotion-portal`) while a forever discount covers some plans only and the customer portal allows plan changes, where the package can't step in.
- **Cancelling ends it.** A forever discount lasts while its subscription does. A customer who cancels and comes back after the offer ended pays the regular price.
- **The order carries it.** The order and its webhooks name the discount (`order.discountId`), and the provider's dashboard lists each discount's orders.

## Keep it honest

- **A real end and the regular price**: say when the offer ends with its real `endsAt`, and what the price is after it. The pricing table does both. A countdown that restarts or a former price nobody paid is a misleading price under consumer law.
- **A deadline is a deadline**: moving `endsAt` later after a promotion started makes the end you announced untrue. Announce an extension as a new promotion; the sync warns.
- **Say what renews**: before checkout, say what a promotional subscription price becomes afterwards, as the table's line does. Some places also ask for a notice before a long promotional price ends.
- **No offers in transactional email**: a receipt or a sign-in code carries no promotion.
- **Test prices openly**: to try a lower price, give a cohort a promotion and show it as one. Never show two people different list prices for the same plan.

::note
**Run a price test as an experiment.** Its variants are discount cohorts: every visitor sees the regular price, and a variant's promotion shows with its terms. The admin console's Experiments view compares what each cohort converts ([Run an experiment](/docs/build/growth/measure/experiments#test-a-price)).
::

## What happens when…

- **A browser names a key that is no public promotion:** the checkout is refused as [`invalid_input`](/docs/reference/backend/errors#invalid_input) with `field: 'discount'`. So is a promotion for none of the checkout's products, or one the provider no longer redeems.
- **A customer redeemed it as often as `perCustomer` allows:** the provider no longer redeems it for them, so the same refusal applies. `<PricingTable>` opens the checkout again at the regular price.
- **`checkoutDiscount` picks a promotion the provider no longer redeems:** the checkout opens at the regular price, and the log has `billing.checkout_discount_dropped`.
- **`checkoutDiscount` names a key the catalog lacks:** it throws, naming the key. Declare it and run `billing sync`.
- **The catalog breaks a rule:** `billing sync` refuses before it creates anything, and `doctor` reports `billing-promotion-limits`.

## Limits

- **One discount per checkout and per subscription.** Discounts never stack.
- **`applyDiscount` skips the per-customer limit.** The provider checks it at checkout only, so keep your own record for discounts you put on subscriptions.
- **Terms are fixed once redeemed.** A changed amount, type or duration after a redemption is drift: publish new terms under a new key.
- **A discount follows a plan change**, also onto a plan it was not for, while the customer portal allows plan changes.

## Test it

Open the pricing page through a campaign link and check the terms people read:

```ts [tests/promotion.spec.ts]
import { expect, test } from '@playwright/test'

test('the launch offer shows its real terms', async ({ page }) => {
  await page.goto('/pricing?discount=LAUNCH20')
  await expect(page.getByText('20% off for 3 months, then $29/mo')).toBeVisible()
  await expect(page.getByText('Offer ends Jan 31, 2027')).toBeVisible()
})
```

Run `npx nuxt-backend doctor` to check every promotion's limits. Then pay on Polar's sandbox with the test card `4242 4242 4242 4242` and find the discount on the order ([Run end-to-end tests](/docs/develop/testing/e2e)).

## Related

- [Polar](/docs/services/polar): the account, the sandbox and the discounts a promotion becomes.
- [Share campaign links](/docs/build/growth/offers/campaign-links): a link that carries a promotion's code and UTM attribution into checkout.
- [Mint discounts from your server](/docs/build/growth/offers/discounts): discounts made from your server code, outside the catalog.
- [Define and sync your catalog](/docs/build/billing/catalog): the rest of the catalog `billing sync` pushes.
- [Customize the pricing page](/docs/build/billing/pricing-page): the table that shows a promotion.
