import { computed, type ComputedRef, type Ref } from 'vue'
import { useConvex } from 'nuxt-convex-module/client'
import { useAuth } from './use-auth'

/** A workspace (Better Auth organization). */
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
  organizationId: string
  userId: string
  role: string
  user?: { email?: string, name?: string, image?: string | null }
}

/** The active workspace with its members and pending invitations. */
export interface ActiveWorkspace extends Workspace {
  members: WorkspaceMember[]
  invitations: Array<{ id: string, email: string, role?: string | null, status: string }>
}

type AuthQuery<T> = Ref<{ data: T | null, isPending: boolean, error?: unknown }>

/** An invitation the signed-in user has received. */
export interface ReceivedInvitation {
  id: string
  email: string
  role?: string | null
  status: string
  organizationId: string
  inviterId: string
  expiresAt: Date | number | string
}

/** A single invitation with its workspace/inviter context (accept-page data). */
export interface InvitationDetails extends ReceivedInvitation {
  organizationName: string
  organizationSlug: string
  inviterEmail: string
}

/** The organization plugin surface `useOrganization` drives. */
interface OrganizationClient {
  useListOrganizations: () => AuthQuery<Workspace[]>
  useActiveOrganization: () => AuthQuery<ActiveWorkspace>
  useActiveMember: () => AuthQuery<WorkspaceMember>
  organization: {
    create: (args: { name: string, slug: string, logo?: string }) => Promise<unknown>
    setActive: (args: { organizationId: string | null }) => Promise<unknown>
    inviteMember: (args: { email: string, role: string, organizationId?: string }) => Promise<unknown>
    leave: (args: { organizationId: string }) => Promise<unknown>
    acceptInvitation: (args: { invitationId: string }) => Promise<unknown>
    rejectInvitation: (args: { invitationId: string }) => Promise<unknown>
    cancelInvitation: (args: { invitationId: string }) => Promise<unknown>
    getInvitation: (args: { query: { id: string } }) => Promise<unknown>
    listUserInvitations: () => Promise<unknown>
  }
}

export interface UseOrganizationReturn {
  /** Every workspace the user belongs to. */
  organizations: ComputedRef<Workspace[]>
  /** The active workspace (with members + invitations), `null` when none. */
  current: ComputedRef<ActiveWorkspace | null>
  /** The user's membership in the active workspace. */
  member: ComputedRef<WorkspaceMember | null>
  /** The user's role *within the active workspace* (owner/admin/member or custom). */
  role: ComputedRef<string | null>
  /** Members of the active workspace. */
  members: ComputedRef<WorkspaceMember[]>
  /** `true` while workspace state is loading. */
  isLoading: ComputedRef<boolean>
  /**
   * Switch the active workspace. Refreshes the Convex token (the active
   * workspace rides on JWT claims) and re-authenticates the live connection,
   * so all workspace-scoped queries re-run against the new workspace.
   */
  setActive: (organizationId: string) => Promise<void>
  /** Create a workspace (users can own several). */
  create: (args: { name: string, slug: string, logo?: string }) => Promise<unknown>
  /** Invite someone to the active workspace (they receive an accept-link email). */
  invite: (args: { email: string, role?: string, organizationId?: string }) => Promise<unknown>
  /** Leave a workspace (defaults to the active one). */
  leave: (organizationId?: string) => Promise<unknown>
  /**
   * Accept a received invitation. Refreshes the workspace claim; with
   * `activate: true` the joined workspace also becomes the active one.
   */
  acceptInvitation: (invitationId: string, options?: { activate?: boolean }) => Promise<unknown>
  /** Decline a received invitation. */
  declineInvitation: (invitationId: string) => Promise<unknown>
  /** Cancel a pending invitation you (or a teammate) sent — inviter side. */
  cancelInvitation: (invitationId: string) => Promise<unknown>
  /** A single invitation with workspace/inviter context (for the accept page). */
  getInvitation: (invitationId: string) => Promise<InvitationDetails | null>
  /** Invitations the signed-in user has received (across workspaces). */
  listReceivedInvitations: () => Promise<ReceivedInvitation[]>
}

/**
 * Workspace (organization) state and actions, including the full invitation
 * flow (invite / accept / decline / cancel — the packaged `AcceptInvitation`
 * component and `/accept-invitation` page build on these). Anything beyond —
 * member removal, role updates — lives on the fully-typed client:
 * `useAuth().client.organization.*`.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { organizations, current, setActive, create } = useOrganization()
 * </script>
 * <template>
 *   <select :value="current?.id" @change="setActive(($event.target as HTMLSelectElement).value)">
 *     <option v-for="workspace in organizations" :key="workspace.id" :value="workspace.id">
 *       {{ workspace.name }}
 *     </option>
 *   </select>
 * </template>
 * ```
 */
export function useOrganization(): UseOrganizationReturn {
  const auth = useAuth()
  const convex = useConvex()
  const client = auth.client as unknown as OrganizationClient

  const list = client.useListOrganizations()
  const active = client.useActiveOrganization()
  const activeMember = client.useActiveMember()

  // The active workspace is a JWT claim: refresh the cached token, then
  // re-authenticate the live Convex connection so subscriptions re-run
  // with the new workspace (the session id doesn't change on a switch, so
  // nothing else would trigger re-auth until the token expires).
  const refreshWorkspaceClaim = async (): Promise<void> => {
    await auth.fetchAccessToken({ forceRefreshToken: true })
    convex.setAuth(auth.fetchAccessToken)
  }

  const setActive = async (organizationId: string): Promise<void> => {
    await client.organization.setActive({ organizationId })
    await refreshWorkspaceClaim()
  }

  return {
    organizations: computed(() => list.value.data ?? []),
    current: computed(() => active.value.data ?? null),
    member: computed(() => activeMember.value.data ?? null),
    role: computed(() => activeMember.value.data?.role ?? null),
    members: computed(() => active.value.data?.members ?? []),
    isLoading: computed(() => list.value.isPending || active.value.isPending),
    setActive,
    // Creating a workspace makes it the active one, and leaving can drop it —
    // both change the JWT claim, so re-authenticate Convex like setActive does.
    create: async (args) => {
      const result = await client.organization.create(args)
      await refreshWorkspaceClaim()
      return result
    },
    invite: ({ email, role = 'member', organizationId }) =>
      client.organization.inviteMember({ email, role, organizationId }),
    leave: async (organizationId) => {
      const target = organizationId ?? active.value.data?.id
      if (!target) throw new Error('[nuxt-backend] No workspace to leave')
      const result = await client.organization.leave({ organizationId: target })
      await refreshWorkspaceClaim()
      return result
    },
    // Accepting adds a membership (a JWT-relevant change) — refresh the claim
    // like the other membership mutations do.
    acceptInvitation: async (invitationId, options) => {
      const result = await client.organization.acceptInvitation({ invitationId }) as {
        data?: { invitation?: { organizationId?: string } } | null
      }
      await refreshWorkspaceClaim()
      const organizationId = result?.data?.invitation?.organizationId
      if (options?.activate && organizationId) await setActive(organizationId)
      return result
    },
    declineInvitation: invitationId =>
      client.organization.rejectInvitation({ invitationId }),
    cancelInvitation: invitationId =>
      client.organization.cancelInvitation({ invitationId }),
    getInvitation: async (invitationId) => {
      const result = await client.organization.getInvitation({ query: { id: invitationId } }) as {
        data?: InvitationDetails | null
      }
      return result?.data ?? null
    },
    listReceivedInvitations: async () => {
      const result = await client.organization.listUserInvitations() as {
        data?: ReceivedInvitation[] | null
      }
      return result?.data ?? []
    },
  }
}
