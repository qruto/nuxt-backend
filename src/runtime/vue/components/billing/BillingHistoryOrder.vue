<script setup lang="ts">
import { computed } from 'vue'
import { busyAttributes } from '../../a11y'
import { formatBillingDate } from '../../composables/billing-format'
import { formatBillingAmount } from '../../composables/use-billing'
import { valueLabel } from '../../composables/use-labels'
import type { BillingHistoryOrderProps } from '../../parts'
import { useBillingHistoryView } from './billing-history'

/** One charge of `<BillingHistory>`: its date, description, amount and status, and its invoice once the provider finalized one. */
defineOptions({ name: 'BillingHistoryOrder' })
const props = defineProps<BillingHistoryOrderProps>()
const view = useBillingHistoryView('BillingHistoryOrder')
const { labels } = view
const { t, locale } = labels
const busy = computed(() => view.context.value.pending === props.order.id)
// An invoice exists only once the provider finalized one; offering the link before that would open a 404.
const hasInvoice = computed(() => view.invoices() && props.order.isInvoiceGenerated !== false)
// The row is named by its date and charge, which describe its invoice button too.
const dateId = computed(() => view.partId(props.order.id, 'date'))
const descriptionId = computed(() => view.partId(props.order.id, 'description'))
const named = computed(() => `${dateId.value} ${descriptionId.value}`)
</script>

<template>
  <article
    data-history="order"
    :data-status="order.status"
    :aria-labelledby="named"
  >
    <span
      :id="dateId"
      data-history="order-date"
    >{{ formatBillingDate(order.createdAt, { dateStyle: 'medium' }, locale) }}</span>
    <span
      :id="descriptionId"
      data-history="order-description"
    >{{ order.product?.name ?? order.invoiceNumber ?? order.id }}</span>
    <span data-history="order-amount">{{ formatBillingAmount(order.totalAmount, order.currency, locale) }}</span>
    <span data-history="order-status">{{ valueLabel(labels, 'history', 'statuses', order.status) }}</span>
    <button
      v-if="hasInvoice"
      data-history="invoice"
      type="button"
      v-bind="busyAttributes(busy)"
      :aria-describedby="named"
      @click="view.context.value.invoice(order.id)"
    >
      {{ busy ? t('invoiceOpening') : t('invoice') }}
    </button>
  </article>
</template>
