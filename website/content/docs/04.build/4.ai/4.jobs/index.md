---
title: Run generation jobs
description: "Queue generations that take minutes and many model calls: defineJobQueue runs each job as durable steps, in a fair line where paid plans get a head start, more jobs at once, slots kept for them and a daily budget, holds its credits until it starts, lets a guest try once before sign-up, and useJob shows its place and progress."
kind: how-to
status: experimental
capability: jobs
navigation:
  title: Overview
  icon: i-lucide-list-ordered
---

- **You get:** long generations that wait their turn in a fair line, survive deploys, slow down under a provider's rate limit instead of failing, and cost nothing when they fail; a live place in line and progress bar in the page; and one free try for a visitor before they sign up.
- **Powered by:** Convex's [Workflow](https://www.convex.dev/components/workflow) and [rate limiter](https://www.convex.dev/components/rate-limiter) components and its scheduler, the gateway for the models, and Polar's credit meters and Cost Insights.
- **The package adds:** the queue's policy: priority tiers from plan features, with jobs per owner, dedicated slots and a daily budget per tier, model limits that adapt to `429`s, credits held, charged and refunded, guest generation, dead letters, and each job's cost reported to Polar.

Some generations are too long for one call. In Panels, the comic-strip maker these docs build, a strip is four to six panels, each one an image model call that takes up to half a minute. A strip takes longer than a person waits on one request. A job queue runs it for you. Each job waits its turn in a fair line, and plans you choose get a head start, more jobs at once and slots kept for them. The queue keeps every model under its rate limit, so a busy hour slows jobs down instead of failing them. Credits are held while a job waits, charged when it starts and refunded if it fails. In the page, `useJob` shows the job's place in line and its progress, live.

## What powers it

The queue is built from Convex parts you could wire yourself, and the package adds the policy between them:

| Part | Built on | What the package adds |
|---|---|---|
| Durable steps | Convex's Workflow component: each step is saved, so a job survives restarts and deploys | `job.run`, which runs a step under its model's limit and retries it |
| The line | Convex's scheduler, and a table in the package's component | Tiers from plan features, running jobs per owner, dedicated slots, a daily budget per owner, a stall sweep |
| Model limits | Convex's rate limiter component | Limits that halve on a `429` and grow back on success |
| Credits | The billing capability, powered by Polar | A hold that lasts while the job waits, a charge at start, a refund on failure, the cost sent to Cost Insights |
| Models | The Convex AI Gateway, or the Vercel AI Gateway with `AI_GATEWAY_API_KEY` | The same route as every other model call ([Choose a model](/docs/build/ai/models)) |

## Set up the queue

`defineJobQueue` declares the queue once, in `backend/jobs.ts`:

```ts [backend/jobs.ts]
import { defineJobQueue } from 'nuxt-backend/ai'
import { MINUTE } from 'nuxt-backend/rate-limit'
import { components } from './_generated/api'
import { ai } from './ai'

export const jobs = defineJobQueue(components, {
  ai,
  concurrency: 3,
  tiers: {
    priority: { feature: 'priority_queue', headStart: 10 * MINUTE },
    standard: {},
  },
})

// The functions behind useJob() and the admin console's Queue tab.
export const { getJob, cancelJob, getQueue, listJobs, setQueue, retryJob, discardJob, runQueue, billJob } = jobs.api
```

The queue schedules `runQueue` (the pick, the stall sweep, progress and each job's end) and `billJob` (the charge, the refund and the cost report) by these names, so export them from `backend/jobs.ts` with the rest. Both are internal: no client can call them.

`defineJobQueue(components, options)` takes:

::field-group
  :::field{name="ai" type="Ai" required}
  Your `setupAi(...)` instance. Jobs share its billing, its model route, its `ai` rate limit, its provenance settings and the `pause_ai` kill switch.
  :::

  :::field{name="concurrency" type="number"}
  How many jobs run at once across the app. Default `3`. Change it later from the admin console without a deploy.
  :::

  :::field{name="perOwner" type="number"}
  How many jobs one owner may have running at once, for a tier that sets none. Default `1`. The owner is who pays: the active workspace, or the person under `billTo: 'user'`. Extra jobs wait, and are never refused.
  :::

  :::field{name="tiers" type="Record<string, { feature?: string, headStart?: number, perOwner?: number, dedicated?: number, budget?: { units: number, period: number } }>"}
  What each plan gets in the line, best first: a head start in milliseconds, its own `perOwner`, slots kept for it out of `concurrency`, and a credit budget per owner per period. A job takes the first tier whose feature the owner's plan has. See [Give plans priority in the queue](/docs/build/ai/jobs/priority).
  :::

  :::field{name="models" type="Record<string, { perMinute: number, min?: number, max?: number }>"}
  Where each model's limit starts, and the range it adapts within. See [Keep models under their limits](/docs/build/ai/jobs/model-limits).
  :::

  :::field{name="stallAfter" type="number"}
  How long a running job may go without a sign of life before the queue fails it and refunds its credits. Default 5 minutes.
  :::

  :::field{name="workflow" type="WorkflowComponent"}
  The Workflow component the jobs run on. Default `components.workflow`, which the scaffold mounts. Mount a second copy and pass it to keep jobs from sharing a pool with email sequences.
  :::
::

## Define a job

`jobs.define` declares a kind of job, and `jobs.step` an action it runs. Export both, as Convex registers them by name:

```ts [backend/strips.ts]
import { generateText } from 'ai'
import { v } from 'convex/values'
import { internal } from './_generated/api'
import { jobs } from './jobs'

export const render = jobs.define({
  meter: 'credits',
  cost: ({ panels }) => panels * 5,
  args: { stripId: v.id('strips'), idea: v.string(), panels: v.number() },
  handler: async (job, { stripId, idea, panels }) => {
    for (let panel = 1; panel <= panels; panel++) {
      await job.run(internal.strips.drawPanel, { stripId, idea, panel })
      await job.progress({ done: panel, total: panels, label: `Panel ${panel}` })
    }
  },
})

export const drawPanel = jobs.step({
  model: 'google/gemini-3.1-flash-image-preview',
  args: { stripId: v.id('strips'), idea: v.string(), panel: v.number() },
  handler: async (ctx, { stripId, idea, panel }) => {
    const { files } = await generateText({
      model: ctx.model(),
      prompt: `Panel ${panel} of a comic strip about ${idea}. Flat colors, bold ink outlines.`,
    })
    const image = files.find(file => file.mediaType.startsWith('image/'))
    const storageId = await ctx.storeImage(image!, { inputs: [stripId] })
    await ctx.runMutation(internal.strips.savePanel, { stripId, panel, storageId })
  },
})
```

- **`jobs.define({ meter, cost, args, handler })`** holds `cost` credits from `meter` while the job waits. `cost` is a number, or `(args) => number`. `meter: false` makes a job free. The `handler` runs as a durable workflow: the result of each `job.run` and `job.progress` is saved, so a restart or a deploy picks the job up after its last finished step. What the handler returns becomes the job's result. Keep it small, such as ids, and save the work itself in your own tables, as `savePanel`, an internal mutation of yours, does here.
- **`jobs.step({ model, args, handler })`** is an internal action whose `ctx.model()` returns the model it names, through the same route as every model call. Before your handler runs, the step takes a turn from that model's limit. Its calls are paid for by the job's price, so they settle nothing on their own. `ctx.job.id` names the job it runs for.
- **`ctx.storeImage(file, { inputs })`** stores a generated image with its content credentials as a file of the job's owner, which the storage quota counts and an erasure deletes, and records what made it. Read its URL with `storage.fileUrl` ([Label AI-generated content](/docs/build/ai/provenance#label-a-result)).
- **`job.run(step, args)`** runs a step and returns what it returned. When the step finds no free turn, or its model answers `429`, a timeout or a passing provider error, `job.run` waits and runs it again. See [Keep models under their limits](/docs/build/ai/jobs/model-limits).
- **`job.progress({ done, total, label? })`** reports how far the job got. `useJob` shows it, and it also tells the queue the job is alive.

The handler itself only orders the steps, so it must make the same calls in the same order on every replay: read data and call models inside steps, never in the handler. Changing a job's steps fails the jobs of that kind still running when you deploy. To change them safely, define the new version under a new export, such as `renderV2`, and let the old one drain.

## Start a job

`jobs.enqueue(ctx, job, args)` puts a job in line from a mutation of your own, beside the row the job writes into. Here `workspace` is the [function tier](/docs/build/auth/access/functions) the scaffold's `backend/functions.ts` exports:

```ts [backend/strips.ts]
import { workspace } from './functions'

export const create = workspace.mutation({
  args: { idea: v.string(), panels: v.number() },
  handler: async (ctx, { idea, panels }) => {
    const stripId = await ctx.db.insert('strips', { workspaceId: ctx.workspace.id, idea })
    const { jobId } = await jobs.enqueue(ctx, internal.strips.render, { stripId, idea, panels })
    await ctx.db.patch('strips', stripId, { jobId })
    return stripId
  },
})
```

Before the job joins the line, `enqueue` checks what a [metered action](/docs/build/ai/metered-actions#what-happens-on-each-call) checks, in this order:

1. **The caller** must be signed in, a member of the paying workspace, and acting as themselves.
2. **The `pause_ai` switch** must be off: otherwise `unavailable`, reason `ai_paused`.
3. **The model route** must exist: otherwise `unavailable`, reason `not_configured`.
4. **The `ai` rate limit** must have room: otherwise `rate_limited`, with `limit: 'ai'`.
5. **The tier's budget** must have room for the job's cost: otherwise `rate_limited`, with `limit: 'jobBudget'`, or `feature_required` or `invalid_input` when the job is bigger than the owner's whole budget ([Cap what an owner spends per day](/docs/build/ai/jobs/priority#cap-what-an-owner-spends-per-day)).
6. **The credits** must cover the hold: otherwise `insufficient_credits`, with `balance` and `need`.

A refusal throws a [catalog error](/docs/reference/backend/errors), and the whole mutation rolls back: no row, no job, no hold, nothing counted. Otherwise the job joins and `enqueue` returns `{ jobId }`. `setupAi`'s own `budget` does not apply to jobs. The owner's `perOwner`, the dedicated slots and a paused queue never refuse a job: it joins and waits.

### A job the app runs for itself

Content you make once for everyone, such as the examples a demo shows, is the app's, not the person's who pressed the button. `jobs.enqueue(ctx, job, args, { billTo: 'app' })` puts such a job in line: the app owns it, and the images its steps store with `ctx.storeImage` are the app's files. No account's quota counts them, and no account's export or erasure takes them. Read them with `storage.fileUrl` in a query that decided who may see them, since `getFileUrl` gives the app's files to nobody, and delete them with `storage.release`.

```ts [backend/demo.ts]
export const seed = admin.mutation({
  args: {},
  handler: async (ctx) => {
    const { jobId } = await jobs.enqueue(ctx, internal.demo.drawExample, { ideaId: 'surfing-cat' }, { billTo: 'app' })
    await ctx.db.insert('examples', { ideaId: 'surfing-cat', jobId, panels: [] })
  },
})
```

Such a job is a `meter: false` kind; `enqueue` refuses one that charges credits with a `TypeError`. It needs nobody signed in, so your mutation decides who may start it, as `admin.mutation` does here. It checks the `pause_ai` switch, the model route and the `aiGlobal` limit, the window shared by everything the app pays for, and counts in no tier's budget. Its cost reaches the Costs tab, never a customer's usage.

## Follow it in the page

`useJob(jobId)` reads one job, live:

```vue [app/pages/strips/[id].vue]
<script setup lang="ts">
import { api } from '#backend/api'

const route = useRoute()
const strip = useQuery(api.strips.get, () => ({ id: route.params.id as string }))
const job = useJob(() => strip.value?.jobId)
</script>

<template>
  <p v-if="job.status.value === 'queued'">
    Number {{ job.position.value ?? '100+' }} in line
  </p>
  <progress v-else-if="job.status.value === 'running'" :value="job.progress.value?.done" :max="job.progress.value?.total" />
  <p v-else-if="job.status.value === 'failed'" role="alert">
    {{ job.error.value?.message }}
  </p>
  <button v-if="job.status.value === 'queued' || job.status.value === 'running'" @click="job.cancel()">
    Cancel
  </button>
</template>
```

`useJob(jobId)` takes an id, a ref or a getter, and pauses while it is empty. It reads through the `getJob` and `cancelJob` functions `backend/jobs.ts` exports. It returns:

::field-group
  :::field{name="status" type="ComputedRef<'queued' | 'running' | 'done' | 'failed' | 'canceled' | undefined>"}
  Where the job is. `undefined` while it loads.
  :::

  :::field{name="waitingOn" type="ComputedRef<'line' | 'owner' | 'paused' | undefined>"}
  What holds a waiting job: `'line'` a slot it may use, `'owner'` its owner's other running jobs, at the tier's `perOwner`, and `'paused'` a paused queue, `concurrency` `0` or `pause_ai`. `undefined` once it runs.
  :::

  :::field{name="position" type="ComputedRef<number | null | undefined>"}
  About its place in line while it waits: `1` starts next. The queue runs its pick ahead, with each running job ending the average job's length after it started, and counts the jobs that start before this one, those held by their owner's `perOwner` included ([Show the place in line](/docs/build/ai/jobs/priority#show-the-place-in-line)). `null` when more than 100 jobs are ahead of it, while `waitingOn` is `'owner'` or `'paused'`, and once it runs.
  :::

  :::field{name="estimatedWait" type="ComputedRef<number | undefined>"}
  About how long until it starts, in milliseconds: when the same run of the pick starts it. While `waitingOn` is `'owner'`, that counts the owner's other jobs ahead of it, waiting or running. `undefined` while paused, once it runs, and before any job has finished.
  :::

  :::field{name="progress" type="ComputedRef<{ done: number, total: number, label?: string } | undefined>"}
  What the job last reported with `job.progress`.
  :::

  :::field{name="result" type="ComputedRef<unknown>"}
  What the handler returned, once the job is `done`.
  :::

  :::field{name="provenance" type="ComputedRef<JobProvenance | undefined>"}
  What made the result, once the job is `done`: the models its steps called, when it finished, and the ids of its inputs ([Label AI-generated content](/docs/build/ai/provenance)).
  :::

  :::field{name="error" type="ComputedRef<BackendError | null>"}
  Why the job failed, as a catalog error. Its message is safe to show: the provider's own error stays in your logs.
  :::

  :::field{name="canCancel" type="ComputedRef<boolean>"}
  Whether the person looking may cancel it now: who started it, and the workspace's owners and admins, while it waits or runs.
  :::

  :::field{name="cancel()" type="Promise<void>"}
  Takes the job out of line, and releases its hold. A running job stops after its current step, and stays charged.
  :::
::

Every member of the workspace that pays for a job can read it. The person who started it, and the workspace's owners and admins, can cancel it. Administrators see every job in the admin console's [Queue tab](/docs/build/ai/jobs/operate).

## What happens to a job

| The job | Status | Its credits | `error` |
|---|---|---|---|
| Waits its turn | `queued` | Held | |
| Starts | `running` | Charged: a usage event on the meter | |
| Returns | `done` | Stay charged | |
| Is canceled before it starts | `canceled` | Released | |
| Is canceled while it runs | `canceled` | Stay charged: what it made so far is kept | |
| Fails a step after its last attempt | `failed` | Refunded | `unavailable`, reason `provider_refused` |
| Is flagged by its `moderate` check ([Keep content safe](/docs/build/ai/content-safety#check-prompts)), its first step | `failed` | Released: never charged | `invalid_input`, reason `content_blocked` |
| Has its content refused by the model | `failed` | Refunded | `invalid_input`, reason `content_blocked` |
| Shows no sign of life for `stallAfter` | `failed` | Refunded | `unavailable`, reason `stalled` |
| Throws a catalog error from your code | `failed` | Refunded | That error, as it is |
| Throws any other error | `failed` | Refunded | `unavailable`, reason `job_failed` |

A failed job is refunded in full, even when its steps saved part of the work: keep what it saved, or delete it, as your app needs. It also lands in the admin console's dead letters, where an administrator can retry or discard it ([Operate the queue](/docs/build/ai/jobs/operate#dead-letters)). [Charge for a queued job](/docs/build/ai/jobs/credits) covers the hold, the charge and the refund. The error codes are listed on [Errors](/docs/reference/backend/errors).

## Limits

- **Steps run as Convex actions,** so one step has the action time limit: keep each step to one model call.
- **The queue is one per app.** Kinds of jobs share its concurrency, its tiers and each owner's budget window. At least one slot always stays shared, whatever the dedicated slots.
- **Image models are alpha** on the Convex AI Gateway, so their request format may change (checked on 2026-10-25).

## Test it

Under Vitest, `nuxt-backend/test` runs a job's steps against a mock model, with no waits between attempts. Enqueue a job, let the scheduled steps run, then read what they saved:

```ts [backend/strips.test.ts]
import { asUser, defineBackendTestApp } from 'nuxt-backend/test'
import { expect, test, vi } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'

const testApp = defineBackendTestApp(schema, import.meta.glob('./**/*.ts'))

test('a strip renders every panel', async () => {
  vi.useFakeTimers()
  const t = testApp()
  const ada = await asUser(t)
  const stripId = await ada.mutation(api.strips.create, { idea: 'A fox who wants to fly', panels: 4 })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  const strip = await ada.query(api.strips.get, { id: stripId })
  expect(strip?.panels).toHaveLength(4)
})
```

Jobs run on your dev deployment against real models, through the same [route](/docs/build/ai/models#where-a-model-id-goes) as production, and spend sandbox credits.

## In this section

::card-group
  :::card{icon="i-lucide-gauge" title="Give plans priority in the queue" to="/docs/build/ai/jobs/priority"}
  How the queue picks the next job: tiers from plan features with a head start, jobs per owner, dedicated slots and a daily budget, and why nobody starves.
  :::

  :::card{icon="i-lucide-activity" title="Keep models under their limits" to="/docs/build/ai/jobs/model-limits"}
  Per-model limits that halve on a `429` and grow back, retries with backoff, and which errors fail a job.
  :::

  :::card{icon="i-lucide-hand-coins" title="Charge for a queued job" to="/docs/build/ai/jobs/credits"}
  Credits held while a job waits, charged when it starts, refunded when it fails, and the cost sent to Polar.
  :::

  :::card{icon="i-lucide-sliders-horizontal" title="Operate the queue" to="/docs/build/ai/jobs/operate"}
  The admin console's Queue tab: pause the queue, set its concurrency, retune a model, cancel a job, retry dead letters.
  :::

  :::card{icon="i-lucide-user-round-plus" title="Let a visitor try once" to="/docs/build/ai/jobs/guests"}
  One free generation before sign-up, claimed by the new account's workspace.
  :::

  :::card{icon="i-lucide-chef-hat" title="Turn a long generation into a job" to="/docs/build/ai/jobs/long-generation"}
  End to end: a strip renderer moved from one long action to a job with a place in line and a progress bar.
  :::
::

## Related

- [AI gateway](/docs/services/ai-gateway): the model route and its spending cap.
- [Meter an AI action](/docs/build/ai/metered-actions): for a generation that fits in one call.
- [Run a durable workflow](/docs/build/data/jobs/workflows): the Workflow component, for background work that is not a generation.
- [Spend credits in your functions](/docs/build/billing/credits/spending): the reservation the hold builds on.
- [Label AI-generated content](/docs/build/ai/provenance): content credentials on what a job makes.
