---
title: "Data, files and jobs"
description: "Read and write live Convex data from Vue and Nitro, search and count it, store files, and run durable workflows and migrations."
kind: landing
playground: /playground/client/queries
api: /docs/reference/api/functions
source: src/convex/integrations/functions.ts
navigation:
  title: Overview
  icon: i-lucide-compass
---

Your app's data lives in Convex tables you define in your own schema, `backend/schema.ts`. This section covers the tools that work on those tables: live queries and mutations in Vue, server calls and preloading in Nitro, full-text search, counts and sums, file uploads, durable workflows and online migrations. Each one is a thin helper over Convex itself, or over a Convex component the scaffold already mounts.

## What the component owns

The `backend` component keeps tables of its own: the Better Auth tables, the billing and credit cache, gift purchases, the AI request records and the webhook delivery log. You reach those through the package's functions and composables, not through your schema. Everything else is yours: your tables, your functions, and the data the bundled workflow, migrations and aggregate components work over. [How it works](/docs/start/concepts/how-it-works#what-one-call-mounts) maps each capability to its component.

## Which tool to use

| You want to | Use | Page |
|---|---|---|
| Show data that updates live | A query, read with `useQuery` | [Queries & mutations](/docs/data/queries-and-mutations) |
| Write data, with an optimistic update if you want one | A mutation, called with `useMutation` | [Queries & mutations](/docs/data/queries-and-mutations#usemutation) |
| Call an outside API or a model | An action, called with `useAction`, or a [metered action](/docs/ai/metered-actions) when it spends credits | [Queries & mutations](/docs/data/queries-and-mutations#useaction) |
| Load a long list a page at a time | `usePaginatedQuery` | [Queries & mutations](/docs/data/queries-and-mutations#pagination) |
| Call Convex from a Nitro route, or render data on the first load | `fetchQuery`, `backendAuth(event)`, `preloadQuery` | [Server & SSR](/docs/data/server-rendering) |
| Show why a call was refused, or refuse one yourself | `getBackendError`, `backendError` | [Handle errors](/docs/data/errors) |
| Find rows by the words in a text field | `search`, `defineSearch`, `useSearch` | [Full-text search](/docs/data/search) |
| Show a count or a sum without reading every row | `TableAggregate`, `useAggregate` | [Aggregates](/docs/data/aggregates) |
| Upload files and show them | `useUpload`, `useUploadQueue`, `useStorageUrl` | [File storage](/docs/data/files) |
| Run steps over minutes or days that survive restarts | `setupWorkflows`, `useWorkflowStatus` | [Workflows](/docs/data/jobs/workflows) |
| Change existing documents in batches, or backfill an aggregate | `setupMigrations` | [Migrations](/docs/data/jobs/migrations) |

## In this section

::card-group
  :::card{icon="i-lucide-zap" title="Queries & Mutations" to="/docs/data/queries-and-mutations"}
  Read live data with `useQuery`, write with `useMutation`, call actions, and paginate.
  :::

  :::card{icon="i-lucide-server" title="Server & SSR" to="/docs/data/server-rendering"}
  Call Convex from Nitro handlers, as the signed-in user when needed, and preload queries for hydration.
  :::

  :::card{icon="i-lucide-octagon-alert" title="Handle errors" to="/docs/data/errors"}
  Read a refusal's stable code on the client, and refuse from your own functions with the same codes.
  :::

  :::card{icon="i-lucide-search" title="Full-Text Search" to="/docs/data/search"}
  Search a table's text with a builder checked against your schema, and drive it from an input with `useSearch`.
  :::

  :::card{icon="i-lucide-sigma" title="Aggregates" to="/docs/data/aggregates"}
  Keep counts and sums in sync through triggers, and read them live with `useAggregate`.
  :::
::

## Files

::card-group
  :::card{icon="i-lucide-upload" title="File Storage" to="/docs/data/files"}
  Upload one file or a queue of them with progress and cancellation, then resolve the served URL.
  :::
::

## Background work

::card-group
  :::card{icon="i-lucide-workflow" title="Workflows" to="/docs/data/jobs/workflows"}
  Define durable multi-step functions and email sequences, and follow a run's status from Vue.
  :::

  :::card{icon="i-lucide-arrow-right-left" title="Migrations" to="/docs/data/jobs/migrations"}
  Change existing documents in batches, dry-run first, and resume where a run stopped.
  :::
::

## Not covered here

- **The storage functions.** The upload helpers call a `generateUploadUrl` mutation and a `getUrl` query that you write in your backend; [File storage](/docs/data/files) shows both.
- **A workflow status query.** The scaffold ships none; [Workflows](/docs/data/jobs/workflows#reactive-status) shows the one `useWorkflowStatus` reads.
