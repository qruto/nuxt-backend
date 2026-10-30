---
title: Track delivery
description: "Follow every email you send to delivered, bounced or complained: the /email/events webhook, useEmailStatus in a page, your own handlers for each provider event, bounces on the activity trail, and the delivery log."
kind: how-to
capability: email
api: /docs/reference/api/use-email-status
source: src/runtime/vue/composables/use-email-status.ts
navigation:
  icon: i-lucide-mail-check
---

- **You get:** each email's status, live in a page, and your own code run on every bounce, complaint or delivery.
- **Powered by:** Resend's signed delivery webhooks and its test addresses, which send real events in development.
- **The package adds:** the `/email/events` route that verifies, deduplicates and logs each delivery, the status record, `useEmailStatus`, typed handlers, and bounces on the activity trail.

Show whether an email arrived, and act when one bounces. Resend posts a delivery event for every email the component sends to the `/email/events` webhook, which [`registerBackendRoutes`](/docs/ship/security/webhooks) mounts. The package verifies each event with `EMAIL_WEBHOOK_SECRET` and advances the email's status: `queued`, `sent`, then `delivered`, `bounced`, `complained` or `failed`, with `delivery_delayed`, `opened` and `clicked` beside them. `useEmailStatus` follows that status live in a page.

## Point the provider at the route

In the Resend dashboard, add a webhook to `https://<slug>.convex.site/email/events`, subscribed to the `email.*` events. Add the `contact.*` and `suppression.*` events when you use [topics](/docs/build/email/preferences) and [suppressions](/docs/build/email/delivery/suppressions). Store its signing secret:

```bash
echo 'EMAIL_WEBHOOK_SECRET=your_webhook_signing_secret' >> .env.local
npx nuxt-backend env push
```

Until the secret is set, the route is mounted but fails closed: every delivery answers `503`, `useEmailStatus` stays at `sent`, and `npx nuxt-backend doctor` reports it (`email-webhook-route`). The secret takes a comma-separated list (`whsec_new,whsec_old`) for a rotation with no downtime.

## On your dev deployment

The events in development are real. Send to one of Resend's test addresses, and Resend posts the event it stands for: `delivered@resend.dev` sends `email.delivered`, `bounced@resend.dev` sends `email.bounced`, and `complained@resend.dev` sends `email.complained` ([Develop with real sandboxes](/docs/develop/sandboxes#email-on-resends-test-addresses)).

A cloud dev deployment has a public URL, so the events reach it as they reach production. A local or account-free deployment runs on your machine, where Resend cannot reach it, so its emails stay at `sent`. To track them there, point the webhook at a tunnel (Cloudflare Tunnel or ngrok, for one) to the deployment's HTTP origin.

## Show the status in a page

`useEmailStatus` follows one email the browser asked for. Return the id from an action of the `authed` tier, whose `ctx.user` is the signed-in caller, that emails the person's own address:

```ts [backend/strips.ts]
import { v } from 'convex/values'
import { email } from './email'
import { authed } from './functions'

export const emailMeMyStrip = authed.action({
  args: { title: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { title }) => email.send(ctx, {
    to: ctx.user.email,
    subject: `Your strip: ${title}`,
    text: 'Open it from your studio.',
  }),
})
```

```vue [app/pages/studio.vue]
<script setup lang="ts">
import { api } from '#backend/api'

const send = useAction(api.strips.emailMeMyStrip)
const emailId = ref<string>()
const delivery = useEmailStatus({ emailId })

async function emailMe() {
  emailId.value = (await send({ title: 'The lighthouse' })) ?? undefined
}
</script>

<template>
  <button @click="emailMe">Email it to me</button>
  <p v-if="delivery.isLoading.value">Sending…</p>
  <p v-else-if="delivery.isDelivered.value">Delivered</p>
  <p v-else-if="delivery.isFailed.value">{{ delivery.data.value?.errorMessage ?? delivery.status.value }}</p>
  <p v-else-if="delivery.error.value">{{ delivery.error.value.message }}</p>
  <p v-else>{{ delivery.status.value }}</p>
</template>
```

`useEmailStatus({ emailId })` returns:

::field-group
  :::field{name="data" type="ComputedRef<EmailStatus | null | undefined>"}
  The full record: `status`, `errorMessage`, `bounced`, `complained`, `failed`, `deliveryDelayed`, `opened`, `clicked`. `null` when unknown, `undefined` while loading.
  :::

  :::field{name="status" type="ComputedRef<string | undefined>"}
  The status string.
  :::

  :::field{name="isLoading / isDelivered / isFailed" type="ComputedRef<boolean>"}
  Loading until the first status arrives; delivered; or bounced, complained or failed.
  :::

  :::field{name="error" type="ComputedRef<BackendError | null>"}
  Why the status could not be read (`{ code, data, message }`), or `null`. A failed delivery is `isFailed`, not `error`, and a failed read never throws.
  :::
::

`useAction`, `useEmailStatus` and `ref` are auto-imported, and `#backend/api` is your backend's generated API. Tracking pauses while `emailId` (a value, a ref or a getter) is `undefined` or empty, and `isLoading` stays `true` until the first status arrives. The composable reads `getEmailStatus`, which the scaffolded `backend/email.ts` re-exports from `email.api`; pass `{ api }` to point it elsewhere.

::note
`getEmailStatus` requires a signed-in caller. Delivery records carry the recipient and error details, and email ids leak through return values and logs, so the lookup is never anonymous.
::

## Reacting to events

Per-event handlers go on `setupEmail`, keyed by the provider's event names: `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked`, `email.failed`, `email.scheduled`, `email.received`, `inbox.email.received`, `email.suppressed`, `contact.created` / `updated` / `deleted`, and `domain.created` / `updated` / `deleted`. Handlers run after the component has verified the signature and recorded the status, so `useEmailStatus` already shows the event. The two received events run after the package routed and stored the mail ([Receive email](/docs/build/email/inbound)):

```ts [backend/email.ts]
export const email = setupEmail(components, {
  // …your other options
  events: {
    'email.bounced': async (ctx, event) => {
      // event.data: { email_id, to, subject, bounce: { type, subType, message }, … }
      console.warn('bounced', event.data.email_id, event.data.bounce?.type)
    },
    'email.complained': async (ctx, event) => { /* alert an admin */ },
  },
  // A verified event the catalog doesn't know yet: acknowledged with 202 either way.
  onUnknownEvent: async (ctx, { type, payload }) => { /* … */ },
})
```

A handler that throws answers `500`, so the provider redelivers. A redelivery of a delivery id already fully processed answers `200` without running anything again. When a handler runs, how often and in what order are on [Hooks](/docs/reference/backend/hooks#setupemail-events).

A broadcast's emails arrive as `email.*` events too, with a `broadcast_id` in their data. The component keeps no record of them, so `useEmailStatus` does not follow them; your handlers do.

## Bounces on the activity trail

A bounce to an address an account holds is recorded on the [activity trail](/docs/build/auth/admin/audit-log) as `email.bounced`, about that account. The row names the account, never the address or the email. An address no account holds records nothing. Pass your `audit` instance so the event reaches its `onEvent` too:

```ts [backend/email.ts]
import { audit } from './audit'

export const email = setupEmail(components, {
  // …your other options
  audit,
})
```

Without it, the event is recorded on the component's own trail. The event also puts a notice in the person's [in-app inbox](/docs/build/email/notifications), never an email, since mail to that address is what bounced. Addresses the provider stops delivering to altogether are [suppressions](/docs/build/email/delivery/suppressions).

## The delivery log

The component logs the outcome of every request to the route: `ok`, `invalid_signature`, `unknown_type`, `handler_error`, `duplicate`, `oversized` or `missing_secret`. A delivery whose signature verified gets a row of its own, among the newest 200. A request refused before that, or a duplicate, is counted on one row per kind, so a flood of them can't push a real delivery out.

`getWebhookDeliveries` serves the log to administrators, and DevTools reads it through the same function; anyone else gets `null`. An administrator replays a delivery through the provider from the admin console ([Replay a webhook delivery](/docs/ship/operate/replay)).

## Limits

- **Opens are not reliable.** Apple Mail Privacy Protection loads every image on receipt, so `opened` fires for mail nobody read. Judge engagement by clicks and by activity in your app, as the [sunset rule](/docs/build/email/preferences#sunset-inactive-readers) does.
- **Webhooks are per Resend team.** A webhook belongs to a Resend team and gets every matching event of that team, so a dev or demo deployment needs a Resend team of its own, or it receives production's events ([Develop on real sandboxes](/docs/develop/sandboxes#email-on-resends-test-addresses)).
- **Events can arrive out of order.** A `delivered` can land after a `clicked`. The record keeps the furthest status it has seen, and your handlers should not assume an order.
- **Broadcast emails keep no record.** Your handlers see them; `useEmailStatus` does not.

## Related

- [Resend](/docs/services/resend): the webhook and its signing secret.
- [Register webhooks](/docs/ship/security/webhooks): the routes `registerBackendRoutes` mounts.
- [Events](/docs/reference/backend/events): the provider's event names, and the backend's own.
- [`useEmailStatus`](/docs/reference/api/use-email-status): the composable's generated reference.
