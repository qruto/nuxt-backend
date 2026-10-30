import type { LabelTree } from '../label-format.js'

/**
 * `<ContactForm>`: a contact form for visitors and a feedback form for
 * signed-in people. A visitor gives a name and an address to answer; a
 * signed-in account sends as itself. The honeypot field is hidden from people
 * and from assistive technology.
 */
const CONTACT_LABELS = {
  name: 'Your name',
  email: 'Your email address',
  message: 'Your message',
  // Beside the message: its length, and the range it must be in.
  count: '{count} of {max}',
  hint: 'Write between {min} and {max} characters.',
  send: 'Send message',
  sending: 'Sending…',
  // The confirmation, which is the page itself: nothing is emailed to the sender.
  sent: 'Thank you. Your message was sent to the team.',
  another: 'Write another message',
  disclosure: 'The team answers by email. Your address is used for that reply only.',
  // The honeypot's name: it is hidden from people and from assistive technology, and says so should one reach it.
  trap: 'Leave this field empty',
} satisfies LabelTree

export default CONTACT_LABELS
