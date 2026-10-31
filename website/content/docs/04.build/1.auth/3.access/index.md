---
title: Access
description: "Who may open which page and call which backend function: page rules in definePageMeta, the access tiers createFunctions gives every function, app-wide roles, and the recent sign-in sensitive actions ask for."
kind: landing
navigation:
  icon: i-lucide-key-round
---

Access is decided on the server, in every function, from who the caller is and a fresh read where it matters. Pages mirror those decisions, so a person never opens a screen they can't use. You declare both in one place each: a page's rules in its `definePageMeta({ auth })`, and a function's tier where you define it.

Four things decide what a caller may do:

- **Who they are.** Signed in or not, banned or not, and whether an administrator is visiting their account.
- **Their app-wide role.** `user`, `admin`, or a role of yours such as `editor`.
- **Their workspace.** The active workspace, their built-in role in it (`owner`, `admin` or `member`), and the plan features it pays for.
- **How recent their sign-in is.** A few sensitive actions take a sign-in from the last ten minutes.

The role and the active workspace ride on the Convex token, so most checks cost no read. Membership, and anything an administrator does, is read fresh on every call. Better Auth's admin and organization plugins hold the roles and workspaces. The package adds the page rules, the function tiers, the claims on the token and the recent sign-in.

::card-group
  :::card{icon="i-lucide-lock-keyhole" title="Protect pages and routes" to="/docs/build/auth/access/pages"}
  `definePageMeta({ auth })`, the 403 or 404 a refused person gets, and server routes.
  :::

  :::card{icon="i-lucide-shield" title="Protect backend functions" to="/docs/build/auth/access/functions"}
  The `authed`, `workspace`, `admin`, `withRole` and `withFeature` tiers from one `createFunctions` call.
  :::

  :::card{icon="i-lucide-users-round" title="Give people roles" to="/docs/build/auth/access/roles"}
  App-wide roles, workspace roles, and checking either in a page or a function.
  :::

  :::card{icon="i-lucide-fingerprint" title="Require a recent sign-in" to="/docs/build/auth/access/step-up"}
  "Confirm it's you" before a sensitive action, and `recentSignIn` on your own functions.
  :::
::

Parts of a page, rather than whole pages, are shown by role, workspace or plan with `<Gate>` ([UI](/docs/build/ui)).
