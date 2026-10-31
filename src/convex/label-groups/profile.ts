import type { LabelTree } from '../label-format.js'

/** `<ProfileSettings>` and the profile page. */
const PROFILE_LABELS = {
  title: 'Profile',
  emailVerified: 'Email verified',
  emailUnverified: 'Email unverified',
  role: 'Role: {role}',
  // The app-wide roles the package defines; a role of the app's own shows as it is named.
  roles: {
    user: 'User',
    admin: 'Admin',
  },
  name: 'Display name',
  save: 'Save name',
  saving: 'Saving…',
  saved: 'Name updated.',
  newEmail: 'New email address',
  emailHint: 'You confirm with a code from your current address, then one from the new address.',
  changeEmail: 'Change email',
  // While the first code goes out, and while the second one is checked.
  changing: 'Sending the code…',
  codeSentTo: 'Code sent to {email}',
  // Where the first code went, when the account's address is not known yet.
  currentAddress: 'your current address',
  confirm: 'Confirm',
  confirming: 'Confirming…',
  confirmHint: 'This proves you still hold your current address. Next, a code goes to the new one.',
  verifyHint: 'No code? An address that already belongs to an account receives none.',
  verifying: 'Changing the address…',
  cancel: 'Cancel',
  changed: 'Your email address is now {email}.',
  sameEmail: 'That is already your email address.',
  // The language picker, with @nuxtjs/i18n and two locales or more.
  language: 'Language',
  languageHint: 'Pages and the emails we send you use this language.',
  // Once a picked language is stored on the account.
  languageSaved: 'Language updated.',
} satisfies LabelTree

export default PROFILE_LABELS
