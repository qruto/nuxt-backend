---
title: Show in-app notifications
description: "Put <NotificationInbox> in your header and every event the backend records about a person (an invitation, a role, low credits, a payment, a gift, a bounce) reaches it live, in their language, with the channel matrix that decides which kinds may also email or push."
kind: how-to
capability: notifications
navigation:
  title: In-app notifications
  icon: i-lucide-bell
---

- **You get:** an inbox in your header that shows, live and in each person's language, every event the backend records about them, plus the same events by email or push where they allow it.
- **Powered by:** the package's own Convex component in your deployment. There is no provider to set up; email goes through Resend and push through the browsers' push services.
- **The package adds:** the inbox component and composable, the kinds every built feature records, the channel matrix, each person's channel choices, and the sending rules.

Tell people what happened while they were away: they were given a role, a gift arrived, their credits ran low, an email to them bounced. Put `<NotificationInbox>` in your header, and every event the backend already records about a person reaches it, live and in their language, with nothing to wire per kind. The inbox runs on the package's own component in your deployment, with no provider to set up.

## How it works

Every notification starts as an event on the shared event path, the one the [activity trail](/docs/build/auth/admin/audit-log) records:

1. **An event is recorded** about one account, where it happens: a role change in the workspace hooks, a low balance in a credit spend, a bounce in the email webhook. The notification is written in the same transaction as the event, so one never exists without the other.
2. **Its kind decides who is told, and the channels.** Each kind declares what it may become beside its row, and the channel matrix below narrows it. A workspace's billing kinds tell its owners and admins, an accepted invitation tells whoever sent it while they are still a member (else the workspace's owners and admins), and the rest tell the account they are about, except for what that account did itself. What an administrator did while acting as an account names an administrator, never the account, and that account hears of it too. The [Events](/docs/reference/backend/events) reference lists the kinds.
3. **The person's choices narrow it again.** A channel a person turned off for that kind is skipped ([Notification channels](/docs/build/email/preferences#notification-channels)).
4. **Each channel delivers.** A notification in the app, live in the inbox, written in the same transaction; an email in the package's layout; a [push notification](/docs/build/email/notifications/web-push) to each device the person allowed. Email and push only enqueue there: the deployment schedules your `deliverNotification` with ids alone, and it reads the address, words the message and sends once the event committed. Email and push follow the weekly cap and quiet hours set on `setupEmail` ([Cap how often people hear from you](/docs/build/email/preferences#cap-how-often-people-hear-from-you)), never the sunset rule; the inbox never waits.

The words of each notification are labels, so they read in the person's language and change like the rest of the UI ([Change copy and labels](/docs/build/ui/customize/labels)): a `title` and a `body` under `backend.notifications`, such as `workspace.member_removed.title`. A notification links to the ready-made page where the person manages what it is about: the profile, the security page or the settings. A free plan's own lifecycle events notify no one.

## What notifies

| Area | Notifications | Channels |
|---|---|---|
| The account | A passkey added or removed, the address changed, a sign-in from a new device | In the app, and by email |
| Workspaces | An invitation accepted, a member removed, a role changed | In the app |
| Administration | An app-wide role changed by an administrator | In the app |
| Billing | A plan changed, a subscription started, cancelled or ended, an order paid or refunded, a payment past due, credits low or exhausted | In the app only |
| Gifts and referrals | A gift bought, claimed or refunded, a plan pass ending, a referral claimed or rewarded | In the app only |
| Email | An email to the person's address bounced | In the app only |

The sign-in from a new device arrives with [new-device alerts](/docs/build/auth/accounts/alerts), whose email the sign-in sends itself, with the device, place and time: the email channel never sends a second one, and the person's email choice for that kind holds for the sign-in's email. The payment past due and the plan pass arrive with the features that record them. The rest are recorded today and wait only for this capability to deliver them. Your own kinds join through [Notify people about your own events](/docs/build/email/notifications/custom-events).

## The channel matrix

What a kind may do, whatever it declares:

- **In the app**: every kind that declares it.
- **By email**: only a kind no provider already emails about. A billing, gift or referral kind never sends an email of the package's, since the billing provider sends its customers their receipts, renewals and failed-payment emails. A bounce never emails the address that bounced. A test holds every billing kind to this rule.
- **As a push notification**: a kind the person opted into, on a device they allowed ([Send web push notifications](/docs/build/email/notifications/web-push)). Billing kinds stay in the app.

Because billing kinds stay in the app, `npx nuxt-backend doctor` warns when the billing provider's own customer emails are turned off. Without them, a failed payment would reach no inbox at all ([Customer emails and notifications](/docs/build/billing/events/customer-emails)).

## Set it up

`setupNotifications(components, options?)` from `nuxt-backend/notifications` holds the capability in your backend. The scaffolded `backend/notifications.ts` creates it with the email instance, which words and sends the email and push channels, and re-exports the reads and writes the inbox, the profile's channels and web push call:

```ts [backend/notifications.ts]
import { setupNotifications } from 'nuxt-backend/notifications'
import { components } from './_generated/api'
import { email } from './email'
import { paths } from './paths.generated'

export const notifications = setupNotifications(components, { email, paths })

export const { listNotifications, getUnreadCount, markNotificationsRead } = notifications.api
export const { getNotificationChannels, setNotificationChannel, getPushConfig, subscribePush, unsubscribePush, deliverNotification } = notifications.api
```

Without `email`, notifications reach the inbox alone. `paths` is where a package kind's email links: its ready-made page, wherever `nuxt.config` moves it.

Its `notify` option turns events of your own into notifications ([Notify people about your own events](/docs/build/email/notifications/custom-events)). The package's own kinds need nothing from it: the backend notifies as it records them. `backend/audit.ts` passes the instance to `setupAudit({ notifications })`, so the events of your own that `notify` names reach it too.

## Show the inbox

Put the inbox where people look, in your header:

```vue [app/components/AppHeader.vue]
<template>
  <header>
    <NotificationInbox />
  </header>
</template>
```

`<NotificationInbox>` is a button with the unread count, in its accessible name as well as on screen ("99+" past 99). It opens the list on the browser's own popover: newest first, each notification linking to where it happened, read or still to read. Following one marks it read, **Mark all as read** marks the rest, and **Show older** loads the next page. It shows nothing to a signed-out visitor, and nothing while an administrator acts as the account: an inbox is its own person's. The [app shell](/docs/build/ui/app-shell) carries it in its header, and the playground's layout shows it.

For an inbox of your own, `useNotifications()` returns the list, paged, the unread count, and the actions that mark notifications read (`markRead` for the ones you name, `markAllRead` for every one):

```vue [app/components/MyInbox.vue]
<script setup lang="ts">
const { items, unreadCount, markRead, loadMore } = useNotifications()
</script>

<template>
  <p>{{ unreadCount }} unread</p>
  <ul>
    <li v-for="item in items" :key="item.id">
      <NuxtLink :to="item.link ?? undefined" @click="markRead([item.id])">{{ item.title }}</NuxtLink>
    </li>
  </ul>
  <button @click="loadMore">Older</button>
</template>
```

`useNotificationInbox()` is `<NotificationInbox>` without its markup: its state, the button's name with the unread count in it, and the bindings for a button and a list on the browser's popover, for an inbox that looks like your app.

## How long notifications are kept

The component's hourly maintenance prunes a read notification 90 days after it was read and an unread one 365 days after it was recorded. A notification of your own kind goes sooner when you delete what it points at ([Forget them](/docs/build/email/notifications/custom-events#forget-them-with-what-they-point-at)). A person's notifications are erased with their account, and listed on the [Privacy and data inventory](/docs/ship/compliance/privacy) page.

## In development

The capability runs the same code on your dev deployment, with no provider: events recorded there reach the inbox at once. The DevTools **Account** tab lists the signed-in person's notifications, and the seeded personas of [Try everything](/docs/start/playground/try-everything) arrive with some to read.

## Limits

- **One inbox per account.** Notifications follow the person, not the workspace: a person in two workspaces sees both in one list, each naming the workspace it happened in. A package kind links to its ready-made page, which shows the active workspace.
- **No digest.** Each event is its own notification and its own email. Batch your own kinds before you record them when one action makes many.
- **Live while the page is open.** The inbox updates over the Convex connection; with the app closed, only email and push reach the person.

## Related

- [Notify people about your own events](/docs/build/email/notifications/custom-events): your own kinds in the inbox, by email and as push.
- [Let people choose their emails](/docs/build/email/preferences#notification-channels): each person's channels, kind by kind.
- [Record and review activity](/docs/build/auth/admin/audit-log): the event path every notification starts on.
- [Events](/docs/reference/backend/events): every kind, and what it becomes.
