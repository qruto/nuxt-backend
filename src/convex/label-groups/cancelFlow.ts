import type { LabelTree } from '../label-format.js'

/**
 * `<CancelFlow>` (LIFECYCLE): cancelling takes one step, and a save offer
 * is one optional step. A question, at most one offer by its real terms,
 * and the end, with "Cancel my plan" on every screen and no guilt in the
 * words. `{plan}` is a plan's name, `{date}` a date in the reader's words.
 */
const CANCEL_FLOW_LABELS = {
  title: 'Cancel your plan',
  // The optional question, and the eight reasons the billing provider records.
  question: 'What is the main reason? (optional)',
  reasons: {
    too_expensive: 'Too expensive',
    missing_features: 'Missing features',
    switched_service: 'Switched to another service',
    unused: 'Not using it enough',
    customer_service: 'Customer service',
    low_quality: 'Quality was lower than expected',
    too_complex: 'Too complicated',
    other: 'Something else',
  },
  comment: 'Anything you want to tell us? (optional)',
  continue: 'Continue',
  cancel: 'Cancel my plan',
  canceling: 'Canceling…',
  // The one offer, by its kind.
  offerTitle: 'Before you go',
  offerPause: 'Pause {plan} for {count} month instead. It resumes by itself on {date}, and nothing is charged meanwhile. | Pause {plan} for {count} months instead. It resumes by itself on {date}, and nothing is charged meanwhile.',
  offerDowngrade: 'Switch to {plan} instead, from {date}, when this period ends.',
  offerDiscountRepeating: '{off} off for {count} month | {off} off for {count} months',
  offerDiscountOnce: '{off} off your next payment',
  offerDiscountForever: '{off} off for as long as you keep the plan',
  acceptPause: 'Pause instead',
  acceptDowngrade: 'Switch to {plan}',
  acceptDiscount: 'Keep my plan with this offer',
  accepting: 'Applying…',
  // The end.
  endsOn: 'Your plan ends on {date}.',
  endsPeriod: 'Your plan ends when the current period does.',
  endNote: 'Until then everything keeps working, and your credits stay yours to use.',
  keep: 'Keep my plan',
  keeping: 'Keeping…',
  kept: 'Your plan stays as it is.',
  close: 'Close',
  failed: 'That didn\'t work. Try again, or cancel in the billing portal.',
} satisfies LabelTree

export default CANCEL_FLOW_LABELS
