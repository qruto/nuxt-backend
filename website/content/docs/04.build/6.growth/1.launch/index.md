---
title: Launch in phases
description: "Open your app in three phases, early access with a waitlist, then invite only, then public: setupAccess, the tickets that admit a new address, useAccessPhase on your pages, and a phase you change from the admin console with no deploy."
kind: how-to
capability: auth
source: src/convex/integrations/launch.ts
navigation:
  title: Launch phases
  icon: i-lucide-door-open
---

Most client apps open in steps: a waitlist while you build, invitations while you test with real people, then open doors. `setupAccess` gives your app those three phases, and an administrator moves between them from the admin console with no deploy. Existing accounts always sign in, whatever the phase. While the app is closed, a new address needs a **ticket**: an invite code, an access link, an admitted waitlist entry or an invitation.

- **Natively:** Better Auth runs every sign-in through hooks: the code request, the account's creation and each new session. It has no launch phases and no invite codes (checked on 2026-10-25).
- **The package adds:** the phases, the tickets that admit a new address, invite codes and access links, and the admin console's **Access** tab, all kept in the `backend` component.

## Set it up

`backend/access.ts` declares the phases your app goes through, in order. A new deployment starts on the first one:

```ts [backend/access.ts]
import { setupAccess } from 'nuxt-backend/access'
import { components } from './_generated/api'
import { audit } from './audit'

export const access = setupAccess(components, {
  phases: ['early-access', 'invite-only', 'public'],
  domains: ['panels.example'],
  audit,
})

// The reads behind useAccessPhase and useInvite, and the Access tab.
export const { getAccessPhase, checkInvite, getAccessConsole, setAccessPhase, createInvite, revokeInvite, admitEmails } = access.api
```

Pass it to `setupAuth`, as you pass `audit` and `account`:

```ts [backend/auth.ts]
import { access } from './access'

export const { authComponent, createAuth, getAuthUser } = setupAuth(components, query, {
  email,
  rateLimiter,
  access,
})
```

Leave a phase out of `phases` to skip it: `['invite-only', 'public']` opens with invitations and no waitlist. `domains` admits every address whose part after `@` matches one exactly, in every phase. Use it for your own team's domain.

## The three phases

| Phase | A new address without a ticket | Existing accounts |
|---|---|---|
| `early-access` | Gets a code, checks it, and joins the [waitlist](/docs/build/growth/launch/waitlist). The sign-in flow shows its place. | Sign in |
| `invite-only` | Gets a code, checks it, and is asked for an invite code. | Sign in |
| `public` | Signs up. The phase costs no read. | Sign in |

In both closed phases, the [sign-in flow](/docs/build/auth/sign-in#the-steps) moves to a step of its own after the code: `waitlisted` or `invite-code`. `<AuthForm>` renders both. The `waitlisted` step also offers **I have an invite code**, so a code works in early access too.

## What admits a new address

A new address with a ticket signs up in any phase. A ticket is one of:

- **An invite code** typed on the sign-in page, or **an access link** opened before it ([Hand out invite codes and access links](/docs/build/growth/launch/invites)).
- **An invitation by address** from an administrator, or **an admitted waitlist entry**.
- **A workspace invitation** to the address, pending and unexpired ([Invite people to a workspace](/docs/build/auth/workspaces/invitations)). Each account's invitations admit up to ten new addresses while the app is closed (`workspaceInvitations` on `setupAccess`, `false` for none), and an account a workspace invitation admitted admits nobody by its own. So one admitted member brings their team, not a chain of strangers past the waitlist.
- **A gift addressed to it**: delivered, unclaimed and paid for ([Send, receive and manage gifts](/docs/build/growth/offers/gifts)).
- **An allowed domain**, from `domains`.

The account's creation uses the ticket and records which one. So a closed phase never locks out the people your members invite, or someone a gift was bought for. A hand-written gate that refuses every new address does.

## Why the code always goes out

In a closed phase, a new address still gets its sign-in code. Only after checking the code does the person learn whether they have a ticket. Three things follow:

- **Nobody learns who has an account.** Every address gets the same answer, a code. Only the person holding the mailbox reads what happens next.
- **The waitlist is double opt-in at no extra cost.** The code proves the mailbox, so a waitlist entry is never someone else's address.
- **Codes to new addresses have a budget of their own.** They spend the deployment-wide `signUpOtpGlobal` limit, so a rush of joins never delays existing people's codes. The [bot check](/docs/build/auth/sign-in/bots) runs before each one.

## Change the phase

Administrators change it in the admin console's **Access** tab. The same tab holds the invite codes, the access links and the invitations by address.

- **No deploy.** The phase is stored in the `backend` component, like the package's own [flags](/docs/ship/operate/flags), so a change takes effect on the next request, and a deploy never resets it.
- **Guarded.** Changing it takes a [recent sign-in](/docs/build/auth/access/step-up), is refused during an administrator's visit to another account, and lands on the [activity trail](/docs/build/auth/admin/audit-log).
- **Waiting people keep their place.** Moving from `early-access` to `invite-only` closes the waitlist to new joins and keeps every entry. Administrators can still admit them. One who signs in without being admitted meets the `invite-code` step, like anyone without a ticket.
- **Opening is gradual.** Moving to `public` admits nobody in bulk. Each waiting person signs up when they next sign in, and the [waitlist](/docs/build/growth/launch/waitlist#launch) can announce the launch to those who asked for news.
- **The kill switch wins.** The [sign-up kill switch](/docs/ship/operate/flags#kill-switches) closes sign-up whatever the phase says.

On a new deployment nobody has an account yet, and a closed phase lets no new address in without a ticket. So run `npx nuxt-backend doctor --fix` before you sign in. It asks for your address and admits it. Sign in with that address, then run it once more to make the account an administrator ([Make the first administrator](/docs/build/auth/admin#make-the-first-administrator)).

## Launch from a waitlist in waves

A launch of Panels, the comic-strip maker, might run like this:

1. **Early access.** The landing page collects verified waitlist entries while you build.
2. **Waves.** Each week you approve the next 50 entries in the Waitlist tab. Each approved person gets one "You're in" email and signs up ([Admit in waves](/docs/build/growth/launch/waitlist#admit-in-waves)).
3. **Invite only.** You move the phase on once the waves run smoothly. Your first users share invite codes with friends ([Invite codes](/docs/build/growth/launch/invites#invite-codes)).
4. **Public.** You open the doors and send one launch announcement to the people who asked for news.

Size each wave to what your email plan and your support can carry. The Waitlist tab shows both caps beside its approve button.

## Show the phase on your pages

`useAccessPhase()` reads the current phase, so your landing page offers what the visitor can do now:

```vue [app/pages/index.vue]
<script setup lang="ts">
const { phase } = useAccessPhase()
</script>

<template>
  <WaitlistForm v-if="phase === 'early-access'" />
  <NuxtLink v-else-if="phase === 'invite-only'" to="/login">I have an invite</NuxtLink>
  <NuxtLink v-else to="/login">Start making strips</NuxtLink>
</template>
```

It returns `phase` (`'early-access'`, `'invite-only'` or `'public'`), `isPublic`, `isLoading` and `error`. The server renders it, so the page never flashes the open version before the closed one. Guarded pages keep sending signed-out visitors to the sign-in page in every phase, since the sign-in flow handles each one.

## Your own veto

[`canSignIn`](/docs/build/auth/sign-in/hooks#gate-who-signs-in) still runs after the phase lets an address in, as your app's extra check. It also receives `ticket`, the kind of ticket that admitted a new address, or `null` for an open phase and an existing account.

## What happens when…

- **A new address has no ticket in a closed phase:** the flow moves to `waitlisted` or `invite-code` after the code. It is a step, never an error, so nobody learns who has an account.
- **Your `canSignIn` says no:** the sign-in is refused as [`forbidden`](/docs/reference/backend/errors#forbidden) with reason `sign_in_refused`, carrying your message.
- **The bot check fails:** the code request is refused as `forbidden` with reason `bot_check`.
- **Codes to new addresses use up their budget:** the request is refused as [`rate_limited`](/docs/reference/backend/errors#rate_limited) on `signUpOtpGlobal`. Existing accounts still get their codes.
- **The origin of a new account can't be read:** the creation is treated as the person's own and needs a ticket. The check fails closed. Only `/admin/create-user` counts as an administrator's creation, and is admitted as `administrator`.
- **A new address checks its code without a ticket:** the code check answers `forbidden` with reason `ticket_required`, its `phase`, and `invite` when an invite code came along and admits nobody (`expired`, `used-up`, `revoked`, `unknown`). The code is not used up: `useLoginFlow` moves to the phase's step and sends the same code again with the invite code.

## Limits

- **One phase for the whole app.** There is no phase per workspace or per region. Use `canSignIn` for anything finer.
- **No bulk admission.** Opening to `public` admits each waiting person at their next sign-in, so an old entry never becomes an account nobody asked for.
- **One read per sign-up** in a closed phase, and none in `public`.

## Move from a hand-written gate

A closed beta gated with your own [`canSignIn`](/docs/build/auth/sign-in/hooks#gate-who-signs-in), refusing new addresses at `user-create`, also refuses invited people and gift recipients. Moving to `setupAccess` means deleting that gate: the phases admit them.

## How it works

- **Better Auth's own hooks.** The check runs in the code request's before-hook, `user.create.before` and `session.create.before`. Every route that creates an account passes through them, the administrator's and the server's included.
- **One read decides.** The phase and every ticket are read in one transaction of the `backend` component.
- **It leaves a record.** A phase change and each used ticket land on the activity trail.

## Test it

A new deployment starts on its first phase:

```ts [backend/access.test.ts]
import { asUser, defineBackendTestApp } from 'nuxt-backend/test'
import { expect, test } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'

const testApp = defineBackendTestApp(schema, import.meta.glob('./**/*.ts'))

test('a new deployment opens in early access', async () => {
  const ada = await asUser(testApp(), { email: 'ada@panels.example' })
  expect(await ada.query(api.access.getAccessPhase, {})).toMatchObject({ phase: 'early-access' })
})
```

End to end, sign in with an address outside `domains` and expect the `waitlisted` step after the code ([Run end-to-end tests](/docs/develop/testing/e2e)).

## Related

- [Hand out invite codes and access links](/docs/build/growth/launch/invites): the tickets administrators hand out.
- [Run a waitlist](/docs/build/growth/launch/waitlist): the `early-access` phase end to end.
- [Hook into sign-in and sign-up](/docs/build/auth/sign-in/hooks): `canSignIn` and the lifecycle hooks.
- [Measure growth](/docs/build/growth/measure): how many sign-ups each phase and ticket brought.
- [Guardrails on growth features](/docs/start/concepts/principles#guardrails-on-growth-features): the rules these defaults follow.
