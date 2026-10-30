---
title: Manage subscriptions
description: "Show a subscription in every state with the billing section of /settings, read it with useBilling, change the plan now or at the period's end, cancel in one step with an optional reason, and pause and resume it."
kind: how-to
capability: billing
playground: /playground/settings
api: /docs/reference/api/use-billing
source: src/runtime/vue/composables/use-billing.ts
navigation:
  icon: i-lucide-credit-card
---

You get a ready-made billing section on `/settings` that shows a subscription in every state it can be in, and `useBilling()` for pages of your own. Both read the plan the billing entity pays for, and run every change: a new plan, a cancellation, a pause.

- **Polar does natively:** plan changes with proration, cancellation at the period's end with a reason, pause and resume, payment retries after a failed renewal, and a customer portal that always lets a customer cancel (checked on 2026-10-25).
- **The package adds:** one state line with the one action it calls for, the checks on who may change a plan, the free plan a cancelled workspace returns to, and a yearly-to-monthly switch that waits for the paid year's end.

Only the entity's billing managers change it: the workspace's owner and admins, never an administrator impersonating them. `canManage` says whether the caller may ([Who may buy for a workspace](/docs/build/billing/setup#who-may-buy-for-a-workspace)). A subscription starts with a checkout: see [Open checkout and the portal](/docs/build/billing/subscriptions/checkout).

## The billing section of /settings

The ready-made `/settings` page shows the plan in its current state, with the one action that state calls for. Below it come the history lists: past charges and their invoices (`<BillingHistory>`) for whoever manages the billing, and metered usage (`<UsageHistory>`) for every member. It is the `billing` section of `<WorkspaceSettings>`, so a page of your own gets it with `<WorkspaceSettings :sections="['billing']" />`.

| State (`data-state`) | Reads | The action it offers |
|---|---|---|
| Gifted (`gifted`) | Gifted · gifted until the date, for a [plan pass](/docs/build/growth/offers/plan-passes) | Keep this plan, an ordinary checkout of it |
| Payment failed (`past_due`) | Payment failed, and asks for a new payment method | Update payment method, in the portal |
| Paused (`paused`) | Paused · resumes on the date, when one is set | Resume plan |
| Set to cancel (`canceling`) | Cancels at period end · ends on the date | Keep plan (`uncancel`) |
| Plan change scheduled (`changing`) | Plan change scheduled · switches to the plan on the date | Cancel the change (`cancelPendingChange`) |
| Trial (`trialing`) | On trial · trial ends on the date | Cancel plan |
| Active (`active`) | Active · renews on the date | Cancel plan |

The line reads the first state that holds, top to bottom. A trial set to cancel reads as set to cancel, and a failed payment reads as a failed payment whatever else holds. Each line is words with a tone (`data-tone`) beside it, never colour alone.

The buttons follow the subscription, not only the line:

- **Keep plan** shows on any plan set to cancel, a failed payment set to end included. Its line then says when the plan ends.
- **Cancel the change** shows on a scheduled change, unless the plan is set to end.
- **Cancel plan** shows unless the plan is set to end or paused, so no state offers a second cancellation the provider would refuse.
- **Manage billing** opens the billing portal, for the payment method and the invoices, in every subscribed state. After a failed payment, **Update payment method** comes first.

A member who manages none of the workspace's billing reads the same state, with a note saying who does and no button.

### Cancelling takes one step

"Cancel plan" opens one group: what ends when, and one button that cancels at the end of the paid period. Nothing else stands in the way: no offer to stay, no question and no field, since the confirmation of a cancellation carries nothing but its button. `<PricingTable>`'s "Cancel plan" on the current plan opens the same group, and "Keep plan" undoes the cancellation.

Escape, or "Cancel plan" again, closes the group and keeps focus on the button, except while the cancellation is on its way. Once it goes through, focus moves to the plan's new state and a status announces it. One action runs at a time: while one is on its way, another button starts nothing.

The panel asks for no reason. The provider keeps a cancellation's reason (`too_expensive`, `missing_features`, `switched_service`, `unused`, `customer_service`, `low_quality`, `too_complex`, `other`) and the customer's own comment only with the cancellation itself. It takes one cancellation per period, so neither can be added afterwards. A flow of your own that gathers them passes them with the cancellation: `cancel({ reason, comment })` on `useBilling`, or `cancelPlan({ reason, comment })` from the `billing` slot. Both are optional, and "Keep plan" clears them.

### What the plan includes

The section lists every benefit the plan, and any pack bought, granted to the billing entity, read from the provider's customer state. `useFeatures().benefits` carries the same list: each benefit's `kind` in neutral words, its `name` as the provider lists it, when it was granted, and what the grant holds.

| `kind` | What it gives | What the grant holds |
|---|---|---|
| `license_key` | A license key | `licenseKey`: the display key, masked but for its last characters |
| `download` | File downloads | `files`: how many |
| `community` | A role in a community server | nothing more: the account and the server stay with the provider |
| `repository` | Access to a code repository | `repository`: `owner/name` |
| `shared_channel` | A shared chat channel | nothing more |
| `custom` | A perk you deliver yourself | nothing more |
| `credits` | Prepaid credits | the balance is on `useCredits` |
| `feature` | A feature of the catalog | nothing more: gate on it with `useFeatures().has` |
| `other` | A benefit type newer than the package | nothing more |

The provider's own type stays on `type`. The whole key, the files and the connected accounts live in the billing portal, which the section points a billing manager to.

## Read the subscription

`useBilling()` returns the subscription and its state as computed refs, live:

```vue [app/pages/plan.vue]
<script setup lang="ts">
const billing = useBilling()
// subscription: the active one (the free plan's too, marked free: true), null without one, undefined while loading
// subscriptions: every one, ended and expired trials and the free plan's included
// plan: the catalog key of the plan it is on
// isSubscribed, isFree, isLoading
// status: the provider status (active, trialing, past_due, paused, …)
// cancelAtPeriodEnd, trialEnd, isTrialing, isPaused, isPastDue
// resumesAt: when a paused subscription resumes by itself, else null
// pendingChange: { productId, appliesAt } of the change set for the next period, else null
// canManage: whether the caller may buy and manage (the workspace's owner and admins)
// isFinishingCheckout: true while a return from checkout refreshes the entitlements
// isPending, error: an action on its way, and why the last read or action failed
</script>

<template>
  <p v-if="billing.isSubscribed.value">On {{ billing.plan.value }}</p>
</template>
```

A signed-out visitor reads as on the free plan: the queries are skipped and `subscription` resolves to `null`. On the [free plan](/docs/build/billing/catalog#the-free-plan), `subscription` is its subscription, marked `free: true`, `isFree` is `true` and `isSubscribed` is `false`. A read that fails never throws: `isLoading` turns `false` and the reason is in `error`.

## Change the plan

`changePlan(productId, { proration })` switches the subscription to another plan of the catalog:

```ts
const { products, changePlan, cancelPendingChange } = useBilling()

// Upgrade or downgrade the active subscription, now
await changePlan(products.value!.studio!.id, { proration: 'invoice' })

// Undo a change the provider scheduled for the next period
await cancelPendingChange()
```

From the browser, `proration` is `invoice` (charge the difference now) or `prorate` (carry it to the next invoice). Without it, the provider organization's setting decides. The server refuses these as `invalid_input`:

- a product outside the catalog, or a credit pack;
- a [retired plan](/docs/build/billing/catalog#retire-a-plan) (reason `retired`);
- the free plan (reason `free_plan`).

While the [`pause_checkout`](/docs/ship/operate/flags#kill-switches) kill switch is on, every purchase is refused too.

A switch from a yearly price to a monthly one never happens mid-year, since the year's credits were granted at its start. It waits for the paid year's end, whatever `proration` says, and reads back as `pendingChange` (`{ productId, appliesAt }`). So does a change the provider schedules for any other reason. `cancelPendingChange()` undoes it, and is refused as `invalid_input` (reason `no_change_scheduled`) when nothing is scheduled.

## Cancel and keep

`cancel` ends the plan at the end of the paid period by default, and `uncancel` takes that back:

```ts
const { cancel, uncancel } = useBilling()

// At the end of the paid period, with the customer's optional reason and words
await cancel({ reason: 'too_expensive', comment: 'Back when my next story is due.' })

// Revoke on the spot instead; no refund is implied either way
await cancel({ atPeriodEnd: false })

// Undo a cancellation set for the period's end
await uncancel()
```

The provider takes one cancellation per period. `cancel` on a subscription already set to end is refused as `invalid_input` (reason `cancel_scheduled`), and `uncancel` on one that isn't as `no_cancel_scheduled`. A `comment` is trimmed and refused over 500 characters. When the catalog has a free plan, a cancelled paid plan returns the workspace to it as the plan ends.

Polar's customer portal always offers cancellation at the period's end, whatever else its settings allow. A customer who leaves through the portal skips your app's flow, which is how it should be: cancelling stays one step wherever they start.

Where you turn save offers on (`setupBilling({ lifecycle: { saveOffers } })`), one optional step comes before the cancellation: a question, and one offer by reason, a pause, a cheaper plan or a win-back promotion. `cancel` then answers `{ offer }` instead of cancelling, `offer: false` cancels past it, and `<CancelFlow>` runs both steps. See [Handle cancellations and win people back](/docs/build/growth/engage/cancel-flow). An EU customer inside the withdrawal period gets a withdrawal button with a confirm step and an email receipt ([Follow subscription law](/docs/ship/compliance/subscriptions)).

## Pause and resume

`pause` stops the plan at the end of the period, and `resume` starts it again:

```ts
const { pause, resume, resumesAt } = useBilling()

await pause({ resumesAt: new Date('2027-03-01') })   // at the end of the current period
await resume()                                       // now, starting a new, charged period
```

The plan runs until the period ends, so `isPaused` is still `false` after `pause` returns, while `resumesAt` reads back at once. Polar never charges for a pause and never starts one mid-period. Once paused, the plan's benefits are revoked and no orders are made. Resuming starts a new period at once and charges it on the card on file, with no second checkout (checked on 2026-10-25). Without a date, the subscription stays paused until `resume()`. Customers pause from the portal only when the organization turns on **Enable subscription pause** in Polar's portal settings. The synced subscriptions table holds neither a scheduled change nor a resume date. The package keeps both from each `subscription.*` webhook and from the response of the change itself, newest first by the provider's `modifiedAt`. They read `null` once their date has passed or the subscription changed since.

## When a payment fails

A renewal that Polar can't charge moves the subscription to `past_due`, and Polar retries the payment after 2, 7, 14 and 21 days. `isPastDue` turns `true`, and the billing section leads with **Update payment method**, which opens the portal. When every retry fails, Polar revokes the subscription, and a catalog with a free plan puts the workspace back on it (checked on 2026-10-25).

What the customer keeps meanwhile is Polar's organization setting **Grace period for benefit revocation**: Immediately (the default), or after 2, 7, 14 or 21 days. Inside the grace period the subscription stays `past_due` while its features and credits stay granted. Set it in Polar's dashboard under Settings → Subscriptions.

A `past-due` notice in the app-wide notices region tells every billing manager the payment failed, with the button that opens the portal, on any page ([Show app notices](/docs/build/ui/notices)).

## Trials

A plan's trial is its own, set by the catalog's `trial`, and the provider runs it: it collects the card at checkout, sends the reminder and charges at the end. `isTrialing` and `trialEnd` read it. One trial runs per owner: a checkout for a workspace whose owner already had one starts without it ([One customer per billing entity](/docs/build/billing/setup#one-customer-per-billing-entity)). A different trial, for a partner or a cohort, is your server's choice: see [A different trial or discount, from the server](/docs/build/billing/subscriptions/checkout#a-different-trial-or-discount-from-the-server).

## Every action

Each action rejects with the refusal on failure, as [Composable conventions](/docs/reference/nuxt/conventions) describe. `isPending` is `true` while one runs, and `error` keeps the failure until the next one starts. Await an action in a `try` when the next step depends on it; otherwise show `error.message`.

Each action takes an optional `subscriptionId`. You need it only with `setupBilling({ multipleSubscriptions: true })`, where one entity can hold several subscriptions at once (the ids are on `subscriptions`). Each action is recorded on the [activity trail](/docs/build/billing/events#on-the-activity-trail) as `billing.plan_changed`.

## From server code

`setupBilling` returns the same operations as methods for your own actions: `billing.updateSubscription`, `cancelSubscription`, `uncancelSubscription`, `cancelPendingChange`, `pauseSubscription` and `resumeSubscription`. They check the caller the way the registered functions do, and accept the whole `proration` set: `invoice`, `prorate`, `next_period` and `reset`. A client gets only `invoice` or `prorate`, because `next_period` and `reset` hand over a new plan at once while deferring or waiving its charge.

## What happens when…

| Call | Refused as | When |
|---|---|---|
| `changePlan` | `invalid_input` (`retired`, `free_plan`) | The plan is retired, is the free plan, or is no plan of the catalog |
| `cancelPendingChange` | `invalid_input` (`no_change_scheduled`) | Nothing is scheduled |
| `cancel` | `invalid_input` (`cancel_scheduled`) | The plan is already set to end |
| `uncancel` | `invalid_input` (`no_cancel_scheduled`) | Nothing is set to end |
| any change of the free subscription | `invalid_input` (`free_plan`) | The free plan is never changed, cancelled or paused |
| any action | `forbidden` (`not_billing_manager`, `impersonating`, `not_owner`) | The caller may not manage this plan ([Who may buy for a workspace](/docs/build/billing/setup#who-may-buy-for-a-workspace)) |
| a plan change while purchases are paused | `unavailable` (`checkout_paused`) | The [`pause_checkout`](/docs/ship/operate/flags#kill-switches) kill switch is on |

[Errors](/docs/reference/backend/errors) lists every code and its fields.

## Limits

- **One cancellation per period.** Polar keeps a reason and a comment only with the cancellation itself, so neither can be added later.
- **A pause starts at the period's end.** Polar never pauses mid-period, and a resume always charges a new period at once.
- **No seat changes.** A plan here never counts people, so the seat actions of Polar's API go unused.
- **Renewal reminders are Polar's.** Polar emails them only for cycles of six months or more ([Customer emails and notifications](/docs/build/billing/events/customer-emails)).

## Test it

`createBackendMock` from `nuxt-backend/test-utils` answers the subscription read, so the billing section renders a state with no deployment:

```ts [test/app/plan-state.test.ts]
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { createBackendMock, resetBackendMock } from 'nuxt-backend/test-utils'
import { afterEach, expect, test } from 'vitest'
import { WorkspaceSettings } from '#components'

afterEach(() => resetBackendMock())

test('a failed payment asks for a new card', async () => {
  createBackendMock({
    queries: { 'billing:getCurrentSubscription': { id: 'sub_1', status: 'past_due', productId: 'prod_creator' } },
  })
  const settings = await mountSuspended(WorkspaceSettings, { props: { sections: ['billing'] } })
  expect(settings.find('[data-state="past_due"]').exists()).toBe(true)
})
```

On Polar's sandbox, pause, resume and cancel a test subscription from the demo's [settings page](/playground/settings).

## Related

- [Polar](/docs/services/polar): portal settings, the grace period and the sandbox.
- [Open checkout and the portal](/docs/build/billing/subscriptions/checkout): start a subscription, and the provider's portal for the payment method.
- [Handle cancellations and win people back](/docs/build/growth/engage/cancel-flow): the cancel flow and its save offers.
- [Follow subscription law](/docs/ship/compliance/subscriptions): online cancellation, renewal reminders and the withdrawal button.
- [`useBilling` reference](/docs/reference/api/use-billing): every field and option.
