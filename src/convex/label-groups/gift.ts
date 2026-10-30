import type { LabelTree } from '../label-format.js'

/** The gift notice of `<BackendNotices>`, and the gifts page. */
const GIFT_LABELS = {
  // The gifts page and `<GiftList>`.
  title: 'Gifts',
  description: 'Gifts you sent and gifts for you.',
  loading: 'Loading gifts…',
  receivedTitle: 'Received',
  sentTitle: 'Sent',
  receivedEmpty: 'No gifts for you yet.',
  sentEmpty: 'You have not sent a gift yet.',
  // What a gift is: a pack by its name, a plan pass by its length.
  itemPack: '{name}',
  itemPass: '{count} month of {plan} | {count} months of {plan}',
  from: 'From {sender}',
  to: 'To {recipient}',
  sentOn: 'Sent {date}',
  deliverOn: 'Arrives {date}',
  deliveredOn: 'Delivered {date}',
  claimedOn: 'Received {date}',
  status: {
    scheduled: 'Scheduled',
    delivered: 'Waiting for them',
    claimed: 'Received',
    refunded: 'Refunded',
    paid: 'Waiting for you',
  },
  // Where a gift goes when the person manages more than one workspace.
  claimInto: 'Receive into',
  personalWorkspace: 'My personal workspace',
  resend: 'Send the notice again',
  resending: 'Sending…',
  resent: 'The notice was sent again.',
  changeRecipient: 'Change recipient',
  newRecipient: 'New recipient’s email',
  saveRecipient: 'Save recipient',
  savingRecipient: 'Saving…',
  recipientChanged: 'The gift now goes to the new address.',
  reschedule: 'Change the date',
  newDate: 'New delivery date',
  saveDate: 'Save date',
  savingDate: 'Saving…',
  rescheduled: 'The delivery date changed.',
  cancel: 'Cancel and refund',
  canceling: 'Refunding…',
  canceled: 'The gift was canceled and refunded.',
  cancelHint: 'Canceling refunds the purchase in full. A claimed gift cannot be canceled.',
  actionFailed: 'That did not work',

  received: '{sender} sent you a gift.',
  receivedWithMessage: '{sender} sent you a gift: “{message}”',
  // The sender's name when the purchase carried none.
  someone: 'Someone',
  claim: 'Receive gift',
  claiming: 'Receiving…',
  // Announced once a claim went through.
  claimed: 'Gift received. The credits arrive in a moment.',
  claimFailed: 'Could not receive the gift',
} satisfies LabelTree

export default GIFT_LABELS
