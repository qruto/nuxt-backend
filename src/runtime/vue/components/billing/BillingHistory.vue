<script setup lang="ts">
import { computed, ref, useId, type Ref } from 'vue'
import { useLabels, type BackendLabels, type LabelOverrides } from '../../composables/use-labels'
import { useOrders } from '../../composables/use-orders'
import { usePageTurns } from '../../utils/page-turns'
import { VNodes } from '../../utils/vnodes'
import PagedList from '../shell/PagedList.vue'
import { type BillingHistorySlotContext, type BillingHistorySlots, provideBillingHistoryView } from './billing-history'

/**
 * The customer's past charges with their invoice links — every row read
 * live from the billing provider (this package stores no order ledger), so
 * what renders is what the provider will show on the invoice.
 *
 * Markup with `data-history` attributes, each charge a `BillingHistoryOrder`
 * part, a slot for every region (each receives {@link BillingHistorySlotContext}),
 * and its copy from the `history` labels. Renders its empty state — never an
 * error — when billing is unconfigured or the visitor is signed out, so it
 * is safe to leave mounted in a settings page.
 *
 * @example
 * ```vue
 * <BillingHistory :limit="10" />
 * ```
 */
defineOptions({ name: 'BillingHistory' })

const props = withDefaults(defineProps<{
  title?: string
  /** Charges per page. Default: the provider's own page size. */
  limit?: number
  /** Render the per-order invoice link. Default `true`. */
  invoices?: boolean
  /** Open invoices in the same tab instead of a new one. */
  redirect?: boolean
  /** Copy for this component, over `appConfig.backend.labels.history` and the translations. */
  labels?: LabelOverrides<BackendLabels['history']>
}>(), { title: undefined, limit: undefined, invoices: true, redirect: false, labels: undefined })

const emit = defineEmits({
  invoice: (_url: string) => true,
  error: (_message: string) => true,
})
const slots = defineSlots<BillingHistorySlots>()

const orders = useOrders({ limit: () => props.limit })
const labels = useLabels('history', () => props.labels)
const { t, errorMessage } = labels
const pending: Ref<string | null> = ref(null)
const items = computed(() => orders.orders.value ?? [])
const uid = useId()

async function invoice(orderId: string): Promise<void> {
  // A second press of the busy button does nothing; it keeps focus (`aria-disabled`).
  if (pending.value === orderId) return
  pending.value = orderId
  try {
    const url = await orders.invoice(orderId, { redirect: props.redirect })
    if (url) emit('invoice', url)
  }
  catch {
    // `orders.error` holds the failure the panel shows.
    emit('error', orders.error.value ? errorMessage(orders.error.value) : t('invoiceFailed'))
  }
  finally {
    pending.value = null
  }
}

const context = computed<BillingHistorySlotContext>(() => ({
  orders,
  items: items.value,
  isLoading: orders.isLoading.value,
  error: orders.error.value ? errorMessage(orders.error.value) : null,
  pending: pending.value,
  invoice,
}))
provideBillingHistoryView({ labels, context, invoices: () => props.invoices, partId: (key, part) => `${uid}-${key}-${part}` })

const pages = usePageTurns(orders, 'history')
// Busy while a page loads and while an invoice is being fetched.
const inFlight = computed(() => orders.isLoading.value || pages.turning.value !== null || pending.value !== null)
const firstLoad = computed(() => orders.isLoading.value && orders.orders.value === undefined)
const empty = computed(() => !firstLoad.value && items.value.length === 0 && orders.orders.value !== undefined && !orders.error.value)
const heading = computed(() => props.title ?? t('title'))
/** What the busy button waits for, read out by the status. */
const waitingFor = computed(() => (pending.value ? t('invoiceOpening') : pages.turning.value ? t('pageLoading') : ''))
</script>

<template>
  <div
    data-history="root"
    :aria-busy="inFlight ? 'true' : undefined"
  >
    <slot
      name="header"
      v-bind="context"
    >
      <h2
        v-if="heading"
        data-history="header"
      >
        {{ heading }}
      </h2>
    </slot>
    <!-- A polite loading note for the first page, a polite empty note once a read found none, and nothing after a failed read, which the alert explains. -->
    <PagedList
      :family="'history'"
      :slots="slots"
      :context="context"
      :items="items"
      :first-load="firstLoad"
      :empty="empty"
      :error="orders.error.value ? errorMessage(orders.error.value) : null"
      :status="waitingFor"
      :pages="pages"
      :words="{ loading: t('loading'), empty: t('empty'), newer: t('newer'), older: t('older'), pageLoading: t('pageLoading') }"
    >
      <template #item="{ item }">
        <VNodes
          v-if="slots.order"
          :nodes="slots.order({ ...context, order: item }) as never"
        />
        <BillingHistoryOrder
          v-else
          :order="item"
        />
      </template>
    </PagedList>
  </div>
</template>
