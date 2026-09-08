import { computed, inject, toValue, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'
import { useAction, ConvexAuthStateKey } from 'nuxt-convex-module/client'
import { useBackendNamespace } from '../utils/namespace'
import { type BillingApi, createProviderPager, type UsageEvent } from './use-billing'

export interface UseUsageOptions {
  /**
   * Which meter's history to read (reactive): a configured credit-meter name
   * (`'credits'`) or a raw meter id. Omit for every metered event.
   */
  meter?: MaybeRefOrGetter<string | undefined>
  /** Override the injected `api.billing` namespace. */
  api?: BillingApi
  /** Events per page (reactive). Defaults to the provider's own page size. */
  limit?: MaybeRefOrGetter<number | undefined>
  /** Load the first page on mount. Default `true`. */
  immediate?: boolean
}

export interface UseUsageReturn {
  /** The current page of usage events — `undefined` until the first load. */
  events: Ref<UsageEvent[] | undefined>
  /** The page being shown; provider page numbers start at 1. */
  page: Ref<number>
  /** Total events across all pages, when the provider reported it. */
  total: ComputedRef<number | undefined>
  /** Number of pages, when the provider reported it. */
  pageCount: ComputedRef<number | undefined>
  /** Units consumed on the page in view, when the events carry them. */
  units: ComputedRef<number | undefined>
  /** Whether a further page exists. */
  hasMore: ComputedRef<boolean>
  /** Whether an earlier page exists. */
  hasPrevious: ComputedRef<boolean>
  /** Whether a load is in flight. */
  isLoading: ComputedRef<boolean>
  /** Message of the last failed load, `null` otherwise. Loads never reject. */
  error: Ref<string | null>
  /** Reload the current page. */
  refresh: () => Promise<void>
  /** Load the next page (no-op at the end). */
  next: () => Promise<void>
  /** Load the previous page (no-op on page 1). */
  previous: () => Promise<void>
  /** Jump to a page number. */
  goTo: (page: number) => Promise<void>
}

/**
 * Consumption history for a credit meter, read from the provider's events API
 * — the events your server ingested when it spent credits. There is no local
 * usage ledger by design (`useCredits()` reads the balance cache; this reads
 * the history), so what renders here is exactly what the provider metered.
 *
 * Degrades all the way down: signed-out visitors and backends without
 * `getUsageHistory` get an empty list rather than an error, and a failed load
 * lands in `error` instead of rejecting. Loads happen in the browser only;
 * changing `meter` or `limit` reloads from the first page.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const usage = useUsage({ meter: 'credits', limit: 20 })
 * </script>
 * <template>
 *   <p v-for="event in usage.events.value" :key="event.id">
 *     {{ event.timestamp }} — {{ event.name }} ({{ event.units }})
 *   </p>
 * </template>
 * ```
 */
export function useUsage(options: UseUsageOptions = {}): UseUsageReturn {
  const billing = useBackendNamespace<BillingApi>('billing', 'useUsage', options.api)

  // Usage is customer-scoped: the server resolves the billing entity from the
  // caller's identity, so a signed-out visitor has nothing to fetch.
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth != null && !auth.isAuthenticated.value)

  const runUsage = billing.getUsageHistory ? useAction(billing.getUsageHistory) : null

  const pager = createProviderPager<UsageEvent>(
    runUsage && (args => runUsage({ meter: toValue(options.meter), page: args.page, limit: args.limit })),
    {
      limit: options.limit,
      immediate: options.immediate,
      enabled: () => !signedOut.value,
      watchSources: () => toValue(options.meter),
    },
  )

  return {
    events: pager.items,
    page: pager.page,
    total: pager.total,
    pageCount: pager.pageCount,
    // Only meaningful once the server resolved units per event; a page of
    // events without them stays `undefined` rather than reporting a false 0.
    units: computed(() => {
      const events = pager.items.value
      if (!events?.some(event => typeof event.units === 'number')) return undefined
      return events.reduce((sum, event) => sum + (event.units ?? 0), 0)
    }),
    hasMore: pager.hasMore,
    hasPrevious: pager.hasPrevious,
    isLoading: pager.isLoading,
    error: pager.error,
    refresh: pager.refresh,
    next: pager.next,
    previous: pager.previous,
    goTo: pager.goTo,
  }
}
