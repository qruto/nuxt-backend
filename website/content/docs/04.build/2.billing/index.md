---
title: "Billing and credits"
description: "Charge for your product on Polar's own billing: plans, a free plan, prepaid credits, feature gates and quotas, declared as code, sold through hosted checkout and enforced on the server."
kind: landing
playground: /playground/pricing
api: /docs/reference/api/billing
source: src/convex/integrations/billing.ts
navigation:
  title: Overview
  icon: i-lucide-compass
---

The billing capability lets your app charge for what it does.

- **Polar does natively:** as the merchant of record, it sells to your customer, collects the tax, and handles refunds and chargebacks. It hosts checkout and the customer portal, grants benefits and credits each cycle, meters usage, and sends the lifecycle emails (checked on 2026-10-25).
- **The package adds:** plans, credit packs, features and quotas in one TypeScript file, pushed to Polar with one command. It keeps a live copy of what each customer holds, the entitlement cache, in the package's `backend` Convex component. Your functions gate features and spend credits against that copy, and every page that reads it updates as soon as Polar reports a change.

Polar's account, tokens and sandbox are on the [Polar](/docs/services/polar) page.

Nothing is added to your schema, and the package keeps no ledger of its own: orders, invoices and usage stay with Polar and are read live. It covers what a client app charges for:

- **Plans** with monthly and yearly prices, in one currency or several, and a free plan every workspace starts on.
- **Credits**: prepaid packs, a monthly allowance per plan, and usage past the allowance.
- **Gates**: features and resource quotas, enforced on the server and mirrored in the UI.
- **Growth**: discounts, promotions, campaign links, gifts, plan passes and referrals.
- **The lifecycle**, in `0.2.0`: a cancel flow with one save offer, a past-due notice, abandoned-checkout and renewal reminders, local prices at checkout, and the EU withdrawal button.

## Start here

1. **Pick a model**: plans, credits, or both ([Choose a pricing model](/docs/build/billing/pricing-models)).
2. **Decide who pays**: the active workspace by default, or each account with `billTo: 'user'` for a product people buy for themselves ([Bill each person](/docs/build/billing/setup#bill-each-person)).
3. **Connect Polar's sandbox**: put a sandbox token in `.env.local` as `BILLING_ACCESS_TOKEN`, then run `npx nuxt-backend env push` ([Polar](/docs/services/polar), [Set up billing](/docs/build/billing/setup)).
4. **Declare and sync**: edit `backend/billing.catalog.ts`, then run `npx nuxt-backend billing sync` ([Define and sync your catalog](/docs/build/billing/catalog)).
5. **Sell**: `/pricing` sells the catalog with no code of yours. Pay with the test card `4242 4242 4242 4242` ([Customize the pricing page](/docs/build/billing/pricing-page)).
6. **Gate and spend**: lock features with `withFeature` and `<Gate feature>`, and charge credits with `spendCredits` ([Gate features by plan](/docs/build/billing/subscriptions/feature-gating), [Spend credits in your functions](/docs/build/billing/credits/spending)).

## How it works

```text
billing.catalog.ts ──billing sync──▶ Polar products, benefits, meters, discounts
                                            │
       useBilling().checkout() ──▶ hosted checkout ──▶ order paid
                                                           │
                                       /billing/events (signed webhook)
                                                           │
                                     entitlement cache in the backend component
                                     (plans, features, quotas, credit balances)
                                         │                          │
                     useFeatures(), <Gate feature>        billing.requireFeature(),
                     useCredits(), <PricingTable>         requireQuota(), spendCredits()
```

1. **Declare.** `defineBillingCatalog` in `backend/billing.catalog.ts` names the meters, plans, packs, features, quotas and promotions. A plan's credits and features become benefits of its products, which Polar grants every billing cycle. A pack's credits are granted once at purchase. See [Define and sync your catalog](/docs/build/billing/catalog).
2. **Sync.** `npx nuxt-backend billing sync` creates what Polar is missing, never deletes, and never rewrites a price a customer holds. It writes the provider ids to `backend/billing.generated.ts`, so no id appears in your code, and provisions the `/billing/events` webhook endpoint with its secret.
3. **Sell.** The server-rendered `/pricing` page lists the plans and packs with live prices. `useBilling().checkout()` opens Polar's checkout for a plan, `useCredits().topUp()` for a pack, and `portal()` the customer portal. The server decides what may be sold, to whom, with which trial and discount. See [Open checkout and the portal](/docs/build/billing/subscriptions/checkout).
4. **Hear back.** Polar posts each order, subscription and benefit change to `/billing/events`. The package verifies the signature, drops a replay, refreshes the paying entity's cache, records the change on the [activity trail](/docs/build/billing/events#on-the-activity-trail), then runs your own handlers. See [React to billing events](/docs/build/billing/events).
5. **Gate and spend.** `useFeatures()` and `<Gate feature>` gate the UI. `billing.requireFeature`, the `withFeature` tier and `billing.requireQuota` enforce the same keys in your functions, and refuse with the plans that would allow the call. Server code spends credits with `spendCredits`, or reserves, runs and settles so a failed run costs nothing. See [Gate features by plan](/docs/build/billing/subscriptions/feature-gating) and [Spend credits in your functions](/docs/build/billing/credits/spending).

## Who pays

By default the active workspace pays. Its members share one plan, one set of features and one credit balance. Its owner and admins are its billing managers: they check out, open the portal, and change or cancel the plan. Every other member reads the plan and spends the credits. Set `billTo: 'user'` and each account pays for itself instead, for a product people buy for themselves.

Each billing entity is one Polar customer, keyed by the entity's id: a team customer named after a workspace, or an individual customer for a user. A workspace is never billed per member, and a plan never counts seats. See [Who pays](/docs/build/billing/setup#who-pays) and [Who may buy for a workspace](/docs/build/billing/setup#who-may-buy-for-a-workspace).

## Who does what

| Polar, natively | The package | Your app |
|---|---|---|
| Charges cards and collects tax as the merchant of record | Pushes the catalog and keeps it in line, reporting drift instead of rewriting | Declares the catalog and runs `billing sync` |
| Hosts checkout and the customer portal | Decides on the server what a checkout may sell, with which trial, discount and return address | Places the pricing page, buttons and gates |
| Grants plan and pack benefits each cycle: features, quotas, credits | Caches each entity's grants and balances, live, and checks them in one transaction with your writes | Names the features and quotas its functions enforce |
| Keeps orders, invoices, refunds and usage events | Reads them live for `useOrders()` and `useUsage()`, and records usage when your code spends | Decides what costs credits, and how many |
| Sends receipts, renewal, trial and payment-failure emails | Sends only what no provider sends: the gift notice | Words the in-app messages through labels |
| Counts discount redemptions and holds customers to a promotion's limits | Applies the right promotion at checkout and shows its real terms | Decides who qualifies for a server-only discount |

The package never rebuilds what Polar does natively: [Customer emails and notifications](/docs/build/billing/events/customer-emails) says who tells the customer what.

## When Polar or a webhook is late

Polar is the source of truth, and the entitlement cache follows it through signed webhooks. Each failure has a defined result:

- **A webhook is slow.** Gates and balances read the last state Polar reported until the delivery arrives. A customer back from checkout doesn't wait: the return page reads their new plan from Polar once (`syncEntitlements`).
- **A delivery fails.** Polar retries it, and the package drops a delivery it already processed, so a retry never applies twice. Polar disables an endpoint after 10 failed deliveries in a row and emails your organization. The delivery log and [Replay a webhook delivery](/docs/ship/operate/replay) show and resend what was missed.
- **Polar is unreachable.** Checkout, the portal, plan changes and order history refuse as `unavailable`. Gates, quotas and reservations keep working from the cache.
- **A spend can't be recorded.** `settleSpend` releases the reservation and throws, so the run is not charged. Call it again with the same reservation to charge it: Polar drops an event whose `externalId` it already has.
- **The browser can't read the cache.** `useFeatures().has` says no and `<Gate>` hides the content: a gate closes rather than opens.

## From your machine to production

- **Develop on Polar's sandbox.** Create a sandbox organization and token, put the token in `.env.local`, and run `npx nuxt-backend billing sync`. You get the same catalog, Polar's real checkout and the test card `4242 4242 4242 4242`, and `nuxt-backend status` shows the billing capability as `test`. [Develop with real sandboxes](/docs/develop/sandboxes#billing-on-polars-sandbox) walks through it, webhooks to a local deployment included.
- **Preview and staging bill in the sandbox too.** Every `BACKEND_ENVIRONMENT` but `production` uses Polar's sandbox, so a preview or a public demo never charges a card ([Environments and deployments](/docs/start/concepts/environments#sandbox-and-production-providers)).
- **Then production.** Sync with `--env production`, set the `BILLING_*` variables on the production deployment, and run `npx nuxt-backend doctor --prod`. Doctor checks the token, the webhook endpoint and its secret, and the provider settings a catalog relies on, such as trial-abuse prevention. `doctor --fix` applies those settings for you ([Apply the provider settings](/docs/services#recommended-settings)). See [Go live](/docs/build/billing/setup#go-live).

## What you get

What the package ships for this part of the app, generated from the code: each name links to its
reference entry.

::what-you-get{area="billing"}
::

## In this tab

### Set up and sell

::card-group
  :::card{icon="i-lucide-scale" title="Choose a pricing model" to="/docs/build/billing/pricing-models"}
  Plans, a free plan, prepaid credits, allowances, usage and several currencies: which fits.
  :::

  :::card{icon="i-lucide-plug" title="Set up billing" to="/docs/build/billing/setup"}
  `setupBilling`, who pays, one customer per entity, the environment and going live.
  :::

  :::card{icon="i-lucide-file-code-2" title="Define and sync your catalog" to="/docs/build/billing/catalog"}
  Meters, plans, packs, features, quotas and promotions in code, pushed with `billing sync`.
  :::

  :::card{icon="i-lucide-tags" title="Customize the pricing page" to="/docs/build/billing/pricing-page"}
  The server-rendered `/pricing` and `<PricingTable>`: the yearly switch, currencies, packs per credit.
  :::

  :::card{icon="i-lucide-lock-keyhole-open" title="Gate features by plan" to="/docs/build/billing/subscriptions/feature-gating"}
  `requireFeature` and `withFeature` on the server, `<Gate>` and `<UpgradePrompt>` in pages.
  :::

  :::card{icon="i-lucide-user-cog" title="Who may buy for a workspace" to="/docs/build/billing/setup#who-may-buy-for-a-workspace"}
  Who reads, buys and manages a workspace's billing, checked fresh on every call.
  :::
::

### Subscriptions

::card-group
  :::card{icon="i-lucide-credit-card" title="Manage subscriptions" to="/docs/build/billing/subscriptions"}
  Read the plan's state, change, cancel, pause and resume it, and the billing section of `/settings`.
  :::

  :::card{icon="i-lucide-shopping-cart" title="Open checkout and the portal" to="/docs/build/billing/subscriptions/checkout"}
  Checkout for a plan or a pack, the customer portal, and what the server decides.
  :::

  :::card{icon="i-lucide-gauge" title="Limit resources per plan" to="/docs/build/billing/subscriptions/quotas"}
  How many stories or projects a plan allows, counted in the mutation that makes them. Experimental.
  :::

  :::card{icon="i-lucide-ticket-percent" title="Mint discounts from your server" to="/docs/build/growth/offers/discounts"}
  Mint discounts from server code, accept codes at checkout, apply one your server chooses.
  :::

  :::card{icon="i-lucide-receipt" title="Show orders, invoices and usage" to="/docs/build/billing/subscriptions/orders"}
  Past charges with invoices, metered consumption, and refunds from the admin tier.
  :::

  :::card{icon="i-lucide-door-open" title="Handle cancellations" to="/docs/build/growth/engage/cancel-flow"}
  Planned: cancelling in one step, with one optional step before it for a question and a save offer by reason.
  :::
::

### Credits

::card-group
  :::card{icon="i-lucide-coins" title="Sell credits and top-ups" to="/docs/build/billing/credits"}
  Balances with `useCredits`, packs to top up, and a notice before the balance runs out.
  :::

  :::card{icon="i-lucide-hand-coins" title="Spend credits in your functions" to="/docs/build/billing/credits/spending"}
  `spendCredits`, or reserve, run and settle so a failed run costs nothing, and a hold for queued jobs.
  :::
::

### Growth

::card-group
  :::card{icon="i-lucide-trending-up" title="Growth" to="/docs/build/growth#offers"}
  Promotions, campaign links, gifts, plan passes and referrals, on Polar's own discounts and checkout.
  :::

  :::card{icon="i-lucide-badge-percent" title="Run a promotion" to="/docs/build/growth/offers"}
  A discount in the catalog with its real terms and end date, applied at checkout by key.
  :::

  :::card{icon="i-lucide-megaphone" title="Share campaign links" to="/docs/build/growth/offers/campaign-links"}
  A pricing link with a discount code and UTM attribution, carried through sign-in into checkout.
  :::

  :::card{icon="i-lucide-gift" title="Send, receive and manage gifts" to="/docs/build/growth/offers/gifts"}
  Buy a credit pack for someone by email; they sign in and claim it. A gifts page to manage them is planned.
  :::

  :::card{icon="i-lucide-ticket" title="Gift a plan as a pass" to="/docs/build/growth/offers/plan-passes"}
  Planned: a plan bought once as a gift, for 1, 3 or 12 months, with no card and no renewal.
  :::

  :::card{icon="i-lucide-share-2" title="Run a referral program" to="/docs/build/growth/offers/referrals"}
  Planned: a link per person, an explicit claim, and rewards once the first payment clears its hold.
  :::
::

### Events

::card-group
  :::card{icon="i-lucide-zap" title="React to billing events" to="/docs/build/billing/events"}
  Your own code on orders and subscription changes, and billing on the activity trail.
  :::

  :::card{icon="i-lucide-mail" title="Customer emails and notifications" to="/docs/build/billing/events/customer-emails"}
  What Polar tells customers, what the package adds, and what stays in the app.
  :::
::

### Recipes

::card-group
  :::card{icon="i-lucide-user" title="Bill each person" to="/docs/build/billing/setup#bill-each-person"}
  A setup where every account pays for itself.
  :::

  :::card{icon="i-lucide-chart-line" title="Charge for usage beyond the plan" to="/docs/build/billing/subscriptions/overage"}
  An allowance per plan, then billed overage with a cap.
  :::
::

## Revenue and growth numbers

The admin console reads Polar's live metrics: recurring revenue, new and churned subscriptions, checkouts and usage per meter. It also shows the growth funnel, from waitlist to paid ([Read revenue and usage](/docs/build/growth/measure/revenue); [Measure growth](/docs/build/growth/measure), planned for `0.2.0`). Like the rest of billing it keeps no ledger: the numbers are Polar's.

## Not included

- **Per-seat pricing.** A subscription belongs to the workspace or the user as a whole, and a quota never counts people.
- **A local ledger.** Orders, invoices and usage are read live from Polar. Credits, gifts and rewards are units of service on Polar's meters, never money the app holds.
- **Auto top-up.** A balance grows when someone buys a pack, never by the app charging a card on its own.
- **Editing provider objects from code.** `billing sync` never deletes, and never rewrites a price or a credit grant a customer holds: it reports drift. To stop selling a plan, retire it.
- **A second billing provider.** The catalog and the cache are built on Polar's products, benefits and meters.
- **Workspace billing permissions.** The owner and admins manage billing; granting it to a custom role waits for the next release ([Roadmap](/docs/start/roadmap)).

The reasons are on [Principles](/docs/start/concepts/principles#what-it-never-does), and the rules every growth feature follows are under [Guardrails on growth features](/docs/start/concepts/principles#guardrails-on-growth-features).

## Next

The [Email](/docs/build/email) tab covers the messages the app sends itself. For a complete setup in one place, start from a recipe: [Bill each person](/docs/build/billing/setup#bill-each-person) or [Charge for usage beyond the plan](/docs/build/billing/subscriptions/overage).
