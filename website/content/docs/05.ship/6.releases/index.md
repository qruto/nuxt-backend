---
title: What's new in 0.6
description: "0.6.0 sells through Stripe Managed Payments, Dodo Payments and Creem besides Polar, adds an authenticator app after the sign-in code, a sign-in-only Convex auth mode and live presence, and lets an app set the waitlist's friend credit, keep its rank private and plan the next wave. The module now requires Nuxt 4.7.0."
kind: landing
related:
  - /docs/start/feature-map
  - /docs/start/roadmap
  - /docs/ship/releases/upgrade
navigation:
  title: Overview
  icon: i-lucide-newspaper
---

`0.6.0` widens where an app can sell and how people sign in, and hands the waitlist's rules to the app. The [Feature map](/docs/start/feature-map) lists every feature with its status, and the [Changelog](/docs/ship/releases/changelog) every change. What the release brings, capability by capability:

- **[Billing](/docs/services/merchants).** `setupBilling` runs on Stripe Managed Payments, Dodo Payments and Creem as well as Polar, with the same checkout, portal, plans and webhooks. A refund that arrives before its order is held until the order does, and a yearly plan's months follow their own order.
- **[Auth](/docs/build/auth/accounts/security).** An account can add an authenticator app, asked for after the sign-in code, with backup codes and a trusted device. [Convex auth](/docs/build/auth/convex-auth) is an opt-in mode for an app that only needs sign-in.
- **[Data](/docs/build/data/read-write/presence).** Presence shows who else is on a page, and clears when they leave or lose access.
- **[Growth](/docs/build/growth/launch/waitlist).** `setupAccess({ waitlist })` sets how far each friend moves a person up the line, with no limit if the app wants, and a head start for the friend. `place: { rank: false }` keeps the place and the size of the list to the administrators. They plan the next wave in the admin console, and each person reads only whether they are in it and how many friends short they are. A sharer can get one "a friend joined" email a day, and one mailbox earns one credit.

Development runs on the providers' own test modes, with nothing simulated: Polar's sandbox, Resend's test addresses and the Convex AI Gateway ([Develop on real sandboxes](/docs/develop/sandboxes)). A feature the Feature map marks **Planned** arrives in the next minor release, and its page already describes it as it will ship.

## Upgrading from 0.5

Run `npx nuxt-backend upgrade` as for every release. One requirement changes around it: the module needs Nuxt `4.7.0` or later, as Nuxt 4.6 no longer builds with Vite 8.4. The waitlist keeps its 0.5 behaviour unless `setupAccess({ waitlist })` says otherwise. The [Upgrade page](/docs/ship/releases/upgrade) lists each change with the edit it asks for.

## What waits for a later release

`0.6.0` still serves client apps. The features a service platform needs (API keys, outgoing webhooks, an MCP endpoint for your users' agents, and deeper workspaces with custom roles) arrive together in a later release. The [Roadmap](/docs/start/roadmap) says why each one waits.

## Experimental

A few parts may still change shape in a minor release of the `0.x` line, without the deprecation cycle: metered AI (`nuxt-backend/ai`), the monitoring helpers for your own actions, the test helpers and the backend mock, plan quotas, the gift form and the dev inbox. Their pages carry the Experimental chip, and [the experimental tier](/docs/ship/releases/stability#the-experimental-tier) lists each name.

## In this section

::card-group
  :::card{icon="i-lucide-history" title="Changelog" to="/docs/ship/releases/changelog"}
  Every release, newest first: what changed and what broke.
  :::

  :::card{icon="i-lucide-shield-check" title="Stability" to="/docs/ship/releases/stability"}
  What a version number promises, and which parts are still experimental.
  :::

  :::card{icon="i-lucide-badge-check" title="Verify a release" to="/docs/ship/releases/verify"}
  Check npm's provenance, the attested tarball and its SBOM before you upgrade.
  :::

  :::card{icon="i-lucide-arrow-up-circle" title="Upgrade to a new version" to="/docs/ship/releases/upgrade"}
  Install a release, repair the scaffold and migrate the package's data in one command.
  :::
::
