---
title: Accounts
description: "What a signed-in person manages about their own account: their profile, the passkeys and devices that guard it, its export and its deletion everywhere, the consents they gave, and alerts when a new device signs in."
kind: landing
navigation:
  icon: i-lucide-circle-user
---

An account is one person: an address proven by a code, the passkeys they saved, their signed-in devices and the workspaces they belong to. Two packaged pages cover what a person manages about it, `/profile` and `/security`. Each is one component you can place anywhere, or rebuild from its composables. Everything the app keeps about a person, they can take with them or erase.

Better Auth holds the account, its sessions and its passkeys. The package adds the pages, the export, an erasure that reaches every provider, and the records the law asks a client app to keep. In `0.2.0` a person can also make their account passkey-only, and you can set a minimum age.

::card-group
  :::card{icon="i-lucide-user-pen" title="Let users edit their profile" to="/docs/build/auth/accounts/profile"}
  The display name, the avatar, the language of their email, and a confirmed change of address.
  :::

  :::card{icon="i-lucide-shield-check" title="Manage passkeys and sessions" to="/docs/build/auth/accounts/security"}
  Passkeys, signed-in devices, recent activity, and passkey-only accounts.
  :::

  :::card{icon="i-lucide-file-down" title="Export and delete an account" to="/docs/build/auth/accounts/data"}
  One file of everything the app keeps, and a deletion with a grace period that erases the person everywhere.
  :::

  :::card{icon="i-lucide-badge-check" title="Record consents" to="/docs/build/auth/accounts/consents"}
  Planned: your terms and opt-ins by version, the consent manager for optional storage, and a minimum age.
  :::

  :::card{icon="i-lucide-bell-ring" title="Alert people to new sign-ins" to="/docs/build/auth/accounts/alerts"}
  A notice in the app and by email when a new device signs in, or a recovery code is used.
  :::
::

The account menu and the workspace switcher for your header are part of the [app shell](/docs/build/ui/app-shell), on the UI tab. The first run after sign-up is [activation](/docs/build/growth/engage/activation), under Growth.
