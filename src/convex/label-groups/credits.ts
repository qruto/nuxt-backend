import type { LabelTree } from '../label-format.js'

/**
 * The low-credits notice of `<BackendNotices>`, and the unit every billing
 * label names. `low` takes the balance as `{balance}`. `{unit}`, here and
 * in the `usage`, `settings` and `pricing` groups, is the meter's unit in
 * the form its count takes: the catalog's (`meters.<key>.unit`), else
 * `unit` below.
 */
const CREDITS_LABELS = {
  low: '{balance} {unit} left.',
  // A meter's unit when the catalog names none: its word for each plural
  // category (`few` and `many` for the languages that have them), and as a heading.
  unit: {
    one: 'credit',
    few: 'credits',
    many: 'credits',
    other: 'credits',
  },
  unitTitle: 'Credits',
  topUp: 'Top up',
  // The action that buys the pack preselected for the shortfall.
  topUpPack: 'Buy {pack}',
  toppingUp: 'Opening checkout…',
  topUpFailed: 'Could not start the top-up',
  dismiss: 'Dismiss',
} satisfies LabelTree

export default CREDITS_LABELS
