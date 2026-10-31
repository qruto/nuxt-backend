---
title: Keep people engaged
description: "Which message to send, when, and on which channel: the first run and the activation checklist, lifecycle emails with caps and a sunset rule, automations, product announcements, and the cancel flow with win-back."
kind: landing
navigation:
  title: Overview
  icon: i-lucide-megaphone
---

Reach people at the moments that matter, on the channel that fits, and stop when they stop caring. Transactional messages answer something a person did: a code, a receipt, a strip that is ready. Engagement reaches out on its own: a nudge a day after sign-up, news about a release, an offer when someone cancels.

Each part runs on what the providers already do. Resend keeps contacts, topics, broadcasts and automations, and honors unsubscribes natively. Polar sends receipts, renewal and trial reminders, and failed-payment emails. The package adds the moments, the rules and the screens around them. It keeps no contact list and no bulk sender of its own.

## Which message, when

| Moment | Message | Channel | Page |
|---|---|---|---|
| First visit after sign-up | The first run at `/welcome`, then the activation checklist | In the app | [Guide people to their first result](/docs/build/growth/engage/activation) |
| 24 hours in, nothing created | A nudge toward the first result | Email, tips topic | [Send lifecycle emails](/docs/build/growth/engage/lifecycle-emails) |
| The first result is ready | "Your strip is ready" | Email and the in-app inbox | [Send lifecycle emails](/docs/build/growth/engage/lifecycle-emails), [Show in-app notifications](/docs/build/email/notifications) |
| Credits run low, a trial ends | An account notice | Email and a notice | [Send lifecycle emails](/docs/build/growth/engage/lifecycle-emails), [Sell credits and top-ups](/docs/build/billing/credits) |
| A release ships | A notice, plus a broadcast to those who opted in | In the app and email | [Announce product news](/docs/build/growth/engage/announcements) |
| Someone cancels | One question and one save offer | In the app | [Handle cancellations and win people back](/docs/build/growth/engage/cancel-flow) |
| 7 and 30 days after a plan ends | A win-back, to those who opted in | Email, offers topic | [Handle cancellations and win people back](/docs/build/growth/engage/cancel-flow#win-people-back) |
| Anything your own team writes | An automation built in Resend | Email | [Feed the provider's automations](/docs/build/growth/engage/automations) |

## The rules every marketing email follows

The flows, announcements and preferences enforce these rules for you. A marketing action you write yourself should follow them too:

- **Consent first.** Marketing reaches only people who opted into its topic. A news topic is off until a person turns it on, and the opt-in is recorded as their consent.
- **A way out in every email.** Every marketing email carries a working unsubscribe link and one-click unsubscribe in its headers, plus your postal address.
- **Transactional stays transactional.** A sign-in code, an invitation or a receipt never carries an offer. A billing event starts a marketing email only for people who opted into its topic.
- **Fewer, better emails.** Weekly caps, quiet hours, and no lifecycle or marketing mail after six months without a click or a visit.
- **Nobody is written to on a user's behalf.** People share the app with friends themselves: the app never emails someone who didn't ask.

[Guardrails on growth features](/docs/start/concepts/principles#guardrails-on-growth-features) explains why each rule is a default. [Follow email law](/docs/ship/compliance/email-law) cites the laws behind them.

## In this section

::card-group
  :::card{icon="i-lucide-sparkles" title="Guide people to their first result" to="/docs/build/growth/engage/activation"}
  Planned: the first run at `/welcome`, and an activation checklist that ticks itself off from your events.
  :::

  :::card{icon="i-lucide-list-ordered" title="Send lifecycle emails" to="/docs/build/growth/engage/lifecycle-emails"}
  Ready-made flows from welcome to win-back, with caps and a sunset rule, or a sequence in code.
  :::

  :::card{icon="i-lucide-workflow" title="Feed the provider's automations" to="/docs/build/growth/engage/automations"}
  Planned: contact properties and the events you choose, for automations built in Resend.
  :::

  :::card{icon="i-lucide-megaphone" title="Announce product news" to="/docs/build/growth/engage/announcements"}
  Planned: an in-app notice and a broadcast to the people who opted in, from the admin console.
  :::

  :::card{icon="i-lucide-door-open" title="Handle cancellations and win people back" to="/docs/build/growth/engage/cancel-flow"}
  Planned: one question, one save offer by reason, a lawful exit, and a win-back at 7 and 30 days.
  :::
::

## With the email pages

::card-group
  :::card{icon="i-lucide-sliders-horizontal" title="Let people choose their emails" to="/docs/build/email/preferences"}
  Planned: topics on `setupEmail`, a send that checks each person's choice, and one-click unsubscribe.
  :::

  :::card{icon="i-lucide-mail-open" title="Receive email" to="/docs/build/email/inbound"}
  Planned: replies by email and a support inbox, checked before your code sees them.
  :::

  :::card{icon="i-lucide-bell" title="Show in-app notifications" to="/docs/build/email/notifications"}
  Planned: an inbox in the app for the moments that don't need an email.
  :::
::

## Not included

- **A contact list of the package's own.** Contacts, segments and topics live in Resend, which honors unsubscribes natively.
- **A second copy of Polar's emails.** Receipts, renewal reminders and failed-payment emails stay Polar's ([Customer emails and notifications](/docs/build/billing/events/customer-emails)).
- **Send-time optimization.** Quiet hours keep mail out of the night; there is no evidence a "best hour" model does better.
