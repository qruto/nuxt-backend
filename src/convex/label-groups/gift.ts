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
  // The gift form (`<GiftForm>`, on the gifts page): a credit pack or a plan
  // pass, for whom, with a note and a delivery day, then the purchaser's checkout.
  formTitle: 'Send a gift',
  kind: 'What to give',
  kinds: {
    pack: 'Credits',
    pass: 'A plan',
  },
  packChoice: 'Which pack',
  planChoice: 'Which plan',
  lengthChoice: 'For how long',
  lengthOption: '{count} month | {count} months',
  passHint: 'A plan pass needs no card from them and never renews. It goes to a workspace on the free plan.',
  recipient: 'Their email',
  note: 'A note (optional)',
  noteHint: '{count} of {max} characters, plain text, no links',
  deliverDay: 'Deliver on (optional)',
  deliverHint: 'Leave it empty to send it as soon as you pay.',
  send: 'Pay {price} and send',
  sending: 'Opening checkout…',
  signInToSend: 'Sign in to send a gift',
  payHint: 'You pay now. Until they receive it, you can change the date or the address, or cancel for a full refund.',
  sentBack: 'Paid. The gift goes out on the day you picked; you will find it under Sent.',
  nothingToGive: 'Nothing is on sale to give yet.',
  sendFailed: 'The gift could not be sent',
  // The gifts page while billing is not launched on the deployment.
  soon: 'Plans open soon, and gifts with them.',
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
  // Announced once a claim went through: a credit pack's credits land a moment later, a plan pass starts at once.
  claimed: 'Gift received. The {unit} arrive in a moment.',
  claimedPass: 'Gift received. Your plan starts now.',
  // A pack whose $0 checkout asks for details: it opened in a new tab, and the gift lands once that is done.
  claimOpened: 'One last step opened in a new tab. Finish there to receive the gift.',
  claimFailed: 'Could not receive the gift',
} satisfies LabelTree

export default GIFT_LABELS
