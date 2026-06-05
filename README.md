# nuxt-backend

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

Integrate [Convex](https://convex.dev) with [Nuxt](https://nuxt.com) — one package that ships a **Nuxt module** and a **Convex auth component** with [Better Auth](https://www.better-auth.com) built in.

`nuxt-backend` is a Vue/Nuxt port of the official Convex + Better Auth React/Next integration. It keeps the same core pieces — the Better Auth Convex plugin, Convex auth config, server helpers, auth-aware preloading, and client auth state — but preconfigures the route wiring and component setup so new Nuxt apps do less manual installation work.

> This README covers setup and the end-to-end integration flow. Full API details, exports, architecture, and development notes are in [docs/reference.md](./docs/reference.md).

## Features

### Nuxt Module
- 🔌 **Real-time Convex client** — auto-imported `useConvex`, `useQuery`, `useMutation`, `useAction`, and more
- 🔄 **SSR** — `fetchQuery`, `fetchMutation`, `fetchAction`, `preloadQuery` plus hydration with `usePreloadedQuery` and `usePreloadedAuthQuery`
- 🔐 **Auth composable** — auto-imported `useAuth` exposes Better Auth client + session state, no setup needed
- 🛡️ **Route protection** — built-in `auth` middleware, opt-in per page with `definePageMeta`
- 🌐 **Same-origin auth proxy** — `/api/auth` proxied to Convex, keeps cookies on your domain
- 🏗️ **Auto-scaffold** — minimum Convex root files generated on first run
- 🧩 **Local install mode** — scaffold a hybrid Better Auth component when you want to own the schema

### Convex Auth Component
- 🔑 **Better Auth** — email/password authentication out of the box
- 🗄️ **Convex adapter** — Better Auth persistence backed by your Convex database
- ⚙️ **`nuxt-backend/convex` bridge** — exposes `setupAuth(...)`, official Better Auth Convex exports, and `getAuthUser` for app Convex functions
- 🔗 **Auth config wiring** — `auth.config.ts` keeps Convex token verification aligned with Better Auth

## Installation

### 1. Install the package

```bash
npm install nuxt-backend
```

### 2. Add the Nuxt module

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-backend'],
})
```

### 3. Configure environment variables

Create a `.env.local` file in the app root:

```bash
# .env.local
NUXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
NUXT_PUBLIC_CONVEX_SITE_URL=https://your-deployment.convex.site
```

These are the only app environment variables auto-detected by the module.

Set the Convex deployment environment variables via the CLI:

```bash
npx convex env set BETTER_AUTH_SECRET=$(openssl rand -base64 32)
npx convex env set SITE_URL https://nuxt-backend.localhost
```

Or set them manually in the [Convex dashboard](https://dashboard.convex.dev). These variables are added to the `.env.local` file created by `npx convex dev` and will be picked up by your framework dev server.

So the required values are split like this:

- `.env.local` in the Nuxt app: `NUXT_PUBLIC_CONVEX_URL`, `NUXT_PUBLIC_CONVEX_SITE_URL`
- Convex dashboard env vars: `SITE_URL`, `BETTER_AUTH_SECRET`

### 4. Optional: override module defaults

Most apps do not need a `backend` block in `nuxt.config.ts`. Add it only if you want to override the env-based defaults or change the auth route:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-backend'],
  backend: {
    url: 'https://your-deployment.convex.cloud',
    siteUrl: 'https://your-deployment.convex.site',
    authRoute: '/api/auth',
  },
})
```

### 5. Start the app once so the backend files are scaffolded

```bash
npm run dev
```

On first run, the module creates the minimum Convex files needed to mount the packaged Better Auth component and register the official auth routes. This replaces the manual `convex/betterAuth/*` component setup from the official guide with a prebuilt component and root helpers. If the app already has a Convex functions directory, scaffolding reuses it. Otherwise it creates `backend/` by default:

```text
your-project/
├── backend/
│   ├── convex.config.ts
│   ├── auth.config.ts
│   ├── auth.ts
│   └── http.ts
└── convex.json
```

`convex.json` is only generated when the functions directory is non-standard (anything other than `convex/`).

### 6. Start Convex

```bash
npx convex dev
```

Deploy with:

```bash
npx convex deploy
```

## Usage

The intended integration shape is:

- Nuxt owns the UI, route middleware, SSR handlers, and the same-origin auth proxy.
- Convex owns data, real-time subscriptions, Better Auth persistence, and auth identity.
- `nuxt-backend` keeps the auth route, auth config, and client/server helpers aligned.

A complete working example lives in [`playground/`](./playground) — sign-in/sign-up page, protected todos page with auth-aware SSR preload, Convex queries/mutations, and `auth` middleware.

### 1. Keep the scaffolded Convex files aligned

If you let the module scaffold files, you can keep them as generated. If you create them manually, they should look like this:

```ts
// backend/convex.config.ts
import { defineApp } from 'convex/server'
import backend from 'nuxt-backend/convex/component/convex.config'

const app = defineApp()
app.use(backend)
export default app
```

```ts
// backend/auth.config.ts
export { default } from 'nuxt-backend/convex/auth.config'
```

```ts
// backend/auth.ts
import { setupAuth } from 'nuxt-backend/convex'
import { components } from './_generated/api'
import { query } from './_generated/server'

export const {
  authComponent,
  createAuthOptions,
  options,
  createAuth,
  getAuthUser,
} = setupAuth(components.backend, query)
```

```ts
// backend/http.ts
import { httpRouter } from 'convex/server'
import { authComponent, createAuth } from './auth'

const http = httpRouter()
authComponent.registerRoutes(http, createAuth)

export default http
```

That setup mounts the packaged Better Auth component, configures Convex to trust its tokens, and exposes `api.auth.getAuthUser` for app queries.

### Local hybrid install

Auth is always installed. Use local installation mode when you want to own the Better Auth schema, add custom indexes, or regenerate schema after adding Better Auth plugins:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-backend'],
  backend: {
    installation: 'local',
  },
})
```

The first run scaffolds `backend/components/backend/*` with a local `convex.config.ts`, `schema.ts`, `adapter.ts`, and a schema-generation `auth.ts`. The app-facing `backend/auth.ts` still exports `authComponent`, `createAuthOptions`, `options`, and `createAuth`, matching the official Better Auth Convex API while hiding the installation details behind the Nuxt module.

After changing Better Auth plugins or schema-affecting options, regenerate the local schema and keep your custom indexes in `schema.ts`:

```bash
npx auth generate --config ./backend/components/backend/auth.ts --output ./backend/components/backend/generated-schema.ts
```

### 2. Sign in from Nuxt

```vue
<!-- pages/login.vue -->
<script setup lang="ts">
const { client: auth } = useAuth()
const email = ref('')
const password = ref('')
const pending = ref(false)
const error = ref<string | null>(null)

async function signIn() {
  pending.value = true
  error.value = null

  try {
    await auth.signIn.email({
      email: email.value,
      password: password.value,
    })
    await navigateTo('/account')
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to sign in'
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <form @submit.prevent="signIn">
    <input v-model="email" type="email" placeholder="Email">
    <input v-model="password" type="password" placeholder="Password">
    <button :disabled="pending" type="submit">
      Sign in
    </button>
    <p v-if="error">{{ error }}</p>
  </form>
</template>
```

Use the same client for sign-up and sign-out flows.

### 3. Read session state and Convex data in a protected page

```vue
<!-- pages/account.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { api } from '~/backend/_generated/api'

definePageMeta({ middleware: 'auth' })

const { session } = useAuth()
const currentUser = useQuery(api.auth.getAuthUser, {})
const email = computed(() => session.value.data?.user.email)
</script>

<template>
  <section>
    <p>Signed in as {{ email }}</p>
    <pre>{{ currentUser }}</pre>
  </section>
</template>
```

The built-in `auth` middleware protects the page, `useAuth().session` exposes the Better Auth session, and `useQuery(...)` keeps Convex data live after hydration.

### 4. Use authenticated server helpers in Nitro handlers

```ts
// server/api/me.ts
import { api } from '~/backend/_generated/api'

export default defineEventHandler(async (event) => {
  const auth = backendAuth(event)

  if (!await auth.isAuthenticated()) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  return auth.fetchAuthQuery(api.auth.getAuthUser, {})
})
```

`backendAuth(event)` is the Nuxt/Nitro equivalent of the official Next helper. It can get the Convex auth token, check authentication, run authenticated queries/mutations/actions, and preload authenticated query data for the client.

```ts
// server/api/account.preload.ts
import { api } from '~/backend/_generated/api'

export default defineEventHandler((event) => {
  return backendAuth(event).preloadAuthQuery(api.auth.getAuthUser, {})
})
```

```vue
<script setup lang="ts">
const { data: preloaded } = await useFetch('/api/account.preload')
const currentUser = usePreloadedAuthQuery(preloaded.value!)
</script>
```

Use `usePreloadedAuthQuery` for auth-protected SSR data. It keeps the server result during auth startup, then switches to the live authenticated Convex query or clears the data if the browser is unauthenticated.

### 5. Keep the auth route consistent if you customize it

If you change `backend.authRoute` from `/api/auth`, keep the same path in `createAuthOptions` and Convex auth config. The Nuxt proxy route, Better Auth `basePath`, and `defineBackendAuthConfig({ basePath: ... })` must all match.

## More Documentation

See [docs/reference.md](./docs/reference.md) for the full API reference, package exports, customization details, architecture notes, and development workflow.

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
