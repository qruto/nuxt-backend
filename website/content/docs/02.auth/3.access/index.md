---
title: Access
description: "Who may call which backend function, and what each role and permission allows."
kind: landing
navigation:
  icon: i-lucide-key-round
---

Access is decided on the server, in every function, from the caller's identity and a fresh read where it matters. The browser only mirrors it, to hide what a person cannot use.

::card-group
  :::card{icon="i-lucide-shield" title="Protect backend functions" to="/docs/auth/access/functions"}
  The `authed`, `org`, `admin` and `withRole` builders.
  :::

  :::card{icon="i-lucide-users-round" title="Authorization" to="/docs/auth/access/roles"}
  `setupAuthorization`, custom roles, the client's role checks and `<RoleBoundary>`.
  :::
::
