import { useConvexNamespace } from 'nuxt-convex-module/client'

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
  const resolved = api ?? useConvexNamespace<T>(name)
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
