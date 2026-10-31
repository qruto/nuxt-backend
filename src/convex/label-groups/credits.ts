import type { LabelTree } from '../label-format.js'

/** The low-credits notice of `<BackendNotices>`. `low` takes the balance as `{balance}`, which is also its plural count. */
const CREDITS_LABELS = {
  low: '{balance} credit left. | {balance} credits left.',
  topUp: 'Top up',
  // The action that buys the pack preselected for the shortfall.
  topUpPack: 'Buy {pack}',
  toppingUp: 'Opening checkout…',
  topUpFailed: 'Could not start the top-up',
  dismiss: 'Dismiss',
} satisfies LabelTree

export default CREDITS_LABELS
