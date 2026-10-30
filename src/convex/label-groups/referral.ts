import type { LabelTree } from '../label-format.js'

/**
 * `<ReferralCard>`, `useReferrals()` and the page a referral link opens
 * (REF). The share text says what both sides get, as endorsement rules ask:
 * the sharer's gain is said where the link is. `{name}` is a discount's or a
 * pack's name in the catalog, `{days}` a trial's length, `{reward}` the
 * sharer's reward in words, `{inviter}` the first name of the person who
 * invited the visitor.
 */
const REFERRAL_LABELS = {
  title: 'Invite friends',
  intro: 'Share your link. When a friend signs up and pays, you both get a reward.',
  // The share text: a lead, what the friend gets, what the sharer gets.
  shareLead: 'Try this app with my link.',
  friendDiscount: 'You get {name} on your first payment.',
  friendTrial: 'You get {days} days free.',
  shareSharer: 'I earn {reward} when you become a customer.',
  sharerPack: '{name}',
  sharerMonths: '{count} free month | {count} free months',
  // What the sharer reads about their own side.
  yourReward: 'You get {reward} once a friend\'s first payment has cleared its {days}-day refund window.',
  linkLabel: 'Your link',
  copy: 'Copy link',
  copied: 'Copied',
  share: 'Share',
  claimed: '{count} friend signed up | {count} friends signed up',
  held: '{count} friend is waiting for the refund window | {count} friends are waiting for the refund window',
  rewarded: '{count} friend rewarded | {count} friends rewarded',
  sharePages: 'Show my code on the pages I share',
  sharePagesNote: 'A badge on a shared page links to your invitation link, and says you earn a reward when someone joins.',
  loading: 'Getting your link…',
  signedOut: 'Sign in to get your link.',
  failed: 'Your link could not be read. Try again.',
  // The page a referral link opens.
  landing: {
    title: 'You\'re invited',
    invitedBy: '{inviter} invited you.',
    invited: 'A friend invited you.',
    youGet: 'Sign up through this link and you get {name} on your first payment.',
    youGetTrial: 'Sign up through this link and you get {days} days free on your first payment.',
    youGetNothing: 'Sign up through this link and they will know it came from them.',
    signUp: 'Sign up to claim',
    claim: 'Claim the invitation',
    claiming: 'Claiming…',
    claimed: 'Done. The invitation is yours.',
    ignored: 'This invitation could not be used, and you can go on without it.',
    own: 'This is your own link.',
    invalid: 'This link no longer works.',
    checking: 'Checking the link…',
    continue: 'Continue',
  },
} satisfies LabelTree

export default REFERRAL_LABELS
