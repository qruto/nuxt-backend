// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- the private names' declarations, for every program that compiles this file as written
/// <reference path="./base-modules.d.ts" />
import { getFunctionName, makeFunctionReference, type FunctionReference } from 'convex/server'
import { computed, getCurrentInstance, watch, type App } from 'vue'
import { clearNuxtState, tryUseNuxtApp } from '#app'
import { ConvexAuthStateKey, ConvexClientKey } from '#backend-test-utils/base-client'
import { __resetUseBetterAuthForTests } from '#backend-test-utils/base-use-better-auth'
import { LAST_SIGN_IN_STATE } from '../vue/utils/last-sign-in.js'
import { BackendApiKey, beforeApiRead } from '../vue/utils/namespace.js'
import { activeBackendMock, callFunction, readQuery, registry } from './mock.js'

// Where the mock meets the base module: a client and an auth state under the
// base module's own keys, and a function tree under this package's, so its
// composables and components (`useQuery`, `<Authenticated>`, `<StorageImage>`,
// …) read the active mock as the package's do. Loaded only through the
// aliases, inside the `nuxt` test environment.

type AnyReference = FunctionReference<'query' | 'mutation' | 'action', 'public' | 'internal'>

/** A failed read as the base client's `localQueryResult` throws it: always an `Error`. */
function thrown(error: unknown): Error {
  return error instanceof Error ? error : Object.assign(new Error(String((error as { message?: unknown } | null)?.message ?? error)), { data: error })
}

/** The connection state of a client that is always connected. */
const CONNECTED = {
  hasInflightRequests: false,
  isWebSocketConnected: true,
  timeOfOldestInflightRequest: null,
  hasEverConnected: true,
  connectionCount: 1,
  connectionRetries: 0,
  inflightMutations: 0,
  inflightActions: 0,
}

/**
 * The backend client every composable gets: queries read the active mock
 * and update when it changes (a paginated query's pages too, each read with
 * its `paginationOpts`), calls go to it, and auth, admin auth and prewarming
 * are accepted and ignored.
 */
export const mockClient = {
  url: 'https://backend.mock',
  logger: { logVerbose() {}, log() {}, warn() {}, error() {} },
  watchQuery: (query: AnyReference, args?: Record<string, unknown>) => {
    const name = getFunctionName(query)
    const read = () => readQuery(name, args ?? {})
    return {
      onUpdate: (callback: () => void) => watch(read, () => callback(), { flush: 'sync' }),
      localQueryResult: () => {
        const result = read()
        if (result.status === 'error') throw thrown(result.error)
        return result.status === 'success' ? result.data : undefined
      },
      localQueryLogs: () => undefined,
      journal: () => undefined,
    }
  },
  query: (query: AnyReference, args?: Record<string, unknown>) => callFunction('query', getFunctionName(query), args ?? {}),
  mutation: (mutation: AnyReference, args?: Record<string, unknown>) => callFunction('mutation', getFunctionName(mutation), args ?? {}),
  action: (action: AnyReference, args?: Record<string, unknown>) => callFunction('action', getFunctionName(action), args ?? {}),
  prewarmQuery: () => {},
  setAuth: () => {},
  clearAuth: () => {},
  setAdminAuth: () => {},
  closed: false,
  connectionState: () => CONNECTED,
  subscribeToConnectionState: () => () => {},
  close: async () => {},
}

const references = new Map<string, AnyReference>()

/** A function namespace (`api.billing`) where every name is a function, so a composable finds each export it looks for. */
function namespaceOf(module: string): Record<string, AnyReference | undefined> {
  return new Proxy({}, {
    get: (_target, property) => {
      // Vue's reactivity flags (`__v_isRef`, …) and symbols are no function names.
      if (typeof property !== 'string' || property === 'then' || property.startsWith('__v_')) return undefined
      const path = `${module}:${property}`
      if (!references.has(path)) references.set(path, makeFunctionReference(path) as AnyReference)
      return references.get(path)
    },
  })
}

/** The app's function tree (`api`): one namespace per module name. */
export const mockApi = new Proxy({} as Record<string, unknown>, {
  get: (target, property) => {
    if (typeof property !== 'string' || property === 'then' || property.startsWith('__v_')) return undefined
    return (target[property] ??= namespaceOf(property))
  },
})

/** The auth state `useConvexAuth()` and `<Authenticated>` read. */
export const mockAuthState = {
  isLoading: computed(() => activeBackendMock().state.isLoading),
  isAuthenticated: computed(() => !activeBackendMock().state.isLoading && activeBackendMock().state.user !== null),
  isRefreshing: computed(() => false),
}

const PROVIDED: Array<[symbol, unknown]> = [[ConvexClientKey, mockClient], [BackendApiKey, mockApi], [ConvexAuthStateKey, mockAuthState]]

registry.provides = () => Object.fromEntries(PROVIDED)

/**
 * Put the mock's client, functions and auth state on `provides`. A client the
 * base module's plugin already made stops authenticating: its plugin keeps
 * watching the (mock) session and would open a connection on sign-in.
 */
function provideOn(provides: Record<symbol, unknown>, replace: boolean): void {
  const real = provides[ConvexClientKey] as { setAuth?: unknown, clearAuth?: unknown } | undefined
  if (real && real !== mockClient) Object.assign(real, { setAuth: () => {}, clearAuth: () => {} })
  for (const [key, value] of PROVIDED) if (replace || !(key in provides)) provides[key] = value
}

/** The Nuxt app of the test environment, as `@nuxt/test-utils` finds it. */
function nuxtApp(): { vueApp?: App, runWithContext?: <T>(fn: () => T) => T } | undefined {
  const unctx = (globalThis as { __unctx__?: { get: (key: string) => { tryUse: () => { vueApp?: App } | undefined } } }).__unctx__
  return tryUseNuxtApp() ?? unctx?.get('nuxt-app')?.tryUse()
}

/** The Vue app of the test environment's Nuxt app. */
function nuxtVueApp(): App | undefined {
  return nuxtApp()?.vueApp
}

/**
 * Forget how the browser last signed in (`useLoginFlow().lastMethod`): a
 * mock's sign-ins record it, and the next test's browser has signed in
 * nowhere. It reads the browser's cookie again on its next use.
 */
function forgetLastSignIn(): void {
  nuxtApp()?.runWithContext?.(() => clearNuxtState(LAST_SIGN_IN_STATE))
}

/**
 * Provide the mock on the app the calling component belongs to, when it has
 * none yet: what a plain `mount()` needs. `mountSuspended` copies the Nuxt
 * app's, where every new mock is provided.
 */
export function provideMockOnCurrentApp(): void {
  const provides = getCurrentInstance()?.appContext.provides as Record<symbol, unknown> | undefined
  if (provides) provideOn(provides, false)
}

/** Provide the mock on the Nuxt app, over what the base module's plugins provided. */
function provideOnNuxtApp(): void {
  const app = nuxtVueApp()
  if (app) provideOn(app._context.provides as Record<symbol, unknown>, true)
}

registry.activated.add(provideOnNuxtApp)
// This package reads its function tree under its own key, not through a base composable.
beforeApiRead.add(provideMockOnCurrentApp)
registry.reset.add(__resetUseBetterAuthForTests)
registry.reset.add(forgetLastSignIn)
// A mock made before this module loaded is provided now.
if (registry.active.value) provideOnNuxtApp()
