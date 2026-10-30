---
title: Build your app
description: "The seven groups you build a client app from, auth and accounts, billing, email and notifications, AI, data and files, growth, and the UI, and the capabilities each one covers."
kind: landing
capability: tools
navigation:
  title: Overview
  icon: i-lucide-compass
---

This tab is where you build the product people sign in to, pay for and create things in. Each group below is one part of the app, and each page in it does one job: the code, the page that shows it, what refuses, the limits and the test. The examples build Panels, a comic-strip maker, the same app the [tutorial](/docs/start/tutorial) builds end to end.

Every group says what the provider does natively and what the package adds on top. When a group needs a provider account, its pages link to the provider's page under [Services](/docs/services).

## The groups and their capabilities

| Group | Capabilities | Powered by |
|---|---|---|
| [Auth, accounts and workspaces](/docs/build/auth) | `auth`, `protection` | Better Auth inside your [Convex](/docs/services/convex) deployment |
| [Billing and credits](/docs/build/billing) | `billing` | [Polar](/docs/services/polar), as merchant of record |
| [Email and notifications](/docs/build/email) | `email`, `notifications` | [Resend](/docs/services/resend), and the browser's push service |
| [AI features](/docs/build/ai) | `ai`, `jobs`, `protection` | The [AI gateway](/docs/services/ai-gateway) |
| [Data, files and jobs](/docs/build/data) | `data`, `jobs` | [Convex](/docs/services/convex): database, file storage, scheduler, components |
| [Grow your app](/docs/build/growth) | `auth`, `billing`, `email`, `analytics`, `flags` | The providers above |
| [Pages and components](/docs/build/ui) | spans them all | Nuxt and Vue |

[Capabilities](/docs/start/concepts/capabilities) explains each of the twelve, and the [Feature map](/docs/start/feature-map) shows which pages are built, changing or planned for this release.

## Where to start

1. **Sign people in.** [Auth setup](/docs/build/auth/setup) and [Sign users in](/docs/build/auth/sign-in) work with no options.
2. **Model your data.** [Your data](/docs/build/data/your-data), then [Scope tables to a workspace](/docs/build/data/read-write/workspace-scoped).
3. **Charge for it.** [Set up billing](/docs/build/billing/setup), then plans or [credits](/docs/build/billing/credits).
4. **Make it yours.** The packaged pages work as installed; [restyle them](/docs/build/ui/customize) when they need your look.

## The groups

::card-group
  :::card{icon="i-lucide-key-round" title="Auth, accounts and workspaces" to="/docs/build/auth"}
  Sign-in with sign-in codes and passkeys, protected pages and functions, roles, accounts with export, deletion and consents, workspaces with members and invitations, and an admin console.
  :::

  :::card{icon="i-lucide-credit-card" title="Billing and credits" to="/docs/build/billing"}
  Plans, a free plan, prepaid credits, feature gates and quotas, declared as code, sold through hosted checkout and enforced on the server.
  :::

  :::card{icon="i-lucide-mail" title="Email and notifications" to="/docs/build/email"}
  The emails sent for you, your own sends, branded and translated templates, delivery tracking, preferences, inbound mail, an in-app inbox and web push.
  :::

  :::card{icon="i-lucide-sparkles" title="AI features" to="/docs/build/ai"}
  AI features paid for with credits: each call reserves its credits, runs any model through the AI gateway, and settles at what it cost. Queued jobs, chat and content safety.
  :::

  :::card{icon="i-lucide-database" title="Data, files and jobs" to="/docs/build/data"}
  Your own tables beside the backend component: live queries, server rendering, typed refusals, search, counts, checked uploads, share links, retention and background work.
  :::

  :::card{icon="i-lucide-trending-up" title="Grow your app" to="/docs/build/growth"}
  Launch phases and the waitlist, promotions, referrals and gifts, lifecycle email, the cancel flow, and the funnel and experiments, within the law.
  :::

  :::card{icon="i-lucide-layout-template" title="Pages and components" to="/docs/build/ui"}
  Packaged pages, the app shell, one gate and one notices region, styled defaults on tokens, headless composables, copy-in source and an accessibility contract.
  :::
::
