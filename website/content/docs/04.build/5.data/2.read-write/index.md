---
title: Query and update data
description: "Read live data in Vue with useQuery, write with useMutation and optimistic updates, call actions, load long lists a page at a time, and ride out a dropped connection."
kind: how-to
capability: data
demo: true
playground: /playground/strips
navigation:
  title: Query and update
  icon: i-lucide-zap
---

A page subscribes to a query and re-renders whenever its result changes, in every tab that shows it, with nothing to refetch or invalidate. A mutation writes in one transaction, and every query it touches updates. An action calls the outside world. Convex runs all three and pushes changes over one WebSocket; the base module brings them to Vue, and the package adds the access tiers behind every call and `<ConnectionStatus>` for a dropped connection. The composables below are auto-imported in app code and stay live across hydration; `api`, the typed references to your functions, comes from [`#backend/api`](/docs/reference/nuxt/import-aliases).

Every example calls functions of your own in `backend/`, each declared at its [access tier](/docs/build/auth/access/functions). For a page that must arrive with its data, see [Render data on the server](/docs/build/data/read-write/server-rendering).

## `useQuery()`

`useQuery(query, args?)` returns a computed ref of the result, `undefined` while it loads. Arguments may be a ref or a getter, and the query follows them; `'skip'` pauses it. A query that fails throws, so wrap the part of the page that reads it in an error boundary, or use the object form below.

```vue
<script setup lang="ts">
import { api } from '#backend/api'

const messages = useQuery(api.messages.list, {})
// messages.value: Message[] | undefined

const userId = ref<string | null>(null)
const profile = useQuery(
  api.users.get,
  () => userId.value ? { userId: userId.value } : 'skip',
)
</script>
```

### Errors in the result: `useQuery_experimental()`

The object form returns a computed ref of `{ status, data, error }`, where `status` is `'pending'`, `'success'` or `'error'`. An error lands in the result unless you pass `throwOnError: true`. Read its code with [`getBackendError`](/docs/build/data/read-write/errors).

```vue
<script setup lang="ts">
import { api } from '#backend/api'

const channel = ref('#general')
const result = useQuery_experimental({
  query: api.messages.list,
  args: () => ({ channel: channel.value }),
})
// result.value.status: 'pending' | 'success' | 'error'
</script>
```

## `useQueries()`

Use it when the set of queries itself changes at runtime, such as one per open panel. It returns a shallow ref of an object with the same keys: each value is the query's result, `undefined` while it loads, or the `Error` it failed with.

```vue
<script setup lang="ts">
import { api } from '#backend/api'

const results = useQueries({
  messages: { query: api.messages.list, args: { channel: '#general' } },
  me: { query: api.users.me, args: {} },
})
// results.value.messages, results.value.me
</script>
```

## `useMutation()`

`useMutation(mutation)` returns a function that runs it and resolves with what it returns. It rejects when the mutation is refused or fails: read the refusal with [`getBackendError`](/docs/build/data/read-write/errors).

```vue
<script setup lang="ts">
import { api } from '#backend/api'

const sendMessage = useMutation(api.messages.send)

async function send(body: string) {
  await sendMessage({ body })
}
</script>
```

An optimistic update changes what the page shows before the server answers, and is rolled back on its own if the mutation fails:

```ts
const sendNow = useMutation(api.messages.send).withOptimisticUpdate((localStore, args) => {
  const current = localStore.getQuery(api.messages.list, {}) ?? []
  localStore.setQuery(api.messages.list, {}, [...current, { _id: crypto.randomUUID(), body: args.body }])
})
```

::demo-counter
::

## `useAction()`

An action runs outside the database: it calls an outside API or a model, and reads and writes through queries and mutations of its own. Call it the same way:

```vue
<script setup lang="ts">
import { api } from '#backend/api'

const generateImage = useAction(api.images.generate)

async function generate(prompt: string) {
  return await generateImage({ prompt })
}
</script>
```

An action that spends a person's credits is a [metered action](/docs/build/ai/metered-actions); one called again with the same arguments can be [cached](/docs/build/data/jobs/action-cache).

## Pagination

`usePaginatedQuery(query, args, { initialNumItems })` loads a long list a page at a time. The query takes `paginationOpts` and returns a page:

```ts [backend/messages.ts]
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { authed } from './functions'

export const listPaginated = authed.query({
  args: { channel: v.string(), paginationOpts: paginationOptsValidator },
  handler: (ctx, { channel, paginationOpts }) => ctx.db.query('messages')
    .withIndex('by_channel', q => q.eq('channel', channel))
    .order('desc')
    .paginate(paginationOpts),
})
```

It returns `results`, `status`, `isLoading` and `loadMore`, each one a ref you can destructure. `status` is `'LoadingFirstPage'`, `'CanLoadMore'`, `'LoadingMore'` or `'Exhausted'`, and a query that fails throws.

```vue
<script setup lang="ts">
import { api } from '#backend/api'

const { results, status, loadMore } = usePaginatedQuery(
  api.messages.listPaginated,
  { channel: '#general' },
  { initialNumItems: 20 },
)
</script>

<template>
  <p v-for="message in results" :key="message._id">{{ message.body }}</p>
  <button :disabled="status !== 'CanLoadMore'" @click="loadMore(20)">Load more</button>
</template>
```

Every loaded page stays live: a row inserted, changed or deleted shows at once. For a first page rendered on the server, use [`useAsyncPaginatedQuery`](/docs/build/data/read-write/server-rendering#render-a-long-list).

### `usePaginatedQuery_experimental()`

Its positional form is `usePaginatedQuery`. Its object form, `usePaginatedQuery_experimental({ query, args, initialNumItems })`, returns a computed ref of `{ data, status, error, canLoadMore, isLoading, loadMore }`, where `status` is `'pending'`, `'success'` or `'error'`, and keeps an error in the result unless you pass `throwOnError: true`.

::note
React backs its experimental hook with the Convex client's native `PaginatedQueryClient`, which the published `convex` package does not export. This port pages by hand, as `usePaginatedQuery` does, with the same observable results.
::

## Imperative access: `useBackendClient()`

For a one-off call outside a composable's lifecycle, take the client itself. Most app code should prefer the composables.

```vue
<script setup lang="ts">
import { api } from '#backend/api'

const backend = useBackendClient()

async function refresh() {
  return await backend.query(api.messages.list, {})
}
</script>
```

The [client reference](/docs/reference/nuxt/client) lists its methods. There is no client on the server: Nitro routes use the [server helpers](/docs/build/data/read-write/server-rendering#call-the-backend-from-a-nitro-route) instead.

## Connection state

```vue [components/OfflineNote.vue]
<script setup lang="ts">
const connection = useConnectionState()
</script>

<template>
  <span v-if="!connection.isWebSocketConnected">Offline</span>
</template>
```

Place it as `<ClientOnly><OfflineNote /></ClientOnly>`.

::demo-connection
::

`useConnectionState()` is the client's own state: `isWebSocketConnected`, `hasEverConnected`, `connectionRetries` and `inflightMutations` among it. Call it in the browser only, as above: on a server render it asks the client for its state, which opens the client's socket from the server.

### Tell people the connection dropped

`<ConnectionStatus>` says it in words. Every ready-made page already shows it, in the status region of its frame, which floats at the bottom of the viewport. In your own layout it renders where you place it, and a ready-made page inside that layout leaves the words to yours, so a drop is shown and announced once:

```vue [layouts/default.vue]
<template>
  <div>
    <slot />
    <ConnectionStatus :delay="3000" />
  </div>
</template>
```

It shows nothing while the connection is up, and it never opens a connection to report on one: a page that runs no query, such as the sign-in page for a signed-out visitor, holds no socket for it. A drop that lasts `delay` milliseconds (1.5 seconds by default) reads "Reconnecting…", so a blip passes unannounced; going offline reads "You're offline." at once, with the number of changes waiting to be sent. It is display only: there is nothing to press, since the client reconnects and sends the waiting changes on its own. Its live region stays mounted, so a screen reader announces the words when they appear. Its default slot receives `status` (`online`, `reconnecting` or `offline`) and `pendingChanges`, for an indicator of your own; its words are the `connection` [labels](/docs/build/ui/customize/labels#the-groups).

### Changes that are not sent yet

A mutation made while the connection is down waits in the client and goes out when it is back. If the person closes the tab or leaves the site first, the browser asks them to confirm: the client's own `unsavedChangesWarning`, which is on in every browser and needs no setup. The module creates the client with it on.

## Related

- [Render data on the server](/docs/build/data/read-write/server-rendering): pages that arrive with their data, and calls from Nitro.
- [Handle errors](/docs/build/data/read-write/errors): read why a query or a mutation was refused.
- [Protect backend functions](/docs/build/auth/access/functions): the tier each function you call is declared at.
- [Convex](/docs/services/convex): the deployment these calls reach, and its limits.
- [Composables](/docs/reference/nuxt/composables) and [the client](/docs/reference/nuxt/client): the reference.
