---
title: "AI features"
description: "Sell AI features paid for with prepaid credits: every model call reserves its credits, runs any provider's model through the Convex AI Gateway, then settles at what it cost, and a failed run costs nothing. Plus generation jobs, chat, content safety and provenance labels."
kind: landing
capability: ai
status: experimental
playground: /playground/strips
api: /docs/reference/api/ai
source: src/convex/integrations/ai.ts
navigation:
  title: Overview
  icon: i-lucide-compass
---

- **You get:** AI features your users pay for in credits, with any provider's model, streamed answers, long generations in a fair queue, chat, content checks and an AI-generated label.
- **Powered by:** the AI SDK for model calls, the [Convex AI Gateway](/docs/services/ai-gateway) for every provider's models with no key (or the Vercel AI Gateway with one), Convex's persistent text streaming, Workflow, rate limiter, Agent and RAG components, and Polar's credit meters.
- **The package adds:** reserve, run, settle around every call, so a failed run costs nothing; rate limits, budgets and a kill switch; the job queue with priority tiers and adaptive model limits; ownership and workspace checks; and provenance.

The `ai` capability lets your app sell AI features, paid for with prepaid credits from your billing catalog. Before a model call runs, its credits are reserved. After it runs, it settles at what the model cost, and a run that fails costs nothing. Any provider's model works by its `provider/model` id. Answers stream to the page, and long generations wait their turn in a fair job queue. Rate limits, a credit budget and a kill switch cap the spend.

::note
The `ai` capability is in the [experimental tier](/docs/ship/releases/stability): its metering model, reserve, run, then settle against the billing provider's meters, may change shape in a minor release.
::

## What it gives your app

| Feature | What you write | Page |
|---|---|---|
| Metered actions | A Convex action wrapped by `ai.meteredAction`, with a meter and a cost | [Meter an AI action](/docs/build/ai/metered-actions) |
| Streamed answers | `ai.stream` on the server, `useAiStream` in a page; the text persists and resumes | [Stream a response](/docs/build/ai/streaming) |
| Any provider's model | A `provider/model` id, called through `ctx.model()` with the AI SDK | [Choose a model](/docs/build/ai/models) |
| Limits, budgets and alerts | The `ai` rate limit, a credit `budget`, low-balance hooks, the `pause_ai` kill switch | [Budgets and costs](/docs/build/ai/models#budgets-and-costs) |
| Generation jobs (planned) | A job queue and jobs of durable steps; a composable that shows a job's place in line and its progress | [Run generation jobs](/docs/build/ai/jobs) |
| Chat (planned) | A chat with your instructions, and a composable that drives the thread | [Add chat](/docs/build/ai/chat) |
| Knowledge search (planned) | A namespace per workspace, and replies grounded in it | [Add knowledge search](/docs/build/ai/chat/knowledge-search) |
| Content safety (planned) | A check on prompts and uploads, prompt-injection guidance, and a report queue for administrators | [Keep content safe](/docs/build/ai/content-safety) |
| Provenance (planned) | Content credentials in generated images, and the visible AI-generated label | [Label AI-generated content](/docs/build/ai/provenance) |

The planned rows arrive in `0.2.0`, experimental like the rest of this capability. The [Feature map](/docs/start/feature-map#ai) lists every AI feature with its status. New to it? Start with the [credit-metered feature recipe](/docs/build/ai/metered-actions#a-complete-feature): one meter, one pack, one streamed answer and the page that runs it.

## How a metered call works

Every metered call takes the same path, whether it is an action, a stream, a chat reply or a job:

1. **Check the caller.** The caller must be signed in, a member of the workspace that pays, and acting as themselves: an administrator impersonating them is refused.
2. **Check the switches and limits.** The `pause_ai` kill switch, the model being reachable, the `ai` rate limit and the credit budget are checked, in that order, before anything is spent.
3. **Reserve.** The call's cost, or an estimate of it, is taken from the cached balance at once, so two calls at the same moment can never spend the same credits. Too few credits refuses the call with `insufficient_credits`.
4. **Run.** Your handler runs, and calls its model through `ctx.model()`.
5. **Settle or release.** A run that succeeds settles at its real cost: a fixed price, its token usage priced from your table, or the cost the gateway reports. The rest of the estimate goes back to the balance. A run that throws releases the whole reservation.

The spend lands with the billing provider as a usage event on the credit meter, with the member who made the call. The balance in the page updates live. [Meter an AI action](/docs/build/ai/metered-actions#what-happens-on-each-call) walks through each step, and [Spend credits in your functions](/docs/build/billing/credits/spending#reserve-run-settle) explains the reservation underneath. A job holds its credits for as long as it waits instead, and charges them when it starts ([Charge for a queued job](/docs/build/ai/jobs/credits)).

### Who pays

The billing entity pays: the active workspace by default, so its members share one balance, or the person, when `setupBilling` is set to `billTo: 'user'`. The spend is always the member's own, checked fresh on every call, so someone removed from the workspace is refused on their next call.

### Why no budget service

A budget is a cap per workspace and window, such as 500 credits a day. It is recorded as a rate-limit window, so there is no separate budget store to keep in step with the credits: the credits are the ledger, and the provider keeps it. See [Budgets and costs](/docs/build/ai/models#budgets-and-costs).

## What powers it

- **The AI SDK** (`ai`, an optional peer) runs the model calls and streams. An app that never names a model never installs it.
- **The [Convex AI Gateway](https://docs.convex.dev/ai-gateway/overview)** answers every provider's models on a paid Convex plan, with no key: Convex bills your team and reports each call's cost. Its AI SDK provider, `@convex-dev/ai-sdk-provider`, is an optional peer too.
- **The Vercel AI Gateway** answers where the Convex one does not, such as a free plan or a self-hosted backend, with one key, `AI_GATEWAY_API_KEY`. It is also the route for pinning inference to the EU ([Choose a model](/docs/build/ai/models)).
- **Convex persistent text streaming** keeps a streamed answer on the server, so a reload or a second device reads it.
- **The billing capability**, powered by Polar, holds the credit meters, the plans and packs that grant credits, and the usage events.
- **Planned:** Convex's Workflow and rate limiter components under the job queue, its Agent component for chat, its RAG component for knowledge search, a safety classifier through the gateway for content safety, and C2PA content credentials for provenance.

[Capabilities](/docs/start/concepts/capabilities) shows how the `ai` capability sits beside the others, and how `npx nuxt-backend status` reads its state. The [AI gateway](/docs/services/ai-gateway) service page has the plans, keys and spending caps.

## In development

Development runs against real models from the first call, through the same route as production:

- **On a paid Convex plan**, your dev deployment reaches the Convex AI Gateway with no key. A local deployment does once it is linked to a project with `npx convex login`.
- **Otherwise**, add `AI_GATEWAY_API_KEY` to `.env.local` and run `npx nuxt-backend env push`.
- **Credits** come from your billing sandbox: buy a pack with the test card, then spend it at the model's real cost ([Develop on real sandboxes](/docs/develop/sandboxes#ai-through-the-convex-ai-gateway)).
- **Tests** under Vitest answer every model id from a mock, so a test of a metered action needs no key and makes no network call.

Earlier previews answered from a stand-in model on a local deployment without a key. `0.2.0` removes it ([Choose a model](/docs/build/ai/models#develop-and-test)).

The [demo](/docs/start/playground) draws strips with a generation job: a [strip](/playground/strips) costs 30 credits, and a run that fails refunds them. On the demo, AI stops for the rest of a UTC day once that day's model calls reach `spendLimit`.

## In production

1. **Sync the catalog to production.** The credit meter, and the plans and packs that grant its credits: `npx nuxt-backend billing sync --env production`. See [Define and sync your catalog](/docs/build/billing/catalog).
2. **Pick the model route.** On a paid Convex plan, install `@convex-dev/ai-sdk-provider` and the Convex AI Gateway answers, with no key. Otherwise add `AI_GATEWAY_API_KEY` to `.env.local` and run `npx nuxt-backend env push --prod`. See [Where a model id goes](/docs/build/ai/models#where-a-model-id-goes).
3. **Cap the gateway's spend.** Set a spending limit for your Convex team, and a warning on the deployment's AI Gateway usage, or a budget on the Vercel AI Gateway. Either way a mistake in your prices can never cost more than you chose. See [Cap what the gateway spends](/docs/build/ai/models#cap-what-the-gateway-spends).
4. **Run `npx nuxt-backend doctor --prod`.** It reports the route `deployment-ai-gateway-api-key` finds for your models, fails when none is ready, and probes the stream route (`ai-stream-route`). See [Production checklist](/docs/ship/checklist).
5. **Label what a model made.** Under the EU AI Act, generated images and text people may take for real need a label from 2026-08-02. See [Disclose AI-generated content](/docs/ship/compliance/ai-transparency); that page is not legal advice.

To stop every metered call at once, with no deploy, turn on the `pause_ai` kill switch in the admin console: see [Pause AI](/docs/build/ai/models#pause-ai).

## What you get

What the package ships for this part of the app, generated from the code: each name links to its
reference entry.

::what-you-get{area="ai"}
::

## In this section

::card-group
  :::card{icon="i-lucide-boxes" title="Choose a model" to="/docs/build/ai/models"}
  Call any provider's model by its `provider/model` id, pin inference to the EU, cap what the gateway spends, set budgets, and charge the cost each call reports.
  :::

  :::card{icon="i-lucide-sparkles" title="Meter an AI action" to="/docs/build/ai/metered-actions"}
  Wrap an action so it is rate-limited and paid for in credits, set a flat or token-priced cost, and ship a complete feature.
  :::

  :::card{icon="i-lucide-audio-lines" title="Stream a response" to="/docs/build/ai/streaming"}
  Stream a metered answer that persists on the server, drive it with `useAiStream`, and resume it after a reload.
  :::

  :::card{icon="i-lucide-list-ordered" title="Run generation jobs" to="/docs/build/ai/jobs"}
  Planned: long generations in a fair queue, a head start for paid plans, model limits that adapt, credits held until a job starts, one guest try, and dead letters.
  :::

  :::card{icon="i-lucide-messages-square" title="Add chat" to="/docs/build/ai/chat"}
  Planned: threads each person keeps, every reply streamed, persisted and paid for in credits, and answers grounded in each workspace's documents.
  :::

  :::card{icon="i-lucide-shield-alert" title="Keep content safe" to="/docs/build/ai/content-safety"}
  Planned: check prompts and uploads with a safety model, guard against prompt injection, let people report content, and review reports.
  :::

  :::card{icon="i-lucide-badge-check" title="Label AI-generated content" to="/docs/build/ai/provenance"}
  Planned: C2PA content credentials and the IPTC source type in generated images, a provenance record on every result, and a visible label.
  :::
::

## Not covered here

- **The model's work.** The package routes and meters the call. The prompt and what you do with the answer are yours, written with the AI SDK.
- **Your price.** The gateway reports what a call cost you. What you charge for it, `creditsPerUsd` or a token price table, is yours to set.
- **Agents that use your app.** An MCP endpoint your users' agents sign in to waits for the next release: see the [Roadmap](/docs/start/roadmap#service-app-features). Agents that build your app are on [Build with a coding agent](/docs/develop/agents).
- **The docs site's Ask AI.** That is the docs site's own assistant for these docs, a separate thing from the `ai` capability: it shares no key, model or credits with your app.
