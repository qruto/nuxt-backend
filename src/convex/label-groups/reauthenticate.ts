import type { LabelTree } from '../label-format.js'

/**
 * `<ReauthenticateDialog>`: confirming it is the person, with a passkey or
 * a code to the account's own address, before a sensitive action.
 */
const REAUTHENTICATE_LABELS = {
  title: 'Confirm it\'s you',
  intro: 'This needs a recent sign-in. Confirm with your passkey or a code we email you.',
  passkey: 'Use your passkey',
  passkeyWaiting: 'Waiting for your passkey…',
  // Between the passkey button and the email-code button.
  divider: 'or',
  emailCode: 'Email me a code',
  sending: 'Sending the code…',
  sent: 'We sent a code to {email}.',
  code: 'Verification code',
  verify: 'Confirm',
  verifying: 'Confirming…',
  back: 'Back',
  cancel: 'Cancel',
} satisfies LabelTree

export default REAUTHENTICATE_LABELS
