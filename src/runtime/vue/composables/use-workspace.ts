import { computed, type ComputedRef } from 'vue'
import { useConvex } from 'nuxt-convex-module/client'
import { unwrapAuth } from '../utils/auth-result'
import { useActionState } from '../utils/action-state'
import { type BackendError, failureOf, getBackendError } from '../utils/backend-error'
import { useAuthSession } from '../utils/auth-session'
import { useLabels } from './use-labels'

/** A workspace. */
export interface Workspace {
  id: string
  name: string
  slug: string
  logo?: string | null
  createdAt: Date | number
  metadata?: unknown
}

/** A workspace member row. */
export interface WorkspaceMember {
  id: string
  workspaceId: string
  userId: string
  role: string
  createdAt?: Date | number | string
  user?: { id?: string, email?: string, name?: string, image?: string | null }
}

/** The active workspace with its members and invitations. */
export interface ActiveWorkspace extends Workspace {
  members: readonly WorkspaceMember[]
  invitations: readonly WorkspaceInvitation[]
}

/** An invitation to a workspace. */
export interface WorkspaceInvitation {
  id: string
  email: string
  role?: string | null
  status: string
  workspaceId: string
  inviterId: string
  expiresAt: Date | number | string
}

/** An invitation the signed-in user has received. */
export type ReceivedInvitation = WorkspaceInvitation

/** A single invitation with its workspace/inviter context (accept-page data). */
export interface InvitationDetails extends WorkspaceInvitation {
  workspaceName: string
  workspaceSlug: string
  inviterEmail: string
}

export interface UseWorkspaceReturn {
  /** Every workspace the user belongs to. */
  workspaces: ComputedRef<Workspace[]>
  /** The active workspace (with members + invitations), `null` when none. */
  current: ComputedRef<ActiveWorkspace | null>
  /** The user's membership in the active workspace. */
  member: ComputedRef<WorkspaceMember | null>
  /** The user's role *within the active workspace* (owner/admin/member or custom). */
  role: ComputedRef<string | null>
  /** Members of the active workspace. */
  members: ComputedRef<WorkspaceMember[]>
  /** The active workspace's pending invitations, live. */
  invitations: ComputedRef<WorkspaceInvitation[]>
  /** `true` while workspace state is loading. */
  isLoading: ComputedRef<boolean>
  /** `true` while an action runs. */
  isPending: ComputedRef<boolean>
  /**
   * Why the last action failed, else why the workspace state could not be
   * read, else `null`. An action clears its own failure when the next one
   * starts, and signing out clears it.
   */
  error: ComputedRef<BackendError | null>
  /**
   * Switch the active workspace. Refreshes the backend token (the active
   * workspace rides on its claims) and re-authenticates the live connection,
   * so all workspace-scoped queries re-run against the new workspace.
   */
  setActive: (workspaceId: string) => Promise<void>
  /** Create a workspace (users can own several); it becomes the active one. Resolves with it. */
  create: (args: { name: string, slug: string, logo?: string }) => Promise<Workspace>
  /**
   * Rename a workspace (the active one unless `workspaceId` names another),
   * keeping its address. Owners and admins only.
   */
  rename: (name: string, workspaceId?: string) => Promise<void>
  /** Invite someone to the active workspace (they receive an accept-link email). Resolves with the invitation. */
  invite: (args: { email: string, role?: string, workspaceId?: string }) => Promise<WorkspaceInvitation>
  /** Leave a workspace (defaults to the active one). The last owner can't leave. */
  leave: (workspaceId?: string) => Promise<void>
  /** Give a member of the active workspace another built-in role: `owner`, `admin` or `member` (owner and admins only). */
  updateMemberRole: (memberId: string, role: 'owner' | 'admin' | 'member') => Promise<void>
  /** Take a member out of the active workspace (owner and admins only). */
  removeMember: (memberId: string) => Promise<void>
  /**
   * Accept a received invitation. Refreshes the workspace claim; with
   * `activate: true` the joined workspace also becomes the active one.
   * Resolves with the new membership once the server accepted: a switch that
   * fails afterwards does not undo that, and shows in `error` instead.
   */
  acceptInvitation: (invitationId: string, options?: { activate?: boolean }) => Promise<WorkspaceMember>
  /** Decline a received invitation. */
  declineInvitation: (invitationId: string) => Promise<void>
  /** Cancel a pending invitation you (or a teammate) sent — inviter side. */
  cancelInvitation: (invitationId: string) => Promise<void>
  /**
   * A single invitation with workspace/inviter context (for the accept
   * page); `null` when there is no such invitation, or it is no longer
   * pending. Any other refusal rejects.
   */
  getInvitation: (invitationId: string) => Promise<InvitationDetails | null>
  /** Invitations the signed-in user has received (across workspaces). */
  listReceivedInvitations: () => Promise<ReceivedInvitation[]>
}

/**
 * Whether a failed invitation read is the server saying there is no such
 * invitation, or none still pending (expired, answered): Better Auth answers
 * exactly that with a bare 400, a message and no code. Every other refusal
 * carries a code (`ORGANIZATION_NOT_FOUND`, `VALIDATION_ERROR`, …) or
 * another status (not the recipient, signed out), and rejects.
 */
function invitationNotFound(cause: unknown): boolean {
  const body = (cause as { cause?: { status?: unknown, code?: unknown } } | null)?.cause
  return body?.status === 400 && !body.code
}

/** Better Auth's names a membership or an invitation arrives with. */
interface UpstreamRow { organizationId?: string, organizationName?: string, organizationSlug?: string }

/** A member row with the workspace's id under its own name. */
function memberOf(row: WorkspaceMember & UpstreamRow): WorkspaceMember {
  const { organizationId, ...member } = row
  return { ...member, ...(organizationId === undefined ? {} : { workspaceId: organizationId }) }
}

/** An invitation with the workspace's id, name and slug under their own names. */
function invitationOf<T extends WorkspaceInvitation>(row: T & UpstreamRow): T {
  const { organizationId, organizationName, organizationSlug, ...invitation } = row
  return {
    ...invitation,
    ...(organizationId === undefined ? {} : { workspaceId: organizationId }),
    ...(organizationName === undefined ? {} : { workspaceName: organizationName }),
    ...(organizationSlug === undefined ? {} : { workspaceSlug: organizationSlug }),
  } as T
}

/**
 * Workspace state and actions: the list, the switch, the members and the
 * full invitation flow (invite / accept / decline / cancel — the packaged
 * `AcceptInvitation` component and `/accept-invitation` page build on these).
 *
 * The workspace state never throws: a failed read shows in `error`. Every
 * action resolves with its data, or rejects with an `Error` whose message is
 * the package's label for the refusal, in the reader's language (the auth
 * client's error as the `cause`, which `getBackendError` reads) and keeps the failure in `error`; a
 * rate-limited call carries the wait as `retryAfter`.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { workspaces, current, setActive, error } = useWorkspace()
 * </script>
 * <template>
 *   <p v-if="error">{{ error.message }}</p>
 *   <select :value="current?.id" @change="setActive(($event.target as HTMLSelectElement).value)">
 *     <option v-for="workspace in workspaces" :key="workspace.id" :value="workspace.id">
 *       {{ workspace.name }}
 *     </option>
 *   </select>
 * </template>
 * ```
 */
export function useWorkspace(): UseWorkspaceReturn {
  const auth = useAuthSession()
  const convex = useConvex()
  const { client } = auth

  const list = client.useListOrganizations()
  const active = client.useActiveOrganization()
  const activeMember = client.useActiveMember()

  const signedOut = computed(() => !auth.isLoading.value && !auth.isAuthenticated.value)
  const { isPending, failure, run: runAction } = useActionState(() => signedOut.value)
  // A rejected action says why in the package's words, in the reader's
  // language (the `errors` labels), never the auth library's English: the
  // auth error stays its `cause`, so `getBackendError` still reads its code.
  const { errorMessage } = useLabels('errors')
  const run: typeof runAction = (call, options) => runAction(call, options).catch((cause: unknown) => {
    // The package's own setup message (a missing workspace to leave) is for the developer, as written.
    if (cause instanceof Error && cause.message.startsWith('[nuxt-backend]')) throw cause
    // A refusal with no catalog code reads as the unexpected one: never the auth library's own sentence.
    throw new Error(errorMessage(getBackendError(cause) ? cause : null), { cause })
  })
  const readFailure = computed(() => {
    const cause = list.value.error ?? active.value.error ?? activeMember.value.error
    return cause ? failureOf(cause) : null
  })

  // The active workspace is a token claim: refresh the cached token, then
  // re-authenticate the live connection so subscriptions re-run with the new
  // workspace (the session id doesn't change on a switch, so nothing else
  // would trigger re-auth until the token expires).
  const refreshWorkspaceClaim = async (): Promise<void> => {
    await auth.fetchAccessToken({ forceRefreshToken: true })
    convex.setAuth(auth.fetchAccessToken)
  }

  const switchTo = async (workspaceId: string): Promise<void> => {
    unwrapAuth(await client.organization.setActive({ organizationId: workspaceId }))
    await refreshWorkspaceClaim()
  }

  const current = computed((): ActiveWorkspace | null => {
    const data = active.value.data as (Workspace & { members?: Array<WorkspaceMember & UpstreamRow>, invitations?: Array<WorkspaceInvitation & UpstreamRow> }) | null | undefined
    if (!data) return null
    return { ...data, members: (data.members ?? []).map(memberOf), invitations: (data.invitations ?? []).map(row => invitationOf(row)) }
  })

  return {
    workspaces: computed(() => [...(list.value.data ?? [])]),
    current,
    member: computed(() => {
      const data = activeMember.value.data as (WorkspaceMember & UpstreamRow) | null | undefined
      return data ? memberOf(data) : null
    }),
    role: computed(() => activeMember.value.data?.role ?? null),
    members: computed(() => [...(current.value?.members ?? [])]),
    invitations: computed(() => (current.value?.invitations ?? []).filter(invitation => invitation.status === 'pending')),
    isLoading: computed(() => list.value.isPending || active.value.isPending),
    isPending,
    error: computed(() => (signedOut.value ? null : failure.value ?? readFailure.value)),
    setActive: workspaceId => run(() => switchTo(workspaceId)),
    // Creating a workspace makes it the active one, and leaving can drop it —
    // both change the token claim, so re-authenticate like setActive does.
    create: args => run(async () => {
      const created = unwrapAuth<Workspace & { members?: unknown }>(await client.organization.create(args))
      await refreshWorkspaceClaim()
      const { members: _members, ...workspace } = created
      return workspace
    }),
    rename: (name, workspaceId) => run(async () => {
      const target = workspaceId ?? active.value.data?.id
      if (!target) throw new Error('[nuxt-backend] No workspace to rename: pass its id, or set an active workspace.')
      unwrapAuth(await client.organization.update({ data: { name: name.trim() }, organizationId: target }))
    }),
    invite: ({ email, role = 'member', workspaceId }) => run(async () =>
      invitationOf(unwrapAuth<WorkspaceInvitation & UpstreamRow>(await client.organization.inviteMember({ email, role: role as 'member', organizationId: workspaceId })))),
    leave: workspaceId => run(async () => {
      const target = workspaceId ?? active.value.data?.id
      if (!target) throw new Error('[nuxt-backend] No workspace to leave: pass its id, or set an active workspace.')
      unwrapAuth(await client.organization.leave({ organizationId: target }))
      await refreshWorkspaceClaim()
    }),
    updateMemberRole: (memberId, role) => run(async () => {
      unwrapAuth(await client.organization.updateMemberRole({ memberId, role }))
    }),
    removeMember: memberId => run(async () => {
      unwrapAuth(await client.organization.removeMember({ memberIdOrEmail: memberId }))
    }),
    // Accepting adds a membership (a claim-relevant change) — refresh the
    // claim like the other membership changes do.
    acceptInvitation: (invitationId, options) => run(async () => {
      const member = memberOf(unwrapAuth<{ member: WorkspaceMember & UpstreamRow }>(await client.organization.acceptInvitation({ invitationId })).member)
      await refreshWorkspaceClaim()
      if (options?.activate && member.workspaceId) {
        // The invitation is accepted either way: a failed switch is the
        // person's to retry, not a reason to report the join as failed.
        await switchTo(member.workspaceId).catch((cause: unknown) => {
          failure.value = failureOf(cause)
        })
      }
      return member
    }),
    declineInvitation: invitationId => run(async () => {
      unwrapAuth(await client.organization.rejectInvitation({ invitationId }))
    }),
    cancelInvitation: invitationId => run(async () => {
      unwrapAuth(await client.organization.cancelInvitation({ invitationId }))
    }),
    // Reads, run as actions so `error` and `isPending` cover them: never reported to `backend:error`.
    getInvitation: invitationId => run(async () => {
      try {
        return invitationOf(unwrapAuth<InvitationDetails & UpstreamRow>(await client.organization.getInvitation({ query: { id: invitationId } })))
      }
      catch (cause) {
        if (invitationNotFound(cause)) return null
        throw cause
      }
    }, { silent: true }),
    listReceivedInvitations: () => run(async () =>
      (unwrapAuth<Array<ReceivedInvitation & UpstreamRow> | null>(await client.organization.listUserInvitations()) ?? []).map(row => invitationOf(row)), { silent: true }),
  }
}
