---
title: Authentication
description: Sign in from Nuxt, read reactive session state, protect routes, and gate UI with the auth components.
kind: how-to
playground: /playground/platform/account
api: /docs/reference/api/use-login-flow
source: src/runtime/vue/composables/use-login-flow.ts
navigation:
  icon: i-lucide-shield-check
---

Better Auth is wired in by the module. App code talks to it through a single composable — `useAuth()` — plus an opt-in route middleware and four auth-state components.

## `useAuth()`

`useAuth()` is the single Better Auth service. It exposes the Better Auth client, the reactive session wrapper, the computed auth state used by the Convex integration, and the passwordless calls the packaged pages use:

```vue
<script setup lang="ts">
const { client, session, isAuthenticated, isLoading, sendOtp, signInWithOtp, signOut } = useAuth()

await sendOtp('user@example.com')                              // emails a one-time code
await signInWithOtp({ email: 'user@example.com', otp: '123456' }) // signs in, or signs up on first use
const user = computed(() => session.value.data?.user)
</script>
```

Sign-in is passwordless by default: an emailed one-time code, with an optional passkey saved afterwards. Better Auth client calls **resolve** `{ data, error }` instead of throwing — check `error`, or wrap the call in `unwrapAuth()` (auto-imported) to turn it into an exception.

::callout{icon="i-lucide-key-round"}
Email + password is off (`emailAndPassword.enabled: false`). To offer it as well, pass `authOptions: { emailAndPassword: { enabled: true } }` to `setupAuth` in `backend/auth.ts` ([customizing auth](/docs/auth/setup#auth-route-and-options)) — after which `client.signIn.email({ email, password })` and `client.signUp.email(...)` work as in the Better Auth docs.
::

## Signing in

The shipped `/login` page and the `<AuthForm>` component are built on `useLoginFlow()`. For your own page, use the same composable — it owns the step state (`choose` → `request-code` → `verify-code` → `add-passkey`), validation, the pending flag and the error message:

```vue [pages/login.vue]
<script setup lang="ts">
const { step, email, name, otp, pending, error, sendCode, verifyCode, addPasskey, skipPasskey, signInWithPasskey, goTo } = useLoginFlow({
  onSuccess: () => navigateTo('/account'),
})
</script>

<template>
  <form v-if="step === 'choose' || step === 'request-code'" @submit.prevent="sendCode">
    <input v-model="name" type="text" placeholder="Name (for new accounts)" autocomplete="name">
    <input v-model="email" type="email" placeholder="Email" autocomplete="email">
    <button :disabled="pending" type="submit">Email me a code</button>
    <button type="button" @click="signInWithPasskey">Use a passkey</button>
  </form>

  <form v-else-if="step === 'verify-code'" @submit.prevent="verifyCode">
    <input v-model="otp" inputmode="numeric" autocomplete="one-time-code" placeholder="6-digit code">
    <button :disabled="pending" type="submit">Sign in</button>
    <button type="button" @click="goTo('request-code')">Use another email</button>
  </form>

  <div v-else-if="step === 'add-passkey'">
    <p>Signed in. Save a passkey for next time?</p>
    <button :disabled="pending" type="button" @click="addPasskey">Save a passkey</button>
    <button type="button" @click="skipPasskey">Not now</button>
  </div>

  <p v-if="error">{{ error }}</p>
</template>
```

`useLoginFlow(options?)` takes:

| Option | Default | Effect |
|---|---|---|
| `requireName` | `true` | UI hint read by `<AuthForm>`: show a name field on the email step. `verifyCode()` sends `name` with the code whenever it is non-empty — on a custom page, keep it bound through the verify step, not only the request step. |
| `validateEmail` | a basic shape check | `(email) => boolean \| string` — gates the email before `sendCode`. Return `false` for the default message, or a string for a custom one. |
| `onSuccess` | — | Called once the user is signed in and the flow is complete (e.g. `navigateTo`). |

It returns:

| Name | Type / effect |
|---|---|
| `step` | `Ref<'choose' \| 'request-code' \| 'verify-code' \| 'add-passkey'>` |
| `email`, `name`, `otp` | `Ref<string>` — bind them to your inputs |
| `pending` | `Ref<boolean>` — an action is in flight |
| `error` | `Ref<string \| null>` — the last failed action's message |
| `retryAfter` | `Ref<number \| null>` — after a rate-limit refusal, the seconds to wait (rounded up); `null` otherwise |
| `emailValid` | `ComputedRef<boolean>` — whether `email` passes `validateEmail` |
| `signInWithPasskey()` | sign in with a passkey already saved on this device |
| `sendCode()` | email a code to `email` → `verify-code` |
| `verifyCode()` | verify `otp` (signs in, or signs up on first use) → `add-passkey` |
| `addPasskey()` | save a passkey on the new session → done |
| `skipPasskey()` | skip the passkey offer → done |
| `goTo(step)` | jump to a step, clearing `otp` and `error` |
| `reset()` | back to `choose` with every field cleared |

A refused request (HTTP 429) leaves the flow on its current step. `error` reads *"Too many attempts. Try again in 30 seconds."* and `retryAfter` holds the `30`, so a custom page can count down or disable its button until then. When the wait is unknown, the message says *"…Try again in a moment."* and `retryAfter` stays `null`. See [rate limiting](/docs/ship/production/rate-limits#what-the-user-sees) for which refusals carry a wait.

Every step is also available one level down on `useAuth()` — `sendOtp`, `signInWithOtp`, `signInWithPasskey`, `registerPasskey` — when a page needs a shape the composable does not model.

## Reading session state

```vue [pages/account.vue]
<script setup lang="ts">
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

const { session } = useAuth()
const currentUser = useQuery(api.auth.getAuthUser, {})
const email = computed(() => session.value.data?.user.email)
</script>

<template>
  <section>
    <p>Signed in as {{ email }}</p>
    <pre>{{ currentUser }}</pre>
  </section>
</template>
```

`useAuth().session` exposes the Better Auth session, and `useQuery(...)` keeps Convex data live after hydration.

## Protecting routes

Guard a page with the built-in `auth` middleware — it's registered **non-global**, so installing the module never guards routes by surprise:

```vue
<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
</script>
```

Unauthenticated users are redirected to the sign-in page (`/login`, or wherever [`pages.login`](/docs/reference/configuration/module-options) puts it) with the original destination in `?redirect=`. The guard runs on the server for direct loads and in the browser for client-side navigation.

`auth` is this package's name for the guard `nuxt-convex-module` registers as `convex-auth` — both stay registered and point at the same middleware, so code written against the base module keeps working.

## Auth-state components

Four components render their slot based on auth state — useful for headers, menus, and loading skeletons:

```vue
<template>
  <Authenticated>Signed in — show the dashboard</Authenticated>
  <Unauthenticated>Show a sign-in button</Unauthenticated>
  <AuthLoading>Resolving auth…</AuthLoading>
  <AuthRefreshing>Reconnecting…</AuthRefreshing>
</template>
```

| Component | Renders its slot when |
|---|---|
| `<Authenticated>` | the user is authenticated |
| `<Unauthenticated>` | the user is unauthenticated |
| `<AuthLoading>` | auth state is still resolving |
| `<AuthRefreshing>` | an authenticated session's token is being refreshed after the backend rejected it (routine background rotation does not trigger it) |

## Workspace invitations

A member invites by email, and the invitee accepts on the built-in `/accept-invitation` page after signing in. [Invitations end-to-end](/docs/auth/workspaces#invitations-end-to-end) has the flow, the `useOrganization()` calls on both sides and how to customize the email, the link and the page.

## Advanced: low-level auth helpers

The package also exports low-level Convex auth helpers for custom auth integrations: `provideConvexAuth`, `useAuthState`, and the components above. These are building blocks for custom auth providers and are **not required** for the default Better Auth setup scaffolded by the module.

```ts
function useAuthState(): {
  isLoading: ComputedRef<boolean>
  isAuthenticated: ComputedRef<boolean>
  isRefreshing: ComputedRef<boolean>
}
function provideConvexAuth(options: ConvexAuthProviderOptions): ConvexAuthState
```

The three flags are computed refs — read `.value` in script (templates unwrap them). `isRefreshing` is the state `<AuthRefreshing>` renders on: the backend rejected a confirmed token and a new one is being fetched.

::tip{to="/docs/auth/setup"}
To customize Better Auth itself — add providers, plugins, or change the auth route — see the Convex Backend section.
::
