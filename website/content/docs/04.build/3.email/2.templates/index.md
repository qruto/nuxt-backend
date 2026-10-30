---
title: Customize email templates
description: "The emails the package sends for you (the sign-in code, the email-change notice, the welcome, the workspace invitation and the gift), how to restyle any of them in one place without replacing the transport, and how to preview them before they go out."
kind: how-to
capability: email
api: /docs/reference/api/email
source: src/convex/email-templates.ts
navigation:
  title: Customize templates
  icon: i-lucide-layout-template
---

- **You get:** every email the package sends (the sign-in code, the email-change notice, the welcome, the invitation, the gift), restyled or rewritten in one place, and previewed before it goes out.
- **Powered by:** your `setupEmail` instance; Resend only delivers what the template renders. Resend's hosted templates work for your own sends through `template`.
- **The package adds:** the template registry, dependency-free defaults in light and dark with a plain-text twin, overrides that keep the transport, previews in DevTools, and `eject` for a full copy.

Change what any email the package sends says, or how it looks, in one place. Every email the package sends for you comes from a template on your `setupEmail` instance in `backend/email.ts`. `setupAuth` and `setupBilling` send through that instance, so one override restyles an email wherever it goes out. The defaults are dependency-free HTML in one [branded layout](/docs/build/email/templates/theme), light and dark, with a plain-text twin, in the [recipient's language](/docs/build/email/templates/languages).

## The templates

Each template takes the data of its email and returns `{ to, subject, html?, text? }`, an `EmailMessage`. Return `blocks` in place of `html` and the layout renders them in your [theme](/docs/build/email/templates/theme#your-own-emails-in-the-layout), with the text version written for you:

| Name | Sent when | Data |
|---|---|---|
| `otp` | A one-time code: to sign in, to verify an address (`email-verification`, which with `reason: 'email-change'` confirms the current address at the start of an email change), and for the new address of an email change (`change-email`). With `reason: 'passkey-only'` and an empty `otp`, a sign-in code asked for a [passkey-only account](/docs/build/auth/sign-in#passkey-only-accounts): no code, and the way back in. `requestedFrom` is who asked: the device, an approximate place and the time | `{ email, otp, type: 'sign-in' \| 'email-verification' \| 'forget-password' \| 'change-email', reason?: 'email-change' \| 'passkey-only', requestedFrom?: { device?: { browser?, os? }, place?: { city?, country? }, at, timeZone? } }` |
| `passkeyRecovered` | A passkey-only account signed in with its recovery code: where from, and a link to `/security` to sign other devices out | `{ email, requestedFrom?, url }` |
| `emailChanged` | An email change went through: to the old address, so whoever holds it hears of a change they didn't make | `{ email, newEmail }` |
| `deletionScheduled` | An account's [deletion](/docs/build/auth/accounts/data#delete-an-account) is scheduled: the date it happens and the "keep my account" link | `{ email, deletesAt, keepUrl }` |
| `deletionCanceled` | The deletion was cancelled: nothing was deleted | `{ email }` |
| `welcome` | Once, right after a user is created | `{ email, name }` |
| `invite` | A workspace invitation, with an accept link | `{ email, url, inviterName, inviterEmail, workspaceName, role }` |
| `gift` | A gift is paid, to its recipient ([Gifts](/docs/build/growth/offers/gifts#the-notification-email)) | `{ recipientEmail, purchaserName?, item, claimUrl }`: the sender's name (at most 40 characters, no links), the pack's name and the app's URL, never the purchaser's email or message |

The `0.2.0` features add their own emails to this registry, each overridable the same way. Their names land with each feature:

- the waitlist's confirmation;
- the alert about a sign-in from a new device;
- the notifications a person chose to get by email ([Show in-app notifications](/docs/build/email/notifications)). The billing provider's receipts and reminders never join: they stay the provider's.

Each template also gets a render context:

- `t(key, params?)` reads the words the defaults are made of, in the recipient's language: `t('email.invite.subject', { workspace: 'Studio Nine' })` is `Join Studio Nine`, or its translation in `setupEmail`'s `messages`. A key of your own reads from the root of those messages.
- `locale` is the language the email is written in ([Send email in each reader's language](/docs/build/email/templates/languages)).
- `brand` is `{ name, url, logo? }`, the app the email is sent for ([Brand your emails](/docs/build/email/templates/theme#your-name-and-logo)).
- `theme` is `{ colors, dark, fonts }`, every color and font in effect, for an email you write as `html` ([Your colors and fonts](/docs/build/email/templates/theme#your-colors-and-fonts)).
- `link(url)` turns a link to one of your pages into the recipient's language's ([Localized links](/docs/build/email/templates/languages#localized-links)).

## Override a template

Pass any subset as `templates` on `setupEmail`. The transport stays the component's; only the message changes. Each override gets the data, the render context, and `byDefault`, the packaged template bound to the same context:

```ts [backend/email.ts]
import { setupEmail } from 'nuxt-backend/email'
import { components } from './_generated/api'

export const email = setupEmail(components, {
  brand: { name: 'Panels' },
  templates: {
    otp: ({ email, otp, type }) => ({
      to: email,
      subject: type === 'sign-in' ? 'Your Panels sign-in code' : 'Your Panels verification code',
      text: `Your code: ${otp}. It expires in 5 minutes.`,
    }),
    invite: (data, { byDefault }) => ({
      ...byDefault(data),
      subject: `${data.inviterName} wants you on ${data.workspaceName}`,
    }),
  },
})
```

Render however you like: the layout's `blocks`, a string builder, `@vue-email`, `@react-email`, anything that returns HTML and text. An override that returns `blocks` goes into the layout; one that returns `html` is sent as it is. An override may be `async`, so a renderer that returns a promise works as it is; `byDefault` stays synchronous. The [advanced example](/docs/start/templates#example-advanced) overrides `otp`, `invite` and `gift` this way.

Some fields hold text a user typed: a name, a workspace name, a gift sender's name. Escape them when you write your own HTML, or that user can put markup into an email your domain sends. `escapeHtml` from `nuxt-backend/email` is the one the packaged templates use:

```ts [backend/email.ts]
import { escapeHtml } from 'nuxt-backend/email'

gift: (data, { byDefault }) => ({
  ...byDefault(data),
  html: `<p>From ${escapeHtml(data.purchaserName ?? 'someone')}</p>`,
}),
```

::note
`backend/auth.ts` imports `email` from `backend/email.ts`, so `email.ts` must not import `auth.ts` back: the import cycle leaves `email` undefined while `setupAuth` runs. To read the signed-in user in `email.ts`, use `ctx.auth.getUserIdentity()`.
::

### The welcome email

`welcome` goes out once, right after sign-up, on every app. Onboarding that follows it belongs in an [email sequence](/docs/build/growth/engage/lifecycle-emails): the scaffold's `onSignup` sequence starts three days later. Restyle the welcome itself through `templates.welcome`.

## Sent once

The welcome email, the email-change notice and a gift notification carry an idempotency key under the package's own prefix: `nuxt-backend:welcome:<user>`, `nuxt-backend:email-changed:<user>:<address>` and `nuxt-backend:gift:<id>`. While the first email is on record (final records are pruned after a week), a second send with the same key returns its id and delivers nothing. A retried request or a redelivered webhook never emails twice. An invitation carries no key: every send of it, a resend included, goes out. Your own sends take the same option, `email.send(ctx, { …, idempotencyKey })`.

## Previewing

Preview every email before it reaches anyone:

- **DevTools.** The **Email** tab renders every email the package sends with sample data, on your dev deployment: in each language your messages cover, light or dark, wide or at phone width. **Send to delivered@resend.dev** sends the one in view to Resend's test address, where the [dev inbox](/docs/develop/dev-inbox) reads it. It runs `previewEmails` and `sendEmailPreview`, two internal functions the scaffolded `backend/email.ts` re-exports from `email.api`. `sendEmailPreview` sends to test addresses only, and neither is reachable from a page or an agent.
- **A page of your own.** `email.render(name, data, { locale? })` resolves one template in effect, override included, without sending it. `email.previews({ locale? })` renders them all with sample data, `{ key, template, variant?, note, locale, to, subject, html, text }` each. `forceColorScheme(html, 'dark')` from `nuxt-backend/email` shows an email as a dark-mode reader sees it.
- **Tests.** `renderEmail(name, data, options)` from [`nuxt-backend/test-utils`](/docs/reference/api/test-utils) renders one email as your `setupEmail` options would, without a deployment.

A page that shows every email is a query over `previews`, each in light and dark:

```ts [backend/emailTemplates.ts]
import { v } from 'convex/values'
import { forceColorScheme } from 'nuxt-backend/email'
import { query } from './_generated/server'
import { email } from './email'

export const previews = query({
  args: { locale: v.optional(v.string()) },
  // Sample data only: nothing a visitor typed, nothing of an account.
  handler: async (_ctx, { locale }) => ({
    locales: email.locales,
    previews: (await email.previews({ locale })).map(preview => ({
      ...preview,
      html: forceColorScheme(preview.html, 'light'),
      htmlDark: forceColorScheme(preview.html, 'dark'),
    })),
  }),
})
```

`email.sendTemplate(ctx, name, data, { locale?, senderId?, idempotencyKey? })` renders and sends in one call, the way auth and billing do, in the recipient's language ([The recipient's language](/docs/build/email/templates/languages#the-recipients-language)).

## Eject an email

An override changes what a template returns. When you want the template's whole source in your app, to edit line by line, eject it:

```bash
npx nuxt-backend eject email:invite
```

`eject` copies the packaged template's own source into `backend/emails/invite.ts`, with a version stamp at the top, and wires it into `templates` for you. The copy is a function of the data and the render context, as an override is: the blocks the email is made of, each word read from its labels through `t`, and the plain text, so you change a block, its order or its words line by line:

```ts [backend/emails/invite.ts]
// nuxt-backend eject: email:invite@0.2.0
// Sent in place of the packaged `invite` email: ../email.ts lists it in `setupEmail`'s `templates`.
import type { EmailMessage, EmailRenderContext, InviteEmailData } from 'nuxt-backend/email'
import { linkBlocks, plainName } from 'nuxt-backend/email'

/** The longest inviter name the email shows. */
const INVITER_NAME_LENGTH = 40
/** The longest workspace name the email shows. */
const WORKSPACE_NAME_LENGTH = 60

/**
 * The `invite` email: who invites the person to which workspace, in which
 * role, and the link that accepts. Both names are the inviter's own text,
 * mailed from the app's domain: no link or domain they typed goes along. A
 * workspace name that was nothing else leaves the sentences that name none.
 */
export function invite({ email, url, inviterName, inviterEmail, workspaceName, role }: InviteEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  const inviter = plainName(inviterName, INVITER_NAME_LENGTH) ?? inviterEmail
  const workspace = plainName(workspaceName, WORKSPACE_NAME_LENGTH)
  const intro = workspace ? t('email.invite.intro', { inviter, workspace, role }) : t('email.invite.introUnnamed', { inviter, role })
  const link = context.link(url)
  return {
    to: email,
    subject: workspace ? t('email.invite.subject', { workspace }) : t('email.invite.subjectUnnamed'),
    blocks: [{ paragraph: intro }, ...linkBlocks(link, t('email.invite.action'), context)],
    text: `${intro}\n\n${link}`,
    preheader: intro,
  }
}
```

Three helpers the packaged emails share come from `nuxt-backend/email`, for your own emails too: `linkBlocks(url, label, context)`, a button and the link written out (a bare path, from a deployment with no `SITE_URL`, gets its text alone); `describeOrigin(requestedFrom, context)`, the "Requested from Chrome on macOS, near Lisbon…" line of the code emails; and `plainName(name, max)`, a name someone typed with every link and bare domain taken out, so an email from your domain never carries one (the invitation reads the inviter's and the workspace's names through it).

From then on the copy is yours: the package never changes it. `npx nuxt-backend upgrade` compares each ejected file with the template of the new version and shows what changed, so you can carry a fix over by hand. Eject only what an override cannot reach, since every ejected email is one more file to keep in step ([Eject a part, page or email](/docs/build/ui/customize/eject)).

## What happens when…

| The template | What happens |
|---|---|
| Throws while it renders | The send fails before it reaches the provider, and the log names the template. A sign-in code request answers with the catalog error `unavailable`, so the person is never left waiting |
| Returns neither `html` nor `text` | The send is refused with an error that names the template |
| Is an `async` override that never resolves | The send times out like any other action, and is retried |
| Puts a user's text into `html` unescaped | Nothing stops it: escape it with `escapeHtml` |

## Test it

`renderEmail(name, data, options)` from [`nuxt-backend/test-utils`](/docs/reference/api/test-utils) renders one email as your `setupEmail` options would, with no deployment:

```ts [backend/email.test.ts]
import { renderEmail } from 'nuxt-backend/test-utils'
import { expect, test } from 'vitest'
import { templates } from './email'

test('the invitation names the workspace', async () => {
  const message = await renderEmail('invite', {
    email: 'kai@example.com',
    url: 'https://panels.app/invite/abc',
    inviterName: 'Ada',
    inviterEmail: 'ada@example.com',
    workspaceName: 'Studio Nine',
    role: 'member',
  }, { templates })
  expect(message.subject).toContain('Studio Nine')
})
```

Export the `templates` object you pass to `setupEmail` so the test renders the same overrides.

## Related

- [Send email in each reader's language](/docs/build/email/templates/languages): the messages every template reads.
- [Brand your emails](/docs/build/email/templates/theme): the layout every template renders into.
- [Send transactional email](/docs/build/email/sending): the instance the templates live on, and your own sends.
- [Eject a part, page or email](/docs/build/ui/customize/eject): the version stamp, and upgrading afterwards.
- [`nuxt-backend/email`](/docs/reference/api/email): `EmailTemplates`, `EmailTemplateOverrides` and every data type.
