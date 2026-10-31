---
name: nuxt-backend-growth
description: Growing a Nuxt app on nuxt-backend. Launch phases with a waitlist and invites, catalog promotions, server-minted discounts, campaign links, plan passes, referrals and gifts, guiding people to their first result, lifecycle email and announcements, the cancel flow and win-back, and measuring the funnel and revenue. Use when opening sign-up in phases, adding an offer, a referral or a gift, an onboarding checklist, a lifecycle or announcement email, a cancel flow, or growth metrics. Read the nuxt-backend core skill first.
---

# nuxt-backend: growth

Growth runs on what the services already do: the billing provider counts and limits discounts and
grants benefits, the email provider holds contacts, topics and broadcasts, and the backend keeps the
launch phase, the waitlist and the funnel in your own deployment. The `nuxt-backend` core skill
holds the rules every change follows; billing itself (plans, checkout, credits) is in
`nuxt-backend-billing`, and sending email in `nuxt-backend-email`.

## Rules

- **Offers are declared, then applied on the server.** A promotion lives in the catalog; a discount
  your server mints never reaches the client as a code it can reuse.
- **A device stores nothing.** An offer travels in the link, and an explicit step on the page
  claims it.
- **Show the real terms.** An offer shows the end date and the limits the billing provider
  enforces, never a countdown it does not.
- **Marketing needs consent.** Lifecycle and announcement email go only to people subscribed to the
  topic, with one-click unsubscribe; sign-in and receipts are transactional and always sent.

## Tasks

<!-- generated:tasks -->
- [Mint discounts from your server](https://nuxt-backend.dev/docs/build/growth/offers/discounts): Mint, list and remove discounts from server code, let customers type codes at checkout, pass a campaign's code, or apply a discount your server chooses. Discounts you plan ahead belong in the catalog. Reach for `useBilling()`.
- [Share campaign links](https://nuxt-backend.dev/docs/build/growth/offers/campaign-links): Share a pricing link with a discount code and UTM attribution: useCampaign reads both from the address, the pricing page carries them through sign-in into checkout, and the provider stores the attribution on the order. Reach for `useCampaign()`.
- [Gift a plan as a pass](https://nuxt-backend.dev/docs/build/growth/offers/plan-passes): Let a customer buy a plan once as a gift: the recipient's free workspace gets the plan for 1, 3 or 12 months, with every benefit the plan grants, no card and no renewal, and a notice before it ends. Experimental. Reach for `useGifts()`.
- [Run a referral program](https://nuxt-backend.dev/docs/build/growth/offers/referrals): Give every person a referral link, attribute sign-ups through an explicit claim with nothing stored on the device, and reward both sides from your catalog once the referred person's first payment clears its hold, with caps and abuse checks.
- [Send, receive and manage gifts](https://nuxt-backend.dev/docs/build/growth/offers/gifts): Buy a credit pack for someone else by email with useGifts().send. The purchaser pays on their own billing account and keeps the receipt; the recipient signs in and claims the credits at no cost. Reach for `useGifts()`.
- [Run a promotion](https://nuxt-backend.dev/docs/build/growth/offers): Declare a discount in the catalog, as a public code or one only your server applies, push it with billing sync, apply it at checkout by its key, pick one per customer, put one on a subscription, and show its real terms on the pricing page. Reach for `nuxt-backend/billing`.
- [Guide people to their first result](https://nuxt-backend.dev/docs/build/growth/engage/activation): A first run at /welcome for every new account, then an activation checklist of three to seven tasks that ticks itself off from your own events, shows progress, and goes away once done or dismissed.
- [Send lifecycle emails](https://nuxt-backend.dev/docs/build/growth/engage/lifecycle-emails): Turn on ready-made lifecycle flows (welcome, a nudge for people who created nothing, first result, credits low, trial ending, abandoned checkout, win-back), keep them under weekly caps, quiet hours and a sunset rule, or write a sequence of your own in code. Reach for `nuxt-backend/workflows`.
- [Feed the provider's automations](https://nuxt-backend.dev/docs/build/growth/engage/automations): Send Resend the contact properties and the events you choose, so automations built in its dashboard can send a tip after a first story or a nudge after a quiet week, with no drip code of your own and nothing forwarded unless your code sends it. Reach for `nuxt-backend/email`.
- [Announce product news](https://nuxt-backend.dev/docs/build/growth/engage/announcements): Tell people about a release from the admin console: a dismissible notice in `<BackendNotices>` with an expiry, and an optional broadcast to the people who opted into a topic, created once, sent by id, and never outside production. Reach for `nuxt-backend/email`.
- [Handle cancellations and win people back](https://nuxt-backend.dev/docs/build/growth/engage/cancel-flow): Ask one optional question when someone cancels, make one offer that fits the answer (a pause, a smaller plan or a discount), honor the cancellation without a maze, and write again at 7 and 30 days to people who opted in. Reach for `useBilling()`.
- [Read revenue and usage](https://nuxt-backend.dev/docs/build/growth/measure/revenue): Polar's live metrics in the admin console: recurring revenue, new, renewed and churned subscriptions, cancellations per reason, checkouts, usage per meter, and costs and margin once AI costs are reported, read fresh with no ledger of its own. Reach for `nuxt-backend/billing`.
- [Run an experiment](https://nuxt-backend.dev/docs/build/growth/measure/experiments): Split signed-in people between two versions of a page or an offer with a variant flag, record who saw which, count each variant's conversions and guardrails in the admin console, and run price tests only as disclosed discounts. Reach for `nuxt-backend/flags`.
- [Measure growth](https://nuxt-backend.dev/docs/build/growth/measure): First-party, cookie-free growth funnels in the admin console, from waitlist to paid, broken down by invite, campaign, referral, promotion and the how-did-you-hear answer, with cohort retention counted next to your data. Reach for `nuxt-backend/admin`.
<!-- /generated:tasks -->

## The API

Growth uses the billing, email and auth APIs: their task skills' `references/api.md` list the
names. The docs: https://nuxt-backend.dev/docs/build/growth.
