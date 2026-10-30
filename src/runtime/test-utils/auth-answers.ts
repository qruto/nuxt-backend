import type { Passkey } from '../vue/utils/auth-session.js'
import type { WorkspaceMember } from '../vue/composables/use-workspace.js'
import { freshId, type BackendMock, type BackendMockInvitation, type BackendMockWorkspace } from './mock.js'

// What each auth client method answers when no test stubbed it: the answer
// Better Auth 1.6's organization and passkey plugins give for the state the
// mock holds, refusals included, with their status and code. A method with
// no entry answers `null`.

/** A built-in answer's refusal: what the real server says no with, as the client's `error`. */
export class Refusal extends Error {
  readonly error: Record<string, unknown>

  constructor(error: Record<string, unknown>) {
    super(String(error.message))
    this.error = error
  }
}

type Args = Record<string, unknown> & { query?: { id?: string } }

/** A refusal with Better Auth's code and message: `{ status, statusText, code, message }`. */
const refused = (status: number, statusText: string, code: string, message: string) => new Refusal({ status, statusText, code, message })

const INVITATION_NOT_FOUND = () => refused(400, 'BAD_REQUEST', 'INVITATION_NOT_FOUND', 'Invitation not found')
const NOT_THE_RECIPIENT = () => refused(403, 'FORBIDDEN', 'YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION', 'You are not the recipient of the invitation')
const PASSKEY_NOT_FOUND = () => refused(404, 'NOT_FOUND', 'PASSKEY_NOT_FOUND', 'Passkey not found')

/** The session record beside the signed-in account: its id is the account's own unless the test set one. */
export function sessionOf(mock: BackendMock) {
  const { state } = mock
  if (!state.user) return null
  return { ...state.session, id: state.session.id ?? `session-${state.user.id}`, userId: state.user.id, activeOrganizationId: state.activeWorkspace }
}

const workspaceById = (mock: BackendMock, id: unknown) => mock.state.workspaces.find(workspace => workspace.id === id)

/** The active workspace, if the account has one. */
export const activeWorkspaceOf = (mock: BackendMock) => workspaceById(mock, mock.state.activeWorkspace)

/** A workspace as Better Auth lists it: without the mock's own fields. */
export function workspaceFields({ id, name, slug, logo, createdAt }: BackendMockWorkspace) {
  return { id, name, slug, logo: logo ?? null, createdAt }
}

/** The signed-in account's membership of `workspace`. */
export function memberOf(mock: BackendMock, workspace: BackendMockWorkspace) {
  const user = mock.state.user
  return {
    id: `member-${workspace.id}`,
    organizationId: workspace.id,
    userId: user?.id ?? '',
    role: workspace.role,
    user: { id: user?.id ?? '', email: user?.email ?? '', name: user?.name ?? '', image: user?.image ?? null },
  }
}

/** A member as Better Auth answers it: the workspace's id under the plugin's name. */
function upstreamMember({ workspaceId, ...member }: WorkspaceMember) {
  return { ...member, organizationId: workspaceId }
}

/** An invitation as Better Auth answers it: the workspace's id under the plugin's name, and none of the mock's own fields. */
function upstreamInvitation({ workspaceId, workspaceName: _name, workspaceSlug: _slug, inviterEmail: _email, ...invitation }: BackendMockInvitation) {
  return { ...invitation, organizationId: workspaceId }
}

/** The workspace with everyone in it, as `useActiveOrganization` gives it. */
export function fullWorkspace(mock: BackendMock, workspace: BackendMockWorkspace) {
  return { ...workspaceFields(workspace), members: workspace.members?.map(upstreamMember) ?? [memberOf(mock, workspace)], invitations: (workspace.invitations ?? []).map(upstreamInvitation) }
}

/** An invitation the account may answer: pending, unexpired and addressed to it, or the refusal Better Auth gives. */
function answerableInvitation(mock: BackendMock, id: unknown, notFound: () => Refusal): BackendMockInvitation {
  const invitation = mock.state.invitations.find(candidate => candidate.id === id)
  if (!invitation || invitation.status !== 'pending' || new Date(invitation.expiresAt).getTime() < Date.now()) throw notFound()
  if (invitation.email.toLowerCase() !== mock.state.user?.email.toLowerCase()) throw NOT_THE_RECIPIENT()
  return invitation
}

/** Whether leaving `workspace` would leave it without an owner. */
function soleOwner(mock: BackendMock, workspace: BackendMockWorkspace): boolean {
  if (!workspace.role.split(',').includes('owner')) return false
  const members = workspace.members ?? [{ role: workspace.role }]
  return members.filter(member => member.role.split(',').includes('owner')).length <= 1
}

const organizationAnswers: Record<string, (mock: BackendMock, args: Args) => unknown> = {
  // By id, by slug, or (neither given) the active one; `null` clears it. A
  // workspace the account is not in clears it too, then refuses.
  'organization.setActive': (mock, { organizationId, organizationSlug }) => {
    if (organizationId === null) {
      mock.state.activeWorkspace = null
      return null
    }
    let id = organizationId ?? (organizationSlug ? undefined : mock.state.activeWorkspace)
    if (id === null) return null
    if (id === undefined) {
      id = mock.state.workspaces.find(workspace => workspace.slug === organizationSlug)?.id
      if (id === undefined) throw refused(400, 'BAD_REQUEST', 'ORGANIZATION_NOT_FOUND', 'Organization not found')
    }
    const workspace = workspaceById(mock, id)
    if (!workspace) {
      mock.state.activeWorkspace = null
      throw refused(403, 'FORBIDDEN', 'USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION', 'User is not a member of the organization')
    }
    mock.state.activeWorkspace = workspace.id
    return workspaceFields(workspace)
  },
  'organization.create': (mock, { name, slug, logo, keepCurrentActiveOrganization }) => {
    if (mock.state.workspaces.some(workspace => workspace.slug === slug)) throw refused(400, 'BAD_REQUEST', 'ORGANIZATION_ALREADY_EXISTS', 'Organization already exists')
    const workspace: BackendMockWorkspace = { id: freshId(mock, 'workspace'), name: String(name), slug: String(slug), logo: (logo as string | undefined) ?? null, createdAt: 0, role: 'owner' }
    mock.state.workspaces.push(workspace)
    if (!keepCurrentActiveOrganization) mock.state.activeWorkspace = workspace.id
    return { ...workspaceFields(workspace), members: [memberOf(mock, workspace)] }
  },
  'organization.inviteMember': (mock, { email, role, organizationId }) => {
    const workspace = workspaceById(mock, organizationId ?? mock.state.activeWorkspace)
    if (!workspace) throw refused(400, 'BAD_REQUEST', 'NO_ACTIVE_ORGANIZATION', 'No active organization')
    const invitation = { id: freshId(mock, 'invitation'), email: String(email), role: (role as string | undefined) ?? 'member', status: 'pending', workspaceId: workspace.id, inviterId: mock.state.user?.id ?? '', expiresAt: Date.now() + 48 * 3600_000 }
    workspace.invitations = [...(workspace.invitations ?? []), invitation]
    return upstreamInvitation(invitation)
  },
  'organization.cancelInvitation': (mock, { invitationId }) => {
    const invitation = mock.state.workspaces.flatMap(workspace => workspace.invitations ?? []).find(candidate => candidate.id === invitationId)
    if (!invitation) throw INVITATION_NOT_FOUND()
    invitation.status = 'canceled'
    return upstreamInvitation(invitation)
  },
  'organization.leave': (mock, { organizationId }) => {
    const workspace = workspaceById(mock, organizationId)
    if (!workspace) throw refused(400, 'BAD_REQUEST', 'MEMBER_NOT_FOUND', 'Member not found')
    if (soleOwner(mock, workspace)) throw refused(400, 'BAD_REQUEST', 'YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER', 'You cannot leave the organization as the only owner')
    mock.state.workspaces = mock.state.workspaces.filter(candidate => candidate !== workspace)
    if (mock.state.activeWorkspace === workspace.id) mock.state.activeWorkspace = null
    return memberOf(mock, workspace)
  },
  'organization.listUserInvitations': mock => mock.state.invitations.filter(invitation =>
    invitation.status === 'pending' && invitation.email.toLowerCase() === mock.state.user?.email.toLowerCase()).map(upstreamInvitation),
  'organization.getInvitation': (mock, { query }) => {
    // Better Auth answers a missing invitation here with a bare 400: no code.
    const invitation = answerableInvitation(mock, query?.id, () => new Refusal({ status: 400, statusText: 'BAD_REQUEST', message: 'Invitation not found!' }))
    const known = workspaceById(mock, invitation.workspaceId)
    return {
      ...upstreamInvitation(invitation),
      organizationName: invitation.workspaceName ?? known?.name ?? invitation.workspaceId,
      organizationSlug: invitation.workspaceSlug ?? known?.slug ?? invitation.workspaceId,
      inviterEmail: invitation.inviterEmail ?? 'inviter@example.com',
    }
  },
  'organization.acceptInvitation': (mock, { invitationId }) => {
    const invitation = answerableInvitation(mock, invitationId, INVITATION_NOT_FOUND)
    invitation.status = 'accepted'
    const id = invitation.workspaceId
    const role = invitation.role ?? 'member'
    const workspace = workspaceById(mock, id) ?? { id, name: invitation.workspaceName ?? id, slug: invitation.workspaceSlug ?? id, createdAt: 0, role }
    if (!workspaceById(mock, id)) mock.state.workspaces.push(workspace)
    // Accepting makes the workspace the active one, as Better Auth does.
    mock.state.activeWorkspace = id
    return { invitation: upstreamInvitation(invitation), member: { ...memberOf(mock, workspace), role } }
  },
  'organization.rejectInvitation': (mock, { invitationId }) => {
    const invitation = mock.state.invitations.find(candidate => candidate.id === invitationId)
    if (!invitation || invitation.status !== 'pending') throw refused(400, 'BAD_REQUEST', 'INVITATION_NOT_FOUND', 'Invitation not found!')
    if (invitation.email.toLowerCase() !== mock.state.user?.email.toLowerCase()) throw NOT_THE_RECIPIENT()
    invitation.status = 'rejected'
    return { invitation: upstreamInvitation(invitation), member: null }
  },
}

const passkeyAnswers: Record<string, (mock: BackendMock, args: Args) => unknown> = {
  'passkey.listUserPasskeys': mock => [...mock.state.passkeys],
  'passkey.addPasskey': (mock, { name }) => {
    const passkey: Passkey = { id: freshId(mock, 'passkey'), name: (name as string | undefined) ?? null, createdAt: new Date(0).toISOString() }
    mock.state.passkeys.push(passkey)
    return passkey
  },
  'passkey.updatePasskey': (mock, { id, name }) => {
    const passkey = mock.state.passkeys.find(candidate => candidate.id === id)
    if (!passkey) throw PASSKEY_NOT_FOUND()
    passkey.name = String(name)
    return { passkey }
  },
  'passkey.deletePasskey': (mock, { id }) => {
    if (!mock.state.passkeys.some(candidate => candidate.id === id)) throw PASSKEY_NOT_FOUND()
    mock.state.passkeys = mock.state.passkeys.filter(candidate => candidate.id !== id)
    return { status: true }
  },
}

/** A recovery code the mock hands out: fixed, so a test can type it back. */
const MOCK_RECOVERY_CODE = 'M0CK0-REC0V-ERY00-C0DE0'

/**
 * The package's own auth routes, which the client reaches through
 * `$fetch(path, { body })`: passkey-only, its recovery, and an
 * administrator turning it off.
 */
function packageRoute(mock: BackendMock, input: unknown): unknown {
  const [route, options] = (Array.isArray(input) ? input : [input]) as [string, { body?: Record<string, unknown> } | undefined]
  const body = options?.body ?? {}
  const user = mock.state.user as (Record<string, unknown> & { passkeyOnly?: boolean }) | null
  if (route === '/passkey-only/set') {
    if (body.enabled && mock.state.passkeys.length === 0) throw new Refusal({ status: 400, statusText: 'BAD_REQUEST', code: 'invalid_input', field: 'passkeys', message: 'A passkey-only account needs a passkey.' })
    if (user) user.passkeyOnly = body.enabled === true
    return { recoveryCode: body.enabled ? MOCK_RECOVERY_CODE : null }
  }
  if (route === '/sign-in/recovery-code') {
    if (body.recoveryCode !== MOCK_RECOVERY_CODE) throw new Refusal({ status: 400, statusText: 'BAD_REQUEST', code: 'invalid_input', field: 'recoveryCode', message: 'That recovery code isn\'t right, or it was used already.' })
    return { token: 'mock-token', user: mock.signIn({ email: String(body.email) }), recoveryCode: MOCK_RECOVERY_CODE }
  }
  if (route === '/admin/disable-passkey-only') return { passkeyOnly: false }
  return null
}

/** What each auth client method answers when no test stubbed it, by its path. */
export const BUILT_IN: Record<string, (mock: BackendMock, args: Args) => unknown> = {
  'signOut': (mock) => {
    mock.signOut()
    return { success: true }
  },
  // Each records how the account signed in, as Better Auth's lastLoginMethod does.
  'signIn.emailOtp': (mock, { email, name }) => ({ token: 'mock-token', user: mock.signIn({ email: String(email), ...(name ? { name: name as string } : {}), lastLoginMethod: 'email-otp' }) }),
  'signIn.passkey': mock => ({ user: mock.signIn({ lastLoginMethod: 'passkey' }), session: sessionOf(mock) }),
  'emailOtp.sendVerificationOtp': () => ({ success: true }),
  'emailOtp.requestEmailChange': () => ({ success: true }),
  'emailOtp.changeEmail': (mock, { newEmail }) => {
    if (mock.state.user) mock.state.user.email = String(newEmail)
    return { status: true }
  },
  'updateUser': (mock, fields) => {
    if (mock.state.user) Object.assign(mock.state.user, fields)
    return { status: true }
  },
  // The account goes once the person confirms from the email: nothing changes yet.
  'deleteUser': () => ({ success: true }),
  'revokeOtherSessions': () => ({ status: true }),
  // The token the base module's session layer fetches for the backend client.
  'convex.token': mock => ({ token: mock.state.user ? 'mock-token' : null }),
  '$fetch': (mock, args) => packageRoute(mock, args),
  ...passkeyAnswers,
  ...organizationAnswers,
}
