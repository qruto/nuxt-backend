import type { LabelTree } from '../label-format.js'

/**
 * The `/report` page: the public notice form (DSA Art. 16, with the TAKE IT
 * DOWN Act's intimate-image removal request), and the author's appeal
 * against a decision on the same page.
 */
const REPORT_LABELS = {
  page: {
    title: 'Report content',
  },
  intro: 'Tell us about content in this app that is illegal or breaks our terms. A person on our team reviews every report.',
  url: 'Link to the content',
  urlHint: 'Copy the address of the page that shows it.',
  reason: 'What is wrong with it',
  reasons: {
    illegal: 'It is illegal',
    intimate: 'It is an intimate image of me shared without my consent',
    child_abuse: 'It sexually exploits a child',
    abuse: 'Harassment or bullying',
    sexual: 'Sexual content',
    violence: 'Violence or threats',
    spam: 'Spam or a scam',
    other: 'Something else',
  },
  details: 'Why',
  detailsHint: 'Explain why the content is illegal or breaks our terms, and name the law or term if you know it. What you write is kept with our decision, so leave out personal details we don\'t need.',
  name: 'Your name',
  email: 'Your email address',
  contactHint: 'We email you a receipt and our decision. For child sexual abuse material you may leave both out.',
  signature: 'Your full name, as your signature',
  signatureHint: 'Signing confirms that you are the person shown, or may act for them.',
  intimateNote: 'We decide a request to remove an intimate image shared without consent within 48 hours, and remove identical copies too.',
  goodFaith: 'I believe in good faith that this report is accurate and complete.',
  send: 'Send report',
  sending: 'Sending…',
  sent: 'Thanks. We received your report and will email you our decision.',
  sentAnonymous: 'Thanks. We received your report.',
  appeal: {
    title: 'Appeal a decision',
    checking: 'Checking the link…',
    unknown: 'This appeal link doesn\'t work. Check that you copied all of it.',
    hidden: 'On {date} we removed "{title}".',
    dismissed: 'On {date} we decided to keep "{title}".',
    untitled: 'your content',
    reason: 'Our reason: {reason}',
    until: 'You can appeal until {date}.',
    expired: 'This decision can no longer be appealed.',
    text: 'Why the decision should change',
    send: 'Send appeal',
    sending: 'Sending…',
    open: 'Thanks. A person on our team is reviewing your appeal and will email you the outcome.',
    upheld: 'We reviewed your appeal and kept our decision.',
    reversed: 'We reviewed your appeal and reversed our decision.',
  },
} satisfies LabelTree

export default REPORT_LABELS
