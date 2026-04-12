# nuxt-backend

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

Batteries-included [Nuxt](https://nuxt.com) module for [Convex](https://convex.dev) with built-in authentication.

## Features

- 🔌 **Real-time Convex client** — WebSocket on client, HTTP on server
- 🔐 **Authentication** — Email/password out of the box via [Better Auth](https://www.better-auth.com)
- 🛡️ **Route protection** — `auth` middleware to guard pages
- 🔄 **SSR** — Session hydration, server-side queries and mutations
- 📦 **Auto-imports** — Composables and server utilities, zero manual imports
- 🏗️ **Auto-scaffold** — Minimal Convex root files generated on first run

## Installation

### 1. Install the package

```bash
npm install nuxt-backend
```

### 2. Add the module

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-backend'],
})
```

### 3. Configure environment

Create a `.env` file in your project root:

```bash
CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_SITE_URL=https://your-deployment.convex.site
```

In the [Convex dashboard](https://dashboard.convex.dev), set these environment variables:

```
SITE_URL=http://localhost:3000
BETTER_AUTH_SECRET=<random-secret>
```

### 4. Start development

```bash
npm run dev
```

On first run the module scaffolds the minimum Convex files:

```
your-project/
├── backend/
│   ├── convex.config.ts   # Mounts the packaged auth component
│   └── auth.config.ts     # Convex auth provider config for Better Auth
├── convex.json            # Points the Convex CLI at backend/
└── .env
```

### 5. Start Convex

```bash
npx convex dev     # Development
npx convex deploy  # Production
```

---

## Composables

All composables are auto-imported.

### `useQuery(query, args)`

Reactive query with real-time updates on the client and one-shot fetch during SSR.

```vue
<script setup>
import { api } from '~/backend/_generated/api'

const { data, error, isLoading } = useQuery(api.messages.list, {})

// Skip conditionally
const { data: user } = useQuery(api.users.get, computed(() =>
  userId.value ? { id: userId.value } : 'skip'
))
</script>
```

Returns `{ data: Ref<T | undefined>, error: Ref<Error | null>, isLoading: Ref<boolean> }`

### `useMutation(mutation)`

```vue
<script setup>
import { api } from '~/backend/_generated/api'

const sendMessage = useMutation(api.messages.send)
await sendMessage({ body: 'Hello!' })
</script>
```

### `useAction(action)`

```vue
<script setup>
import { api } from '~/backend/_generated/api'

const generateImage = useAction(api.images.generate)
const url = await generateImage({ prompt: 'a cat' })
</script>
```

### `useAuth()`

Reactive auth state.

```vue
<script setup>
const { isAuthenticated, isLoading } = useAuth()
</script>

<template>
  <div v-if="isLoading">Loading...</div>
  <div v-else-if="isAuthenticated">Welcome!</div>
  <div v-else>Please sign in</div>
</template>
```

### `useSession()`

SSR-compatible session data.

```vue
<script setup>
const session = await useSession()
const user = computed(() => session.data.value?.user)
</script>
```

### `useAuthClient()`

Full Better Auth client for sign-in, sign-up, sign-out.

```vue
<script setup>
const auth = useAuthClient()

await auth.signIn.email({ email: 'user@example.com', password: 'secret' })
await auth.signUp.email({ email: 'user@example.com', password: 'secret', name: 'User' })
await auth.signOut()
</script>
```

### `useBackend()`

Direct access to the Convex client (`ConvexClient` on client, `ConvexHttpClient` on server).

---

## Route Protection

Guard pages with the built-in `auth` middleware:

```vue
<script setup>
definePageMeta({ middleware: 'auth' })
</script>
```

Unauthenticated users are redirected to `/login`.

---

## Server Utilities

Auto-imported in your `server/` directory.

```ts
// server/api/example.ts
export default defineEventHandler(async () => {
  const messages = await fetchQuery(api.messages.list, {})
  await fetchMutation(api.messages.send, { body: 'From server' })
  const result = await fetchAction(api.images.generate, { prompt: 'cat' })
  return messages
})
```

### Authenticated

```ts
// server/api/profile.ts
export default defineEventHandler(async (event) => {
  const token = getCookie(event, 'better-auth.session_token')
  if (!token) throw createError({ statusCode: 401 })

  return await fetchAuthQuery(token, api.users.me, {})
})
```

### Preloading

```ts
const preloaded = await preloadQuery(api.messages.list, {})
const data = preloadedQueryResult(preloaded)
```

| Function | Description |
|---|---|
| `fetchQuery` | Run a query |
| `fetchMutation` | Run a mutation |
| `fetchAction` | Run an action |
| `fetchAuthQuery` | Authenticated query |
| `fetchAuthMutation` | Authenticated mutation |
| `fetchAuthAction` | Authenticated action |
| `preloadQuery` | Preload query for SSR |
| `preloadAuthQuery` | Preload authenticated query |
| `preloadedQueryResult` | Extract result from preloaded query |

---

## Configuration

All options have sensible defaults. Environment variables are picked up automatically.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-backend'],
  backend: {
    // Convex deployment URL (default: CONVEX_URL env)
    url: 'https://your-deployment.convex.cloud',

    // Convex site URL for auth proxy (default: CONVEX_SITE_URL env)
    siteUrl: 'https://your-deployment.convex.site',

    // Auth proxy route prefix (default: '/api/auth')
    authRoute: '/api/auth',
  },
})
```

### Environment Variables

| Variable | Where | Description |
|---|---|---|
| `CONVEX_URL` | `.env` | Convex deployment URL (`*.convex.cloud`) |
| `CONVEX_SITE_URL` | `.env` | Convex HTTP actions URL (`*.convex.site`) |
| `SITE_URL` | Convex dashboard | Your app URL (e.g. `http://localhost:3000`) |
| `BETTER_AUTH_SECRET` | Convex dashboard | Secret for auth token signing |

---

## Customizing the Convex root files

Zero-config mode mounts the packaged auth component at `/api/auth` and wires Convex auth to the same path.

If you want a different auth route, replace the scaffolded files with the named helpers:

```ts
// backend/convex.config.ts
import { defineBackendApp } from 'nuxt-backend/convex-config'

export default defineBackendApp({
  httpPrefix: '/internal/auth',
})
```

```ts
// backend/auth.config.ts
import { defineBackendAuthConfig } from 'nuxt-backend/auth-config'

export default defineBackendAuthConfig({
  basePath: '/internal/auth',
})
```

If you change the Nuxt module's `backend.authRoute`, keep these Convex helpers on the same path.

The packaged component is intentionally opinionated for zero setup. If you need full Better Auth ownership beyond route wiring, switch out of the zero-config defaults and own the Convex auth files in your project.

---

## Architecture

```
┌─────────────┐    WebSocket     ┌──────────────────┐
│   Browser    │◄───────────────►│   Convex Cloud    │
│              │                 │                   │
│              │   /api/auth/*   │   queries         │
│              │────────────────►│   mutations       │
│              │     proxy       │   actions         │
└──────────────┘                 │                   │
                                 │   Better Auth     │
┌──────────────┐    HTTP         │   (HTTP actions)  │
│  Nuxt Server │◄───────────────►│                   │
└──────────────┘                 └───────────────────┘
```

- **Client**: `ConvexClient` connects via WebSocket for real-time reactivity. Auth tokens are automatically wired in.
- **Server**: `ConvexHttpClient` makes stateless HTTP requests. Session tokens read from cookies.
- **Auth proxy**: `/api/auth/*` proxied to Convex site URL — same-origin, no CORS issues.

---

## Development

```bash
npm install          # Install dependencies
npm run dev:prepare  # Generate type stubs
npm run dev          # Dev with playground
npm run lint         # ESLint
npm run test         # Vitest
npm run prepack      # Build for publishing
```

## License

[MIT](./LICENSE)

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/nuxt-backend/latest.svg?style=flat&colorA=020420&colorB=00DC82
[npm-version-href]: https://npmjs.com/package/nuxt-backend

[npm-downloads-src]: https://img.shields.io/npm/dm/nuxt-backend.svg?style=flat&colorA=020420&colorB=00DC82
[npm-downloads-href]: https://npm.chart.dev/nuxt-backend

[license-src]: https://img.shields.io/npm/l/nuxt-backend.svg?style=flat&colorA=020420&colorB=00DC82
[license-href]: https://npmjs.com/package/nuxt-backend

[nuxt-src]: https://img.shields.io/badge/Nuxt-020420?logo=nuxt
[nuxt-href]: https://nuxt.com
