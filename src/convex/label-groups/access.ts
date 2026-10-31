import type { LabelTree } from '../label-format.js'

/**
 * `<AccessDenied>`: what a signed-in person reads when a page's `auth` rules
 * refuse them. The message follows the rule they failed (the 403's
 * `data.reason`); `message` covers any other refusal.
 */
const ACCESS_LABELS = {
  title: 'You don\'t have access to this page',
  // An app-wide role or permission the page asks for, or a 403 of the app's own.
  message: 'Your account doesn\'t have the access this page needs. Ask an administrator if you need it.',
  // A role in the active workspace.
  messageWorkspace: 'Your role in this workspace doesn\'t include this page. Switch to another workspace, or ask its owner for access.',
  messageBanned: 'This account is banned.',
  signedInAs: 'Signed in as {email}.',
  home: 'Go to the home page',
  switchWorkspace: 'Switch workspace',
  switchAccount: 'Sign in with another account',
  switchingAccount: 'Signing out…',
  switchAccountFailed: 'Could not sign out',
} satisfies LabelTree

export default ACCESS_LABELS
