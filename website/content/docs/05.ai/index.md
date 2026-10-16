---
title: "AI features"
description: "Meter the AI features you sell: each call reserves prepaid credits, runs your model, then settles, and a failed run costs nothing."
kind: landing
status: experimental
navigation:
  title: Overview
  icon: i-lucide-compass
---

`nuxt-backend/ai` meters the model calls your app makes. It wraps a Convex action, or a token stream, so each call is rate-limited per billing entity (the active workspace, or the user) and paid for with prepaid credits from your billing catalog. Credits are reserved before your handler runs and settled when it returns; by default, a run that fails releases them and costs nothing. The spend is recorded as a usage event with the billing provider, so per-customer usage shows in the provider's own dashboard with no extra tables.

::note
`nuxt-backend/ai` is in the experimental tier: the reserve → settle metering model may change shape in a minor release.
::

## How it fits together

1. **Declare a credit meter.** The meter, and the plans and packs that grant credits on it, live in `backend/billing.catalog.ts`; `npx nuxt-backend billing sync` creates them with the provider. See [Catalog as code](/docs/billing/catalog).
2. **Wrap the action.** `setupAi(components, { billing, rateLimiter })` in the scaffolded `backend/ai.ts` hands back `ai.meteredAction`, a drop-in for `action` that names the meter and the cost of a call. See [Metered actions](/docs/ai/metered-actions).
3. **Reserve, run, settle.** Each call checks sign-in, the rate limit and any budget, reserves the cost against the cached balance, runs your handler, then settles the spend. A handler that throws releases the reservation and rethrows, except under `charge: 'start'`, which spends before the handler runs and refunds nothing. See [What happens on each call](/docs/ai/metered-actions#what-happens-on-each-call).
4. **Price by tokens.** When the cost is only known after the model returns, reserve an estimate and settle what `priceTokens` computes from the reported token usage, against a price table your app owns. See [Token pricing](/docs/ai/metered-actions#token-pricing).
5. **Stream the response.** `ai.stream` puts the same reservation around a token stream that also persists server-side, and `useAiStream` drives it from Vue; reload mid-stream and the text continues. Credits settle when the stream finishes, and an error or a disconnect releases them. See [Streaming](/docs/ai/streaming).
6. **Show and top up the balance.** `useCredits` reads the live balance and opens a top-up checkout. See [Credits & top-ups](/docs/billing/credits).

### Limits and budgets

Both limits run through the rate limiter the scaffold already sets up. The `ai` limit caps calls per billing entity, 30 a minute by default. The optional `budget` on `setupAi` caps credits per window, such as 500 credits a day per workspace. A budget is a cap recorded as a rate-limit window, not a ledger, so there is no separate budget store to keep in sync. See [Rate limiting](/docs/ship/production/rate-limits).

## In this section

::card-group
  :::card{icon="i-lucide-sparkles" title="Metered Actions" to="/docs/ai/metered-actions"}
  Wrap an action so it is rate-limited and credit-metered, set a flat or token-priced cost, and call it from Vue.
  :::

  :::card{icon="i-lucide-audio-lines" title="Streaming" to="/docs/ai/streaming"}
  Stream a metered response that persists server-side, drive it with `useAiStream`, and resume it after a reload.
  :::
::

::playground-link{to="/playground/platform/ai" label="metered AI"}
::

## Not covered here

- **A model.** You call your own model inside the handler; the package meters the call around it.
- **Model prices.** No provider knows what a model costs you, so the price table `priceTokens` reads is yours to keep.
- **Agents that use your app.** They connect through the [MCP endpoint](/docs/agents/mcp) as a signed-in user, and any credits their tools spend land on the same billing entity as the web app's.
