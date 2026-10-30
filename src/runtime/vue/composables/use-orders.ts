import { computed, inject, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'
import { useAction, ConvexAuthStateKey } from 'nuxt-convex-module/client'
import { useActionState } from '../utils/action-state'
import type { BackendError } from '../utils/backend-error'
import { useBackendNamespace } from '../utils/namespace'
import { openProviderUrl } from '../utils/open-url'
import { type BillingApi, type BillingOrder, createProviderPager } from './use-billing'
import { notConfigured } from './billing-provider'

export interface UseOrdersOptions {
  /** Override the injected `api.billing` namespace. */
  api?: BillingApi
  /** Orders per page (reactive). Defaults to the provider's own page size. */
  limit?: MaybeRefOrGetter<number | undefined>
  /** Load the first page on mount. Default `true`. */
  immediate?: boolean
}

/** Per-call options for {@link UseOrdersReturn.invoice}. */
export interface InvoiceOptions {
  /** Open the invoice in the same tab instead of a new one. */
  redirect?: boolean
  /** Return the URL without opening it. */
  open?: boolean
}

export interface UseOrdersReturn {
  /** The current page of past charges — `undefined` until the first load. */
  orders: Ref<BillingOrder[] | undefined>
  /** The page being shown; provider page numbers start at 1. */
  page: Ref<number>
  /**
   * Total orders across all pages, when the provider reported it: the
   * provider's count, which includes the subscription orders that charged
   * nothing (a free plan's cycle) the pages leave out.
   */
  total: ComputedRef<number | undefined>
  /** Number of pages, when the provider reported it (counting those orders too: a page may list fewer than `limit`). */
  pageCount: ComputedRef<number | undefined>
  /** Whether a further page exists. */
  hasMore: ComputedRef<boolean>
  /** Whether an earlier page exists. */
  hasPrevious: ComputedRef<boolean>
  /** Whether a load is in flight. */
  isLoading: ComputedRef<boolean>
  /** `true` while `invoice` runs. */
  isPending: ComputedRef<boolean>
  /** Why the last `invoice` failed, else why the last load failed, else `null`. Loads never reject. */
  error: ComputedRef<BackendError | null>
  /** Reload the current page. */
  refresh: () => Promise<void>
  /** Load the next page (no-op at the end). */
  next: () => Promise<void>
  /** Load the previous page (no-op on page 1). */
  previous: () => Promise<void>
  /** Jump to a page number. */
  goTo: (page: number) => Promise<void>
  /**
   * Fetch the invoice link for an order and open it, returning the URL
   * (`null` when the provider has no invoice for that order yet). Rejects on
   * failure, which `error` also holds, and when the backend does not export
   * `getInvoiceUrl`.
   */
  invoice: (orderId: string, options?: InvoiceOptions) => Promise<string | null>
}

/**
 * The signed-in customer's billing history — past charges straight from the
 * provider's orders API, plus the per-order invoice link. Nothing is mirrored
 * locally: this package keeps no order ledger, so the list is always what the
 * provider says it is.
 *
 * Degrades all the way down: signed-out visitors and backends that have not
 * deployed `getOrders` get an empty list rather than an error, and a failed
 * load lands in `error` instead of rejecting (this is usually rendered by a
 * permanently mounted panel). Loads happen in the browser only. `invoice` is
 * an action: it rejects on failure and mirrors it into `error`.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const orders = useOrders({ limit: 10 })
 * </script>
 * <template>
 *   <p v-for="order in orders.orders.value" :key="order.id">
 *     {{ order.createdAt }} — {{ order.totalAmount / 100 }} {{ order.currency }}
 *     <button @click="orders.invoice(order.id)">Invoice</button>
 *   </p>
 * </template>
 * ```
 */
export function useOrders(options: UseOrdersOptions = {}): UseOrdersReturn {
  const billing = useBackendNamespace<BillingApi>('billing', 'useOrders', options.api)

  // Orders are customer-scoped: the server resolves the billing entity from
  // the caller's identity, so a signed-out visitor has nothing to fetch.
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth != null && !auth.isAuthenticated.value)

  const runOrders = billing.getOrders ? useAction(billing.getOrders) : null
  const runInvoice = billing.getInvoiceUrl ? useAction(billing.getInvoiceUrl) : null

  const { isPending, failure, run } = useActionState(() => signedOut.value)
  const pager = createProviderPager<BillingOrder>(
    runOrders && (args => runOrders({ page: args.page, limit: args.limit })),
    { limit: options.limit, immediate: options.immediate, enabled: () => !signedOut.value },
  )

  return {
    orders: pager.items,
    page: pager.page,
    total: pager.total,
    pageCount: pager.pageCount,
    hasMore: pager.hasMore,
    hasPrevious: pager.hasPrevious,
    isLoading: pager.isLoading,
    isPending,
    error: computed(() => failure.value ?? pager.error.value),
    refresh: pager.refresh,
    next: pager.next,
    previous: pager.previous,
    goTo: pager.goTo,
    invoice: (orderId, opts = {}) => run(async () => {
      if (!runInvoice) notConfigured('invoice')
      const result = await runInvoice({ orderId })
      const url = result?.url ?? null
      // Invoices are a deliberate click, so opening is the default; `open:
      // false` hands the URL back for a download link or a custom viewer.
      if (url && (opts.open ?? true)) openProviderUrl(url, opts.redirect)
      return url
    }),
  }
}
