import type { LabelTree } from '../label-format.js'

/** `<UsageHistory>`: metered consumption. `title` is empty, as in `history`. `{unit}` is the meter's unit (see the `credits` group). */
const USAGE_LABELS = {
  title: '',
  units: '{count} {unit}',
  empty: 'No usage recorded yet.',
  loading: 'Loading…',
  newer: 'Newer',
  older: 'Older',
  pageLoading: 'Loading the page…',
} satisfies LabelTree

export default USAGE_LABELS
