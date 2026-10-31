import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, inject, ref, type Ref, watch } from 'vue'
import { useAsyncState } from '@vueuse/core'
import { ConvexAuthStateKey, useConvex } from 'nuxt-convex-module/client'
import type { RevenueInterval, RevenueReport } from '../../../convex/integrations/billing/types/revenue'
import { type BackendError, failureOf } from '../utils/backend-error'
import { useBackendNamespace } from '../utils/namespace'

/** The windows the Revenue view offers, in days; the first is the default. */
export const REVENUE_WINDOWS = [30, 90, 365] as const

/** One of {@link REVENUE_WINDOWS}. */
export type RevenueWindow = typeof REVENUE_WINDOWS[number]

/** The function of `billing.api` the Revenue view reads. */
export interface RevenueApiRefs {
  getRevenue?: FunctionReference<'action', 'public', { since: number, until?: number, interval?: RevenueInterval }, RevenueReport>
}

export interface UseRevenueOptions {
  /** Override the injected `api.billing` namespace. */
  api?: RevenueApiRefs
  /** The window to open on, in days. Default 30. */
  days?: RevenueWindow
  /** How the periods are cut. Default: by day for 30 days, by week for 90, by month for a year. */
  interval?: RevenueInterval
}

export interface UseRevenueReturn {
  /** The window in days: set it to read another. */
  days: Ref<RevenueWindow>
  /** How the periods are cut: set it to read again. */
  interval: Ref<RevenueInterval>
  /** The provider's metrics over the window, as of the last read; `undefined` until one answered. */
  report: ComputedRef<RevenueReport | undefined>
  /** `true` while a read is on its way. */
  isLoading: ComputedRef<boolean>
  /** Why the last read failed, else `null`: `forbidden` for a caller who is no administrator, `unavailable` when the provider refused. */
  error: ComputedRef<BackendError | null>
  /** Read the window again. */
  refresh: () => Promise<void>
}

const DAY_MS = 24 * 60 * 60 * 1000

/** The interval that suits a window: days for a month, weeks for a quarter, months for a year. */
export function revenueInterval(days: RevenueWindow): RevenueInterval {
  return days <= 30 ? 'day' : days <= 90 ? 'week' : 'month'
}

/**
 * The first moment of the window that ends today: its first UTC day's
 * start. Fixed for the day, so a read for the same window asks the same.
 */
export function revenueWindowStart(days: number, now = Date.now()): number {
  return now - (now % DAY_MS) - (days - 1) * DAY_MS
}

/**
 * The admin console's Revenue view, as data: the billing provider's metrics
 * over the last 30, 90 or 365 days, through `backend/billing.ts`'s
 * `getRevenue`, which answers administrators in person only. A read, not a
 * subscription: it runs when the view opens, when the window or the
 * interval changes and on `refresh()`, each one a call to the provider.
 *
 * @internal
 */
export function useRevenue(options: UseRevenueOptions = {}): UseRevenueReturn {
  const api = useBackendNamespace<RevenueApiRefs>('billing', 'useRevenue', options.api)
  const auth = inject(ConvexAuthStateKey, null)
  // The browser's client: the server renders the view without a read.
  const convex = import.meta.client ? useConvex() : null
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)
  const days = ref<RevenueWindow>(options.days ?? REVENUE_WINDOWS[0])
  const interval = ref<RevenueInterval>(options.interval ?? revenueInterval(days.value))
  // The last read's answer stays while the next one is on its way.
  const read = useAsyncState(
    async (): Promise<RevenueReport | undefined> => (convex && api.getRevenue && !signedOut.value ? await convex.action(api.getRevenue, { since: revenueWindowStart(days.value), interval: interval.value }) : undefined),
    undefined,
    { immediate: false, resetOnExecute: false, onError: () => {} },
  )
  const refresh = async () => {
    await read.execute()
  }
  // A new window takes the interval that suits it; changing either reads again.
  watch(days, (value) => {
    interval.value = revenueInterval(value)
  })
  watch([days, interval, signedOut], refresh, { immediate: true })

  return {
    days,
    interval,
    report: computed(() => (signedOut.value ? undefined : read.state.value)),
    isLoading: computed(() => !signedOut.value && read.isLoading.value),
    error: computed(() => (signedOut.value || read.error.value === undefined ? null : failureOf(read.error.value))),
    refresh,
  }
}
