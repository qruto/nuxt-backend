---
title: "Auth, accounts and workspaces"
description: "Passwordless sign-in with email codes and passkeys, session state, route and function guards, roles, and multi-tenant workspaces with invitations."
kind: landing
navigation:
  title: Overview
  icon: i-lucide-compass
---

Accounts in `nuxt-backend` are [Better Auth](https://www.better-auth.com) running inside your Convex backend, composed by `setupAuth` and read in Nuxt through `useAuth()`. Sign-in is passwordless: an emailed one-time code, with a passkey offered afterwards for next time. On top of the session come app-wide roles and permissions, multi-tenant workspaces with emailed invitations, and ready-made pages at `/login`, `/profile`, `/security`, `/settings` and `/accept-invitation`.

Roles, permissions and workspaces are Better Auth's admin and organization plugins, both on by default. The package wires them to Convex, puts the role and the active workspace on the Convex JWT, and adds the composables, components, pages and server-side function builders that read them.

## How it fits together

1. **Wire.** The module scaffolds `backend/auth.ts`, where `setupAuth` mounts the `backend` component and connects email delivery, rate limits and your hooks: `canSignIn` to decide who may sign in, `onUserCreated` and `onUserDeleted` for the account lifecycle. See [Auth setup](/docs/auth/setup).
2. **Sign in.** `/login` renders `<AuthForm>`, built on `useLoginFlow()`: request a code, verify it, then optionally save a passkey. The first sign-in creates the account and a personal workspace. See [Signing in](/docs/auth/sign-in#signing-in).
3. **Read the session.** `useAuth().session` holds the session in the app. In your backend, the role and the active workspace are claims on the Convex JWT, so most checks cost no database read. See [Reading session state](/docs/auth/sign-in#reading-session-state) and [the active workspace](/docs/auth/workspaces#the-active-workspace-is-a-claim).
4. **Protect.** The `auth` route middleware sends signed-out visitors to `/login` and back to where they were headed. `<Authenticated>`, `<RoleBoundary>` and `<OrganizationBoundary>` gate the UI, and the `authed`, `org`, `admin` and `withRole` function builders enforce the same rules on the server. See [Protecting routes](/docs/auth/sign-in#protecting-routes) and [pre-authorized function builders](/docs/auth/access/functions).
5. **Manage.** `useOrganization()` switches, creates and leaves workspaces and sends invitations. The `/settings`, `/profile` and `/security` pages cover workspaces, the display name and email address, passkeys, device sessions and account deletion. See [Workspaces](/docs/auth/workspaces) and [Default pages](/docs/ui/pages).

## In this section

::card-group
  :::card{icon="i-lucide-key-round" title="Auth setup" to="/docs/auth/setup"}
  The scaffolded files, what `setupAuth` returns, and how to extend Better Auth or move the auth route.
  :::

  :::card{icon="i-lucide-shield-check" title="Authentication" to="/docs/auth/sign-in"}
  Sign users in with `useLoginFlow`, read the session, and guard pages with the `auth` middleware.
  :::

  :::card{icon="i-lucide-shield" title="Authorization" to="/docs/auth/access/roles"}
  App-wide roles and permissions, the function builders that check them, and `hasRole` / `can` on the client.
  :::

  :::card{icon="i-lucide-users" title="Workspaces" to="/docs/auth/workspaces"}
  The active workspace as a claim, `useOrganization`, `<WorkspaceSettings>`, and invitations end to end.
  :::
::

The emails sign-in sends, from the one-time code to the workspace invitation, are covered under [Templates](/docs/email/templates).

::playground-link{to="/playground/platform/account" label="authentication"}
::

## Not covered here

- **Passwords.** Email and password sign-in is off, and `<AuthForm>` offers only email codes and passkeys. You can turn passwords on through `authOptions`, but the form and per-identity rate limits for them are yours to build. See [Extend Better Auth options](/docs/auth/setup#extend-better-auth-options).
- **Changing an email address through a profile update.** `updateProfile` takes the display name only; a new address goes through the verified change-email flow.
