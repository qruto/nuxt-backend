---
title: "Auth, accounts and workspaces"
description: "Who a person is and what they may do: sign-in with sign-in codes and passkeys, launch phases with a waitlist and invites, protected pages and functions, roles, accounts with export, deletion and consents, workspaces with members and invitations, and an admin console."
kind: landing
playground: /login
api: /docs/reference/api/auth
source: src/convex/client/index.ts
navigation:
  title: Overview
  icon: i-lucide-compass
---

The `auth` capability answers two questions for every request: who is this, and what may they do. People sign in with a code sent to their email, or with a passkey, and nothing else: no passwords, no social sign-in and no magic links ([Email codes and passkeys only](/docs/start/concepts/principles#email-codes-and-passkeys-only)). Your pages and Convex functions each declare who may use them, in one line. People manage and erase their own accounts, and share workspaces. You run it all from an admin console at `/admin`.

It is the `auth` [capability](/docs/start/concepts/capabilities): the part of the package every app runs, always on.

## Your first protected page

The scaffold already mounts `/login`, `/profile`, `/security`, `/settings` and `/admin`. In development, the sign-in code prints in your `convex dev` console. Guard a page with one line:

```vue [app/pages/studio.vue]
<script setup lang="ts">
definePageMeta({ auth: true })

const { user } = useAuth()
</script>

<template>
  <p>Welcome back, {{ user?.name }}.</p>
</template>
```

And a function with one builder, the `authed` tier, which refuses anyone signed out before your handler runs:

```ts [backend/strips.ts]
import { authed } from './functions'

export const mine = authed.query({
  args: {},
  handler: async ctx => ctx.db.query('strips')
    .withIndex('authorId', q => q.eq('authorId', ctx.user.id))
    .take(50),
})
```

A **tier** is one of these builders: `authed`, `workspace`, `admin` and two more, each a drop-in for Convex's `query`, `mutation` and `action` ([Protect backend functions](/docs/build/auth/access/functions)).

## What powers it

[Better Auth](https://www.better-auth.com) runs inside your Convex deployment, in the package's `backend` component. Accounts, sessions and workspaces live next to your data, with no auth service in between. The package composes Better Auth's own plugins, and adds what a client app needs on top:

| Native to Better Auth | Added by the package |
|---|---|
| Email codes, passkeys and sessions | `setupAuth`, which the scaffold calls for you, `useLoginFlow`, `<AuthForm>` at `/login`, passkey autofill. Planned: codes bound to the browser that asked, the passkey offer, the WebAuthn Signal API and passkey-only accounts with a recovery code |
| Sign-in and sign-up hooks | `canSignIn` and the lifecycle hooks, launch phases, invite codes, access links and a verified waitlist |
| Roles, bans and impersonation (the admin plugin) | Roles on the session token, page rules, function tiers, a recent sign-in for sensitive actions, the admin console. Planned: tabs of your own and a reports queue |
| Workspaces, members and invitations (the organization plugin) | A personal workspace for everyone, the active workspace carried on the session token, `useWorkspace` |
| Account and session tables | Export, deletion, the activity trail, new-device alerts. Planned: the grace period, an erasure that reaches every provider, consents, a consent manager for optional storage, a minimum age |

The **active workspace** is the one a person works in right now. Every account has at least one, its personal workspace.

## How it fits together

1. **Wire.** The scaffold's `backend/auth.ts` calls `setupAuth`, which connects email, rate limits, the activity trail, erasure and your hooks ([Auth setup](/docs/build/auth/setup)).
2. **Open the doors.** Launch in phases, a waitlist, then invites, then everyone ([Launch in phases](/docs/build/growth/launch)).
3. **Sign in.** `/login` renders `<AuthForm>` on `useLoginFlow()`: a code, then a passkey for next time. The first sign-in creates the account and a personal workspace ([Sign users in](/docs/build/auth/sign-in)).
4. **Protect.** `definePageMeta({ auth })` guards pages, and the tiers guard every function you build with them ([Access](/docs/build/auth/access)).
5. **Manage.** People edit their profile at `/profile`, their passkeys, devices and data at `/security`, and their workspaces at `/settings` ([Accounts](/docs/build/auth/accounts), [Workspaces](/docs/build/auth/workspaces)).
6. **Run it.** Administrators use `/admin`: every account and workspace, the activity trail, the launch phase and the waitlist ([Run the admin console](/docs/build/auth/admin)).

## In development and in production

- **On your machine.** The code prints in the `convex dev` console, and Resend's test addresses receive real emails you read in the [dev inbox](/docs/develop/dev-inbox). The bot check lets every request through, as Vercel's BotID does in development ([Develop with real sandboxes](/docs/develop/sandboxes)).
- **In production.** `AUTH_SECRET` and `SITE_URL` are required on the deployment, `EMAIL_*` delivers the codes ([Resend](/docs/services/resend)), and a bot check guards each code request ([Bot protection](/docs/services/bot-protection)). Make the first administrator with `npx nuxt-backend doctor --fix`.
- **Its state.** `npx nuxt-backend status` and DevTools show the capability's state, and `npx nuxt-backend doctor --only auth` names what is missing ([the `auth` findings](/docs/reference/cli/diagnostics#auth)).

## Start here

::card-group
  :::card{icon="i-lucide-log-in" title="Sign users in" to="/docs/build/auth/sign-in"}
  Codes and passkeys with `useLoginFlow`, passkey autofill, and the session in your pages.
  :::

  :::card{icon="i-lucide-door-open" title="Launch in phases" to="/docs/build/growth/launch"}
  Early access with a waitlist, then invite only, then public.
  :::

  :::card{icon="i-lucide-lock-keyhole" title="Protect pages and routes" to="/docs/build/auth/access/pages"}
  `definePageMeta({ auth })` with roles, workspaces and plan features.
  :::

  :::card{icon="i-lucide-users" title="Create and switch workspaces" to="/docs/build/auth/workspaces"}
  The personal workspace, the active one on the token, and `useWorkspace`.
  :::
::

## Every page

Pages marked *planned* describe a part of `0.2.0` that is not built yet. Pages marked *changing* describe the `0.2.0` API of a part that is built ([Feature map](/docs/start/feature-map)).

**Set up**

- [Auth setup](/docs/build/auth/setup): the scaffolded files, everything `setupAuth` takes and returns, and the auth route.

**Sign-in**

- [Sign users in](/docs/build/auth/sign-in): `useLoginFlow`, `<AuthForm>`, passkey autofill and `useAuth`, plus browser-bound codes, the passkey offer and passkey-only accounts (planned).
- [Build a custom sign-in page](/docs/build/auth/sign-in/custom-page): your own `/login`, with `?redirect=` and autofill kept.
- [Stop bots](/docs/build/auth/sign-in/bots): BotID on Vercel, a challenge elsewhere, `verifyHuman` for your own calls.
- [Launch in phases](/docs/build/growth/launch) (planned): early access, invite only and public, and the tickets that admit a new address.
- [Hook into sign-in and sign-up](/docs/build/auth/sign-in/hooks): `canSignIn`, `onUserCreated`, `onUserDeleted` and Better Auth hooks of your own.

**Access**

- [Protect pages and routes](/docs/build/auth/access/pages): page rules, the 403 and the 404, when a session ends, and server routes.
- [Protect backend functions](/docs/build/auth/access/functions): the `authed`, `workspace`, `admin`, `withRole` and `withFeature` tiers.
- [Give people roles](/docs/build/auth/access/roles): app-wide roles and workspace roles, and where each is checked.
- [Require a recent sign-in](/docs/build/auth/access/step-up): "Confirm it's you" before sensitive actions.

**Accounts**

- [Let users edit their profile](/docs/build/auth/accounts/profile): name, avatar, language and a new email address.
- [Manage passkeys and sessions](/docs/build/auth/accounts/security): `/security`, its devices, its recent activity, and passkey-only (planned).
- [Export and delete an account](/docs/build/auth/accounts/data): one export of everything, and a deletion with a grace period that erases the person at every provider.
- [Record consents](/docs/build/auth/accounts/consents) (planned): terms, privacy and opt-ins by version, the consent manager for optional storage, and a minimum age.
- [Alert people to new sign-ins](/docs/build/auth/accounts/alerts): a notice when a new device signs in.

**Workspaces**

- [Create and switch workspaces](/docs/build/auth/workspaces): the personal workspace, `useWorkspace` and `/settings`.
- [Invite people to a workspace](/docs/build/auth/workspaces/invitations): the invitation flow end to end.
- [Manage members](/docs/build/auth/workspaces/members): the members list, built-in roles and removal.

**Admin**

- [Run the admin console](/docs/build/auth/admin): the first administrator, then `/admin`.
- [Impersonation](/docs/build/auth/admin/impersonation): why administrators act only through a short, recorded visit.
- [Record and review activity](/docs/build/auth/admin/audit-log): the activity trail, and events of your own on it.
- [Add your own admin tabs](/docs/build/auth/admin/custom-tabs) (planned): your team's tools inside the console.

The launch, waitlist, revenue and growth tabs of the console are covered under [Grow your app](/docs/build/growth).

The emails sign-in sends, from the code to the invitation, are covered under [Templates](/docs/build/email/templates). Content people report is reviewed in the console's [Reports tab](/docs/build/auth/admin#review-reports), set up in [Keep content safe](/docs/build/ai/content-safety#review-reports).

## What you get

What the package ships for this part of the app today, generated from the code. Each name links to its reference entry.

::what-you-get{area="auth"}
::

## Not in 0.2.0

These arrive in a later release ([Roadmap](/docs/start/roadmap)):

- roles a workspace owner defines, and billing as a permission inside them;
- moving a workspace to another owner;
- shareable links into a workspace;
- API keys, and an MCP endpoint for your users' agents, on OAuth with the device grant;
- sessions bound to the device (Device Bound Session Credentials), which only Chrome on Windows ships so far.
