import { computed, defineComponent, h, ref, type PropType, type Ref, type VNodeChild } from 'vue'
import { type BillingOrder, formatBillingAmount, toBillingDate } from '../composables/use-billing'
import { useBackendConfig } from '../composables/use-backend-config'
import { useOrders, type UseOrdersReturn } from '../composables/use-orders'

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

/** A date the way the visitor writes dates; the raw string if it will not parse. */
function formatDate(value: unknown): string {
  const date = toBillingDate(value)
  if (!date) return typeof value === 'string' ? value : ''
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
  }
  catch {
    return date.toISOString().slice(0, 10)
  }
}

/**
 * The customer's past charges with their invoice links — every row read live
 * from the billing provider (this package stores no order ledger), so what
 * renders is what the provider will show on the invoice.
 *
 * Headless like `<PricingTable>`: semantic markup with `data-history`
 * attributes for styling, a slot for every region (each receives
 * {@link BillingHistorySlotContext}), and no copy that cannot be replaced
 * through `appConfig.backend.labels.history`.
 *
 * Renders its empty state — never an error — when billing is unconfigured or
 * the visitor is signed out, so it is safe to leave mounted in a settings page.
 *
 * @example
 * ```vue
 * <BillingHistory :limit="10" />
 * ```
 */
export const BillingHistory = defineComponent({
  name: 'BillingHistory',
  props: {
    title: { type: String, default: undefined },
    /** Charges per page. Default: the provider's own page size. */
    limit: { type: Number as PropType<number | undefined>, default: undefined },
    /** Render the per-order invoice link. Default `true`. */
    invoices: { type: Boolean, default: true },
    /** Open invoices in the same tab instead of a new one. */
    redirect: { type: Boolean, default: false },
  },
  emits: {
    invoice: (_url: string) => true,
    error: (_message: string) => true,
  },
  setup(props, { slots, emit }) {
    const orders = useOrders({ limit: () => props.limit })
    const config = useBackendConfig()
    const labels = { ...config.labels.history }

    const pending: Ref<string | null> = ref(null)
    const items = computed(() => orders.orders.value ?? [])

    async function invoice(orderId: string): Promise<void> {
      pending.value = orderId
      try {
        const url = await orders.invoice(orderId, { redirect: props.redirect })
        if (url) emit('invoice', url)
      }
      catch (failure) {
        const message = failure instanceof Error ? failure.message : 'Could not open the invoice'
        orders.error.value = message
        emit('error', message)
      }
      finally {
        pending.value = null
      }
    }

    const context = (): BillingHistorySlotContext => ({
      orders,
      items: items.value,
      isLoading: orders.isLoading.value,
      error: orders.error.value,
      pending: pending.value,
      invoice,
    })

    const orderRow = (order: BillingOrder): VNodeChild => {
      if (slots.order) return slots.order({ ...context(), order })
      const busy = pending.value === order.id
      // An invoice exists only once the provider finalized one; offering the
      // link before that would open a 404.
      const hasInvoice = props.invoices && order.isInvoiceGenerated !== false
      return h('article', { 'data-history': 'order', 'data-status': order.status, 'key': order.id }, [
        h('span', { 'data-history': 'order-date' }, formatDate(order.createdAt)),
        h('span', { 'data-history': 'order-description' }, order.product?.name ?? order.invoiceNumber ?? order.id),
        h('span', { 'data-history': 'order-amount' }, formatBillingAmount(order.totalAmount, order.currency)),
        h('span', { 'data-history': 'order-status' }, order.status),
        hasInvoice
          ? h('button', {
              'data-history': 'invoice',
              'type': 'button',
              'disabled': busy,
              'onClick': () => invoice(order.id),
            }, busy ? '…' : labels.invoice ?? 'Invoice')
          : null,
      ])
    }

    const pager = (): VNodeChild => {
      if (slots.pager) return slots.pager(context())
      if (!orders.hasMore.value && !orders.hasPrevious.value) return null
      return h('div', { 'data-history': 'pager' }, [
        h('button', {
          'data-history': 'newer',
          'type': 'button',
          'disabled': !orders.hasPrevious.value || orders.isLoading.value,
          'onClick': () => orders.previous(),
        }, labels.newer ?? 'Newer'),
        h('button', {
          'data-history': 'older',
          'type': 'button',
          'disabled': !orders.hasMore.value || orders.isLoading.value,
          'onClick': () => orders.next(),
        }, labels.older ?? 'Older'),
      ])
    }

    return () => {
      const ctx = context()
      const title = props.title ?? labels.title
      const loadingFirstPage = orders.isLoading.value && orders.orders.value === undefined
      return h('div', { 'data-history': 'root' }, [
        slots.header?.(ctx) ?? (title ? h('h2', { 'data-history': 'header' }, title) : null),
        loadingFirstPage
          ? slots.loading?.(ctx) ?? h('p', { 'data-history': 'loading' }, labels.loading ?? 'Loading…')
          : items.value.length === 0
            ? slots.empty?.(ctx) ?? h('p', { 'data-history': 'empty' }, labels.empty ?? 'No charges yet.')
            : h('div', { 'data-history': 'list' }, items.value.map(orderRow)),
        pager(),
        orders.error.value
          ? slots.error?.(ctx) ?? h('p', { 'data-history': 'error', 'role': 'alert' }, orders.error.value)
          : null,
        slots.footer?.(ctx) ?? null,
      ])
    }
  },
})
