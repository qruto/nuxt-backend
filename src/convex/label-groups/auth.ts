import type { LabelTree } from '../label-format.js'

/**
 * `<AuthForm>` and the sign-in page: every step of the passwordless sign-in,
 * and what the auth flows tell a person they refused.
 */
const AUTH_LABELS = {
  // The heading and the sign-in page's document title.
  title: 'Sign in',
  // The same heading once `appConfig.backend.brand.name` is set.
  titleBrand: 'Sign in to {brand}',
  passkeySignIn: 'Sign in with passkey',
  passkeyWaiting: 'Waiting for your passkey…',
  // Between the passkey button and the email-code button.
  divider: 'or',
  emailCode: 'Continue with email code',
  // On the button of the way this browser last signed in.
  lastUsed: 'Last used',
  name: 'Name',
  email: 'Email',
  sendCode: 'Email me a code',
  sending: 'Sending the code…',
  sent: 'We sent a code to {email}.',
  code: 'Verification code',
  verify: 'Verify',
  verifying: 'Verifying…',
  back: 'Back',
  passkeyOffer: 'Save a passkey on this device to sign in instantly next time.',
  // After a recovery: the passkey can't be skipped.
  passkeyRequired: 'Save a new passkey on this device to finish signing in.',
  // Shown once, after a recovery used the old one.
  newRecoveryCode: 'Your new recovery code: {code}. Keep it somewhere safe. It is shown once.',
  lostPasskey: 'Lost your passkey?',
  recoverIntro: 'Enter your email and the recovery code you saved when you turned on passkey-only sign-in.',
  recoveryCode: 'Recovery code',
  recover: 'Recover my account',
  recovering: 'Checking the recovery code…',
  addPasskey: 'Add passkey',
  addingPasskey: 'Adding the passkey…',
  skip: 'Skip for now',
  // A new address while the app is in early access, after its code checked.
  waitlisted: 'You\'re on the waitlist. We\'ll let you in as soon as we can.',
  // The same, once the entry's place is known.
  waitlistedPlace: 'You\'re #{position} of {total} on the waitlist. We\'ll let you in as soon as we can.',
  waitlistedDisclosure: 'We admit in waves and may also admit by other criteria. Your position can change.',
  // The agreement line under the sign-in form, naming every required consent ({terms} is the list of their links).
  agreement: 'By continuing, you agree to {terms}.',
  // One required consent as that line names it, with its link.
  agreementItem: 'the {title}',
  // The age step, asked once of a new account when the app sets a minimum age. It never names the minimum.
  ageQuestion: 'How old are you?',
  ageSubmit: 'Continue',
  ageChecking: 'Checking…',
  haveInviteCode: 'I have an invite code',
  // An address the email provider stopped delivering to: the same words whether or not an account holds it.
  undeliverable: 'We can\'t send email to this address right now. Use another address, or contact us for help.',
  tryAnotherEmail: 'Use another address',
  // A new address while the app is invite only, after its code checked.
  inviteIntro: 'Signing up takes an invite right now. Enter your invite code.',
  inviteCode: 'Invite code',
  redeemInvite: 'Continue',
  checkingInvite: 'Checking the invite code…',
  // The /invite page an access link opens.
  invitePage: {
    title: 'Your invite',
    checking: 'Checking your invite…',
    valid: 'Your invite works. Sign in with your email to create your account.',
    expired: 'This invite has expired.',
    usedUp: 'This invite has been used up.',
    revoked: 'This invite is no longer valid.',
    unknown: 'This invite link doesn\'t work. Check that you opened the whole link.',
    continue: 'Continue to sign in',
  },
  // Over the bot check's challenge, while it asks for a click (off Vercel, with challenge keys).
  challenge: 'Confirm you\'re a person to continue.',
} satisfies LabelTree

export default AUTH_LABELS
