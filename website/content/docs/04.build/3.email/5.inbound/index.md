---
title: Receive email
description: "Turn mail sent to your app into app events and conversations: replies that reach the right person and thread, an address per workspace, and a shared support inbox with reply by email, on Resend's receiving and Inboxes, checked for spoofing before your code sees them."
kind: how-to
capability: email
navigation:
  title: Receiving
  icon: i-lucide-mail-open
---

- **You get:** replies by email on the right thread, an address per workspace, and a support address your team answers from one shared inbox.
- **Powered by:** Resend's receiving, which takes mail for a domain you point at it and posts `email.received`, and Resend Inboxes (since 2026-10-21), which store, thread and label conversations and send replies from the inbox address.
- **The package adds:** reply addresses tied to a person and a thread, the DMARC and sender checks, hooks for your code, the support inbox wired to the contact form, and the admin console's **Inbox** tab.

Let people answer by email. A reply to an email your app sent lands back in the app, on the thread it answers, as the person who sent it. Mail sent to a workspace's own address arrives in that workspace. Resend receives the mail on a domain you point at it, and the package checks each message and hands it to your code.

## How it works

1. **Resend receives.** A receiving domain, such as `in.panels.app`, points its MX records at Resend, and mail to any address on it arrives there.
2. **One route.** Resend posts an `email.received` event to `/email/events`, the route that already carries delivery events, verified with the same `EMAIL_WEBHOOK_SECRET`. There is no second endpoint to secure.
3. **The package fetches and checks.** The event carries only the sender, the recipients and the subject, so the component reads the message through Resend's API. That read includes the SPF, DKIM and DMARC results Resend's mail server computed. The component drops a message whose sender fails DMARC, or that comes past the inbound rate limit, and logs why. The deployment's limit counts only mail that a reply address, a workspace or the support inbox claims. A sender's own limit counts only once Resend's results are in, and mail that does not pass DMARC spends a bucket apart, so a forgery in someone's name never uses up theirs. To tune `inboundMail` and `inboundMailGlobal`, pass your limiter as `setupEmail({ rateLimiter })` ([Tune rate limits](/docs/ship/security/rate-limits)).
4. **Your code handles it.** The component stores the message and calls your `inbound` hook with what the address names, checked against the sender. The [contact form](/docs/build/email/inbound/contact-form) takes the same path.

## Reply by email

An email about a thread, such as a comment on a strip, gets a reply-to address of its own. `email.replyAddress(ctx, { userId, thread })` returns an address on the receiving domain with a short random token in it, the same one every time for the same person and thread. The deployment stores what the token names, the person and the thread, so the address fits the 64 characters an address allows before its `@`. An address is kept for a year after the last email it went out in. It takes the ctx of a mutation or an action, which is where it stores them:

```ts [backend/comments.ts]
await email.send(ctx, {
  to: author.email,
  subject: `New comment on ${strip.title}`,
  text: comment.body,
  replyTo: [await email.replyAddress(ctx, { userId: author.id, thread: `strip:${strip._id}` })],
})
```

A reply reaches your `onReply` hook with both, once two checks pass: the sender passes DMARC (a sender whose domain publishes no policy does not), and the sender's address is that person's own. A forwarded email answered by someone else is dropped, so a leaked reply address lets no one post as the person. A reply from a banned account is dropped too. Add the reply in that thread, without trusting anything else the mail says about itself.

## Email into a workspace

Each workspace can have an address of its own on the receiving domain, its slug: `studio@in.panels.app`. Mail sent to it reaches your `onWorkspaceMail` hook with the workspace's id and slug, for a shared inbox or receipts to file. Members see it where your app shows it. The addresses mail servers expect, such as `postmaster` and `abuse`, are never given to a workspace.

## Handle inbound mail

Set the receiving domain and your hooks on `setupEmail`:

```ts [backend/email.ts]
export const email = setupEmail(components, {
  inbound: {
    domain: 'in.panels.app',
    onReply: async (ctx, { userId, thread, message }) => {
      await ctx.runMutation(internal.comments.addReply, { userId, thread, text: message.text })
    },
    onWorkspaceMail: async (ctx, { workspaceId, slug, message }) => { /* … */ },
  },
})
```

`message` holds the provider's id for the mail, the sender's address and name, the address it came to, the subject, the text and the HTML, and each attachment's name and size. The deployment keeps the text, never the HTML. Read an attachment's content through Resend's API when your hook needs it. Like the `events` handlers, each hook runs after the message is verified and stored, and declares when it runs, how often and what happens when it throws ([Hooks](/docs/reference/backend/hooks)). Administrators read every inbound message in the admin console's **Inbox** tab, beside the contact form's.

## The support inbox

Give people one address to write to, `support@panels.app`, and your team one place to answer from. Resend Inboxes hosts the conversation: each message starts a thread, replies stay in it, and your team can label, assign and archive threads in Resend's dashboard. Name the address on `setupEmail`:

```ts [backend/email.ts]
export const email = setupEmail(components, {
  inbound: {
    domain: 'in.panels.app',
    support: 'support@panels.app',
  },
})
```

`npx nuxt-backend email sync` creates the inbox at Resend, on a domain with receiving turned on, and subscribes the webhook to its `inbox.email.received` events. It runs the `syncInbound` function of `email.api`, which also says what is left to do by hand (the domain's receiving and its MX record, or a webhook that does not exist yet). Re-export it, and the two functions of the admin console's Inbox tab, beside the rest:

```ts [backend/email.ts]
export const { getEmailStatus, submitContactMessage, getInboxConsole, replyToInbox, syncInbound, previewEmails, sendEmailPreview } = email.api
```

`email sync` prints the inbox, its domain, the webhook's inbound events and what is left to do, and its `--json` carries them as `inbound`. Without the re-export it says so in one line and syncs the rest. A dry run leaves the inbox alone.

Then:

- **Mail to the address** becomes a thread in the inbox. The package keeps a copy of each message, with the sender's account when the address belongs to one and the sender passed DMARC, so the admin console shows who wrote.
- **The [contact form](/docs/build/email/inbound/contact-form)** posts each message into the same inbox, as a thread whose reply-to is the visitor's address. The message arrives from your `EMAIL_FROM` address, and a reference line at its foot lets the package hand the thread back to the message in the Inbox tab.
- **Your team replies** from Resend's dashboard or from the admin console's **Inbox** tab. The reply goes out from `support@panels.app` and stays on the thread, and the person answers from their own mail client. A reply from the Inbox tab goes out once however often it is retried, and spends the administrator's `admin` limit.
- **Inbox agents.** Resend's inbox agent can label and draft replies from your instructions. It runs at Resend, outside your deployment, so treat its drafts as drafts.

Inboxes stores conversations for you; receiving hands each message to your code. The reply addresses and workspace addresses above use receiving, the support address uses Inboxes, and both can share one domain. Checked against Resend's docs on 2026-10-27.

## Set up the receiving domain

1. In Resend's dashboard, add a receiving domain, a subdomain such as `in.panels.app`, and publish the MX record it lists. Make Resend's record the lowest number, the highest priority, or mail goes elsewhere.
2. Subscribe the Resend webhook to `email.received`, and to `inbox.email.received` for a support inbox, beside the delivery events ([Track delivery](/docs/build/email/delivery#point-the-provider-at-the-route)).
3. Set `inbound.domain` to it.

On your dev deployment, skip the DNS: Resend gives every account a receiving address at `<id>.resend.app`. Set `inbound.domain` to that domain, and mail sent to any address on it reaches the dev deployment.

## Privacy

An inbound message is personal data. It is kept for 90 days, erased with the account that sent it or by its sender's address, and listed on the [Privacy and data inventory](/docs/ship/compliance/privacy) page.

## What happens when…

| Inbound mail | What happens |
|---|---|
| Fails DMARC, or a reply from a sender that does not pass it | Dropped and logged `email.inbound_rejected`, reason `dmarc` |
| Comes past the inbound rate limit | Dropped and logged, reason `rate_limited` |
| Answers a reply address from someone else, or from a banned account | Dropped and logged, reason `sender_mismatch`: a leaked reply address lets no one post as its owner |
| Goes to an address nothing claims | Dropped and logged, reason `unknown_recipient` |
| Makes your hook throw | Answered `500`, so Resend delivers it again; the stored copy is not duplicated |

## Limits

- **Attachments are fetched on demand.** The event carries only names and sizes; reading the content is one more call to Resend's API.
- **Text in mail is untrusted.** An email that your code hands to a model can carry instructions written for the model. Treat it as data ([Guard against prompt injection](/docs/build/ai/content-safety#guard-against-prompt-injection)).
- **Inboxes needs a verified domain with receiving on,** or forwarding from an address you already have.

## Related

- [Resend](/docs/services/resend): the receiving domain and Inboxes.
- [Add a contact form](/docs/build/email/inbound/contact-form): messages from people without their mail client open.
- [Track delivery](/docs/build/email/delivery): the `/email/events` route inbound mail shares.
- [Show in-app notifications](/docs/build/email/notifications): the emails people reply to.
