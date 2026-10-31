import type { LabelTree } from '../label-format.js'

/** `<UsageHistory>`: metered consumption. `title` is empty, as in `history`. */
const USAGE_LABELS = {
  title: '',
  units: '{count} credit | {count} credits',
  empty: 'No usage recorded yet.',
  loading: 'Loading…',
  newer: 'Newer',
  older: 'Older',
  pageLoading: 'Loading the page…',
} satisfies LabelTree

export default USAGE_LABELS
