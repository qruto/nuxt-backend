---
title: Build a creative app
description: "Build Panels, a comic-strip maker, from the starter to production in six parts: sign-in, credits, uploads, generation, notifications and sharing, then a deploy."
kind: landing
capability: tools
navigation:
  title: Tutorial
  icon: i-lucide-graduation-cap
---

You build Panels, a comic-strip maker. People sign in, buy credits, upload a photo, and turn an idea into a three-panel strip drawn by a model. They get an email when the strip is ready, and share it by a link anyone can open. Then you test the paid path and deploy it.

Panels is one app with three uses. The tutorial builds it, the public demo runs it in sandbox mode, and the template publishes it, so the code you write here is the code the demo runs. It uses only the package's public APIs.

## What you build

| Screen | What it does | Package APIs |
|---|---|---|
| `/login` | Sign in with a sign-in code or a passkey | `<AuthForm>`, `useLoginFlow` |
| `/strips` | The workspace's strips, and a field for a new idea | `createFunctions` → `workspace`, `definePageMeta({ auth: true })`, `<AppShell>` |
| `/pricing` | Credit packs and a plan with a head start | `defineBillingCatalog`, `<PricingTable>`, `useCredits` |
| `/strips/[id]` | The photo, the strip as it draws, its place in line, and the share link | `setupStorage`, `<UploadField>`, `defineJobQueue`, `useJob`, `<Gate>`, `<AiLabel>`, `useShareLink` |
| `/s/[token]` | A finished strip, for anyone with the link | `storage.shareable`, `storage.resolveShareLink` |
| The bell, `/notifications` and email | "Your strip is ready", in the app, as a push and by email | `setupEmail`, `setupNotifications`, `<AppShell>`, `useEmailPreferences` |

The backend is a few files of your own in `backend/`, next to the ones the install wrote: `schema.ts`, `routes.ts`, `strips.ts`, `demo.ts`, `storage.ts` and `jobs.ts`, and a few lines in `ai.ts`, `email.ts`, `notifications.ts`, `admin.ts`, `account.ts` and `auth.ts`.

## Accounts and time

Each part names the accounts it needs. The first part needs none, and every account has a free tier or a sandbox that covers the tutorial.

| Part | You add | Accounts | Time |
|---|---|---|---|
| [1. Sign in](/docs/start/tutorial/sign-in) | The app, sign-in and strips per workspace | None | 15 min |
| [2. Sell credits](/docs/start/tutorial/credits) | A credit catalog, the pricing page and a test purchase | A [Polar](/docs/services/polar) sandbox | 15 min |
| [3. Accept photos](/docs/start/tutorial/uploads) | Checked uploads, moderation and reports | An [AI gateway](/docs/services/ai-gateway) | 20 min |
| [4. Generate strips](/docs/start/tutorial/generate) | The generation queue and its page | The same AI gateway | 25 min |
| [5. Notify and share](/docs/start/tutorial/notify-and-share) | The ready email, the in-app inbox and share links | A [Resend](/docs/services/resend) account | 20 min |
| [6. Test and deploy](/docs/start/tutorial/deploy) | Tests of the paid path, and production | A [Convex](/docs/services/convex) account and [Vercel](/docs/services/vercel) | 30 min |

You need Node 24.11 or later and some Nuxt. The [Quickstart](/docs/start/quickstart) is a shorter first run, if you want one before this.

## Skip to the end

The finished app is a template. Create it to read the result, or to run the demo on your own accounts:

```bash
npm create nuxt@latest my-panels -- -t gh:qruto/nuxt-backend/templates/panels
```

The command names the template by its folder on GitHub until `create nuxt` lists it by name. [Templates](/docs/start/templates) says what it needs to run.

## The parts

::card-group
  :::card{icon="i-lucide-log-in" title="Part 1: sign in" to="/docs/start/tutorial/sign-in"}
  Create Panels from the starter, run it on a local deployment, sign in with the code in the terminal, and model strips per workspace.
  :::

  :::card{icon="i-lucide-coins" title="Part 2: sell credits" to="/docs/start/tutorial/credits"}
  Declare credit packs in the billing catalog, sync them to the billing sandbox, show the pricing page, and buy credits with the test card.
  :::

  :::card{icon="i-lucide-upload" title="Part 3: accept photos" to="/docs/start/tutorial/uploads"}
  Accept photo uploads with size, type and quota checks, strip their metadata, show them, and keep unsafe uploads out with moderation and reports.
  :::

  :::card{icon="i-lucide-wand-sparkles" title="Part 4: generate strips" to="/docs/start/tutorial/generate"}
  Define the generation queue, hold credits while a strip draws and charge or refund them, run it from a page, and label the result as AI-generated.
  :::

  :::card{icon="i-lucide-share-2" title="Part 5: notify and share" to="/docs/start/tutorial/notify-and-share"}
  Email people when their strip is ready, show the in-app inbox, and share a finished strip by a link anyone can open.
  :::

  :::card{icon="i-lucide-rocket" title="Part 6: test and deploy" to="/docs/start/tutorial/deploy"}
  Test the paid path with backend tests, a page test and one browser run, then deploy Panels and check production with doctor.
  :::
::
