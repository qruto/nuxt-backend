---
title: Introduction
description: What nuxt-backend is, the backend of a client app on Nuxt in twelve capabilities, the services behind it, who it is for, what waits for the next release, and what your app has on day one.
kind: landing
navigation:
  icon: i-lucide-info
---

`nuxt-backend` is the backend of a client app: a product people sign in to, pay for and create things in. One [Nuxt](https://nuxt.com) module and one [Convex](https://convex.dev) component give your app sign-in, workspaces, plans and credits, email, notifications, metered AI and generation jobs, and the pages that use them. You write your product. The package brings the sign-in flows, the webhook handling, the credit accounting and the pages.

The package groups the services it builds on into twelve [capabilities](/docs/start/concepts/capabilities), each named for what it gives your app: `auth`, `billing`, `email` and so on. Your code calls `useCredits` and reads `BILLING_*` rather than Polar's API, and each capability starts working once its key is set.

Know the trade-offs before you start. Your data lives in Convex, and payments run through Polar as merchant of record, at 5% + 50¢ per sale. Sign-in is passkeys and sign-in codes only, the app runs on Nuxt 4, and there is no per-seat billing. Each capability is built on one provider's own features, so leaving a provider means rewriting that capability. [When it fits](#when-it-fits) has the full list.

## What it is made of

A Nuxt module for the app, and one all-in-one backend component for Convex, with these services behind them. Each service has a page that sets it up, from the account to production:

| Service | What it does in your app | Capabilities |
|---|---|---|
| [Convex](/docs/services/convex) | The database, functions, realtime sync, scheduling and file storage. The package's backend component runs here, beside your own tables. | data, jobs, flags |
| [Better Auth](https://www.better-auth.com) | Sessions, sign-in codes, passkeys and workspaces. It runs inside your deployment, so it needs no account. | auth |
| [Polar](/docs/services/polar) | Products, checkout, subscriptions, credit meters and invoices, as the merchant of record. | billing, analytics |
| [Resend](/docs/services/resend) | Sending, delivery events, contacts, topics, automations and inbound mail. | email, notifications |
| [Convex AI Gateway](/docs/services/ai-gateway) | Every provider's models with no key to manage, each call at its real cost. Without it, a Vercel AI Gateway key does the same. | ai |
| [Vercel](/docs/services/vercel) | Hosting first. Other hosts keep working. | hosting |
| [Vercel BotID or Cloudflare Turnstile](/docs/services/bot-protection) | An invisible bot check on Vercel, a challenge elsewhere, before a code is sent or an account is made. | protection |
| [Sentry](/docs/services/sentry) | Error reports, logs, traces, cron check-ins and uptime. | monitoring |

The [Service map](/docs/services) says which you need, the free tier of each, and the order to connect them in. In development each provider runs in its own test mode: Polar's sandbox for checkout, Resend's test addresses for mail, and sign-in codes in your terminal until email is connected ([Develop on real sandboxes](/docs/develop/sandboxes)). The [Feature map](/docs/start/feature-map) lists every feature with its status.

## Who it is for

A Nuxt developer, or a small team, building a client app. A tool that turns photos into comic strips, a writing app sold by credits, a game with a premium plan. You want sign-in, billing and email working before your first feature, on a realtime backend. You want pages you restyle rather than build, and a coding agent that knows the package as well as you do.

## When it fits

| Use it when | Pick something else when |
|---|---|
| You are building a client app on Nuxt 4, and want sign-in, plans and credits working on day one | You need passwords or social sign-in: sign-in here is passkeys and sign-in codes only |
| Your data can live in Convex, the realtime database underneath | Your data has to live in Postgres, MySQL or another database |
| You sell plans, prepaid credits or metered AI, billed by the provider's own meters | You bill per seat: it is not planned |
| You want the pages too (sign-in, pricing, settings), styled to start and yours to restyle | Your app is React or Next, or Nuxt 5 before the package supports it |

[Principles](/docs/start/concepts/principles) explains each "no", and [Choosing nuxt-backend](/docs/start/concepts/choosing) compares the package with the alternatives.

## What it is not

- **Not a platform for service providers, yet.** API keys, outgoing webhooks, an MCP endpoint for your users' agents, custom workspace roles and ownership transfer wait for the next release. The [Roadmap](/docs/start/roadmap) says why each one waits.
- **Not a hosted service.** It runs in your Convex deployment and your Nuxt app, on your provider accounts: the data and the customers are yours.
- **Not a Nuxt layer or a template you fork.** It is one module in `modules`, a dependency you upgrade: `npx nuxt-backend upgrade` repairs the scaffold and runs the package's data migrations.
- **Not a kit of optional parts.** Every capability ships in the package and starts working once its key or catalog exists. Until then it stays off, or runs on its development stand-in, such as sign-in codes printed in your terminal.
- **Not a switch between providers.** The names are neutral, but each capability is built on one service's own features ([Replacing a provider](/docs/start/concepts/choosing#replacing-a-provider)).
- **Not tied to a UI kit.** The pages come styled and depend on no UI library. Customizing them climbs one ladder: mount, tokens, labels, slots, swap a part, headless composables, eject ([Customization ladder](/docs/build/ui/customize)).

## Day one

After the install and the first `npx nuxt-backend dev`, with no account anywhere, your app already has:

- **Sign-in.** `/login` takes a passkey or a sign-in code. The code prints in your terminal until email is connected, and every new account gets a personal workspace: the unit that pays, holds members and owns data.
- **Accounts.** `/settings`, `/profile` and `/security`: the workspace and its members, the plan and credits, the profile, passkeys and signed-in devices.
- **For administrators.** `/admin`, for the people who run the app.
- **A view of it all.** The DevTools Backend tab and `npx nuxt-backend status` show each capability's state, and `npx nuxt-backend doctor` names what is missing.

A Polar sandbox token adds the rest of the first hour. `npx nuxt-backend billing sync` creates the plans and credit packs of `backend/billing.catalog.ts` in Polar's sandbox, `/pricing` sells them, and a scaffolded metered action spends the credits. [What you got](/docs/start/what-you-got) lists every file, page, route and composable of that first run.

## Three ways to start

::tabs

:::tabs-item{label="Agent" icon="i-lucide-bot"}
Paste this into Claude Code, Cursor, Codex or any agent that runs commands in your project. It installs the package's skill and follows its install guide, on a local deployment that needs no account:

```text
Install nuxt-backend, the all-in-one SaaS backend for Nuxt on Convex, in this project:
run `npx -y skills@1.7.0 add https://nuxt-backend.dev --skill nuxt-backend -y`,
then follow .agents/skills/nuxt-backend/references/install.md.
```

:agent-prompt-links
:::

:::tabs-item{label="CLI" icon="i-lucide-terminal"}
In a Nuxt app you already have, start with Nuxt's own module command:

```bash
npx nuxt module add nuxt-backend
```

The [Quickstart](/docs/start/quickstart) takes it from there: a signed-in app in about three minutes, with no account anywhere.
:::

:::tabs-item{label="Template" icon="i-lucide-layout-template"}
A new app, with the module installed and its backend files written:

```bash
npm create nuxt@latest my-app -- -t gh:qruto/nuxt-backend/templates/starter
cd my-app
npm run dev
```

The first run asks where to create the deployment. **Start without an account** makes a local one.

[Templates and examples](/docs/start/templates) lists the starter, Panels and the examples.
:::

::

## Learn by building panels

The [tutorial](/docs/start/tutorial) builds Panels, a comic-strip maker, in six parts: sign-in, credits, photo uploads, generation jobs, notifications and share links, then a deploy. Panels is also the public demo and a template, so the code you write there is the code the demo runs.

## In this tab

Read the Start tab top to bottom on a first visit, then keep the concepts at hand:

- **Begin.** [Quickstart](/docs/start/quickstart): a signed-in app, then credits bought and spent. [What you got](/docs/start/what-you-got): the inventory of that first run.
- **Install.** [Installation](/docs/start/installation): one command, an agent prompt, or by hand. [Templates and examples](/docs/start/templates): the starter, Panels and the examples.
- **Try.** [Try the demo](/docs/start/playground): Panels, the tutorial's app, live on this site in sandbox mode. [Try everything](/docs/start/playground/try-everything): the same on your machine, with personas and a checklist.
- **Build.** [Build a creative app](/docs/start/tutorial): the tutorial, from the starter to production.
- **Plan.** [Feature map](/docs/start/feature-map): every feature with its status. [Roadmap](/docs/start/roadmap): what waits for the next release.
- **Understand.** [How it works](/docs/start/concepts/how-it-works), [Capabilities](/docs/start/concepts/capabilities), [Principles](/docs/start/concepts/principles), [Environments](/docs/start/concepts/environments), [nuxt-backend and nuxt-convex-module](/docs/start/concepts/nuxt-convex-module) and [Choosing nuxt-backend](/docs/start/concepts/choosing).

## The docs, tab by tab

The tabs run from general to detailed: what it is, how to connect each service, how to develop and test, how to build each feature, how to ship.

::card-group
  :::card{icon="i-lucide-graduation-cap" title="Tutorial" to="/docs/start/tutorial"}
  Build Panels, a comic-strip maker, from the starter to production in six parts.
  :::

  :::card{icon="i-lucide-plug" title="Services" to="/docs/services"}
  One page per provider: the account, its test mode, the keys, the webhooks, production, costs and the data it holds.
  :::

  :::card{icon="i-lucide-code" title="Develop" to="/docs/develop"}
  The dev loop on real sandboxes, the dev inbox, DevTools and doctor, testing at every level, and building with a coding agent.
  :::

  :::card{icon="i-lucide-hammer" title="Build" to="/docs/build"}
  Every feature, grouped as auth and accounts, billing, email and notifications, AI, data and files, growth, and the UI.
  :::

  :::card{icon="i-lucide-ship" title="Ship" to="/docs/ship"}
  The deploy, the production checklist, security, compliance, operating in production, and releases.
  :::

  :::card{icon="i-lucide-book-open" title="Reference" to="/docs/reference"}
  Every option, env name, composable, component, route, error and CLI flag, generated from the code.
  :::
::

## Version and stability

These docs describe the `0.2.x` line. Patch releases never change the public surface. A minor release may change it, through a deprecation first, and each change is on the [Upgrade page](/docs/ship/releases/upgrade). [Stability](/docs/ship/releases/stability) lists what counts as the surface, and which parts are still experimental.

Two chips mark a page ahead of the code. **Planned** means the feature arrives in `0.2.0` and is not built yet. **Changing** means it is built, and the page already shows the API as `0.2.0` reshapes it. The [Feature map](/docs/start/feature-map#statuses) explains both and names the unit of work behind each.

## Try it first

The [demo](/playground) is Panels, the tutorial's app, running against this site's own deployment in sandbox mode: sign in with a generated sandbox address, with nothing to install. [Try the demo](/docs/start/playground) says what it lets you do and what it refuses, and [Try everything](/docs/start/playground/try-everything) runs the same on your machine.
