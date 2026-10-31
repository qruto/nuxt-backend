---
title: Grow your app
description: "Launch in phases, make offers, keep people engaged and measure what works: waitlist and invites, promotions, gifts and referrals, lifecycle email and the cancel flow, the funnel and experiments, each inside the law."
kind: landing
capability: billing
navigation:
  title: Overview
  icon: i-lucide-trending-up
---

Grow in four steps: launch in phases, make offers people can act on, keep them engaged, and measure what works. Each step keeps its legal guardrails by default.

Every piece runs on what the services already do. Better Auth decides who may sign up. Polar counts and limits discounts, grants benefits, cancels and pauses plans, and reports revenue. Resend keeps contacts and topics, and runs broadcasts and automations. The package adds the flows a client app needs on top: the waitlist and invites, offers declared in your catalog, lifecycle email with caps, the cancel flow, and a first-party funnel. A visitor's device stores nothing: an offer travels in the link, and an explicit step claims it.

## Launch

Open the doors in phases: early access with a waitlist, then invite only, then public.

::card-group
  :::card{icon="i-lucide-door-open" title="Launch in phases" to="/docs/build/growth/launch"}
  Planned: three phases switched from the admin console with no deploy, and what admits a new address in each.
  :::

  :::card{icon="i-lucide-list-checks" title="Run a waitlist" to="/docs/build/growth/launch/waitlist"}
  Planned: double opt-in, a public position, a referral boost, and admission in waves.
  :::

  :::card{icon="i-lucide-ticket" title="Hand out invite codes and access links" to="/docs/build/growth/launch/invites"}
  Planned: shareable codes with limits and personal links that admit one address.
  :::
::

## Offers

Turn your catalog into offers people can act on: a launch discount, a link from a newsletter, credits bought for a friend, a free month for a referral. Polar counts and limits each discount, copies checkout metadata to the order, and grants benefits. The package declares the offers in your catalog, applies them on the server where you say, and shows their real terms.

::card-group
  :::card{icon="i-lucide-badge-percent" title="Run a promotion" to="/docs/build/growth/offers"}
  A discount in the catalog, public by code or applied by your server, shown with its real end date.
  :::

  :::card{icon="i-lucide-ticket-percent" title="Mint discounts from your server" to="/docs/build/growth/offers/discounts"}
  One-off discounts your code creates for one customer, with Polar's limits.
  :::

  :::card{icon="i-lucide-link" title="Share campaign links" to="/docs/build/growth/offers/campaign-links"}
  A pricing link with a discount code and UTM attribution, carried through sign-in into checkout.
  :::

  :::card{icon="i-lucide-gift" title="Send, receive and manage gifts" to="/docs/build/growth/offers/gifts"}
  Buy a credit pack for someone by email; they sign in and claim it.
  :::

  :::card{icon="i-lucide-calendar-heart" title="Gift a plan as a pass" to="/docs/build/growth/offers/plan-passes"}
  Planned: a plan for 1, 3 or 12 months with no card and no renewal, and the reverse trial built on it.
  :::

  :::card{icon="i-lucide-share-2" title="Run a referral program" to="/docs/build/growth/offers/referrals"}
  Planned: a code per person, rewards once the first payment clears, and the share loop on share pages.
  :::
::

## Engage

Send the right message at the right moment, and let people go cleanly when they want to.

::card-group
  :::card{icon="i-lucide-megaphone" title="Keep people engaged" to="/docs/build/growth/engage"}
  Which message, when, on which channel, and the rules every marketing email follows.
  :::

  :::card{icon="i-lucide-sparkles" title="Guide people to their first result" to="/docs/build/growth/engage/activation"}
  Planned: the first run at `/welcome` and an activation checklist.
  :::

  :::card{icon="i-lucide-list-ordered" title="Send lifecycle emails" to="/docs/build/growth/engage/lifecycle-emails"}
  Ready-made flows from welcome to win-back, with caps and a sunset rule, or a sequence in code.
  :::

  :::card{icon="i-lucide-door-closed" title="Handle cancellations and win people back" to="/docs/build/growth/engage/cancel-flow"}
  Planned: one question, one save offer by reason, and a lawful exit.
  :::
::

## Measure

Count what works inside your deployment, with no tracking script.

::card-group
  :::card{icon="i-lucide-filter" title="Measure growth" to="/docs/build/growth/measure"}
  Planned: the funnel from waitlist to paid, attribution, "How did you hear about us?" and cohorts.
  :::

  :::card{icon="i-lucide-chart-line" title="Read revenue and usage" to="/docs/build/growth/measure/revenue"}
  Polar's revenue, churn per reason, usage and margin in the admin console.
  :::

  :::card{icon="i-lucide-flask-conical" title="Run an experiment" to="/docs/build/growth/measure/experiments"}
  Planned: variant flags, exposure, results with guardrails, and price tests as disclosed discounts.
  :::
::

## Growth across the package

| Stage | Feature | Status | Where |
|---|---|---|---|
| Before launch | Launch phases, switched from the admin console | Available | [Launch in phases](/docs/build/growth/launch) |
| Before launch | A double opt-in waitlist with a public position and a referral boost | Available | [Run a waitlist](/docs/build/growth/launch/waitlist) |
| Launch | Invite codes and access links, and admission in waves | Available | [Hand out invite codes and access links](/docs/build/growth/launch/invites) |
| Acquire | Promotions, server discounts and campaign links | Available | [Run a promotion](/docs/build/growth/offers) |
| Acquire | Credit gifts | Available | [Send, receive and manage gifts](/docs/build/growth/offers/gifts) |
| Acquire | Plan passes, the reverse trial and referrals | Available | [Gift a plan as a pass](/docs/build/growth/offers/plan-passes), [Run a referral program](/docs/build/growth/offers/referrals) |
| Convert | Upgrade prompts with a cool-down, quota gates, local prices at checkout | Available and planned | [Gate features by plan](/docs/build/billing/subscriptions/feature-gating), [Open checkout and the portal](/docs/build/billing/subscriptions/checkout) |
| Engage | Email sequences | Available | [Send lifecycle emails](/docs/build/growth/engage/lifecycle-emails) |
| Engage | Ready-made lifecycle flows, the activation checklist, announcements and automations | Planned | [Keep people engaged](/docs/build/growth/engage) |
| Retain | Cancel with a reason, pause and resume | Available | [Manage subscriptions](/docs/build/billing/subscriptions) |
| Retain | Save offers by reason and win-back emails | Planned | [Handle cancellations and win people back](/docs/build/growth/engage/cancel-flow) |
| Measure | The funnel, attribution, revenue and experiments | Planned | [Measure growth](/docs/build/growth/measure) |

## The rules they keep

Every growth feature ships with the same defaults, listed once under [Guardrails on growth features](/docs/start/concepts/principles#guardrails-on-growth-features):

- **Offers** show their real end date and the regular price. A price test is a disclosed discount, never a hidden price.
- **Sharing** discloses its incentive, and the app never emails someone without an account on a user's behalf.
- **Email** reaches marketing topics only with consent, carries one-click unsubscribe, and stops after six months of silence.
- **Cancelling** takes one step. A save offer is one optional step, and never stands in the way of a legal right.
- **Value** in gifts and rewards is units of service, never money.

The laws behind them are on [Compliance](/docs/ship/compliance): [subscription law](/docs/ship/compliance/subscriptions) for renewals, cancellation and the EU withdrawal button, and [email law](/docs/ship/compliance/email-law) for consent and unsubscribe. They are not legal advice: check them against the law where you sell.
