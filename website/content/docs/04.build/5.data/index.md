---
title: "Data, files and jobs"
description: "Your own tables and functions beside the backend component: live queries in Vue, data rendered on the server, typed refusals, search, counts, checked uploads, share links, retention and background work, on Convex."
kind: landing
playground: /playground/strips
navigation:
  title: Overview
  icon: i-lucide-database
---

This is the part of the backend you build on. Your tables sit in your own schema, beside the ones the `backend` component keeps, and your functions guard them with an access tier. Pages read them live, render them on the server first, and learn why a call was refused. Around them come what a client app needs next: search, counts, uploads, share links, retention and work that runs in the background. It is two of the package's [capabilities](/docs/start/concepts/capabilities): `data`, the database and what reads it, and `jobs`, the work that runs outside a request. New here? Start with [Your data](/docs/build/data/your-data), then [Query and update data](/docs/build/data/read-write).

It runs on [Convex](/docs/services/convex): the database, its realtime queries, search indexes, file storage and scheduler, and the official Convex components. The package adds the access tiers, typed refusals, checked uploads with EXIF stripping and byte quotas, expiring private URLs, share links and retention rules, and composables that follow one set of [conventions](/docs/reference/nuxt/conventions). Nothing here hides Convex: a plain `query`, `mutation` or `action` is always a valid choice, and counters, caches, queues and migrations come straight from their components.

## How it works

```text
backend/schema.ts      your tables, beside the backend component's own
backend/*.ts           your queries, mutations and actions, each behind an access tier
  ├─ Vue pages         useQuery, useMutation, useAction: live over one WebSocket
  ├─ server render     useAsyncQuery: rendered with the data, then live in the browser
  └─ Nitro routes      fetchQuery, backendAuth(event)
backend/storage.ts     checked uploads, owner records, expiring URLs, share links
backend/crons.ts       your jobs and retention rules; the component runs its own
```

1. **Model.** Declare your tables in `backend/schema.ts`, with account and workspace ids as strings. See [Your data](/docs/build/data/your-data).
2. **Protect.** Declare every function at its tier: signed in, a workspace member, an administrator, a role or a plan's feature. See [Protect backend functions](/docs/build/auth/access/functions) and [Scope tables to a workspace](/docs/build/data/read-write/workspace-scoped).
3. **Read and write.** A page subscribes to a query and re-renders whenever its result changes, in every open tab. A mutation writes in one transaction; an action calls the outside world. See [Query and update data](/docs/build/data/read-write).
4. **Render on the server.** `useAsyncQuery` fetches during the server render, as the signed-in person, and the browser goes live without a second fetch. See [Render data on the server](/docs/build/data/read-write/server-rendering).
5. **Refuse with a reason.** A refusal carries a stable code and its data, which a page reads with `getBackendError`. See [Handle errors](/docs/build/data/read-write/errors).
6. **Search and count.** Search indexes beside your tables, and aggregates and counters that stay fast at any size. See [Search your data](/docs/build/data/read-write/search) and [Keep counts and sums](/docs/build/data/read-write/aggregates).
7. **Store files.** Uploads checked on the server and stripped of location data, stored with their row in one mutation, shown to who may see them and shared by link. See [Files](/docs/build/data/files).
8. **Keep it small.** Delete rows once they pass an age, and run work on a clock, in steps or in bulk. See [Delete old data on a schedule](/docs/build/data/retention) and [Background work](/docs/build/data/jobs).

## Who does what

| | Convex | The package | Your app |
|---|---|---|---|
| Database | Tables, indexes, transactions, realtime subscriptions | The `backend` component's own tables, which it migrates and prunes itself | `backend/schema.ts` and every table in it |
| Functions | Queries, mutations, actions and HTTP routes | Access tiers (`createFunctions`), typed refusals (`backendError`), the server helpers in Nitro | Every function in `backend/` |
| Search and counts | Search indexes; the aggregate and sharded counter components | `defineSearch`, `useSearch` | The indexes and aggregates you declare |
| Files | File storage, upload URLs, `ctx.storage` in mutations | `setupStorage`: sniffed types, EXIF stripping, file and byte quotas, owner records, expiring URLs, share links, the orphan sweep; `<UploadField>`, over the base module's `useUpload` | What each file is attached to, and who may share what |
| Retention | The scheduler and crons | `defineRetention`, and the hourly maintenance of the component's own tables | How long each of your tables keeps its rows |
| Background work | The scheduler, crons, and the workflow, workpool, action cache and migrations components | `setupWorkflows`, `useWorkflowStatus` | Your jobs |

The `backend` component keeps accounts and sessions, workspaces and invitations, the billing cache, gifts, files and their owners, AI request records, the activity trail, flag overrides, email records and account exports. You reach them through the package's functions and composables, never through your schema, and the component deletes what it no longer needs on its own. It never reads or deletes your tables. [How it works](/docs/start/concepts/how-it-works) maps each capability to its component.

## In development and in production

- **In development** the app runs on a dev deployment that `npx nuxt-backend dev` creates on its first run, local or in the cloud. Both capabilities read `test` there: the amber light in `npx nuxt-backend status`. See [Develop on real sandboxes](/docs/develop/sandboxes).
- **In tests** `defineBackendTestApp` from `nuxt-backend/test` registers the scaffold's components for `convex-test`, and the backend mock answers your pages' queries. See [Test your app](/docs/develop/testing).
- **In production** the deployment is a cloud or self-hosted one, and both capabilities read `live`, the green light. Choose its region when you create it: [Convex](/docs/services/convex) explains the cost and the move. See [Deploy](/docs/ship/deploy).
- **Watching it.** `npx nuxt-backend status` and the DevTools Overview tab show both capabilities' state and each maintenance pass. See [Capabilities](/docs/start/concepts/capabilities).

## Which tool to use

| You want to | Use | Page |
|---|---|---|
| Add a table of your own, keyed to accounts or workspaces | `backend/schema.ts`, and a tier from `createFunctions` | [Your data](/docs/build/data/your-data) |
| Keep each workspace's rows to its members | The `workspace` tier and an index on `workspaceId` | [Scope tables to a workspace](/docs/build/data/read-write/workspace-scoped) |
| Show data that updates live, and write it | `useQuery`, `useMutation`, `useAction` | [Query and update data](/docs/build/data/read-write) |
| Load a long list a page at a time | `usePaginatedQuery` | [Query and update data](/docs/build/data/read-write#pagination) |
| Render a page with its data on the first load | `useAsyncQuery`, `useAsyncPaginatedQuery` | [Render data on the server](/docs/build/data/read-write/server-rendering) |
| Show why a call was refused, or refuse one yourself | `getBackendError`, `backendError` | [Handle errors](/docs/build/data/read-write/errors) |
| Find rows by the words in a text field | `defineSearch`, `useSearch` | [Search your data](/docs/build/data/read-write/search) |
| Show a count or a sum without reading every row | `@convex-dev/aggregate`, `@convex-dev/sharded-counter` | [Keep counts and sums](/docs/build/data/read-write/aggregates) |
| Delete rows once they pass an age | `defineRetention` | [Delete old data on a schedule](/docs/build/data/retention) |
| Accept uploads under a size, type and byte limit, with location data removed | `setupStorage`, `storage.store`, `useUpload`, `<UploadField>` | [Accept checked uploads](/docs/build/data/files/checked-uploads) |
| Show stored images at the size a page needs | `<StorageImage>`, `<NuxtImg provider="backend">` | [Show images](/docs/build/data/files/images) |
| Serve a private file for a set time | `storage.signedUrl` | [Show images](/docs/build/data/files/images#serve-a-private-file-for-a-while) |
| Let a person share a row by link | `storage.shareable`, `useShareLink` | [Share by link](/docs/build/data/files/share-links) |
| Run steps over minutes or days that survive restarts | `setupWorkflows`, `useWorkflowStatus` | [Run a durable workflow](/docs/build/data/jobs/workflows) |
| Run a job on a schedule | `cronJobs()`, `@convex-dev/crons` | [Schedule jobs](/docs/build/data/jobs/scheduled) |
| Run many jobs a few at a time, with retries | `@convex-dev/workpool` | [Queue work with a workpool](/docs/build/data/jobs/workpool) |
| Keep an expensive action's results for a while | `@convex-dev/action-cache` | [Cache expensive actions](/docs/build/data/jobs/action-cache) |
| Change existing documents in batches | `@convex-dev/migrations` | [Migrate data](/docs/build/data/jobs/migrations) |

## What you get

What the package ships for this part of the app today, generated from the code: each name links to its reference entry.

::what-you-get{area="data"}
::

## In this section

::card-group
  :::card{icon="i-lucide-table-2" title="Your data" to="/docs/build/data/your-data"}
  Where your tables go, how they point at accounts and workspaces, and how they join export and erasure.
  :::

  :::card{icon="i-lucide-building-2" title="Scope tables to a workspace" to="/docs/build/data/read-write/workspace-scoped"}
  Stamp, index and check the active workspace, and gate writes by the member's role.
  :::

  :::card{icon="i-lucide-zap" title="Query and update data" to="/docs/build/data/read-write"}
  Read live data with `useQuery`, write with `useMutation`, call actions, paginate, and ride out a dropped connection.
  :::

  :::card{icon="i-lucide-server" title="Render data on the server" to="/docs/build/data/read-write/server-rendering"}
  Pages that arrive with their data, signed-in reads included, and go live in the browser.
  :::

  :::card{icon="i-lucide-octagon-alert" title="Handle errors" to="/docs/build/data/read-write/errors"}
  Read a refusal's stable code on the client, and refuse from your own functions with the same codes.
  :::

  :::card{icon="i-lucide-search" title="Search your data" to="/docs/build/data/read-write/search"}
  Search a table's text with a builder checked against your schema, and drive it from an input.
  :::

  :::card{icon="i-lucide-sigma" title="Keep counts and sums" to="/docs/build/data/read-write/aggregates"}
  Counts and sums from the aggregate component, and counters that take many writers at once.
  :::

  :::card{icon="i-lucide-hourglass" title="Delete old data on a schedule" to="/docs/build/data/retention"}
  Retention rules in bounded batches, and tokens stored as hashes.
  :::
::

## Files

::card-group
  :::card{icon="i-lucide-folder-up" title="Files" to="/docs/build/data/files"}
  How uploads are checked, owned, shown, shared and swept.
  :::

  :::card{icon="i-lucide-file-check" title="Accept checked uploads" to="/docs/build/data/files/checked-uploads"}
  `setupStorage`, a photo stored with its row in one mutation, and upload URLs for large files.
  :::

  :::card{icon="i-lucide-image" title="Show images" to="/docs/build/data/files/images"}
  `<StorageImage>`, `<NuxtImg>` sizes, and expiring private URLs.
  :::

  :::card{icon="i-lucide-link" title="Share by link" to="/docs/build/data/files/share-links"}
  A link to one row, with a preview card and the sharer's referral code.
  :::

  :::card{icon="i-lucide-trash-2" title="Keep storage clean" to="/docs/build/data/files/cleanup"}
  Release files, the orphan sweep, and a person's files in export and erasure.
  :::
::

## Background work

::card-group
  :::card{icon="i-lucide-timer" title="Background work" to="/docs/build/data/jobs"}
  Which tool runs work outside a request, and what the component's maintenance already runs.
  :::

  :::card{icon="i-lucide-workflow" title="Run a durable workflow" to="/docs/build/data/jobs/workflows"}
  Durable multi-step functions, and a run's status live in Vue.
  :::

  :::card{icon="i-lucide-calendar-clock" title="Schedule jobs" to="/docs/build/data/jobs/scheduled"}
  Fixed jobs in `crons.ts`, and per-person schedules with the crons component.
  :::

  :::card{icon="i-lucide-list-ordered" title="Queue work with a workpool" to="/docs/build/data/jobs/workpool"}
  Many actions a few at a time, with retries and a callback as each ends.
  :::

  :::card{icon="i-lucide-database-zap" title="Cache expensive actions" to="/docs/build/data/jobs/action-cache"}
  An action's results kept for a while, with expiry and invalidation.
  :::

  :::card{icon="i-lucide-arrow-right-left" title="Migrate data" to="/docs/build/data/jobs/migrations"}
  Change existing documents in batches, dry-run first, and resume where a run stopped.
  :::
::

## Not included

- **Another database.** The data lives in your Convex deployment, which is what makes every query live. The package has no adapter for SQL or another store.
- **Who is online.** Presence is a collaboration feature and no part of `0.2.0`: the [Roadmap](/docs/start/roadmap) says what to use instead.
- **Wrappers over Convex components.** Counters, aggregates, cached actions, queues and migrations come straight from their components, as the recipes above show.

## Next

- New here? Read [Your data](/docs/build/data/your-data), then [Query and update data](/docs/build/data/read-write).
- Charging for what you built: [Billing](/docs/build/billing). Putting it online: [Ship](/docs/ship).
