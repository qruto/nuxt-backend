import type { LabelTree } from '../label-format.js'

/** `<SecuritySettings>` and the security page. */
const SECURITY_LABELS = {
  title: 'Security',
  passkeys: 'Passkeys',
  passkeysEmpty: 'No passkeys yet — add one to sign in without codes.',
  addPasskey: 'Add passkey on this device',
  addingPasskey: 'Adding the passkey…',
  passkeyAdded: 'Passkey registered on this device.',
  // The rename field's name, read by assistive tech: the row has no room for a visible label.
  passkeyName: 'Passkey name',
  unnamedPasskey: 'Unnamed passkey',
  rename: 'Rename',
  // The accessible names of a row's buttons, which say which passkey they act
  // on. Each `…Named` label starts with the visible label it names (`rename`
  // here), so speech input still finds the button by what it shows.
  renameNamed: 'Rename passkey {name}',
  save: 'Save',
  saveNamed: 'Save the name of passkey {name}',
  saving: 'Saving…',
  remove: 'Remove',
  removeNamed: 'Remove passkey {name}',
  removing: 'Removing…',
  removeConfirm: 'Remove passkey “{name}”?',
  sessions: 'Active sessions',
  sessionsLoading: 'Loading sessions…',
  unknownDevice: 'Unknown device',
  // A session's device from its user agent: `Chrome · macOS`, or `Browser · macOS`.
  device: '{browser} · {os}',
  browser: 'Browser',
  // How a passkey is kept, as the authenticator reports it; another value shows as it came.
  deviceTypes: {
    singleDevice: 'This device only',
    multiDevice: 'Synced',
  },
  thisDevice: 'This device',
  revoke: 'Revoke',
  revokeNamed: 'Revoke {device}, signed in {date}',
  revoking: 'Signing out…',
  revokeOthers: 'Sign out other sessions',
  revokingOthers: 'Signing out the other sessions…',
  othersRevoked: 'Other sessions signed out.',
  // The Alerts section: recent sign-ins from a device the account had not used, and recovery-code sign-ins.
  alerts: 'Alerts',
  alertsEmpty: 'No new device has signed in to your account.',
  alertNewDevice: 'New sign-in from {device}, {date}',
  alertRecovery: 'Recovery code used on {device}, {date}',
  alertSignOut: 'Sign it out',
  alertSignOutNamed: 'Sign it out: {device}, signed in {date}',
  // Passkey-only: the switch, and the recovery code it answers with.
  passkeyOnly: 'Sign in with passkeys only',
  passkeyOnlyHint: 'Sign-in codes stop working for this account. Keep the recovery code: it is the way back in without a passkey.',
  passkeyOnlyOff: 'Allow sign-in codes again',
  newRecoveryCodeAction: 'Make a new recovery code',
  recoveryCode: 'Your recovery code: {code}. Keep it somewhere safe. It is shown once.',
  danger: 'This device',
  signOut: 'Sign out',
  signingOut: 'Signing out…',
  // The confirmation a destructive action asks in, when the app passes no `confirm` of its own.
  confirmAccept: 'Confirm',
  confirmCancel: 'Cancel',
} satisfies LabelTree

export default SECURITY_LABELS
