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
  /** Invite someone to the active workspace. */
  invite: (args: { email: string, role?: string, organizationId?: string }) => Promise<unknown>
  /** Leave a workspace (defaults to the active one). */
  leave: (organizationId?: string) => Promise<unknown>
}

/**
 * Workspace (organization) state and actions. Everything beyond the common
 * flows — invitations management, member removal, role updates — lives on the
 * fully-typed client: `useAuth().client.organization.*`.
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

  const setActive = async (organizationId: string): Promise<void> => {
    await client.organization.setActive({ organizationId })
    // The active workspace is a JWT claim: refresh the cached token, then
    // re-authenticate the live Convex connection so subscriptions re-run
    // with the new workspace (the session id doesn't change on a switch, so
    // nothing else would trigger re-auth until the token expires).
    await auth.fetchAccessToken({ forceRefreshToken: true })
    convex.setAuth(auth.fetchAccessToken)
  }

  return {
    organizations: computed(() => list.value.data ?? []),
    current: computed(() => active.value.data ?? null),
    member: computed(() => activeMember.value.data ?? null),
    role: computed(() => activeMember.value.data?.role ?? null),
    members: computed(() => active.value.data?.members ?? []),
    isLoading: computed(() => list.value.isPending || active.value.isPending),
    setActive,
    create: args => client.organization.create(args),
    invite: ({ email, role = 'member', organizationId }) =>
      client.organization.inviteMember({ email, role, organizationId }),
    leave: async (organizationId) => {
      const target = organizationId ?? active.value.data?.id
      if (!target) throw new Error('[nuxt-backend] No workspace to leave')
      return client.organization.leave({ organizationId: target })
    },
  }
}
