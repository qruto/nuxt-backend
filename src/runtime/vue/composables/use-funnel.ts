import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, inject, ref, type Ref } from 'vue'
import { ConvexAuthStateKey } from 'nuxt-convex-module/client'
import { type FunnelReport, weekOf } from '../../../convex/funnel-rules'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'

export type { FunnelReport } from '../../../convex/funnel-rules'

/** The windows the Growth view offers, in weeks; the second is the default. */
export const FUNNEL_WINDOWS = [4, 12, 26] as const

/** One of {@link FUNNEL_WINDOWS}. */
export type FunnelWindow = typeof FUNNEL_WINDOWS[number]

/** The function of `admin.api` the Growth view reads. */
export interface FunnelApiRefs {
  getFunnel?: FunctionReference<'query', 'public', { weeks: number, until?: number }, FunnelReport>
}

export interface UseFunnelOptions {
  /** Override the injected `api.admin` namespace. */
  api?: FunnelApiRefs
  /** The window to open on, in weeks. Default 12. */
  weeks?: FunnelWindow
}

export interface UseFunnelReturn {
  /** The window in weeks: set it to read another. */
  weeks: Ref<FunnelWindow>
  /** The funnel over the window, live; `undefined` until it is read. */
  report: ComputedRef<FunnelReport | undefined>
  /** `true` while the first read is on its way. */
  isLoading: ComputedRef<boolean>
  /** Why the read failed, else `null`: `forbidden` for a caller who is no administrator. */
  error: ComputedRef<BackendError | null>
}

/**
 * The admin console's Growth view, as data: the funnel over the last 4, 12
 * or 26 weeks up to this week, through `backend/admin.ts`'s `getFunnel`,
 * which answers administrators in person only. Live: a sign-up shows as it
 * is recorded. The week it ends on is this one, read from the browser's
 * clock once, so the server's read stays a pure function of the data.
 *
 * @internal
 */
export function useFunnel(options: UseFunnelOptions = {}): UseFunnelReturn {
  const api = useBackendNamespace<FunnelApiRefs>('admin', 'useFunnel', options.api)
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)
  const weeks = ref<FunnelWindow>(options.weeks ?? FUNNEL_WINDOWS[1])
  const until = weekOf(Date.now())
  const read = api.getFunnel
    ? useLiveQuery(api.getFunnel, () => (signedOut.value ? 'skip' : { weeks: weeks.value, until }))
    : absentQuery<FunnelReport>()
  return {
    weeks,
    report: computed(() => (signedOut.value ? undefined : read.data.value ?? undefined)),
    isLoading: computed(() => !signedOut.value && read.isLoading.value),
    error: computed(() => (signedOut.value ? null : read.error.value)),
  }
}
