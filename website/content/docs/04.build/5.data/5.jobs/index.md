---
title: Background work
description: "Which tool runs work outside a request, from Convex's scheduler and crons to the official workflow, workpool, action cache and migrations components, and what the backend component already runs on its own."
kind: concept
capability: jobs
navigation:
  title: Overview
  icon: i-lucide-timer
---

A query or a mutation answers one call and is done. Work that happens later, on a clock, over several steps or in bulk runs in the background, on Convex's own scheduler or an official Convex component. Your app uses them directly, the way their docs show: the package wraps only workflows, and keeps its own maintenance inside its component.

## Which tool when

| You want to | Use | Page |
|---|---|---|
| Run one function later: in a minute, or at a set time | `ctx.scheduler.runAfter` or `runAt`, in any mutation or action | [Convex scheduling](https://docs.convex.dev/scheduling/scheduled-functions) |
| Run a job on a fixed schedule | `cronJobs()` in `backend/crons.ts` | [Schedule jobs](/docs/build/data/jobs/scheduled#your-own-jobs) |
| Run a job on a schedule your code picks, such as a digest at each reader's hour | The [`@convex-dev/crons`](https://www.convex.dev/components/crons) component | [Schedule jobs](/docs/build/data/jobs/scheduled#jobs-your-code-schedules) |
| Delete rows once they pass an age | `defineRetention`, started from `crons.ts` | [Delete old data on a schedule](/docs/build/data/retention) |
| Run several steps over minutes or days, each retried, surviving restarts | A workflow, through `setupWorkflows` | [Run a durable workflow](/docs/build/data/jobs/workflows) |
| Run many of the same job a few at a time, with retries and a callback | The [`@convex-dev/workpool`](https://www.convex.dev/components/workpool) component | [Queue work with a workpool](/docs/build/data/jobs/workpool) |
| Keep an expensive action's results, so the same call runs once | The [`@convex-dev/action-cache`](https://www.convex.dev/components/action-cache) component | [Cache expensive actions](/docs/build/data/jobs/action-cache) |
| Change existing documents in batches | The [`@convex-dev/migrations`](https://www.convex.dev/components/migrations) component | [Migrate data](/docs/build/data/jobs/migrations) |
| Queue AI generations, with what each plan gets in line and credits held until they run | `defineJobQueue`, in the `ai` capability | [Run generation jobs](/docs/build/ai/jobs) |

Pick the scheduler for one delayed call, and a cron when the same thing repeats on a clock. Pick a workflow when one piece of work has several steps that must all happen, and a workpool when there is a lot of the same work that must not all run at once. Put the action cache in front of an action called again with the same arguments.

## What the component already runs

The `backend` component cleans up after itself. Its own cron starts a maintenance pass every hour, wherever the component is mounted, so your app schedules nothing for it. A pass deletes what is past its window in the component's own tables: expired sessions and codes, settled AI request records, old email records, unanswered invitations, activity past its year, old exports and failed erasures. With `0.2.0` it also deletes uploads nobody claimed ([Keep storage clean](/docs/build/data/files/cleanup)).

[Schedule jobs](/docs/build/data/jobs/scheduled#the-maintenance-the-component-runs) names each task and how a pass runs. [Limits and retention](/docs/reference/backend/limits#windows-and-lifetimes) gives every window. A sign-in code takes its own path from the start and [leaves no record](/docs/build/email/sending#secret-emails-leave-no-record).

## What this means for you

- **Schedule nothing for the package.** Mounting the `backend` component is enough, on every deployment, previews included.
- **Keep your own tables small yourself.** The component never reads or deletes your data: give each table that grows a [retention rule](/docs/build/data/retention).
- **Install a component when you first need it.** The scaffold mounts `workflow` and `workpool`, which the package's own helpers use. Mount the crons, action cache and migrations components yourself, as their pages show.
- **Know your plan's limits.** Scheduled functions and crons count as function calls on your Convex plan ([Convex](/docs/services/convex#costs-and-limits)).
- **Watch the passes** on the DevTools [Overview tab](/docs/develop/devtools#overview), or with `npx convex run --component backend maintenance:status`.
