# nuxt-backend

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

Integrate [Convex](https://convex.dev) with [Nuxt](https://nuxt.com) — one package that ships a **Nuxt module** and a **Convex auth component** with [Better Auth](https://www.better-auth.com) built in.

`nuxt-backend` is a Vue/Nuxt port of the official Convex + Better Auth React/Next integration. It keeps the same core pieces — the Better Auth Convex plugin, Convex auth config, server helpers, auth-aware preloading, and client auth state — but preconfigures the route wiring and component setup so new Nuxt apps do less manual installation work.

> This README covers setup and the end-to-end integration flow. Full API details, exports, architecture, and development notes are in [docs/reference.md](./docs/reference.md).

## What this module provides

Adding `modules: ['nuxt-backend']` registers the following surface, described in standard Nuxt module terms. Grouped by where each piece lives. Full signatures, argument types, and the import tree are in the [API reference](#api-reference) below.

### ⚙️ Configuration

- **Module options** (`backend` config key) — `url`, `siteUrl`, `authRoute`, `installation`. All optional; URLs fall back to env vars.
- **Runtime config** — `runtimeConfig.public.backend.{url,siteUrl}` and `runtimeConfig.backend.siteUrl`, resolved from module options or `NUXT_PUBLIC_CONVEX_URL` / `NUXT_PUBLIC_CONVEX_SITE_URL`.

### 🖼️ App runtime (Vue)

- **Nuxt plugins** — a client Convex plugin and an SSR auth-token prefetch plugin; injects `useNuxtApp().$convex`.
- **Auto-imported composables** — `useConvex`, `useQuery` (+ `useConvexQuery`, `useQuery_experimental`), `useQueries` (+ `useConvexQueries`), `useMutation` (+ `useConvexMutation`), `useAction` (+ `useConvexAction`), `usePaginatedQuery` (+ `usePaginatedQuery_experimental`), `usePreloadedQuery`, `usePreloadedAuthQuery`, `useConvexConnectionState`, `useUpload`, `useUploadQueue`, `useStorageUrl` (+ `uploadFile`), `useConvexAuth`, `provideConvexAuth`, and `useAuth`.
- **Auto-registered components** — `<Authenticated>`, `<Unauthenticated>`, `<AuthLoading>`.
- **Route middleware** — `auth`, opt-in per page via `definePageMeta({ middleware: 'auth' })` (registered non-global, so installing the module never guards routes by surprise).

### 🛠️ Server (Nitro)

- **Server route** — `${backend.authRoute}/**` (default `/api/auth/**`): a same-origin Better Auth proxy that keeps cookies on your domain.
- **Server auto-imports** — `fetchQuery`, `fetchMutation`, `fetchAction`, `preloadQuery`, `preloadedQueryResult`, `backendAuth` (available in `server/` routes, Nitro handlers, and middleware).

### 🧩 Project wiring & types

- **Import aliases** — `#backend`, `#backend/api`, `#backend/server`, `#backend/dataModel`, and `#backend/_generated`, registered for both Vite and Nitro, pointing at your Convex functions directory and its [generated files](https://docs.convex.dev/generated-api/).
- **Scaffolded files** (first run) — `backend/convex.config.ts`, `auth.config.ts`, `auth.ts`, `http.ts`; local mode also creates `backend/components/backend/*`.
- **Type augmentation** — runtime config keys, the injected `$convex`, auto-imported composables, auto-registered components, and package subpath declarations all become typed after Nuxt preparation.

### 🔐 Convex auth bridge (package entrypoints)

- **Better Auth component** — email/password auth out of the box, a Convex adapter for persistence, and HTTP auth endpoints served through Convex.
- **Entrypoints** — `nuxt-backend` (the module), `nuxt-backend/convex` (`setupAuth`, `createAuth`, `createAuthOptions`, `makeAuthApi`, `createBetterAuth`), `nuxt-backend/convex/component/convex.config`, `nuxt-backend/convex/component/schema`, `nuxt-backend/convex/auth.config`, and `nuxt-backend/convex/test`. (`getAuthUser`, `authComponent`, and `options` are returned by `setupAuth(...)`, not direct exports.)

### Full Nuxt module surface

`nuxt-backend` deliberately uses only the part of the Nuxt module API that an auth/data integration needs, and leaves routing, layout, and styling to your app. The table below triages the complete set of things a Nuxt module *can* provide against what this module does.

<details>
<summary>Provided vs. intentionally app-owned</summary>

| Capability (Nuxt Kit / mechanism) | In `nuxt-backend` |
|---|---|
| Module options · `defineNuxtModule({ configKey })` | ✅ `backend.url`, `siteUrl`, `authRoute`, `installation` |
| Runtime config · `options.runtimeConfig` / `updateRuntimeConfig` | ✅ public + private `backend` keys |
| App plugins · `addPlugin` / `addPluginTemplate` | ✅ client + server plugins, injects `$convex` |
| Auto-imported composables · `addImports` / `addImportsDir` | ✅ Convex + auth composables |
| Auto-imported components · `addComponent` / `addComponentsDir` | ✅ `<Authenticated>`, `<Unauthenticated>`, `<AuthLoading>` |
| Route middleware · `addRouteMiddleware` | ✅ `auth` (opt-in, non-global) |
| Server routes / middleware · `addServerHandler` | ✅ auth proxy at `authRoute/**` |
| Server auto-imports · `addServerImports` / `addServerImportsDir` | ✅ `fetchQuery`, `preloadQuery`, `backendAuth`, … |
| Import aliases · `options.alias` (+ `nitro.alias`) | ✅ `#backend`, `#backend/api`, `#backend/server`, `#backend/dataModel`, `#backend/_generated` |
| Type augmentation · `declare module` / `addTypeTemplate` | ✅ runtime config + generated declarations |
| Package entrypoints · `exports` map | ✅ 6 subpaths (module + Convex bridge) |
| Scaffolded files on disk | ✅ first-run Convex wiring (module-specific) |
| Layouts · `addLayout` | — app-owned |
| Pages / routes · `extendPages` | — app-owned |
| Route rules · `extendRouteRules` | — app-owned |
| Global head · `setGlobalHead` / `app.head` | — app-owned |
| Global CSS · `options.css` | — app-owned |
| Global route middleware · `addRouteMiddleware({ global: true })` | — app-owned (auth is opt-in) |
| App config · `options.appConfig` | — not used |
| Nitro plugins · `addServerPlugin` | — not used |
| Server scan dirs / virtual files · `addServerScanDir` / `addServerTemplate` | — not used |
| Dev-only handlers · `addDevServerHandler` | — not used |
| Prerender routes · `addPrerenderRoutes` | — app-owned |
| Virtual files · `addTemplate` / `updateTemplates` | — not used (physical scaffold instead) |
| Bundler plugins / config · `addVitePlugin` / `extendViteConfig` / `build.transpile` | — not used |
| Module dependencies · `moduleDependencies` / `installModule` | — not used |
| Compatibility constraints · `meta.compatibility` | — not declared |
| Nuxt layer · `extends` | — not shipped as a layer |

</details>

Keeping pages, layouts, global CSS, global middleware, route rules, and layers app-owned means installing the module never changes your routing, layout, styling, or domain behavior.

## Installation

### 1. Install the package

```bash
npx nuxi@latest module add nuxt-backend
```

<details>

<summary>…or install using your dependency manager</summary>

```bash
# Using pnpm
pnpm add nuxt-backend

# Using yarn
yarn add nuxt-backend

# Using npm
npm install nuxt-backend
```

</details>

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

## API reference

Two ways to consume the surface:

- **Explicit imports** — `import { … } from 'nuxt-backend/…'`, declared in the package `exports` map. The `nuxt-backend/convex*` subpaths run in your **Convex backend** (`backend/`), not the Vue app.
- **Auto-imports** — registered by the module, no `import` needed. Vue composables and components are available in app code; the server utilities are available in `server/` (Nitro).

Generic helpers in the signatures below (`FunctionReference`, `FunctionArgs`, `FunctionReturnType`, `OptionalRestArgs`, `ConnectionState`, `Value`) come from `convex`; the paginated result types are re-exported from `convex/react` for parity.

### Import tree

```text
nuxt-backend
├─ "nuxt-backend" ............................ Nuxt module (default) + type ModuleOptions
├─ "nuxt-backend/convex" .................... setupAuth · createAuth · createAuthOptions
│                                             makeAuthApi · createBetterAuth · createBetterAuthOptions
│                                             + types CreateBetterAuthOptions · SetupAuthOptions
├─ "nuxt-backend/convex/component/convex.config" ......... default: the `backend` component
├─ "nuxt-backend/convex/component/schema" .. tables · authSchema · default (= authSchema)
├─ "nuxt-backend/convex/component/_generated/component" .. type ComponentApi  (types only)
├─ "nuxt-backend/convex/auth.config" ....... defineBackendAuthConfig · default · type DefineBackendAuthConfigOptions
└─ "nuxt-backend/convex/test" .............. register · default ({ register, modules })

auto-imports (no import statement)
├─ Vue composables ......... useConvex · useQuery (+ useConvexQuery, useQuery_experimental)
│                            useQueries (+ useConvexQueries) · useMutation (+ useConvexMutation)
│                            useAction (+ useConvexAction) · usePaginatedQuery (+ usePaginatedQuery_experimental)
│                            usePreloadedQuery · usePreloadedAuthQuery · useConvexConnectionState
│                            useUpload · useUploadQueue · useStorageUrl (+ uploadFile)
│                            useConvexAuth · provideConvexAuth · useAuth
├─ Vue components .......... <Authenticated> · <Unauthenticated> · <AuthLoading>
├─ Injection ............... useNuxtApp().$convex : ConvexVueClient
└─ Server utils (Nitro) .... fetchQuery · fetchMutation · fetchAction
                             preloadQuery · preloadedQueryResult · backendAuth

aliases ...................... #backend · #backend/api · #backend/server
                             #backend/dataModel · #backend/_generated  (Vite + Nitro)
```

### Explicit entrypoints

#### `nuxt-backend`

```ts
import nuxtBackendModule, { type ModuleOptions } from 'nuxt-backend'

interface ModuleOptions {
  url?: string
  siteUrl?: string
  authRoute?: string                  // default '/api/auth'
  installation?: 'default' | 'local'  // default 'default'
}
// Also augments RuntimeConfig.backend.siteUrl and
// PublicRuntimeConfig.backend.{ url, siteUrl }.
```

#### `nuxt-backend/convex` — app-side Convex bridge

```ts
import {
  setupAuth, createAuth, createAuthOptions,
  makeAuthApi, createBetterAuth, createBetterAuthOptions,
  type CreateBetterAuthOptions, type SetupAuthOptions,
} from 'nuxt-backend/convex'

// Composes the wrapper + API-remount patterns for the common scaffolded case.
function setupAuth<DM extends GenericDataModel, Schema = DefaultAuthSchema>(
  componentRef: ComponentRef,
  queryBuilder: QueryBuilder<DM, 'public'>,
  options?: SetupAuthOptions<Schema>,
): {
  authComponent: AuthComponent
  createAuthOptions: (ctx: GenericCtx<DM>) => BetterAuthOptions
  options: BetterAuthOptions
  createAuth: (ctx: GenericCtx<DM>) => BetterAuthInstance
  getAuthUser: RegisteredQuery
}

function createAuth<DM extends GenericDataModel, Schema = DefaultAuthSchema>(
  ctx: GenericCtx<DM>, componentRef: ComponentRef, options?: SetupAuthOptions<Schema>,
): BetterAuthInstance

function createAuthOptions<DM extends GenericDataModel, Schema = DefaultAuthSchema>(
  ctx: GenericCtx<DM>, componentRef: ComponentRef, options?: SetupAuthOptions<Schema>,
): BetterAuthOptions

function makeAuthApi<DM extends GenericDataModel, Schema = DefaultAuthSchema>(
  componentRef: ComponentRef, queryBuilder: QueryBuilder<DM, 'public'>, options?: SetupAuthOptions<Schema>,
): { getAuthUser: RegisteredQuery }

function createBetterAuth(database: BetterAuthAdapter, options?: CreateBetterAuthOptions): BetterAuthInstance
function createBetterAuthOptions(database: BetterAuthAdapter, options?: CreateBetterAuthOptions): BetterAuthOptions

interface CreateBetterAuthOptions {
  authConfig?: AuthConfig          // override the default Convex auth config
  authOptions?: BetterAuthOptions  // merged with package defaults
  basePath?: string                // default '/api/auth'
}
interface SetupAuthOptions<Schema> extends CreateBetterAuthOptions {
  schema?: Schema                  // local Better Auth schema for hybrid/local installs
  verbose?: boolean                // verbose component client logs
}
```

#### `nuxt-backend/convex/component/convex.config`

```ts
import backend from 'nuxt-backend/convex/component/convex.config'
// default export: the `backend` Convex component → app.use(backend)
```

#### `nuxt-backend/convex/component/schema`

```ts
import authSchema, { tables, authSchema as schema } from 'nuxt-backend/convex/component/schema'
// tables:     { user, session, account, verification, rateLimit, passkey, jwks }
// authSchema: SchemaDefinition = defineSchema(tables)   (default export === authSchema)
```

#### `nuxt-backend/convex/component/_generated/component` — types only

```ts
import type { ComponentApi } from 'nuxt-backend/convex/component/_generated/component'
type ComponentApi<Name extends string | undefined = string | undefined>
```

#### `nuxt-backend/convex/auth.config`

```ts
import defineBackendAuthConfig, {
  type DefineBackendAuthConfigOptions,
} from 'nuxt-backend/convex/auth.config'

function defineBackendAuthConfig(options?: DefineBackendAuthConfigOptions): AuthConfig
interface DefineBackendAuthConfigOptions {
  basePath?: string  // default '/api/auth'
  jwks?: string
}
// default export === defineBackendAuthConfig()
```

#### `nuxt-backend/convex/test`

```ts
import backendTest, { register } from 'nuxt-backend/convex/test'

function register(
  t: TestConvex<SchemaDefinition<GenericSchema, boolean>>,
  name?: string,           // default 'backend'
): void
// default export: { register, modules }
```

### Auto-imported composables (Vue)

```ts
// Client access
function useConvex(): ConvexVueClient

// Queries — returns undefined while loading; throws query errors
function useQuery<Q extends FunctionReference<'query'>>(
  query: Q,
  ...args: OptionalRestArgsOrSkip<Q>   // reactive args; pass 'skip' to pause
): ShallowRef<FunctionReturnType<Q> | undefined>
const useConvexQuery = useQuery

// Experimental object form — errors returned in result unless throwOnError
function useQuery_experimental<Q extends FunctionReference<'query'>, ThrowOnError extends boolean = false>(
  options: { query: Q, args: MaybeRefOrGetter<FunctionArgs<Q> | 'skip'>, throwOnError?: ThrowOnError },
): ShallowRef<UseQueryResult<FunctionReturnType<Q>, ThrowOnError>>  // { status: 'pending'|'success'|'error', data?, error? }

// Dynamic set of queries
function useConvexQueries(queries: MaybeRefOrGetter<RequestForQueries>): ShallowRef<QueriesResults>
const useQueries = useConvexQueries
// RequestForQueries: Record<string, { query: FunctionReference<'query'>, args: Record<string, Value> }>
// QueriesResults:    Record<string, Value | undefined | Error>

// Mutations
function useMutation<M extends FunctionReference<'mutation'>>(mutation: M): VueMutation<M>
const useConvexMutation = useMutation
interface VueMutation<M extends FunctionReference<'mutation'>> {
  (...args: OptionalRestArgs<M>): Promise<FunctionReturnType<M>>
  withOptimisticUpdate(update: OptimisticUpdate<FunctionArgs<M>>): VueMutation<M>
}

// Actions
function useAction<A extends FunctionReference<'action'>>(action: A): VueAction<A>
const useConvexAction = useAction
interface VueAction<A extends FunctionReference<'action'>> {
  (...args: OptionalRestArgs<A>): Promise<FunctionReturnType<A>>
}

// Pagination — positional form, throws on error
function usePaginatedQuery<Q extends PaginatedQueryReference>(
  query: Q,
  args: MaybeRefOrGetter<PaginatedQueryArgs<Q> | 'skip'>,
  options: { initialNumItems: number },
): ShallowRef<UsePaginatedQueryReturnType<Q>>
// → { results, status: 'LoadingFirstPage'|'CanLoadMore'|'LoadingMore'|'Exhausted', isLoading, loadMore }

// Experimental — overloaded: positional (throws) OR object form (errors in result)
function usePaginatedQuery_experimental<Q extends PaginatedQueryReference>(
  query: Q, args: MaybeRefOrGetter<PaginatedQueryArgs<Q> | 'skip'>, options: { initialNumItems: number },
): ShallowRef<UsePaginatedQueryReturnType<Q>>
function usePaginatedQuery_experimental<Q extends PaginatedQueryReference, ThrowOnError extends boolean = false>(
  options: MaybeRefOrGetter<UsePaginatedQueryOptions<Q, ThrowOnError>>,
): ShallowRef<UsePaginatedQueryObjectReturnType<Q, ThrowOnError>>
// object form → { data, status: 'pending'|'success'|'error', error, canLoadMore, isLoading, loadMore }

// SSR hydration — consume a Preloaded payload, then go live on the client
function usePreloadedQuery<Q extends FunctionReference<'query'>>(preloaded: Preloaded<Q>): ShallowRef<FunctionReturnType<Q>>
function usePreloadedAuthQuery<Q extends FunctionReference<'query'>>(preloaded: Preloaded<Q>): ShallowRef<FunctionReturnType<Q> | null>

// WebSocket connection
function useConvexConnectionState(): ShallowRef<ConnectionState>

// File storage — convenience helpers over Convex file storage (see docs/reference.md)
function useUpload(generateUploadUrl: GenerateUploadUrl, options?: UseUploadOptions): VueUpload
const useConvexUpload = useUpload
interface VueUpload {
  upload: (file: Blob) => Promise<StorageId | null>   // null on failure; see `error`
  isUploading: Ref<boolean>; progress: Ref<number>    // progress 0–1
  error: Ref<Error | null>; storageId: Ref<StorageId | null>
  cancel: () => void; reset: () => void
}
function useUploadQueue(generateUploadUrl: GenerateUploadUrl, options?: UseUploadQueueOptions): VueUploadQueue
const useConvexUploadQueue = useUploadQueue
// → { items, enqueue, isUploading, progress, pendingCount, activeCount, cancel, remove, clear }
function useStorageUrl(getUrl: GetStorageUrl, storageId: MaybeRefOrGetter<StorageId | string | null | undefined>): ShallowRef<string | null | undefined>
const useConvexStorageUrl = useStorageUrl
function uploadFile(options: { url: string, file: Blob, onProgress?: (p: number) => void, signal?: AbortSignal }): Promise<StorageId>

// Better Auth (the single auth service for app code)
function useAuth(initialToken?: string | null): UseAuthService
interface UseAuthService {
  client: AuthClient                       // Better Auth client (signIn, signUp, signOut, …)
  session: AuthSession                     // reactive Better Auth session
  isAuthenticated: ComputedRef<boolean>
  isLoading: ComputedRef<boolean>
  fetchAccessToken: AuthTokenFetcher
  authVersion: ComputedRef<string | null>
}

// Low-level Convex auth (advanced — not needed for the default Better Auth setup)
function useConvexAuth(): ConvexAuthState                              // { isLoading, isAuthenticated }
function provideConvexAuth(options: ConvexAuthProviderOptions): ConvexAuthState
interface ConvexAuthProviderOptions {
  client: ConvexVueClient
  useAuth: () => {
    isLoading: MaybeRefOrGetter<boolean>
    isAuthenticated: MaybeRefOrGetter<boolean>
    fetchAccessToken: AuthTokenFetcher
    authVersion?: MaybeRefOrGetter<unknown>
  }
}
```

### Auto-imported components (Vue templates)

```vue
<Authenticated>   <!-- renders its slot only when authenticated -->
<Unauthenticated> <!-- renders its slot only when unauthenticated -->
<AuthLoading>     <!-- renders its slot while auth state is resolving -->
```

### Auto-imported server utilities (Nitro / `server/`)

```ts
function fetchQuery<Q extends FunctionReference<'query'>>(
  query: Q, ...args: ArgsAndOptions<Q, NuxtConvexOptions>      // (args?, options?)
): Promise<FunctionReturnType<Q>>
function fetchMutation<M extends FunctionReference<'mutation'>>(
  mutation: M, ...args: ArgsAndOptions<M, NuxtConvexOptions>
): Promise<FunctionReturnType<M>>
function fetchAction<A extends FunctionReference<'action'>>(
  action: A, ...args: ArgsAndOptions<A, NuxtConvexOptions>
): Promise<FunctionReturnType<A>>
function preloadQuery<Q extends FunctionReference<'query'>>(
  query: Q, ...args: ArgsAndOptions<Q, NuxtConvexOptions>
): Promise<Preloaded<Q>>
function preloadedQueryResult<Q extends FunctionReference<'query'>>(preloaded: Preloaded<Q>): FunctionReturnType<Q>

interface NuxtConvexOptions {
  token?: string  // JWT for an authenticated call
  url?: string    // defaults to NUXT_PUBLIC_CONVEX_URL
}

// Per-request authenticated helper for the current H3 event
function backendAuth(event: H3Event, opts?: BackendAuthOptions): BackendAuthService
type BackendAuthOptions = GetTokenOptions & { convexSiteUrl?: string }
interface BackendAuthService {
  getToken(): Promise<string | undefined>
  isAuthenticated(): Promise<boolean>
  handler(): Promise<Response>
  preloadAuthQuery<Q extends FunctionReference<'query'>>(query: Q, args?: Q['_args']): Promise<Preloaded<Q>>
  fetchAuthQuery<Q extends FunctionReference<'query'>>(query: Q, args?: Q['_args']): Promise<FunctionReturnType<Q>>
  fetchAuthMutation<M extends FunctionReference<'mutation'>>(mutation: M, args?: M['_args']): Promise<FunctionReturnType<M>>
  fetchAuthAction<A extends FunctionReference<'action'>>(action: A, args?: A['_args']): Promise<FunctionReturnType<A>>
}
```

### `ConvexVueClient`

Returned by `useConvex()` and injected as `useNuxtApp().$convex`. Most app code should prefer the composables; reach for the client for imperative one-off calls.

```ts
class ConvexVueClient {
  query<Q extends FunctionReference<'query'>>(query: Q, ...args: OptionalRestArgs<Q>): Promise<FunctionReturnType<Q>>
  mutation<M extends FunctionReference<'mutation'>>(
    mutation: M, ...args: ArgsAndOptions<M, VueMutationOptions<FunctionArgs<M>>>
  ): Promise<FunctionReturnType<M>>
  action<A extends FunctionReference<'action'>>(action: A, ...args: OptionalRestArgs<A>): Promise<FunctionReturnType<A>>
  watchQuery<Q extends FunctionReference<'query'>>(query: Q, ...args: OptionalRestArgs<Q>): Watch<FunctionReturnType<Q>>
  connectionState(): ConnectionState
  subscribeToConnectionState(cb: (state: ConnectionState) => void): () => void
  setAuth(fetchToken: AuthTokenFetcher, onChange?: (isAuthenticated: boolean) => void): void
  clearAuth(): void
  close(): Promise<void>
}
```

### Import aliases

```ts
import { api, internal, components } from '#backend/api'
import { query, mutation, action } from '#backend/server'
import type { Doc, Id } from '#backend/dataModel'

// '#backend'            → your Convex functions dir (backend/ or convex/)
// '#backend/api'        → _generated/api       (api, internal, components)
// '#backend/server'     → _generated/server    (query, mutation, action, *Ctx, ...)
// '#backend/dataModel'  → _generated/dataModel (DataModel, Doc, Id, TableNames)
// '#backend/_generated' → _generated           (long form, any generated file)
// All registered for both Vite and Nitro.
```

The short aliases resolve to the same files as `#backend/_generated/*`, so use
whichever you prefer. Because `#backend/api` / `#backend/server` /
`#backend/dataModel` map straight to the generated modules, they shadow any
function file you happen to name `api.ts` / `server.ts` / `dataModel.ts` —
import those via a different name (or `#backend/_generated/...`).

## More Documentation

See [docs/reference.md](./docs/reference.md) for usage examples, customization details, architecture notes, and the development workflow.

## Contributing

1. Clone this repository
2. Install dependencies using `pnpm install`
3. Prepare for development using `pnpm dev:prepare`
4. Start development server using `pnpm dev`

We follow conventional commits (Renovate PRs do too). After CI is green on `main`, run `pnpm release` locally to cut a new release (release-it updates CHANGELOG.md, creates a git tag, and can create a GitHub Release). Pushing the tag triggers the automated release workflow which:

- Creates (or updates) a rich GitHub Release with conventional commit grouping and an explicit "Thank you to contributors" section (via `changelogithub` + fallback `gh release create`).
- Publishes to npm with provenance (OIDC recommended).

See `.github/workflows/release.yml` and `.github/release.yml` for the exact configuration.

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
