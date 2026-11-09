import type { LabelTree } from '../label-format.js'

/**
 * `<WaitlistForm>` and the `/waitlist` page: joining the waitlist and
 * reading a place in it. The app's questions show as their key and choices,
 * unless `<WaitlistForm>` is given `questionLabels`.
 */
const WAITLIST_LABELS = {
  title: 'Join the waitlist',
  intro: 'We\'re opening in waves. Add your email and we\'ll send a code to confirm it.',
  email: 'Email address',
  // The words the launch-news box asks, which are kept as what the person agreed to.
  launchNews: 'Email me when it launches',
  join: 'Join the waitlist',
  joining: 'Sending the code…',
  codeIntro: 'Enter the code we sent to {email}.',
  code: 'Code',
  verify: 'Confirm',
  verifying: 'Checking the code…',
  back: 'Use another address',
  placed: 'You\'re #{position} of {total}',
  placedUnknown: 'You\'re on the waitlist.',
  disclosure: 'We admit in waves and may also admit by other criteria. Your position can change.',
  admitted: 'You\'re in. Sign up with the address you joined with.',
  signUp: 'Sign up',
  declined: 'We can\'t offer you a place right now.',
  joined: 'You already have an account.',
  referredBy: 'A friend invited you. They move up the list when you join.',
  dropReferral: 'Not from a friend',
  shareTitle: 'Move up the list',
  shareIntro: 'Each friend who joins with your link moves you up, up to {cap} friends.',
  shareLink: 'Your link',
  copy: 'Copy',
  copied: 'Copied',
  friends: '{count} friend has joined with your link. | {count} friends have joined with your link.',
  shareText: 'Join the waitlist with my link. If you do, I move up the list.',
  leave: 'Leave the waitlist',
  leaving: 'Leaving…',
  left: 'You left the waitlist. Your address is removed.',
  page: {
    title: 'Waitlist',
    checking: 'Checking your place…',
    unknown: 'This link doesn\'t work. Open the link in your confirmation email, or join again.',
    member: 'You\'re signed in already, so there\'s no waitlist for you.',
    continue: 'Continue',
    open: 'Everyone can sign up now: there\'s no waitlist.',
    closed: 'The waitlist is closed. Signing up takes an invite right now.',
    haveInvite: 'I have an invite',
  },
} satisfies LabelTree

export default WAITLIST_LABELS
