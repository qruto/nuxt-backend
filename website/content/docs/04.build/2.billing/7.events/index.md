---
title: React to billing events
description: "Run your own code when the billing provider reports an order, a subscription change or a refund, after the built-in refresh, and read billing's own events on the activity trail."
kind: how-to
capability: billing
api: /docs/reference/api/billing
source: src/convex/integrations/billing/webhooks.ts
navigation:
  icon: i-lucide-zap
---

When someone pays, upgrades or gets a refund, your app may need to act: unlock a project, send a welcome, record the sale.

- **Polar does natively:** it reports every change to the deployment's `/billing/events` route as a signed webhook, retries a failed delivery, and disables an endpoint after 10 failures in a row. Secrets created on or after 2026-09-08 sign with Standard Webhooks; older ones with Polar's own HMAC (checked on 2026-10-25).
- **The package adds:** it verifies the signature, drops a replay, refreshes the paying entity's cached plans, features and credits, fulfils gifts, and records the change on the [activity trail](#on-the-activity-trail).

Your handlers run after that, keyed by Polar's own event names, so features and credits already read fresh inside them.

## Run your code on an event

Pass your handlers to `setupBilling` as `events`:

```ts [backend/billing.ts]
export const billing = setupBilling(components, {
  catalog,
  email,
  audit,
  events: {
    'order.paid': async (ctx, event) => {
      // Entitlements are already refreshed here: provision what the order bought.
      await ctx.runMutation(internal.onboarding.markPaid, { orderId: event.data.id })
    },
  },
})
```

A handler runs at least once per delivery:

- **It throws**: the delivery is logged as `handler_error` and answered `500`, and the provider delivers it again.
- **It already ran**: a delivery processed before answers `200` without running it again.
- **Order**: the provider delivers events in no particular order.

Key what a handler writes on the event's id, so a second run changes nothing. [Hooks and guarantees](/docs/reference/backend/hooks#setupbilling-events) has the whole promise. [`registerBackendRoutes`](/docs/ship/security/webhooks) mounts the route with its secret, `BILLING_WEBHOOK_SECRET`.

## Which events refresh the cache

These events refresh the paying entity's cache before your handler runs:

- `customer.state_changed`;
- `order.created`, `order.paid` and `order.refunded`;
- every `subscription.*` event;
- `refund.created` and `refund.updated`;
- `benefit_grant.created`, `benefit_grant.updated`, `benefit_grant.cycled` and `benefit_grant.revoked`.

A handler can listen to any event in the provider's catalog, these and the rest (`checkout.*`, `customer.*`, `product.*`, `benefit.*`).

A `benefit.updated` also re-syncs the products table, because the provider sends no product event when a benefit is edited in its dashboard: [the pricing page](/docs/build/billing/pricing-page) follows the new credits. A re-sync that fails is logged as `billing.product_resync_failed` and never fails the delivery. The [events reference](/docs/reference/backend/events#billing-events) lists what the package does for each event.

## Lifecycle events

Three of Polar's events carry the moments a subscription business acts on. Polar sends them today, and a handler of yours can listen:

| Event | Polar sends it when | What the app usually does |
|---|---|---|
| `checkout.expired` | A checkout reaches its expiry without being completed | Remind the person once, if they agreed to hear from you |
| `subscription.past_due` | A renewal payment fails; Polar retries over 21 days | Tell every billing manager in the app, with a link to the portal |
| `subscription.cycled` | A subscription enters a new period, before the renewal order exists | Reset a per-period counter of your own; wait for `order.paid` for the money |

`setupBilling({ lifecycle })` handles them for you, as below.

```ts [backend/billing.ts]
export const billing = setupBilling(components, {
  catalog,
  email,
  audit,
  lifecycle: {
    abandonedCheckout: true,                       // checkout.expired → the checkoutAbandoned lifecycle email, once
    renewalReminders: true,                        // the yearly reminder Polar doesn't send for short cycles
    withdrawal: true,                              // the EU withdrawal button, where Polar doesn't provide one
  },
})
```

- **`abandonedCheckout`** records `billing.checkout_abandoned` once per checkout that expired unpaid, with the person who opened it as its actor: what the `checkoutAbandoned` flow of [Send lifecycle emails](/docs/build/growth/engage/lifecycle-emails) starts from, only for an address with marketing consent. A free checkout records nothing.
- **`subscription.past_due`** needs no switch: it records `billing.subscription_past_due`, and the `past-due` notice of the app-wide notices region shows to the entity's billing managers while the status is `past_due`, and goes on recovery ([When a payment fails](/docs/build/billing/subscriptions#when-a-payment-fails)).
- **`renewalReminders`** sends the annual reminder of a renewing subscription's terms that California's auto-renewal law asks for, to subscriptions Polar sends no reminder to ([Customer emails and notifications](/docs/build/billing/events/customer-emails)).
- **`saveOffers`** and **`withdrawal`** belong to the [cancel flow](/docs/build/growth/engage/cancel-flow) and to [Follow subscription law](/docs/ship/compliance/subscriptions).

## On the activity trail

Billing also records its own events on the app's activity trail: who opened a checkout, who changed the plan, what the provider reported. Each one is a row for the billing entity, read by its workspace's owners and admins (or by the account billed on its own) and by administrators. Each row is handed to your `setupAudit({ onEvent })` action:

| Recorded when | Kinds |
|---|---|
| A billing manager opens a checkout, or changes, cancels, pauses or resumes the plan | `billing.checkout_started`, `billing.plan_changed` |
| The cancel flow makes a save offer, and a billing manager takes it; a billing manager withdraws within 14 days | `billing.save_offer_made`, `billing.save_offer_accepted`, `billing.contract_withdrawn` |
| A checkout expires unpaid, with `lifecycle.abandonedCheckout`; a new workspace starts a reverse trial | `billing.checkout_abandoned`, `billing.trial_pass_started` |
| A verified delivery reports a paid subscription, an order, a refund or a benefit | `billing.subscription_created`, `billing.subscription_updated`, `billing.subscription_canceled` (with the customer's `reason`), `billing.subscription_past_due`, `billing.subscription_revoked`, `billing.order_paid`, `billing.order_refunded`, `billing.benefit_granted`, `billing.benefit_revoked` |
| An administrator refunds an order | `billing.refund_issued` |
| A metered spend takes a balance to its low mark, or to zero | `billing.credits_low`, `billing.credits_exhausted` |
| A gift is paid for, claimed, or refunded before its claim | `gift.purchased`, `gift.claimed`, `gift.refunded` |

The scaffold passes `audit` to `setupBilling`, which is how these reach `onEvent`. Without it they are still recorded, on the component's own trail.

Some things record nothing:

- a free plan's own lifecycle: its $0 subscriptions and orders, and the benefits they grant;
- an order that charged nothing, such as a gift's claim;
- `customer.state_changed`, which repeats what the subscription and benefit events record.

Recording never fails what it records: a row that could not be written leaves `audit.record_failed` in the deployment's log. A row holds ids and amounts, never an address or a name. The [events reference](/docs/reference/backend/events#backend-events) has each kind's data and the channels it may notify on: billing kinds notify in the app only, never by email ([Customer emails and notifications](/docs/build/billing/events/customer-emails)).

## Events this package does not know

An authentic delivery whose type the installed provider SDK cannot parse, such as an event newer than the package, is acknowledged with `202` so the provider never retries it in a loop. To see it, pass `onUnknownEvent`:

```ts [backend/billing.ts]
export const billing = setupBilling(components, {
  catalog,
  email,
  audit,
  onUnknownEvent: async (ctx, { type }) => {
    console.warn('unhandled billing event', type)
  },
})
```

## What happens when…

| Symptom | Fix |
|---|---|
| Deliveries answer `503` | `BILLING_WEBHOOK_SECRET` is not set on the deployment: see [`billing-webhook-secret`](/docs/reference/cli/diagnostics#billing-webhook-secret). |
| Deliveries answer `403` | The deployment's secret is not the endpoint's: run `npx nuxt-backend billing sync --force` to store the endpoint's own. |
| A handler's work happens twice | A delivery after a throw runs the handler again: key what it writes on the event's id. |
| An event type is newer than the package | It is answered `202` and never retried; pass `onUnknownEvent` to see it |
| Ten deliveries in a row fail | Polar disables the endpoint and emails your organization; [Replay a webhook delivery](/docs/ship/operate/replay) resends what was missed |

## Limits

- **At least once, in any order.** A handler must be idempotent: key its writes on the event's id.
- **Webhooks need a reachable URL.** A local deployment gets none without a tunnel.
- **No email from billing events.** Billing, gift and referral kinds notify in the app only ([Customer emails and notifications](/docs/build/billing/events/customer-emails)).

## Test it

Test on Polar's sandbox, where every event is real and no money moves ([Develop with real sandboxes](/docs/develop/sandboxes#billing-on-polars-sandbox)):

1. Buy a plan or a pack on `/pricing` with the test card `4242 4242 4242 4242`.
2. Watch the delivery arrive in the delivery log: the admin console's Webhooks tab, or `getWebhookDeliveries` for administrators ([The delivery log](/docs/ship/security/webhooks#the-delivery-log)).
3. To run a handler again, redeliver the event from the provider's webhook dashboard. In `0.2.0` the admin console [replays a delivery](/docs/ship/operate/replay) too.

Polar's webhooks need a URL they can reach. A cloud dev deployment has one. A local deployment does not: there the return from checkout refreshes the entitlements once, and your handlers run only when a tunnel forwards the deliveries (`npx nuxt-backend billing sync --webhook https://your-tunnel-host/billing/events`).

## Related

- [Polar](/docs/services/polar): the webhook endpoint, its secret and the sandbox.
- [Register webhooks](/docs/ship/security/webhooks): every route the backend mounts, its secret and the delivery log.
- [Customer emails and notifications](/docs/build/billing/events/customer-emails): who tells the customer about each change.
- [Record and review activity](/docs/build/auth/admin/audit-log): the trail these events are recorded on, and `onEvent`.
- [Events reference](/docs/reference/backend/events#billing-events): what the package does with each provider event.
