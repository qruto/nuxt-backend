import { type App, hasInjectionContext, inject, type InjectionKey } from 'vue'

/**
 * The app's generated function tree (`#backend/api`). Its shape is the app's
 * own, so it stays loose here: each composable casts the namespace it reads
 * (`api.billing`, `api.flags`, …) to the references it expects.
 *
 * @internal
 */
export type BackendApi = Record<string, Record<string, unknown>>

/**
 * Where the generated `api` is provided. The base module provided it until
 * 0.12; this package now provides it itself (the `nuxt-backend-provide-api`
 * plugin) and the test utilities provide their mock under it.
 *
 * @internal
 */
export const BackendApiKey: InjectionKey<BackendApi> = Symbol('nuxt-backend:api')

/**
 * Run before the `api` is read. The test utilities register here to provide
 * their mock on the calling component's app, as a plain `mount()` needs.
 *
 * @internal
 */
export const beforeApiRead = new Set<() => void>()

/**
 * Provide the generated `api` app-wide. The packaged plugin calls it with
 * `#backend/api` once codegen exists, and with the top-level names codegen
 * listed. Codegen's runtime `api` (`anyApi`) answers every name, so a
 * composable whose file the app doesn't have would call functions the
 * deployment lacks. With the names, any other namespace reads `undefined`,
 * and each composable falls back as it does for a missing file.
 *
 * @internal
 */
export function provideBackendApi(api: BackendApi, app: App, modules?: readonly string[]): void {
  app.provide(BackendApiKey, modules ? declaredOnly(api, new Set(modules)) : api)
}

/** The `api` with only the given top-level namespaces: any other name reads `undefined`. */
function declaredOnly(api: BackendApi, modules: ReadonlySet<string>): BackendApi {
  return new Proxy(api, {
    get: (target, key, receiver) => (typeof key === 'string' && !modules.has(key) ? undefined : Reflect.get(target, key, receiver)),
    has: (target, key) => (typeof key === 'string' ? modules.has(key) : Reflect.has(target, key)),
  })
}

/**
 * One namespace of the provided `api` (`'billing'`), or `undefined` outside a
 * setup context, before codegen, or when the app has no such file.
 *
 * @internal
 */
export function useApiNamespace<T = Record<string, unknown>>(name: string): T | undefined {
  if (!hasInjectionContext()) return undefined
  for (const hook of beforeApiRead) hook()
  return inject(BackendApiKey, undefined)?.[name] as T | undefined
}

const warned = new Set<string>()

/**
 * Resolve a scaffolded `backend/<name>.ts` function namespace, warning once
 * per namespace in dev when it is missing. Composables bind to the scaffolded
 * files by name — renaming `backend/billing.ts` (or trimming its exports)
 * otherwise degrades `useBilling()` to silent undefineds with nothing in the
 * console. `nuxt-backend doctor` performs the deployment-side version of this
 * check against the required export contract.
 */
export function useBackendNamespace<T>(name: string, composable: string, api?: T): T {
  const resolved = api ?? useApiNamespace<T>(name)
  if (resolved === undefined && import.meta.dev && !warned.has(name)) {
    warned.add(name)
    console.warn(
      `[nuxt-backend] ${composable}() found no \`${name}\` function namespace. `
      + `Expected backend/${name}.ts with its scaffolded exports deployed — restore it with \`npx nuxt-backend init\` `
      + `(or pass { api } explicitly). Until then its queries stay undefined and its actions throw.`,
    )
  }
  return (resolved ?? {}) as T
}
