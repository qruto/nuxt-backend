---
name: nuxt-backend-data
description: Data in a Nuxt app on nuxt-backend. Live Convex queries, mutations, actions and pagination from Vue, server rendering, error codes and how to read and throw them, full-text search, aggregates and high-write counters, file storage, durable workflows, queued work in a workpool, cached action results, scheduled jobs and crons, and schema migrations. Use when reading or writing app data, adding a Convex function or table, handling a refused call, searching or counting, uploading files, caching an expensive action, or running background, bulk and scheduled work. Read the nuxt-backend core skill first.
---

# nuxt-backend: data

The app's data lives in its own Convex tables in `backend/`, keyed by the user id; the `backend`
component owns its schema. The `nuxt-backend` core skill holds the rules every change follows;
this one covers reading, writing and background work.

## Reading and writing

- `useQuery`, `useMutation`, `useAction` and `usePaginatedQuery` take refs from `#backend/api`;
  `useBackendClient()` makes a one-off imperative call, and `<StorageImage>` shows an image in file
  storage. The base module's brand-named composables and components are not auto-imported in a
  nuxt-backend app: use these neutral names.
- For user-scoped functions, use the builders in `backend/functions.ts` (`authed`, `workspace`,
  `admin`; the `nuxt-backend-auth` skill).
- `useConnectionState()` is the live connection; `<ConnectionStatus>` says a drop or going offline
  in words, and already closes every ready-made page. Do not build a retry button: the client
  reconnects, resends waiting mutations, and asks before a tab with unsent ones closes.

## Data composables

`useSearch(query, { term })` and `useWorkflowStatus(query, { workflowId })`
take an options object of values, refs or getters and return a plain object to destructure:
`data` (or `results`), `isLoading`, `isPending` for actions, and `error` as
`{ code, data, message } | null`. A read never throws, so bind `error` instead of wrapping it in
`try`; an action rejects and fills `error` too. `data` is `undefined` until the first read lands.
Rules: https://nuxt-backend.dev/docs/reference/nuxt/conventions.

## Errors

A refusal is a `ConvexError` with a stable code (`unauthenticated`, `forbidden`, `no_workspace`,
`rate_limited`, `insufficient_credits`, `invalid_input`, `not_ready`, `unavailable`), which
production keeps where it hides a plain `Error` as "Server Error".

- Read one with the auto-imported `getBackendError(error)`: branch on `code`, show `message`. It
  reads auth results and the rate limiter's error too.
- Refuse from your own functions with `backendError(code, data)` from `nuxt-backend/functions`.
- Call your own limits with `throws: true` and still throw `rate_limited` when the result is
  `{ ok: false }`: the limiter throws only when it knows the wait.
- Codes: https://nuxt-backend.dev/docs/reference/backend/errors.

## Search, aggregates and background work

- Search: `defineSearch` and `search` from `nuxt-backend/search` over Convex's full-text indexes,
  read with `useSearch`.
- Counts and sums: `@convex-dev/aggregate`, kept in step by `convex-helpers` triggers, imported
  directly and read with `useQuery`.
- A count many people change at once (views, likes, votes): `new ShardedCounter(components.shardedCounter)`
  from `@convex-dev/sharded-counter`; `inc`, `dec` and `count` it from your functions.
- Durable multi-step work: `setupWorkflows` from `nuxt-backend/workflows`, followed with
  `useWorkflowStatus`.
- Bulk work a few at a time: `new Workpool(components.workpool, options)` from `@convex-dev/workpool`.
  Enqueue from a mutation or an action; retries stay opt-in (`retry: true`), so only retry
  actions that are safe to run twice.
- An expensive action called again with the same arguments: `new ActionCache(components.actionCache,
  { action, name, ttl })` from `@convex-dev/action-cache`, mounted in `convex.config.ts`. Without
  `ttl` a result stays until removed. The arguments are the key, shared by every caller: put the
  user's id among them when a result is theirs alone.
- Scheduled jobs: Convex's own `cronJobs()` in `backend/crons.ts`; jobs scheduled at runtime on
  `@convex-dev/crons`. The `backend` component runs its own maintenance; don't add cron jobs that prune its tables.
- Schema migrations: `new Migrations(components.migrations)` from `@convex-dev/migrations`, mounted
  in `convex.config.ts`.

## Tasks

<!-- generated:tasks -->
- [Scope tables to a workspace](https://nuxt-backend.dev/docs/build/data/read-write/workspace-scoped): Keep each workspace's rows to its members: stamp the active workspace on every write, read through an index on it, check a row's workspace before you touch it by id, and gate writes by the member's role.
- [Render data on the server](https://nuxt-backend.dev/docs/build/data/read-write/server-rendering): Render pages with their data, signed-in reads included, and go live in the browser without a second fetch; preload from a Nitro route, or call the backend from your own API routes.
- [Handle errors](https://nuxt-backend.dev/docs/build/data/read-write/errors): Read a refusal's code with getBackendError, show the right sentence or the way out, and refuse from your own functions with the same codes. Reach for `nuxt-backend/functions`.
- [Search your data](https://nuxt-backend.dev/docs/build/data/read-write/search): Find rows by the words in a text field: a search builder checked against your schema, a ready-made search query, and useSearch to drive it from an input. Reach for `nuxt-backend/search`.
- [Query and update data](https://nuxt-backend.dev/docs/build/data/read-write): Read live data in Vue with useQuery, write with useMutation and optimistic updates, call actions, load long lists a page at a time, and ride out a dropped connection.
- [Accept checked uploads](https://nuxt-backend.dev/docs/build/data/files/checked-uploads): Accept photos and files checked on the server: size and sniffed type, EXIF and GPS stripped, quotas counted in files and bytes, and the file stored with its row in one mutation, or claimed after an upload URL.
- [Show images](https://nuxt-backend.dev/docs/build/data/files/images): Show a stored image with `<StorageImage>`, at the size and format a page needs with `<NuxtImg>` and the backend image provider, or behind an expiring private URL that stops working after a set time.
- [Share by link](https://nuxt-backend.dev/docs/build/data/files/share-links): Let a person share one of their rows by link: mark the table shareable, turn a link on, rotate or revoke it with useShareLink, read the row on a public page, give the link a preview card, and carry a made-with badge and the sharer's referral code.
- [Keep storage clean](https://nuxt-backend.dev/docs/build/data/files/cleanup): Release a file when your row lets go of it, let the component's sweep delete uploads nobody claimed or that failed their checks, and see how a person's files join their export and erasure.
- [Delete old data on a schedule](https://nuxt-backend.dev/docs/build/data/retention): Keep each table's rows only as long as you need them: defineRetention deletes rows past their age in bounded batches that schedule themselves, and the token helpers keep secrets out of your tables.
- [Run a durable workflow](https://nuxt-backend.dev/docs/build/data/jobs/workflows): Run work of several steps over minutes or days, each step retried and the whole surviving restarts and deploys, and follow a run's status live from Vue. Reach for `nuxt-backend/workflows`.
- [Schedule jobs](https://nuxt-backend.dev/docs/build/data/jobs/scheduled): Add your app's fixed jobs to crons.ts with Convex's cronJobs, schedule per-person jobs at runtime with the crons component, and see the maintenance the backend component runs on its own.
<!-- /generated:tasks -->

## The API

[references/api.md](references/api.md) lists the composables and import paths of this area, each
with its doc comment's first sentence.
