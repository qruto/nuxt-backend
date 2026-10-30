import type { LabelTree } from '../label-format.js'

/**
 * `<BillingHistory>`: past charges and their invoice links. `title` is empty,
 * so the component renders no heading until an app sets one.
 */
const HISTORY_LABELS = {
  title: '',
  invoice: 'Invoice',
  invoiceOpening: 'Opening the invoice…',
  invoiceFailed: 'Could not open the invoice',
  // An order's status, as the billing provider names it; another one shows as it came.
  statuses: {
    pending: 'Pending',
    paid: 'Paid',
    refunded: 'Refunded',
    partially_refunded: 'Partly refunded',
  },
  empty: 'No charges yet.',
  loading: 'Loading…',
  newer: 'Newer',
  older: 'Older',
  // What the pressed pager button says while its page loads.
  pageLoading: 'Loading the page…',
} satisfies LabelTree

export default HISTORY_LABELS
