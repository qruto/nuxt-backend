---
title: What's new in 0.2
description: "0.2.0 is the first release of nuxt-backend: a complete backend for client apps, capability by capability, with what is experimental, what waits for the next release, and how to verify the release before you install it."
kind: landing
related:
  - /docs/start/feature-map
  - /docs/start/roadmap
  - /docs/ship/releases/upgrade
navigation:
  title: Overview
  icon: i-lucide-newspaper
---

`0.2.0` is the first real release: `0.1.0` on npm was a throwaway test publish, so everything in it is new. It is a complete backend for client apps: products people sign in to, pay for and create things in. The [Feature map](/docs/start/feature-map) lists every feature with its status. What the release brings, capability by capability:

- **[Auth](/docs/start/feature-map#auth).** Sign-in by sign-in code and passkey, launch phases with invite codes, access links and a waitlist, workspaces with invitations, step-up for sensitive actions, consents, and each account's export and deletion with a grace period. The admin console has impersonation, the activity trail, content reports and tabs of your own.
- **[Data](/docs/start/feature-map#data) and [jobs](/docs/start/feature-map#jobs).** Live queries, server rendering, search, checked uploads with share links, retention rules, workflows, scheduled jobs and the backend's own hourly maintenance.
- **[Billing](/docs/start/feature-map#billing).** Plans with monthly and yearly prices in the visitor's currency, a free plan, credits, quotas, feature gates enforced on the server, promotions, gifts, plan passes, referrals and a server-rendered pricing page, all from a catalog in code.
- **[Email](/docs/start/feature-map#email) and [notifications](/docs/start/feature-map#notifications).** One template registry, themed and localized, with delivery tracking, suppressions, preferences with one-click unsubscribe, sequences, announcements, contact forms and inbound mail. Notifications reach an in-app inbox and web push, on the channels each person allows.
- **[AI](/docs/start/feature-map#ai).** Metered model calls and streams through the Convex AI Gateway, paid with credits at their real cost. Generation jobs queue with priority tiers and hold credits until they run. Chat threads and knowledge search build on the same metering.
- **[Protection](/docs/start/feature-map#protection), [monitoring](/docs/start/feature-map#monitoring) and [flags](/docs/start/feature-map#flags).** Bot checks, rate limits and content moderation, error reports, cron check-ins and a health endpoint, feature flags and kill switches.
- **[Analytics](/docs/start/feature-map#analytics).** Revenue metrics and a growth funnel from waitlist to paid, in the admin console.
- **[Hosting](/docs/start/feature-map#hosting).** One build command on any host, Vercel first, one-command production, a deploy template, and `doctor --prod` as the launch gate. This tab's guides cover the rest: webhook replay, secret rotation and the provider settings `doctor --fix` applies.
- **[UI](/docs/start/feature-map#ui).** Ready-made pages for every capability, restyled with tokens, labels and slots, swapped part by part, or rebuilt on headless composables, with an app shell for your own pages.
- **[The tools](/docs/start/feature-map#developer-tools).** A CLI for setup, the env, the catalog and upgrades, a DevTools tab with every capability's state, and an AI developer kit: agent skills, agent files, a docs MCP and a developer MCP server for your coding agent.

Development runs on the providers' own test modes, with nothing simulated: Polar's sandbox, Resend's test addresses and the Convex AI Gateway ([Develop on real sandboxes](/docs/develop/sandboxes)). Each service has a page of its own, from sign-up to a passing `doctor` ([Service map](/docs/services)).

A feature the Feature map marks **Planned** lands before `0.2.0` is published, and its page already describes it as it will ship. A page marked **Changing** describes the `0.2.0` API of a feature the code still has in an earlier shape.

## What waits for the next release

`0.2.0` serves client apps. The features a service platform needs (API keys, outgoing webhooks, an MCP endpoint for your users' agents, and deeper workspaces with custom roles) arrive together in the next release. The [Roadmap](/docs/start/roadmap) says why each one waits.

## Experimental

A few parts may still change shape in a minor release of the `0.x` line, without the deprecation cycle: metered AI (`nuxt-backend/ai`), the monitoring helpers for your own actions, the test helpers and the backend mock, plan quotas and the dev inbox. Their pages carry the Experimental chip, and [the experimental tier](/docs/ship/releases/stability#the-experimental-tier) lists each name.

## Coming from a preview

`npx nuxt-backend upgrade` repairs the scaffold and runs the package's data migrations. An app built on a preview of `main` gets the edits it needs from it too ([Upgrade to a new version](/docs/ship/releases/upgrade)).

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
