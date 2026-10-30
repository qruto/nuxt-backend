import type { LabelTree } from '../label-format.js'

/** The past-due notice of `<BackendNotices>` (LIFECYCLE), for the billing managers while a renewal payment is retried. */
const PAST_DUE_LABELS = {
  // The banner's accessible name.
  label: 'Payment failed',
  message: 'Your last payment failed. The plan keeps working while it is retried; update the payment method to keep it.',
  action: 'Update payment method',
  opening: 'Opening…',
} satisfies LabelTree

export default PAST_DUE_LABELS
