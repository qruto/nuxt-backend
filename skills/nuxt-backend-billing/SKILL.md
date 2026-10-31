---
name: nuxt-backend-billing
description: Billing in a Nuxt app on nuxt-backend. The catalog as code (meters, plans, packs, features and promotions in backend/billing.catalog.ts, then billing sync), pricing with PricingTable, checkout and the customer portal, plan changes, feature gates and plan quotas, prepaid credits and top-ups, orders and usage history, gifts, and who may manage billing in a workspace. Use when adding or changing plans, prices, a paywall, feature gate or plan quota, a checkout or portal button, credit spending or balances, gifts, or billing permissions. Read the nuxt-backend core skill first.
---

# nuxt-backend: billing

Each workspace (or user, with `billTo: 'user'`) is a billing entity with a provider customer of
its own. The server decides what is sold; the client reads state and starts sessions. The
`nuxt-backend` core skill holds the rules every change follows; this one covers plans, checkout,
credits and gifts.

## The catalog

- Declare meters, plans, packs and features in `backend/billing.catalog.ts`, then run
  `npx nuxt-backend billing sync`: it creates the products, writes
  `backend/billing.generated.ts` and loads them on the deployment. Never edit the generated file.
- A plan has `prices: { month, year }` (cents), one product per price: `products.pro` is the
  monthly one, `products['pro:year']` the yearly one. Its `credits.units` is a month's
  allowance; the yearly price grants twelve times it once a year (`units: { month, year }` to set
  each). Never write `interval` and `price` on a plan: that is the 0.1 shape, and sync refuses it.
- A switch from a yearly price to a monthly one is scheduled for the paid year's end, whatever
  `proration` says (it reads back as `useBilling().pendingChange`): the year's credits were granted
  up front.
- A plan priced `{ month: 0 }` is the free plan (at most one, by the month only, no trial, no
  `usage`): a real subscription every workspace the auth layer makes starts on (queued by
  `billing:startFreePlan`, which `billing.ts` must export; call `billing.startFreePlan(ctx, id)`
  for one your own code writes), so its credits, features and quotas
  are granted like any plan's. A checkout of a paid plan upgrades it in place, a paid plan that
  ends puts the workspace back on it, and it is never checked out, changed or cancelled
  (`invalid_input`, reason `free_plan`). Existing workspaces join it with
  `npx convex run billing:startFreePlan '{}'`. Read it with `useBilling().isFree` or `plan`,
  never as `subscription === null`: the free plan is a subscription marked `free: true`, in
  `subscriptions` too (filter on `!free` for paid plans).
- Price a plan or pack per currency (`prices: { usd: { month: 2900 }, eur: { month: 2700 } }`,
  `price: { usd: 2000, eur: 1800 }`): native prices on the same product, one of them the
  catalog's `currency`. Never convert at a rate in code: `usePricing()` answers in the visitor's
  currency (`currency`, `currencies`, `setCurrency`), and checkout takes `currency`.
- Stop selling a plan with `retired: true`, never by deleting it: sync archives its products,
  its subscribers keep it, and a checkout or plan change to it is `invalid_input` (reason
  `retired`). Sync pushes a changed `trial`; other differences are drift to fix in the dashboard.
- Promotions are catalog `discounts` (`percentOff` or `amountOff`, `duration` `'once'`,
  `'forever'` or `{ months }`, `products: { plans, interval?, packs }`, `code?`,
  `maxRedemptions`, `perCustomer`, `startsAt`, `endsAt`), applied by key, never by id in code.
  A `code` makes one public. Sync patches one in place; publish changed terms under a new key and
  `retired: true` the old one. A client names only a public one
  (`checkout(id, { discount: 'launch' })`), server code any (`billing.checkout(ctx, { discount })`),
  `setupBilling({ checkoutDiscount })` picks one per plan checkout, and
  `billing.applyDiscount(ctx, { entityId, discount })` puts one on a subscription (guard it
  yourself: the provider skips the per-customer limit there). Show one with
  `<PricingTable discount="launch">`: real end date, regular price after it, never a countdown.
- Plan copy comes from `appConfig.backend.billing.plans` and `packs` (copy only: `blurb`,
  `features`, `highlight`, keyed like the catalog), plus an optional `contact` card.
- Development bills in the provider's sandbox: put a sandbox token in `.env.local`, run `env push`
  and `billing sync`, and pay with the test card. Without a token billing reads `missing`.
  `billing sync` writes the `sandbox` and `production` ids side by side. See
  https://nuxt-backend.dev/docs/develop/sandboxes.

## Reading state and gating

- Read state with `useBilling()`, `useFeatures()` and `useCredits({ meter: 'credits' })`, gate UI
  with `<Gate feature="key">`, and render plans with `<PricingTable>`.
- The billing composables follow the data conventions: `isPending`, `error` as
  `{ code, data, message } | null`, actions that reject. `useBilling().pendingChange` is the plan
  change scheduled for the next period (`cancelPendingChange()` undoes it), `isPastDue` a failed
  payment to update in the portal.
- Enforce a feature in the function, never only in the UI: `billing.requireFeature(ctx, 'key')`
  (or `billing.hasFeature` for a yes or no), or a function built with `withFeature('key')` from `backend/functions.ts`,
  the `workspace` tier plus the feature (the one `createFunctions` call takes `billing`, so
  `billing.ts` never imports `functions.ts`). Both read the entitlement cache, never the
  provider, and refuse with `feature_required`, whose `plans` are the plans on sale that include
  the feature. With `billTo: 'user'`, or behind another tier, call `billing.requireFeature` in
  the handler.
- Every gate names a benefit by its catalog key (the `key` in its metadata), else its benefit id:
  never a grant id, a type or another metadata value. Offer the upgrade with
  `<UpgradePrompt feature="key" />` (the `fallback` of `<Gate feature>`) or
  `<UpgradePrompt :plans="refusal.data.plans" />` after a refusal; it links to
  `/pricing?plan=<key>`.
- Quotas (experimental) limit how many of a thing a workspace holds at once, never per period
  (that is credits): `quotas: { projects: { description: 'projects' } }` in the catalog and per
  plan (a whole number or `'unlimited'`; a plan that names none allows none). Count in the
  mutation that makes the thing, `await billing.requireQuota(ctx, 'projects')` before the insert,
  and `billing.releaseQuota` where it is removed; never in an action or a query. It refuses with
  `quota_exceeded` (`limit`, `used`, `amount`, `plans`). Show it with `useFeatures().quota(key)`,
  `remaining(key)` and `<Gate quota="key">`. Never a quota on members, seats, users,
  teammates, collaborators, guests or people (`seat_limit` too): the sync refuses it.
- `useFeatures().benefits` lists every benefit granted, with a neutral `kind` (`license_key`,
  `download`, `community`, `repository`, `shared_channel`, `custom`, `credits`, `feature`,
  `other`) and its `name`. Show and gate on `kind`, never on the provider's `type`.

## Pricing

- `/pricing` and `<PricingTable>` render on the server from the scaffolded `getPricing`
  (`usePricing()`): live names, prices, trials and credits, a monthly / yearly switch
  (`v-model:interval`), packs compared per credit with a best value. Never hard-code a price or
  a credit count in a page: read `usePricing()`.
- Campaign links: `/pricing?discount=CODE&utm_source=…`. `useCampaign()` reads them from the
  address, `<PricingTable>` passes them to checkout, and the sign-in link keeps the query.
  Nothing is stored on the device.
- Out of credits: `usePricing().packFor(refusal.data.need)` is the smallest pack that covers an
  `insufficient_credits` refusal; `<BackendNotices />` shows the low-credits notice on its own.

## The billing section of /settings

- `<WorkspaceSettings>` (its `billing` section, on the ready-made `/settings`) follows the
  subscription's state: past due, paused, set to cancel, change scheduled, trial, active (the
  first that holds), with the actions the subscription allows, plus the benefits and the history.
- Cancelling is one step there and on `<PricingTable>`'s current plan: what ends when and one
  button, nothing else. Never add a save offer, a question or a field to that confirmation.
  The provider keeps a reason and comment only with the cancellation itself (it refuses a
  second one, as `invalid_input` reason `cancel_scheduled`), so a flow of your own passes them
  with `cancel({ reason, comment })`, never after it.
- Plan and pack checkouts come back with `?checkout_return=`; the module's plugin strips it at
  once and refreshes the entitlements once, `useBilling().isFinishingCheckout` true meanwhile.
  Your own `checkout_id={CHECKOUT_ID}` stays on the address; you don't need it for the plan.

## Checkout, the portal and plan changes

- The server decides what is sold: checkout takes only catalog products, returns only to
  `SITE_URL` (or `setupBilling({ trustedOrigins })`), and refuses the package's metadata keys
  (`userId`, `gift`, `giftId`, `phase`, `giftRecipient`, `recipientEmail`, `purchaserUserId`,
  `utm_*`) and a browser-chosen trial or `discountId`, each as `invalid_input`.
- A campaign passes `discountCode` and `utm`. A different trial (1 to 30 days, in days or weeks)
  or a discount by id goes through `billing.checkout(ctx, …)` in your own action, and the portal
  through `billing.portal(ctx, { returnUrl })`.
- `<BillingCheckoutLink :product-ids>` and `<BillingPortalLink>` create their session on click.
- A checkout for a second plan is `forbidden` (reason `already_subscribed`): switch with
  `changePlan`. Trials run once per owner.

## Who may manage billing

- Only a workspace's owner and admins check out, open the portal, change the plan and read orders
  and invoices; other members read and spend (`forbidden`, reason `not_billing_manager`).
- Membership and roles are read fresh on every call, and an impersonating admin may read but not
  spend.
- An agent reads with `billing:read` and hands out checkout links with `billing:checkout`, but
  never opens the portal or changes the plan.
- Hide buttons with `useBilling().canManage` (the scaffolded `getBillingAccess`), and check a
  caller in your own function with `billing.requireEntity(ctx, { access: 'manage' })`. Table:
  https://nuxt-backend.dev/docs/build/billing/setup#who-may-buy-for-a-workspace.

## Credits and gifts

- Credits are prepaid: `useCredits()` reads the balance and opens a top-up checkout, and metered
  AI spends them (the `nuxt-backend-ai` skill).
- Gifts are credit packs by catalog key, or a plan as a pass: `useGifts().send('credits500', {
  recipientEmail })` buys the pack's private gift product on the purchaser's own account (after an
  earlier paid order, never for their own address, five a day to one address); `send('pro', {
  months: 3, recipientEmail })` gifts a plan with `gift: { months }` in the catalog, which a free
  workspace holds for that long with no card. `deliverAt` dates it. The recipient claims it with
  `useGifts().claim(giftId, { workspaceId })`; the purchaser resends, readdresses, redates or
  cancels (refund, behind a recent sign-in) until then. `billing sync` creates the gift products.

## Tasks

<!-- generated:tasks -->
- [Set up billing](https://nuxt-backend.dev/docs/build/billing/setup): Wire setupBilling into the backend: the scaffolded billing.ts and its options, who pays and who may buy for a workspace, billing each person instead, what a deletion erases, the BILLING_* variables, and going live. Reach for `nuxt-backend/billing`.
- [Define and sync your catalog](https://nuxt-backend.dev/docs/build/billing/catalog): Declare meters, a free plan, plans with monthly and yearly prices in one currency or several, packs, features, quotas and promotions in billing.catalog.ts, push them with `nuxt-backend billing sync`, retire a plan without breaking its subscribers, and keep provider ids out of your code. Reach for `nuxt-backend/billing`.
- [Customize the pricing page](https://nuxt-backend.dev/docs/build/billing/pricing-page): The server-rendered /pricing page and `<PricingTable>`: live plans with a monthly and yearly switch, the free plan, prices in the visitor's currency, credit packs compared per credit, a contact card, retired plans, the copy in app config, slots, events and the page's meta tags. Reach for `usePricing()`.
- [Open checkout and the portal](https://nuxt-backend.dev/docs/build/billing/subscriptions/checkout): Start the provider's hosted checkout for a plan or a pack, send a billing manager to the customer portal, and choose on the server what a checkout may sell, with which trial and discount. Reach for `useBilling()`.
- [Gate features by plan](https://nuxt-backend.dev/docs/build/billing/subscriptions/feature-gating): Enforce a plan's features in your functions with requireFeature and the withFeature tier, gate the UI with useFeatures and Gate, and offer the plans that include a feature with UpgradePrompt: one feature key, read from one entitlement cache, on the server and in the browser. Reach for `useFeatures()`.
- [Limit resources per plan](https://nuxt-backend.dev/docs/build/billing/subscriptions/quotas): Declare how many projects, stories or sites each plan allows, count them in the mutation that makes them with requireQuota, and show what is left with useFeatures and the Gate component. Experimental. Reach for `useFeatures()`.
- [Show orders, invoices and usage](https://nuxt-backend.dev/docs/build/billing/subscriptions/orders): List an entity's past charges with invoice links, show its metered consumption, and refund an order from the admin tier. Reach for `useOrders()`.
- [Manage subscriptions](https://nuxt-backend.dev/docs/build/billing/subscriptions): Show a subscription in every state with the billing section of /settings, read it with useBilling, change the plan now or at the period's end, cancel in one step with an optional reason, and pause and resume it. Reach for `useBilling()`.
- [Spend credits in your functions](https://nuxt-backend.dev/docs/build/billing/credits/spending): Spend credits from your own server code, in one call or as reserve, run and settle so a failed run costs nothing, hold them for a queued job, let a plan with usage pricing go past the balance, and give credits back on a sum meter. Reach for `nuxt-backend/billing`.
- [Sell credits and top-ups](https://nuxt-backend.dev/docs/build/billing/credits): Prepaid credits on provider meters: read balances with useCredits, sell packs as top-ups, warn before the balance runs out, and offer the right pack when a call is refused for lack of credits. Reach for `useCredits()`.
- [React to billing events](https://nuxt-backend.dev/docs/build/billing/events): Run your own code when the billing provider reports an order, a subscription change or a refund, after the built-in refresh, and read billing's own events on the activity trail. Reach for `nuxt-backend/billing`.
<!-- /generated:tasks -->

## The API

[references/api.md](references/api.md) lists the composables, components, import path, the
`billing sync` flags, doctor findings and env of this area, each with its doc comment's first
sentence.
