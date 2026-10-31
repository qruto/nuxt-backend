import type { LabelTree } from '../label-format.js'

/** `<AcceptInvitation>` and the invitation page. */
const INVITATION_LABELS = {
  title: 'Invitation',
  loading: 'Loading invitation…',
  missing: 'This invitation link is invalid or has expired.',
  failed: 'Something went wrong: {message}',
  invited: '{inviter} invited you to join {workspace}.',
  invitedAs: '{inviter} invited you to join {workspace} as {role}.',
  // The workspace roles the package defines; a custom role shows as it is named.
  roles: {
    owner: 'owner',
    admin: 'admin',
    member: 'member',
  },
  accept: 'Accept invitation',
  accepting: 'Joining…',
  decline: 'Decline',
  declining: 'Declining…',
  accepted: 'You joined {workspace}.',
  // The workspace's name, when the invitation did not carry one.
  theWorkspace: 'the workspace',
  declined: 'Invitation declined.',
} satisfies LabelTree

export default INVITATION_LABELS
