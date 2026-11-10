---
title: What's new in 0.4
description: "0.4.0 settles what moving comics.my to 0.3 turned up: jobs charged by what they made keep their result when billing refuses the charge, a gift form and plan changes that say what they do, photos made ready in the browser, member tickets that credit referrals, an install prompt and new UI tokens, and fixes to upgrade, doctor, deploy and replaced pages."
kind: landing
related:
  - /docs/start/feature-map
  - /docs/start/roadmap
  - /docs/ship/releases/upgrade
navigation:
  title: Overview
  icon: i-lucide-newspaper
---

`0.4.0` settles what moving comics.my, the first app on `0.3`, turned up. The [Feature map](/docs/start/feature-map) lists every feature with its status, and the [Changelog](/docs/ship/releases/changelog) every change. What the release brings, capability by capability:

- **[AI jobs](/docs/build/ai/jobs).** A job charged by what it made keeps its result when billing refuses the charge. A refusal that may pass leaves the charge owed and retried in the background under the hold's id. One that won't gives the charge up at once, logged for the operator. `defineJobQueue({ onOwedCharge })` hears how it ends, and the admin Queue tab offers "Retry the charge". A job whose first step finds billing not synced yet waits for it. `job.charge(n, { metadata })` is checked against the provider's limits. A step knows its job's owner, and an image call that drew nothing is tried once more.
- **[Billing](/docs/start/feature-map#billing).** `<GiftForm>` sells gifts from the packaged `/gifts` page, and `<GiftList>` lists them. Plan switches say when they apply and how they settle before they happen, a plan can pause for 1 to 3 months, and `useWithdrawal()` reads the withdrawal window. The pricing page reads `?plan=` and `?interval=` from the address, and money follows each currency's smallest unit.
- **[Uploads](/docs/build/data/files/checked-uploads).** `storage.acceptUpload` runs the check, the content check and the keep in one call. `preparePhoto` makes a photo ready in the browser before it uploads: HEIC decoded, turned upright, scaled, re-encoded and stripped of its metadata.
- **[Growth](/docs/build/growth/launch).** Member tickets claim each friend they admit as their member's referral, on the server. `/invite` takes a typed code, `/waitlist` follows the launch phase, and neither keeps a token in the address bar.
- **[UI](/docs/start/feature-map#ui).** Tracking, outline and press [tokens](/docs/build/ui/customize/tokens), which change nothing until you set them. `useInstallPrompt()` for an [install button](/docs/build/email/notifications/installable) of your own, `useReportAppeal()` for a report page of your own, and refusals worded by the service that is down.
- **[The tools](/docs/start/feature-map#developer-tools).** `upgrade --dry-run` reads the app's own config. `doctor --fix` asks before it syncs email, and `deploy` runs the package's migrations. `doctor` reports `.env.example` drift, and on Vercel a preview gets its own site URL and stays out of search.
- **Under the hood.** An app page replaces a packaged one only when it has the same shape. A production build reloads a page once when its code fails to load before the app starts. `nuxt dev` serves modules `no-cache`, from `/_dev/` unless the app sets `app.buildAssetsDir`, so Safari loads one Vue across restarts.

Development runs on the providers' own test modes, with nothing simulated: Polar's sandbox, Resend's test addresses and the Convex AI Gateway ([Develop on real sandboxes](/docs/develop/sandboxes)). A feature the Feature map marks **Planned** arrives in the next minor release, and its page already describes it as it will ship.

## Upgrading from 0.3

Run `npx nuxt-backend upgrade` as for every release. A few behaviours change around it. `doctor --fix` syncs email in CI only with `--yes`. Dev modules move from `/_nuxt/` to `/_dev/`. Prices in zero-decimal currencies stop being divided by 100. A job whose billing is not synced yet waits for it, and fails `not_ready`, not `insufficient_credits`, only if it never syncs. The [Upgrade page](/docs/ship/releases/upgrade) lists each change with the edit it asks for.

## What waits for a later release

`0.4.0` still serves client apps. The features a service platform needs (API keys, outgoing webhooks, an MCP endpoint for your users' agents, and deeper workspaces with custom roles) arrive together in a later release. The [Roadmap](/docs/start/roadmap) says why each one waits.

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
