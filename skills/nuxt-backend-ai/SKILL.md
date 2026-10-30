---
name: nuxt-backend-ai
description: AI features in a Nuxt app on nuxt-backend. Metered AI actions and token streams that reserve prepaid credits, run a model by its provider/model id through the AI Gateway and settle at the cost it reports (setupAi, meteredAction, stream, ctx.model, priceTokens, useAiStream), spend budgets and low-balance hooks. Use when adding a paid AI feature, streaming a model response, pricing tokens, or capping AI spend. Read the nuxt-backend core skill first.
---

# nuxt-backend: AI

The AI features the app sells, metered in prepaid credits. The `nuxt-backend` core skill holds the
rules every change follows.
`nuxt-backend/ai` is in the experimental tier.

## Metered actions

- `setupAi(components, { billing, rateLimiter })` in the scaffolded `backend/ai.ts` hands back
  `ai.meteredAction`, a drop-in for `action` that names the credit meter and the cost of a call.
  `ctx.usage` says who is charged.
- Each call checks sign-in, the rate limit (`ai`, per billing entity) and any budget, reserves the
  cost against the balance, runs the handler, then settles. A handler that throws releases the
  reservation, except under `charge: 'start'`, which spends first and refunds nothing.
- Refusals are codes: `unauthenticated`, `no_workspace`, `rate_limited`, `insufficient_credits`.
  Read them on the client with `getBackendError(error)`.
- When the cost is known only after the model returns, reserve an estimate with
  `cost: { estimate, finalize }` and settle what `priceTokens` computes from the token usage,
  against a price table the app owns.
- The meter, and the plans and packs that grant credits, live in `backend/billing.catalog.ts`
  (the `nuxt-backend-billing` skill).

## Models

- Name a model as a `provider/model` id (`model: 'openai/gpt-5-mini'`) on `setupAi` or the
  action, and call it with the AI SDK: `generateText({ model: ctx.model(), prompt })`. Install
  `ai` first (an optional peer). A model object from any AI SDK provider works too.
- Ids go through the AI Gateway with `AI_GATEWAY_API_KEY` on the deployment (its own name; Convex
  actions never get Vercel's keyless sign-in). Put it in `.env.local` and run `env push`.
- `cost: { estimate, creditsPerUsd }` settles at the cost each call reports; `prices` covers a
  call that reports none, else the run settles at the reservation (`ai.cost_unreported`).
- Without the key, and where the Convex AI Gateway does not answer, a call is refused with
  `unavailable` (`not_configured`), in development as in production. `ai.modelStatus()` says
  which route answers. Under Vitest, `defineBackendTestApp` answers every id with the AI SDK's
  mock, which repeats the prompt at a fixed cost.
- `streamText` never throws on a failed call; a run whose every model call failed is refused
  `unavailable` (`provider_refused`) and released anyway. Read a stream to its end: one left
  unread never reports its cost, so a reported cost settles at the reservation.

## Streaming

`ai.stream({ name, meter, cost, args, handler })` puts the same reservation around a token
stream that also persists on the server: the handler calls `append(chunk)`. It returns `start`
and `body` to re-export, and `useAiStream({ start, body })` drives it from Vue; reload mid-stream
and the text continues. Credits settle when the stream finishes, and an error or a disconnect
releases them. The endpoint is `/ai/stream`, mounted by `registerBackendRoutes({ ai })`.

## Budgets and low balances

`setupAi`'s `budget` caps credits per window and entity (`{ units: 500, period: DAY }`), and
`credits.onCreditsLow` and `onCreditsExhausted` fire when the balance crosses down. Keep the hooks
thin: record or hand off.

## Tasks

<!-- generated:tasks -->
- [Choose a model](https://nuxt-backend.dev/docs/build/ai/models): Call any provider's model by its provider/model id through the Convex AI Gateway, or a Vercel AI Gateway key where Convex's is unavailable, pin inference to the EU, cap what the gateway may spend, set budgets per workspace, and charge each call at the cost it reports. Reach for `nuxt-backend/ai`.
- [Meter an AI action](https://nuxt-backend.dev/docs/build/ai/metered-actions): Wrap a Convex action with ai.meteredAction so every call is rate-limited and paid for in prepaid credits: reserve, run, then settle, and a failed run costs nothing. Reach for `nuxt-backend/ai`.
- [Stream a response](https://nuxt-backend.dev/docs/build/ai/streaming): Stream a metered answer to the page while it persists on the server: ai.stream on the backend, the /ai/stream endpoint, and useAiStream in Vue. Reload mid-stream and the text continues. Reach for `useAiStream()`.
- [Give plans priority in the queue](https://nuxt-backend.dev/docs/build/ai/jobs/priority): Decide what each plan gets in the job queue: tiers named for plan features set a head start in minutes, how many jobs an owner runs at once, slots kept for paid plans and a daily credit budget, and a job that waits long enough still beats any newcomer for a shared slot.
- [Charge for a queued job](https://nuxt-backend.dev/docs/build/ai/jobs/credits): Price a job in credits: the queue holds them when the job joins the line, so the person learns at once if they can afford it, charges them when it starts, and refunds them when it fails or stalls.
- [Operate the queue](https://nuxt-backend.dev/docs/build/ai/jobs/operate): Run the job queue from the admin console's Queue tab: see what runs and waits, pause the queue, change how many jobs run at once, retune a tier or a model's limit, and cancel a job, each change on the activity trail.
- [Let a visitor try once](https://nuxt-backend.dev/docs/build/ai/jobs/guests): Let a signed-out visitor start one generation before they sign up: guest jobs run free under the app-wide limit, count per browser, and move to the new account's workspace at sign-up.
- [Run generation jobs](https://nuxt-backend.dev/docs/build/ai/jobs): Queue generations that take minutes and many model calls: defineJobQueue runs each job as durable steps, in a fair line where paid plans get a head start, more jobs at once, slots kept for them and a daily budget, holds its credits until it starts, lets a guest try once before sign-up, and useJob shows its place and progress.
- [Add knowledge search](https://nuxt-backend.dev/docs/build/ai/chat/knowledge-search): Search each workspace's own documents by meaning, and ground chat replies in them: ai.knowledge keeps one namespace per workspace and one for the app, embeds text and uploads through the gateway, and charges for it in credits. Reach for `nuxt-backend/ai`.
- [Add chat](https://nuxt-backend.dev/docs/build/ai/chat): Give each person chat threads with a model that knows your instructions, every reply streamed to the page, kept on the server and paid for in credits: ai.chat on the backend and useChat in a page, on Convex's Agent component. Reach for `nuxt-backend/ai`.
- [Keep content safe](https://nuxt-backend.dev/docs/build/ai/content-safety): Check prompts and uploads with a safety model through the gateway before you spend on them, let people report what slipped through, and review reports in the admin console's Reports tab.
- [Label AI-generated content](https://nuxt-backend.dev/docs/build/ai/provenance): Mark what a model made, in the file and in the page: C2PA content credentials and the IPTC digital source type in every generated image, a provenance record of which model made what from which inputs, and the visible AI-generated label the EU AI Act asks for.
<!-- /generated:tasks -->

## The API

[references/api.md](references/api.md) lists the composables, components, server utilities,
import paths, doctor findings and env of this area, each with its doc comment's first sentence.
