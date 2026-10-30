import type { LabelTree } from '../label-format.js'

/**
 * `<WithdrawalButton>` (LIFECYCLE): the EU withdrawal function of Art. 11a,
 * labelled as the law asks, with its confirm step. `{date}` is a date in the
 * reader's words, `{at}` a date and time.
 */
const WITHDRAWAL_LABELS = {
  button: 'Withdraw from contract here',
  period: 'You can withdraw from {plan} until {date}.',
  confirmTitle: 'Withdraw from your {plan} purchase?',
  confirmText: 'Your plan ends now. We email you a receipt, and refund what is due.',
  confirm: 'Confirm withdrawal',
  confirming: 'Withdrawing…',
  back: 'Go back',
  done: 'We received your withdrawal on {at}. A receipt is on its way to your email.',
  failed: 'The withdrawal did not go through. Try again.',
} satisfies LabelTree

export default WITHDRAWAL_LABELS
