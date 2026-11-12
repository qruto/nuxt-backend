---
title: What's new in 0.5
description: "0.5.0 makes public what the packaged billing and growth pages kept inside: plan switches, the billing section, pricing checkout and schema.org data, waitlist and invite links, and referral invites, so an app's own pages work the same way. Packaged pages stop calling functions of a backend file the app doesn't have, and init names the project's own package manager."
kind: landing
related:
  - /docs/start/feature-map
  - /docs/start/roadmap
  - /docs/ship/releases/upgrade
navigation:
  title: Overview
  icon: i-lucide-newspaper
---

`0.5.0` takes what comics.my's own pricing, billing, waitlist, invite and referral pages had to rewrite, and makes it public, so an app's own page does what the packaged one does. The packaged components use the same composables, so there is one implementation. The [Feature map](/docs/start/feature-map) lists every feature with its status, and the [Changelog](/docs/ship/releases/changelog) every change. What the release brings, capability by capability:

- **[Billing](/docs/start/feature-map#billing).** `usePlanChange()` covers the confirmed plan switch, priced in the subscription's own currency. `useBillingSection()` is a billing section's state: what it offers, in order, and whether a switch, a pause or a cancellation applies. `usePricing()` gains `checkout()`, with the pricing table's campaign rules, and `structuredData`, its schema.org data. `useGiftList()` gains `firstDay` and `lastDay`.
- **[Growth](/docs/build/growth/launch).** `useWaitlist({ statusLink: true })` takes a status link's token out of the address and keeps it for the tab. `useInvite({ fromAddress: true })` opens an access link the way the packaged `/invite` page does. `useReferralInvite().inviteTo` is the invite page that carries a referral link's code.
- **[The tools](/docs/start/feature-map#developer-tools).** `init`, `init --agents` and the module's install step name the project's own package manager in their next steps: `pnpm install` and `pnpm run dev` in a pnpm project.
- **Under the hood.** The packaged plugin provides only the backend modules codegen lists, so a composable whose file the app doesn't have falls back instead of calling the deployment. The packaged `/waitlist`, `/invite` and `/r/:code` pages no longer fail on an app without `backend/access.ts` or `backend/referrals.ts`. The docs cover pnpm 12, including the agent skills it offers to link.

Development runs on the providers' own test modes, with nothing simulated: Polar's sandbox, Resend's test addresses and the Convex AI Gateway ([Develop on real sandboxes](/docs/develop/sandboxes)). A feature the Feature map marks **Planned** arrives in the next minor release, and its page already describes it as it will ship.

## Upgrading from 0.4

Run `npx nuxt-backend upgrade` as for every release. Two behaviours change around it. The packaged plugin reads the backend's modules from `_generated/api.d.ts`, so keep that file current: a module it doesn't list reads as absent. The pricing table shows no switch for a plan without a price in the subscription's currency. The [Upgrade page](/docs/ship/releases/upgrade) lists each change with the edit it asks for.

## What waits for a later release

`0.5.0` still serves client apps. The features a service platform needs (API keys, outgoing webhooks, an MCP endpoint for your users' agents, and deeper workspaces with custom roles) arrive together in a later release. The [Roadmap](/docs/start/roadmap) says why each one waits.

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
