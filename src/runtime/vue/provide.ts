import { type App, hasInjectionContext, inject, type InjectionKey, provide } from 'vue'

/**
 * The consumer's generated Convex `api` object (`#backend/api`). Its exact shape
 * is app-specific, so it's kept loose here — composables and components cast the
 * namespaces they consume (`api.billing`, `api.email`, …) to the precise
 * `FunctionReference` types they expect.
 */
export type BackendApi = Record<string, Record<string, unknown>>

export const BackendApiKey: InjectionKey<BackendApi> = Symbol('nuxt-backend:api')

/**
 * Make the generated Convex `api` available to every `nuxt-backend` composable
 * and component, so `useBilling()`, `<CheckoutLink>`, `useEmailStatus()`, … work
 * with zero arguments.
 *
 * The packaged Nuxt plugin calls this automatically with `#backend/api`. Call it
 * yourself (e.g. with a custom `api`) only to override that default — pass the
 * Nuxt `vueApp` so the binding is available during SSR too:
 *
 * ```ts
 * export default defineNuxtPlugin((nuxtApp) => {
 *   provideBackendApi(api, nuxtApp.vueApp)
 * })
 * ```
 */
export function provideBackendApi(api: BackendApi, app?: App): void {
  if (app) app.provide(BackendApiKey, api)
  else provide(BackendApiKey, api)
}

/**
 * The injected generated `api`, or `undefined` when it hasn't been provided
 * (e.g. outside a setup context, or before Convex codegen has run). Prefer
 * {@link useBackendNamespace} for feature access.
 */
export function useBackendApi(): BackendApi | undefined {
  if (!hasInjectionContext()) return undefined
  return inject(BackendApiKey, undefined)
}

/**
 * The named function group from the generated `api` (e.g. `'billing'`,
 * `'email'`), or `undefined` when billing/email isn't scaffolded — letting the
 * feature degrade to a graceful no-op rather than throwing.
 *
 * @typeParam T - The expected shape of the namespace's function references.
 */
export function useBackendNamespace<T = Record<string, unknown>>(name: string): T | undefined {
  const api = useBackendApi()
  const namespace = api?.[name]
  return namespace as T | undefined
}
