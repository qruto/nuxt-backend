---
title: What's new in 0.3
description: "0.3.0 moves into the package what the first apps on 0.2 wrote themselves: hearing when a job ends and charging for what it made, image models, pluggable moderation, welcome credits, billing that waits to launch, member tickets, labels in emails, the report form and legal pages, and test helpers."
kind: landing
related:
  - /docs/start/feature-map
  - /docs/start/roadmap
  - /docs/ship/releases/upgrade
navigation:
  title: Overview
  icon: i-lucide-newspaper
---

`0.3.0` takes in what comics.my, the first app built on `0.2`, had to write for itself, so the next app doesn't. Under it, Better Auth 1.7 on `nuxt-convex-module` 0.14 closes the Better Auth security advisories. The [Feature map](/docs/start/feature-map) lists every feature with its status, and the [Changelog](/docs/ship/releases/changelog) every change. What the release brings, capability by capability:

- **[AI jobs](/docs/build/ai/jobs).** `onJobEnd` runs once for every job that ends, however it ends, and app code reads and cancels jobs with `jobs.get` and `jobs.cancel`. `job.charge(n)` bills what a job made, capped at the hold taken when it was queued, and gives back the rest; a job can also run free. A step draws with image models through `ctx.image()`, stops its model calls at its `timeout`, and marks a failure worth another try with `retryable()`. `setupAi({ gateway })` chooses the AI gateway, and `setupAi({ routes })` gives some models a gateway order of their own.
- **[Content safety](/docs/build/ai/content-safety).** `setupAi({ moderation })` sets a policy: what to block, what to escalate and how long flags are kept, with the flags listed in the admin console. [Providers plug in](/docs/build/ai/content-safety/providers) beside the default classifier, Llama Guard 4, which reads text and images: Azure AI Content Safety for images and text, OpenAI's moderation as a second opinion, and Project Arachnid Shield for known abuse imagery, all over one set of categories, with every decision recorded as its statement of reasons.
- **[Billing](/docs/start/feature-map#billing).** Welcome credits on the free plan, granted once per person. A production deployment without a billing token or a production catalog reads "Plans open soon" and refuses a sale until it launches, and `usePricing().launched` says which. Plans list their gift lengths at live prices, and `npx nuxt-backend billing resync` reads every entity's entitlements again.
- **[Growth](/docs/build/growth/launch).** Member tickets let members bring friends past the waitlist while the app is closed, the waitlist records where each person came from, and `npx nuxt-backend access admit` invites an address from the shell.
- **[Email](/docs/start/feature-map#email) and [labels](/docs/build/ui/customize/labels).** The labels app config sets reach emails, notification emails and push through `labels.generated.ts`, and a `notification` template switches by kind.
- **[UI](/docs/start/feature-map#ui).** Font, border and shadow [tokens](/docs/build/ui/customize/tokens) under one `[data-backend]` root, `useReportForm` for the notice form the EU Digital Services Act asks for, `useSignInAlerts`, legal components for Content pages, and the web app manifest's colours and icons.
- **[Data](/docs/start/feature-map#data) and [tests](/docs/develop/testing).** `storage.expire`, a hook when a [share link](/docs/build/data/files/share-links) is turned on, [retention](/docs/build/data/retention) on a schedule, and `upload`, `seedCredits`, `seedBilling`, `drain` and `stubStorageFetch` in `nuxt-backend/test`. The upload field tells a refusal from a failure and retries a failure from where it stopped.
- **[The tools](/docs/start/feature-map#developer-tools).** `doctor --prod` reads billing's launch state, checks for a `spendLimit` and says where to set up an uptime monitor and each AI gateway's own cap, `deploy --build` uses the project's package manager, and `upgrade` runs the workpool's backfill.
- **Under the hood.** The Better Auth client loads on first use, so a page a signed-out visitor only reads downloads none of it. Browser error reports go through Sentry's managed tunnel on the app's own origin. Other sites can load the og images and the logo.

Development runs on the providers' own test modes, with nothing simulated: Polar's sandbox, Resend's test addresses and the Convex AI Gateway ([Develop on real sandboxes](/docs/develop/sandboxes)). A feature the Feature map marks **Planned** arrives in the next minor release, and its page already describes it as it will ship.

## Upgrading from 0.2

Deploy the backend, then run `npx nuxt-backend upgrade`: the `backend` component gains tables and fields, and the upgrade also runs the workpool's backfill. Most apps need a few edits beside it: a Better Auth plugin of your own must support 1.7, every passkey ceremony now asks for a fingerprint, face or PIN, and `setupEmail` takes the `labels` of the `labels.generated.ts` that `upgrade` writes. The [Upgrade page](/docs/ship/releases/upgrade) lists each change with the edit it asks for.

## What waits for a later release

`0.3.0` still serves client apps. The features a service platform needs (API keys, outgoing webhooks, an MCP endpoint for your users' agents, and deeper workspaces with custom roles) arrive together in a later release. The [Roadmap](/docs/start/roadmap) says why each one waits.

## Experimental

A few parts may still change shape in a minor release of the `0.x` line, without the deprecation cycle: metered AI (`nuxt-backend/ai`), the monitoring helpers for your own actions, the test helpers and the backend mock, plan quotas and the dev inbox. Their pages carry the Experimental chip, and [the experimental tier](/docs/ship/releases/stability#the-experimental-tier) lists each name.

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
