import { inject, provide, type ComputedRef, type InjectionKey } from 'vue'
import type { BillingOrder } from '../../composables/use-billing'
import type { UseLabelsReturn } from '../../composables/use-labels'
import type { UseOrdersReturn } from '../../composables/use-orders'

export interface BillingHistorySlotContext {
  orders: UseOrdersReturn
  /** The page of charges in view (empty while loading or when there are none). */
  items: BillingOrder[]
  isLoading: boolean
  error: string | null
  /** Id of the order whose invoice is being fetched, `null` when idle. */
  pending: string | null
  /** Fetch and open an order's invoice. */
  invoice: (orderId: string) => Promise<void>
}

/** `<BillingHistory>`'s slots, one per region; each receives {@link BillingHistorySlotContext}. */
export interface BillingHistorySlots {
  /** Above the list: replaces the heading. */
  header: (context: BillingHistorySlotContext) => unknown
  /** While the first page loads. */
  loading: (context: BillingHistorySlotContext) => unknown
  /** When there is no charge to show. */
  empty: (context: BillingHistorySlotContext) => unknown
  /** One charge, with the order it renders. */
  order: (context: BillingHistorySlotContext & { order: BillingOrder }) => unknown
  /** The newer and older buttons. */
  pager: (context: BillingHistorySlotContext) => unknown
  /** Why the history could not be read, or why an invoice did not open. */
  error: (context: BillingHistorySlotContext) => unknown
  /** Below everything. */
  footer: (context: BillingHistorySlotContext) => unknown
}

/** What `<BillingHistory>` hands `BillingHistoryOrder` beside the order. */
export interface BillingHistoryView {
  labels: UseLabelsReturn<'history'>
  context: ComputedRef<BillingHistorySlotContext>
  /** Whether a row offers its invoice. */
  invoices: () => boolean
  /** The id of one part of a row, unique to this instance. */
  partId: (key: string, part: string) => string
}

const HISTORY_VIEW: InjectionKey<BillingHistoryView> = Symbol('nuxt-backend:billing-history')

/** @internal */
export function provideBillingHistoryView(view: BillingHistoryView): void {
  provide(HISTORY_VIEW, view)
}

/** @internal */
export function useBillingHistoryView(part: string): BillingHistoryView {
  const view = inject(HISTORY_VIEW, null)
  if (!view) throw new Error(`[nuxt-backend] <${part}> renders inside <BillingHistory>. To build one of your own, use useOrders().`)
  return view
}
