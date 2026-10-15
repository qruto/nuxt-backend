---
title: "Email"
description: "Auth emails sent for you, your own sends from server code, templates, test mode and live delivery tracking, through Resend inside the backend component."
kind: landing
playground: /playground/platform/email
api: /docs/reference/api/email
source: src/convex/integrations/email.ts
navigation:
  title: Overview
  icon: i-lucide-compass
---

Email goes through [Resend](https://resend.com), nested inside the `backend` component, so sending works once the `EMAIL_*` variables are set. The package sends the sign-in and account emails for you, your server code sends its own through `setupEmail`, and every message sent through the component is tracked until it is delivered, bounces or fails.

## What sends what

| Email | Sent by | Customize with |
|---|---|---|
| Sign-in, verification and email-change codes, welcome, delete-account, workspace invitation | The package, from the auth flow | [`templates`](/docs/email/templates) on `setupEmail` |
| Gift notification | The package, when a gift is paid | [`templates`](/docs/email/templates) on `setupEmail` |
| Everything else | Your server code, through `email.send` | Your own HTML or text, or a provider-hosted template |

The package's own emails go out through the same `setupEmail` instance: `setupAuth` and `setupBilling` take it as their `email` option, so its templates restyle them all. For drips, [`defineEmailSequence`](/docs/email/engagement/sequences) sends delivery-tracked steps from a durable workflow. For marketing, the scaffolded `email.ts` ships segments, contacts and broadcasts as internal actions.

## How it fits together

1. **Configure.** Set `EMAIL_API_KEY` and `EMAIL_FROM`; the scaffolded `convex.config.ts` forwards the `EMAIL_*` variables to the component. Until a key is set, sends do nothing and email-code sign-in throws; a dev deployment gets `NUXT_BACKEND_LOG_OTP=1`, which prints the codes to the console instead. See [Environment](/docs/email/sending#environment).
2. **Send.** From an action, `email.send(ctx, options)` enqueues a durable email and resolves to its id. From a mutation or a workflow step, call `components.backend.email.send` directly. See [Sending](/docs/email/sending#sending).
3. **Test, then go live.** Test mode is the default: the provider delivers only to its test addresses, such as `delivered@resend.dev`. Verify a sending domain in Resend, then set `EMAIL_TEST_MODE=false`. While test mode is on, the [sandbox inbox](/docs/email/sandbox-inbox) keeps an hour's copy of mail sent to those addresses, so a demo or an end-to-end test can still finish an email-code sign-in.
4. **Track.** Point a Resend webhook at `/email/events` and store `EMAIL_WEBHOOK_SECRET`. `useEmailStatus` then follows each message from `queued` to `delivered`, `bounced` or `failed`, and `events` hooks on `setupEmail` react to bounces and complaints. See [Delivery tracking](/docs/email/delivery-tracking).

## In this section

::card-group
  :::card{icon="i-lucide-send" title="Sending" to="/docs/email/sending"}
  Set up `setupEmail`, send from your server code, use the sandbox inbox, and configure the `EMAIL_*` variables.
  :::

  :::card{icon="i-lucide-layout-template" title="Templates" to="/docs/email/templates"}
  Every email the package sends, how to restyle any of them in one place, and how to preview them.
  :::

  :::card{icon="i-lucide-mail-check" title="Delivery tracking" to="/docs/email/delivery-tracking"}
  The `/email/events` webhook, `useEmailStatus`, and per-event hooks for bounces and complaints.
  :::
::

## Not covered here

- **Sending from the browser.** The scaffolded `send` is an internal action: a public one that takes its recipient from the browser would relay mail from your verified domain to any address. To let people type an address, put the send behind a role, as `sendAsAdmin` does.
- **Audiences.** Segments replaced the provider's audiences, and the package wraps segments only.
- **Automatic retention.** Delivery records stay until you prune them: schedule `email.cleanup` and `email.cleanupAbandoned` from a cron.
