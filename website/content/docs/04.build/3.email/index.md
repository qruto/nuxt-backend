---
title: "Email and notifications"
description: "How people hear from your app: the sign-in, workspace and gift emails sent for you, your own sends, branded and translated templates, delivery and deliverability, preferences and one-click unsubscribe, inbound mail and a support inbox, an in-app inbox and web push."
kind: landing
playground: /playground/notifications
api: /docs/reference/api/email
source: src/convex/integrations/email.ts
navigation:
  title: Overview
  icon: i-lucide-compass
---

- **You get:** every email your app sends, branded, translated and tracked to delivery; each person's choice of what else reaches them; mail that comes back in; an in-app inbox and web push.
- **Powered by:** [Resend](https://resend.com) for sending, delivery events, topics, suppressions, receiving and Inboxes, and the browsers' own push services for web push. Set Resend up on its [service page](/docs/services/resend).
- **The package adds:** the emails it sends for you, one layout in every language, refusals for mail that could not arrive, topics and one-click unsubscribe as code, the sending rules (weekly caps, quiet hours, sunset), and the notifications component.

Your app has to tell people things: a sign-in code, an invitation to a workspace, a gift waiting for them, a payment that failed, a strip that finished rendering. This tab covers every way it does. The package sends its own emails for you, and your code sends its own through the same instance. Each person chooses what else reaches them: by email, in the app or on their lock screen.

Two [capabilities](/docs/start/concepts/capabilities) do the work:

- **`email`**, powered by Resend, nested inside the `backend` component. Every message renders in one branded layout, in its reader's language, and is tracked until it is delivered or bounces. Topics, broadcasts, automations, receiving and Inboxes are Resend's own; the package adds the code around them.
- **`notifications`**, the package's own component in your deployment. It turns what happens in the backend into an in-app inbox, an email or a web push notification, on the channels each person allows.

Start in three steps: put a Resend key in `.env.local` as `EMAIL_API_KEY` and run `npx nuxt-backend env push`, [send one email](/docs/build/email/sending#check-it-works) to `delivered@resend.dev`, and read it back with `npx nuxt-backend inbox`.

In development, email runs on Resend's test addresses, which send real delivery events, and the [dev inbox](/docs/develop/dev-inbox) reads them back. Without a key, sign-in codes print in your terminal ([Develop on real sandboxes](/docs/develop/sandboxes#email-on-resends-test-addresses)).

## What sends what

| Message | Sent by | Change it with |
|---|---|---|
| Sign-in and verification codes, and the codes of an email change | The package, from the sign-in flow | The `otp` template ([Customize email templates](/docs/build/email/templates)) |
| The email-change notice, to the old address | The package, once a change goes through | The `emailChanged` template |
| The welcome email | The package, once, right after sign-up | The `welcome` template |
| A workspace invitation | The package, when a member invites someone | The `invite` template |
| A gift notification | The package, when a gift is paid | The `gift` template |
| The waitlist confirmation, the deletion notice, the new-device alert | The package, with the features that send them | Their templates, which land with each feature |
| Receipts, renewals, trial reminders and failed-payment emails | The billing provider, never this package | The provider's dashboard ([React to billing events](/docs/build/billing/events)) |
| Your own transactional email | Your server code, through `email.send` | Your HTML, or the package's layout through `email.compose` ([Send transactional email](/docs/build/email/sending)) |
| Onboarding, lifecycle and drip email | A ready-made flow on Resend's automations, or a durable sequence you declare | Its steps ([Send lifecycle emails](/docs/build/growth/engage/lifecycle-emails)) |
| Product news | An announcement an administrator composes, or your own broadcast | The announcement ([Announce product news](/docs/build/growth/engage/announcements)) |
| Notices about an account or a workspace: a role change, low credits, a new device | The notifications capability, from backend events | Each person's channels ([Show in-app notifications](/docs/build/email/notifications)) |

The package's own emails go out through your `setupEmail` instance: `setupAuth` and `setupBilling` send through it, so one template override restyles an email wherever it is sent.

## How it works

1. **Configure.** `setupEmail(components)` in `backend/email.ts` is your app's email instance. The scaffolded `convex.config.ts` forwards the `EMAIL_*` variables to the `backend` component ([Send transactional email](/docs/build/email/sending#environment)).
2. **Render.** Every email comes from a template in one registry, rendered into one layout with your brand, light and dark, in the recipient's language ([Brand your emails](/docs/build/email/templates/theme)).
3. **Check.** In test mode, a sign-in code or an invitation to a real address is refused up front, with a reason the page shows. An address Resend suppressed gets a step of its own at sign-in ([Handle suppressed addresses](/docs/build/email/delivery/suppressions)). Planned: a marketing send checks the person's topic, the weekly cap, quiet hours and the sunset rule ([Let people choose their emails](/docs/build/email/preferences)).
4. **Send.** A send is durable: the component queues it, retries it and keeps a delivery record. A sign-in code takes a path that keeps no record ([Secret emails leave no record](/docs/build/email/sending#secret-emails-leave-no-record)).
5. **Track.** Resend posts delivery events to `/email/events`, verified with `EMAIL_WEBHOOK_SECRET`. Each advances the email's record, which `useEmailStatus` reads live, then runs your handlers ([Track delivery](/docs/build/email/delivery)).
6. **Notify.** A backend event, such as a role change, a low balance or a bounce, writes its row on the activity trail. It then becomes a notification in the inbox and, with the preferences, an email and a push notification. Each goes only where its kind allows and the person has not opted out ([Show in-app notifications](/docs/build/email/notifications)).

## Who does what

- **The package** holds the templates, the layout and the languages, refuses mail that cannot arrive, and queues, retries and records every send. It verifies, deduplicates and logs every webhook delivery, and prunes its records every hour. With the planned features, it also keeps copies of each person's topic choices and of the suppressed addresses, applies the sending rules, and delivers notifications.
- **Resend** delivers the mail, signs the delivery events, keeps the list of addresses it no longer delivers to, and holds the contacts, topics, segments, broadcasts, automations and Inboxes.
- **Your app** decides what it sends and to whom, from data it trusts: a send never takes its recipient from the browser ([Send transactional email](/docs/build/email/sending#set-up-the-email-instance)).

## From development to production

`BACKEND_ENVIRONMENT` decides what email does on each deployment ([Environments](/docs/start/concepts/environments#backend_environment)):

| | `development` | `preview`, `sandbox` | `production` |
|---|---|---|---|
| Who receives mail | Resend's test addresses | Resend's test addresses | Every address |
| Reading a sign-in code | The terminal, or the [dev inbox](/docs/develop/dev-inbox) | The dev inbox | The person's own mailbox |
| Delivery events | Real ones, from the test addresses | Real ones, from the test addresses | Real ones |
| Broadcasts from announcements | Refused | Refused | Sent |
| Checks | `npx nuxt-backend doctor`, and the DevTools **Email** tab | `doctor` against that deployment | `npx nuxt-backend doctor --prod`: the sender's domain, bounce and complaint rates, the quota |

`npx nuxt-backend status` shows the `email` capability as `missing` without a key, `test` in test mode and `live` on production. [Get email into inboxes](/docs/build/email/delivery/deliverability) walks through going live.

## What you get

What the package ships for this part of the app, generated from the code: each name links to its
reference entry.

::what-you-get{area="email"}
::

## Choose a path

| If you want to | Read |
|---|---|
| Send an email from your own function | [Send transactional email](/docs/build/email/sending) |
| Change what the sign-in code or the invitation says | [Customize email templates](/docs/build/email/templates) |
| Write the emails in German | [Send email in each reader's language](/docs/build/email/templates/languages) |
| Put your logo and colors on every email (colors planned) | [Brand your emails](/docs/build/email/templates/theme) |
| Show "Delivered" next to an email you sent | [Track delivery](/docs/build/email/delivery) |
| Send real mail from your own domain | [Get email into inboxes](/docs/build/email/delivery/deliverability) |
| Keep sign-in codes and newsletters on separate senders (planned) | [Get email into inboxes](/docs/build/email/delivery/deliverability#separate-your-senders) |
| Let a demo or an end-to-end test sign in without a mailbox | [Read test mail in the dev inbox](/docs/develop/dev-inbox) |
| Follow up a day after sign-up | [Send lifecycle emails](/docs/build/growth/engage/lifecycle-emails) |
| Email the people who opted into product news (planned) | [Let people choose their emails](/docs/build/email/preferences), then [Announce product news](/docs/build/growth/engage/announcements) |
| Hear from visitors and answer from a shared support inbox | [Add a contact form](/docs/build/email/inbound/contact-form) |
| Tell someone in the app that they were given a role (planned) | [Show in-app notifications](/docs/build/email/notifications) |
| Reach people with the app closed (planned) | [Send web push notifications](/docs/build/email/notifications/web-push) |

## In this tab

### Send

::card-group
  :::card{icon="i-lucide-send" title="Send transactional email" to="/docs/build/email/sending"}
  `setupEmail`, `email.send` from your functions, idempotent sends, record retention and the `EMAIL_*` variables.
  :::

  :::card{icon="i-lucide-layout-template" title="Customize email templates" to="/docs/build/email/templates"}
  Every email the package sends, restyled in one place, and previewed before it goes out.
  :::

  :::card{icon="i-lucide-languages" title="Send email in each reader's language" to="/docs/build/email/templates/languages"}
  Your i18n messages, the reader's `user.locale`, a fallback for people without an account, and localized links.
  :::

  :::card{icon="i-lucide-palette" title="Brand your emails" to="/docs/build/email/templates/theme"}
  Planned: your colors and fonts on the layout, the postal address, and blocks for emails of your own.
  :::

  :::card{icon="i-lucide-mail-check" title="Track delivery" to="/docs/build/email/delivery"}
  The `/email/events` webhook, `useEmailStatus`, and your own handlers for bounces and complaints.
  :::

  :::card{icon="i-lucide-inbox" title="Get email into inboxes" to="/docs/build/email/delivery/deliverability"}
  A verified sending domain, separate senders for transactional and marketing mail, DMARC and BIMI, and what is refused because it would not arrive.
  :::

  :::card{icon="i-lucide-mail-x" title="Handle suppressed addresses" to="/docs/build/email/delivery/suppressions"}
  Planned: addresses Resend stopped delivering to, a clear step at sign-in, and lifting one from the admin console.
  :::
::

### Preferences and inbound

Email that reaches out on its own, and mail that comes back. [Keep people engaged](/docs/build/growth/engage) covers which message to send when; this tab covers the rules every one of them follows.

::card-group
  :::card{icon="i-lucide-sliders-horizontal" title="Let people choose their emails" to="/docs/build/email/preferences"}
  Planned: topics with double opt-in, the soft opt-in at checkout, one-click unsubscribe, weekly caps, quiet hours and the sunset rule.
  :::

  :::card{icon="i-lucide-mail-open" title="Receive email" to="/docs/build/email/inbound"}
  Planned: replies by email on the right thread, an address per workspace, and a shared support inbox.
  :::

  :::card{icon="i-lucide-message-square-text" title="Add a contact form" to="/docs/build/email/inbound/contact-form"}
  A contact form, protected and rate-limited, with each message a thread in your support inbox.
  :::

  :::card{icon="i-lucide-list-ordered" title="Send lifecycle emails" to="/docs/build/growth/engage/lifecycle-emails"}
  Welcome, first result, credits low and win-back flows, and sequences of your own.
  :::

  :::card{icon="i-lucide-megaphone" title="Announce product news" to="/docs/build/growth/engage/announcements"}
  Planned: an in-app notice and a broadcast to the people who opted in.
  :::
::

### Notifications

::card-group
  :::card{icon="i-lucide-bell" title="Show in-app notifications" to="/docs/build/email/notifications"}
  Planned: an in-app inbox fed by backend events, and the channels each kind may use.
  :::

  :::card{icon="i-lucide-bell-plus" title="Notify people about your own events" to="/docs/build/email/notifications/custom-events"}
  Planned: an event of your own, in the inbox, by email and as push, under each person's choices.
  :::

  :::card{icon="i-lucide-bell-ring" title="Send web push notifications" to="/docs/build/email/notifications/web-push"}
  Planned: push in Safari, Chromium and Firefox, with keys `env push` generates, each kind opted into.
  :::

  :::card{icon="i-lucide-smartphone" title="Make the app installable" to="/docs/build/email/notifications/installable"}
  Planned: a manifest from your brand and two icons, and the Home Screen install iPhone needs for push.
  :::
::

## Not included

- **Sending from the browser.** The scaffolded `send` is internal: a public action that takes its recipient from the browser would relay mail from your verified domain to any address. To let someone type an address, put the send behind the admin role ([Send transactional email](/docs/build/email/sending#set-up-the-email-instance)).
- **Rebuilding the billing provider's emails.** Receipts, renewals and dunning stay the provider's, and a billing event never becomes an email of the package's ([Principles](/docs/start/concepts/principles)).
- **A bulk sender of its own.** Marketing goes through Resend's topics, segments and broadcasts. Contacts live in Resend, never in a list of the package's.
- **Audiences.** Resend replaced them with segments, and the package wraps segments only.
- **Writing to people a user names.** Beyond a workspace invitation and a gift, the app never emails someone without an account on a user's behalf.
- **Legal review.** The email-law duties (consent, the postal address, unsubscribe deadlines) are on [Follow email law](/docs/ship/compliance/email-law). That page is not legal advice.

## Next

- [AI features](/docs/build/ai): features you sell for credits, which the low-balance notice follows.
- [Production checklist](/docs/ship/checklist): the production checks, the email ones included.
