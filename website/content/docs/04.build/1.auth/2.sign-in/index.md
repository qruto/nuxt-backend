---
title: Sign users in
description: "Sign people in with a sign-in code or a passkey: useLoginFlow drives every step, <AuthForm> renders it at /login, codes work only in the browser that asked, a passkey is offered after the first code, and passkey-only accounts recover with a code of their own."
kind: how-to
capability: auth
playground: /login
api: /docs/reference/api/use-login-flow
source: src/runtime/vue/composables/use-login-flow.ts
demo: true
navigation:
  icon: i-lucide-shield-check
---

A person signs in with a code sent to their address, then saves a passkey, so the next sign-in needs no code. The module mounts the whole flow at `/login`, and `useLoginFlow()` runs it on a page of your own. It is the only way to sign in: `useAuth()` reads the session and signs out, nothing more.

Better Auth's email OTP and passkey plugins do the work, inside your Convex deployment. The package adds the step machine, the form, passkey autofill, the bot check before a code goes out, and the limits on sending and checking codes. It also binds each code to the browser that asked for it, offers a passkey after a code, keeps the browser's passkey list in step with the account, and lets an account turn codes off.

## How a sign-in goes

1. The person types their address and asks for a code. A [bot check](/docs/build/auth/sign-in/bots) runs first, out of sight.
2. They type the code from their inbox, in the same browser. The first sign-in creates the account and a personal workspace.
3. The flow offers to save a passkey. Next time, the passkey signs them in.

There are no passwords, no social sign-in and no magic links ([Email codes and passkeys only](/docs/start/concepts/principles#email-codes-and-passkeys-only)). In development the code also prints in the `convex dev` console, so you can sign in before email is connected ([Develop with real sandboxes](/docs/develop/sandboxes)).

## Use the ready-made page

`/login` renders `<AuthForm>`, and every page guarded with `definePageMeta({ auth: true })` sends signed-out visitors there. You write nothing. Try it here:

::demo-sign-in
::

To restyle the form or write your own, see [Build a custom sign-in page](/docs/build/auth/sign-in/custom-page).

## Drive the flow from your own page

`useLoginFlow()` holds the current step, the fields, the pending flag and the failure. Bind the fields to your inputs and call the current step's action:

```vue [app/pages/login.vue]
<script setup lang="ts">
const flow = useLoginFlow({ onSuccess: () => navigateTo('/strips') })
const { step, email, otp, isPending, error, passkeyRequired } = flow
</script>

<template>
  <form v-if="step === 'choose' || step === 'request-code'" @submit.prevent="isPending || flow.sendCode()">
    <input v-model="email" type="email" autocomplete="username webauthn">
    <button type="submit" :aria-disabled="isPending || undefined">Email me a code</button>
    <button type="button" @click="flow.signInWithPasskey()">Use a passkey</button>
  </form>
  <form v-else-if="step === 'verify-code'" @submit.prevent="isPending || flow.verifyCode()">
    <input v-model="otp" inputmode="numeric" autocomplete="one-time-code">
    <button type="submit" :aria-disabled="isPending || undefined">Sign in</button>
  </form>
  <div v-else-if="step === 'passkey-offer'">
    <button type="button" @click="flow.addPasskey()">Save a passkey</button>
    <button v-if="!passkeyRequired" type="button" @click="flow.skipPasskey()">Not now</button>
  </div>
  <p v-if="error" role="alert">{{ error.message }}</p>
</template>
```

A busy button is `aria-disabled` and ignores the press. `disabled` would drop keyboard focus to the page ([Accessibility](/docs/build/ui/accessibility)).

### The steps

| Step | What the person does | Next step |
|---|---|---|
| `choose` | Picks a passkey or a code. | `request-code`, `recover`, or done after a passkey |
| `request-code` | Types an address. `sendCode()` emails a code. | `verify-code` |
| `verify-code` | Types the code. `verifyCode()` signs in, or creates the account. | `passkey-offer`, or `age` for a new account when the app sets a minimum age |
| `passkey-offer` | Saves a passkey with `addPasskey()`, or declines with `skipPasskey()`. | done, and `onSuccess` runs |
| `age` | Types their age, the first time only. `submitAge()` checks it against the minimum. | `passkey-offer` |
| `recover` | Types their address and recovery code, for a passkey-only account. `recover()` checks both. | `passkey-offer`, which can't be skipped |
| `undeliverable` | Reads that the address can't receive email, and tries another. | `request-code` |
| `waitlisted` | Reads their place on the waitlist ("You're #48 of 1,204", from `waitlist`), while the app is in early access. | `invite-code`, when they have a code |
| `invite-code` | Types an invite code, while the app is invite only. `redeemInviteCode()` checks it. | `passkey-offer` |

`passkey-offer` and `recover` are the sign-in security steps ([The passkey offer](#the-passkey-offer), [Passkey-only accounts](#passkey-only-accounts)). Four steps are new in `0.2.0`:

- `age` comes with a minimum age ([Set a minimum age](/docs/build/auth/accounts/consents#set-a-minimum-age)). The new address is asked once, after its code checked, and sends the same code again with the age.
- `undeliverable` arrives with [suppressed addresses](/docs/build/email/delivery/suppressions#what-a-person-sees-at-sign-in). It shows the same words whether the address has an account or not.
- `waitlisted` and `invite-code` come with [launch phases](/docs/build/growth/launch); the waitlist records the entry as the code checks ([Run a waitlist](/docs/build/growth/launch/waitlist)).

### Its options and fields

`useLoginFlow(options?)` takes:

| Option | Default | Effect |
|---|---|---|
| `onSuccess` | none | Runs once the person is signed in and the flow is done, for example a `navigateTo`. |
| `validateEmail` | a basic shape check | `(email) => boolean \| string` checks the address before a code goes out. A string is your own message. |
| `autofill` | `false` | Offers saved passkeys in the email field's autofill: see [passkey autofill](#passkey-autofill). |
| `preferLastMethod` | `false` | Opens on the way this browser last signed in. |

It returns:

| Name | What it holds |
|---|---|
| `step` | The current step, from the table above. |
| `email`, `otp`, `inviteCode`, `age`, `recoveryCode` | The fields. Bind them to your inputs. Once `recover()` signed in, `recoveryCode` holds the new code that replaced the used one, to show once. |
| `lastMethod` | How this browser last signed in: `'passkey'`, `'email-otp'` or `null`. |
| `passkeyRequired` | `true` on `passkey-offer` after a recovery, where `skipPasskey()` does nothing. |
| `isPending` | `true` while a step's call runs. |
| `error` | Why the last step failed, as `{ code, data, message }`. Set it to `null` to clear it. |
| `retryAfter` | After a rate-limit refusal, the seconds to wait. `null` otherwise. |
| `emailValid` | Whether `email` passes `validateEmail`. |
| `sendCode()`, `verifyCode()`, `addPasskey()`, `skipPasskey()`, `submitAge()`, `recover()`, `redeemInviteCode()` | The step actions. |
| `signInWithPasskey()` | Signs in with a passkey saved on this device, through the browser's prompt. |
| `goTo(step)`, `reset()` | Moves to a step, or back to the first one with every field cleared. |
| `bind` | Attribute bindings for your own markup, such as `bind.codeInput`, `bind.submit` and `bind.passkeyButton` ([Build on the composables](/docs/build/ui/customize/headless)). |

## Codes work only where they were asked for

A sign-in code works only in the browser that asked for it.

- **Bound to the browser.** Asking for a code sets an HttpOnly cookie on the auth route, tagged for sign-in: a MAC of that one code, which a newer code replaces. Checking the code needs the same cookie, and a check without it costs no guess. A code read over someone's shoulder, or typed into a phishing page, signs nobody in elsewhere.
- **Short and capped.** A code lives five minutes, and three wrong guesses end it. The address may check ten codes an hour, however many went out.
- **Tells the person who asked.** The email names the device that asked, an approximate place and the time, such as "Requested from Chrome on macOS, near Lisbon, Portugal, at 27 Oct 2026, 14:02 WET." The place and the time zone come from the host's IP geolocation where it gives one, such as Vercel's, and are left out otherwise (the time then reads in UTC). Only known browser and system names, letters for a place, and real time zones reach the email, so a forged header writes nothing into it. A person who didn't ask knows to ignore the email (the `otp` template's `requestedFrom`, [Templates](/docs/build/email/templates)).
- **A code, never a link.** Corporate mail scanners open every link in a message, which would spend a sign-in link before the person sees it. A code survives them.

A code typed in another browser is refused as `invalid_input` on `otp`, with reason `other_browser`. The person reads "This code works only in the browser where you asked for it." and asks again there.

Better Auth's email OTP plugin sets the length (six digits), the five minutes and the three guesses. It has no browser binding, so the package adds it (checked on 2026-10-27, Better Auth 1.6).

## The passkey offer

After a code sign-in, the flow stops at `passkey-offer` and asks once: save a passkey, so the next sign-in needs no code.

The offer is explicit because the browser won't make it. Chrome's automatic passkey upgrade only fires after a password sign-in, and this app has no passwords ([Passkey automatic upgrades](https://developer.chrome.com/blog/passkey-automatic-upgrades)).

- **Only where it can work.** The flow reads the browser's `getClientCapabilities()` first. A browser without WebAuthn, or whose capabilities name neither a passkey provider on the device nor a phone over the hybrid transport, skips the offer, and `onSuccess` runs at once.
- **Once a sign-in.** "Not now" signs the person in. The next code sign-in in this browser asks again.
- **After an invite or a gift too.** The offer follows every first sign-in, a workspace invitation and a gift claim included.

`<AuthForm>` renders the offer in its `passkey-offer` slot. On your own page, render the step, or call `skipPasskey()` to leave it out.

## Keep the browser's passkey list in step

A passkey removed on `/security` stays on the device until the browser hears about it. The package tells the browser through the WebAuthn Signal API, so the device stops offering a passkey that no longer works.

| Signal | Sent when | What the device does |
|---|---|---|
| `signalUnknownCredential` | The server refuses a passkey it doesn't know, such as one removed from the account. | Hides or removes that passkey. |
| `signalAllAcceptedCredentials` | The passkey list loads on `/security`, and after a passkey is removed. | Keeps only the passkeys the account still holds. |
| `signalCurrentUserDetails` | The name or the email address changes. | Shows the new name and address on the passkey. |

Every passkey of an account is registered with one user handle, the account's id, so a signal can name the account's passkeys: Better Auth gives each passkey a random handle it never stores, and the package replaces it in the registration options. A passkey saved before that keeps its own handle, which the list and details signals can't reach; the unknown-credential signal still does. Chrome and Edge 132 and Safari 26 support the signals. Other browsers skip them, and nothing else changes ([WebAuthn Signal API](https://developer.chrome.com/docs/identity/webauthn-signal-api)). `usePasskeys().capabilities` holds what `getClientCapabilities()` reported, for your own markup ([Manage passkeys and sessions](/docs/build/auth/accounts/security#passkeys)).

## Passkey-only accounts

A person with a passkey can turn sign-in codes off for their account. A stolen mailbox then can't sign in to it.

- **Turning it on** happens on `/security`, or through `usePasskeys().setPasskeyOnly(true)`. It takes a [recent sign-in](/docs/build/auth/access/step-up) and at least one passkey, and answers with a recovery code, shown once. It signs every other session of the account out, so one a code opened doesn't outlive the switch ([Passkey-only](/docs/build/auth/accounts/security#passkey-only)).
- **Codes are refused.** A code request for the account looks the same as any other, with the same answer, cookie and limits, so nobody learns how an account signs in. No code goes out: the email (the `otp` template with `reason: 'passkey-only'`) says the account signs in with a passkey, and points to "Lost your passkey?". In an app that turns passwords on, a password-reset code is refused the same way, and a password never opens a session for the account.
- **Recovery.** "Lost your passkey?" on `choose` moves to `recover`. The person types their address and recovery code, and `recover()` checks both. The flow then stops at `passkey-offer` with `passkeyRequired`, and finishes only once a new passkey is saved. Until then the session is a recovery session: it lasts fifteen minutes, and every route but saving a passkey, reading the session and signing out refuses it (`forbidden`, reason `passkey_required`), and it gets no Convex token, so no function runs as the account. The used recovery code stops working, and `recoveryCode` holds the new one, which `<AuthForm>` shows once beside the offer.
- **The person hears of it.** Turning codes off or back on emails the account and lands on its activity as `auth.passkey_only_changed`. A recovery emails the address (the `passkeyRecovered` template): the device, place and time it came from, and a link to `/security` to sign other devices out ([Alert people to new sign-ins](/docs/build/auth/accounts/alerts)).

A person who lost every passkey and the recovery code asks you. An administrator turns passkey-only off from the account's drawer in the Users tab, after checking who asks ([Run the admin console](/docs/build/auth/admin)).

## Passkey autofill

A person who saved a passkey can pick it from the email field's autofill, the way a browser fills a saved password. No code, and no prompt to open first. `<AuthForm>` does this, opens on the way this browser last signed in, and marks that method **Last used**.

On your own page, turn both on and mark the email field for passkeys. Its `autocomplete` must end in `webauthn`:

```vue [app/pages/login.vue]
<script setup lang="ts">
const flow = useLoginFlow({
  autofill: true,
  preferLastMethod: true,
  onSuccess: () => navigateTo('/strips'),
})
const { step, email, lastMethod } = flow
</script>

<template>
  <div v-if="step === 'choose'">
    <button type="button" @click="flow.signInWithPasskey()">
      Sign in with passkey <span v-if="lastMethod === 'passkey'">Last used</span>
    </button>
    <button type="button" @click="flow.goTo('request-code')">
      Continue with email <span v-if="lastMethod === 'email-otp'">Last used</span>
    </button>
  </div>
  <form v-else-if="step === 'request-code'" @submit.prevent="flow.sendCode()">
    <input v-model="email" type="email" autocomplete="username webauthn">
    <button type="submit">Email me a code</button>
  </form>
</template>
```

- **When it asks.** On the `choose` and `request-code` steps, once the page shows a field marked `webauthn`. A challenge lasts five minutes, so the flow renews it every four and a half minutes while the page is in view.
- **What the person sees.** A picked passkey finishes the flow, as `signInWithPasskey()` does. A passkey the server refuses, such as one removed from the account but still on the device, lands in `error` as `invalid_input` on `passkey`. A browser without conditional mediation offers nothing in the field, and the passkey button still works.
- **Where the last method comes from.** Better Auth's [`lastLoginMethod`](https://better-auth.com/docs/plugins/last-login-method) plugin records each sign-in on the account (`user.lastLoginMethod`) and in a cookie that lasts 30 days. The cookie holds the method's name only. The server render reads it too, so the page renders the same on both sides.
- **The cookie asks first in `0.2.0`.** It is not strictly necessary, so it is set only once the person allows it in the consent manager. Without it, `lastMethod` is `null` and the page opens on `choose`. A browser that never chose, or declined, gets no cookie ([Ask before optional storage](/docs/build/auth/accounts/consents#ask-before-optional-storage)).
- **Its limits.** Every passkey sign-in starts with a challenge the server stores, so the challenge route is limited per client and for the whole deployment ([Privileged routes](/docs/ship/security/rate-limits#privileged-routes)).

To tie the cookie to a consent of your own, pass your own `lastLoginMethod` in `authOptions.plugins`, with the package's resolver. Keep `storesLastSignInCookie` as the check to follow the consent manager's choice, or write your own:

```ts [backend/auth.ts]
import { lastLoginMethod } from 'better-auth/plugins'
import { resolveSignInMethod, setupAuth, storesLastSignInCookie } from 'nuxt-backend/auth'

export const { authComponent, createAuth, getAuthUser } = setupAuth(components, query, {
  email,
  authOptions: {
    plugins: [lastLoginMethod({
      storeInDatabase: true,
      customResolveMethod: resolveSignInMethod,
      beforeStoreCookie: ctx => storesLastSignInCookie(ctx) && ctx.getCookie('consent') === 'yes',
    })],
  },
})
```

## Read the session

`useAuth()` holds the session in every page and component. It reads, and it signs out:

| Field | What it holds |
|---|---|
| `user` | The signed-in account (`id`, `email`, `name`, `image`, `banned`), or `null`. |
| `session` | The current session, or `null`. |
| `role` | The app-wide role: `user`, `admin` or one of yours ([Roles](/docs/build/auth/access/roles)). |
| `hasRole(role)` | Whether the account holds the role, or one of a list. |
| `isSignedIn` | `true` once a session is loaded. |
| `isLoading` | `true` while the session is still resolving, on the first load and after a refresh. |
| `impersonating` | `true` while an administrator visits the account ([Impersonation](/docs/build/auth/admin/impersonation)). |
| `signOut()` | Ends the session in this tab. |

`isSignedIn` and `isLoading` come from the base module's Convex auth state, so they agree with what your queries see. The way this browser last signed in is `useLoginFlow().lastMethod` ([its fields](#its-options-and-fields)), for a sign-in page that offers it first.

```vue [app/pages/account.vue]
<script setup lang="ts">
definePageMeta({ auth: true })

const { user, signOut } = useAuth()

async function leave() {
  await signOut()
  await navigateTo('/')
}
</script>

<template>
  <p>Signed in as {{ user?.email }}</p>
  <button type="button" @click="leave">Sign out</button>
</template>
```

Where a person goes after `signOut()` is up to you. A session that ends elsewhere, in another tab or from another device, is handled for you ([When the session ends](/docs/build/auth/access/pages#when-the-session-ends)). The active workspace is on [`useWorkspace()`](/docs/build/auth/workspaces). In a Convex function, the tiers of [Protect backend functions](/docs/build/auth/access/functions) give you `ctx.user`.

## What happens when…

The step actions never reject. A failed step stays where it is, with the reason in `error`, so your form needs no `try`. Branch on `error.code`:

| `error.code` | When |
|---|---|
| [`rate_limited`](/docs/reference/backend/errors#rate_limited) | Too many requests. `retryAfter` holds the seconds to wait. |
| [`forbidden`](/docs/reference/backend/errors#forbidden), reason `banned` | The account is banned. |
| `forbidden`, reason `sign_in_refused` | Your [`canSignIn`](/docs/build/auth/sign-in/hooks#gate-who-signs-in) refused, and `message` is yours. |
| `forbidden`, reason `bot_check` | The [bot check](/docs/build/auth/sign-in/bots) failed. |
| `forbidden`, reason `age_required` | A new address checked its code while the app sets a minimum age, and sent none. The code is not used up; the flow moves to `age`. |
| `forbidden`, reason `under_age` | The age typed is under the minimum, or this browser answered under it today. |
| [`invalid_input`](/docs/reference/backend/errors#invalid_input) on `email` or `otp` | A malformed address, or a wrong or expired code. |
| `invalid_input` on `otp`, reason `other_browser` | The code was asked for in another browser. |
| `invalid_input` on `recoveryCode` | A wrong or used recovery code, or an address without one. |
| `forbidden`, reason `passkey_required` | A recovery session tried anything but saving its passkey. |
| [`unavailable`](/docs/reference/backend/errors#unavailable) | Any other failure, with the auth server's sentence as `message`. |

Checking codes has a budget of its own: ten checks an hour per address, however many codes went out ([What the user sees](/docs/ship/security/rate-limits#what-the-user-sees)).

## Limits

- **Codes.** Five sends a minute per address, 300 an hour for the whole deployment, and ten checks an hour per address ([Tune rate limits](/docs/ship/security/rate-limits)). Every code is an email against your provider's quota ([Resend](/docs/services/resend)).
- **Passkeys.** The browser and the device decide what a passkey prompt looks like. A browser without WebAuthn signs in with codes only.
- **Signals.** A browser without the Signal API keeps offering a removed passkey until the person deletes it from the device.
- **Recovery.** One recovery code per account, at least 100 bits. Its route is limited per client and for the whole deployment, never per address, so nobody can lock a person out of their own recovery. A person who loses it with every passkey gets back in only through an administrator.

## Test it

End to end, read the code back from the dev inbox. `inbox --json` reads once, so poll until a code arrives ([Run end-to-end tests](/docs/develop/testing/e2e)):

```ts [tests/sign-in.spec.ts]
import { execFileSync } from 'node:child_process'
import { expect, test } from '@playwright/test'

const latestCode = (address: string) =>
  JSON.parse(execFileSync('npx', ['nuxt-backend', 'inbox', address, '--json'], { encoding: 'utf8' })).code

test('signs in with a code', async ({ page }) => {
  const address = `delivered+e2e-${Date.now()}@resend.dev`
  await page.goto('/login')
  await page.getByRole('button', { name: 'Continue with email' }).click()
  await page.getByRole('textbox', { name: 'Email' }).fill(address)
  await page.getByRole('button', { name: 'Email me a code' }).click()

  await expect.poll(() => latestCode(address), { timeout: 30_000 }).toBeTruthy()
  await page.getByRole('textbox', { name: 'Code' }).fill(latestCode(address))
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: 'Not now' }).click()

  await expect(page).toHaveURL('/')
})
```

## Coming from the current API

The offer step was `add-passkey`, and so was `<AuthForm>`'s slot: both are `passkey-offer` now (the `data-auth="step-add-passkey"` hook keeps its name). A code now works only in the browser that asked for it, so a test that asks in one client and checks in another fails with `other_browser`. The last-method cookie is set only once the browser allowed it in the consent manager, so a page that marks **Last used** lists `preferences` in `appConfig.backend.consent.purposes`.

## Related

- [Build a custom sign-in page](/docs/build/auth/sign-in/custom-page): `<AuthForm>`'s slots and parts, or your own markup on `useLoginFlow`.
- [Hook into sign-in and sign-up](/docs/build/auth/sign-in/hooks): `canSignIn` and the account lifecycle hooks.
- [Stop bots](/docs/build/auth/sign-in/bots): the check before a code goes out.
- [Security model](/docs/ship/security#passwordless-sign-in-and-its-rate-limits): what sign-in turns off, and why.
- [Resend](/docs/services/resend): the provider that delivers the codes.
