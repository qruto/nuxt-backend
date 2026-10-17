import type { FunctionArgs, FunctionReference, FunctionReference_future, FunctionReturnType } from 'convex/server'
import { computed, isRef, toValue, watch, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { useQuery_experimental } from 'nuxt-convex-module/client'
import { type BackendError, failureOf, isUnexpected } from './backend-error'

/**
 * Whether the development-only diagnostics run: `import.meta.dev`, read
 * once. A flag on an object so the tests can turn them on.
 */
export const diagnostics = { enabled: Boolean(import.meta.dev) }

/** A live query as composable state. */
export interface LiveQuery<T> {
  /** The result: `undefined` until the first read lands, while skipped, and after a failed read. */
  data: ComputedRef<T | undefined>
  /** `true` until the first read for the current arguments lands; `false` while skipped. */
  isLoading: ComputedRef<boolean>
  /** Why the read failed (see `failureOf`), or `null`. */
  error: ComputedRef<BackendError | null>
}

/**
 * Subscribe to a query the way every data composable reads: the result, the
 * loading flag and the failure as three refs, so a refused or crashed query
 * shows in `error` and never throws out of a render. In development a
 * failure without a catalog code (a crash, an app's own error) is also
 * logged with its original error, once per distinct failure, since `error`
 * words it for a person.
 */
export function useLiveQuery<Query extends FunctionReference<'query'> | FunctionReference_future<'query'>>(
  query: Query,
  args: MaybeRefOrGetter<FunctionArgs<Query> | 'skip'>,
): LiveQuery<FunctionReturnType<Query>> {
  const skipped = computed(() => toValue(args) === 'skip')
  const state = useQuery_experimental({ query, args })
  const error = computed(() => (state.value.status === 'error' ? failureOf(state.value.error) : null))

  if (diagnostics.enabled) {
    const logged = new Set<string>()
    watch(error, (failure) => {
      if (!failure || !isUnexpected(failure)) return
      const original = (failure as { cause?: unknown }).cause
      const key = original instanceof Error ? original.message : String(original)
      if (logged.has(key)) return
      logged.add(key)
      console.error('[nuxt-backend] query failed:', original)
    }, { immediate: true })
  }

  return {
    data: computed(() => (state.value.status === 'success' ? state.value.data : undefined)),
    isLoading: computed(() => !skipped.value && state.value.status === 'pending'),
    error,
  }
}

/** The state of a query a backend does not export: never loading, never failing, no data. */
export function absentQuery<T>(): LiveQuery<T> {
  return {
    data: computed<T | undefined>(() => undefined),
    isLoading: computed(() => false),
    error: computed(() => null),
  }
}

/**
 * Warn in development when a composable that takes an options object is
 * handed a bare value, ref or getter: the call shape before the options
 * object, which would otherwise read as paused with no hint why.
 */
export function warnCallShape(composable: string, options: unknown, example: string): void {
  if (!diagnostics.enabled) return
  const plain = typeof options === 'object' && options !== null && !isRef(options) && !Array.isArray(options)
  if (!plain) console.warn(`[nuxt-backend] ${composable}() takes an options object, such as ${example}.`)
}
