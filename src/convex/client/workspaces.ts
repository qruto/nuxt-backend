import type { organization } from 'better-auth/plugins'
import type { GenericDataModel } from 'convex/server'
import type { WorkspaceHookWorkspace, WorkspaceOptions } from './auth-types.js'
import { announceEntity, deletionRefusal } from './entities.js'
import { authRefusal } from './refusals.js'
import { type AuthRuntime, asMutationCtx, hookAdapter } from './runtime.js'

/** The organization plugin's options. */
type OrganizationOptions = NonNullable<Parameters<typeof organization>[0]>

// Workspaces (the organization plugin's organizations): the one every new
// session activates.

/**
 * What finding or making a user's workspace reads and writes: the auth
 * adapter in the session hook ({@link ensureActiveWorkspace}), the
 * component's own tables in the package's data migration
 * (`components/backend/migrations.ts`), so the two make the same workspace.
 */
export interface WorkspaceStore {
  /** The organization of the user's first membership, or null. */
  membershipOf: (userId: string) => Promise<string | null>
  /** The organization with this slug, or null. */
  workspaceBySlug: (slug: string) => Promise<string | null>
  /** Whether the organization has any member. */
  hasMember: (organizationId: string) => Promise<boolean>
  /** Create an organization; resolves with its id. */
  createWorkspace: (data: { name: string, slug: string }) => Promise<string>
  /** Make the user the organization's owner. */
  addOwner: (organizationId: string, userId: string) => Promise<void>
}

/**
 * The workspace a user acts in: their first membership, or their personal
 * workspace, made here when they have none. `name` is the account's display
 * name, which names a workspace made here.
 *
 * A personal workspace can outlive its owner's membership. Left empty, it is
 * the user's again; still held by others, it stays with them, and the user
 * gets a new one under a slug of its own. Creating the old slug again would
 * break the organization's unique slug, and with it every sign-in of the
 * account.
 */
export async function userWorkspace(store: WorkspaceStore, userId: string, name?: string): Promise<string> {
  const membership = await store.membershipOf(userId)
  if (membership) return membership
  const slug = `personal-${userId.toLowerCase()}`
  const personal = await store.workspaceBySlug(slug)
  const organizationId = personal && !(await store.hasMember(personal))
    ? personal
    : await store.createWorkspace({
        name: name ? `${name}'s workspace` : 'Personal workspace',
        slug: personal ? `${slug}-${randomSuffix()}` : slug,
      })
  await store.addOwner(organizationId, userId)
  return organizationId
}

/**
 * Resolve the workspace a new session should activate ({@link userWorkspace}),
 * through the Better Auth adapter the session hook carries: organization and
 * owner membership rows written as the organization plugin writes them.
 */
export async function ensureActiveWorkspace(
  userId: string,
  hookCtx: unknown,
  name?: string,
  onCreated?: (organizationId: string) => void,
): Promise<string | undefined> {
  const adapter = hookAdapter(hookCtx)
  if (!adapter) return undefined
  const now = new Date()
  return userWorkspace({
    membershipOf: async id => (await adapter.findOne({ model: 'member', where: [{ field: 'userId', value: id }] }) as { organizationId?: string } | null)?.organizationId ?? null,
    workspaceBySlug: async slug => (await adapter.findOne({ model: 'organization', where: [{ field: 'slug', value: slug }] }) as { id: string } | null)?.id ?? null,
    hasMember: async id => Boolean(await adapter.findOne({ model: 'member', where: [{ field: 'organizationId', value: id }] })),
    createWorkspace: async (data) => {
      const { id } = await adapter.create({ model: 'organization', data: { ...data, createdAt: now } }) as { id: string }
      onCreated?.(id)
      return id
    },
    addOwner: async (organizationId, owner) => {
      await adapter.create({ model: 'member', data: { organizationId, userId: owner, role: 'owner', createdAt: now } })
    },
  }, userId, name)
}

/** Eight hex characters: a fresh slug beside a personal workspace someone else now holds. */
function randomSuffix(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** A row of the organization plugin, as its hooks hand it over. */
type PluginOrganization = { id: string, name: string, slug: string }
type PluginMember = { userId: string, role: string }

/** A workspace as the package's hooks pass it on. */
const workspaceOf = ({ id, name, slug }: PluginOrganization): WorkspaceHookWorkspace => ({ id, name, slug })

/**
 * The organization plugin's options, from the package's own workspace
 * options: no upstream option passes through. The hooks run with the
 * request's Convex ctx. A workspace the plugin made is a billing entity:
 * billing's free plan hears of it, after the app's `onCreate` ran.
 *
 * @internal
 */
export function organizationOptions<DM extends GenericDataModel>(
  workspaces: WorkspaceOptions<DM> | undefined,
  runtime: AuthRuntime<DM> | undefined,
  sendInvitationEmail: OrganizationOptions['sendInvitationEmail'] | undefined,
): OrganizationOptions {
  const ctx = asMutationCtx(runtime?.ctx)
  const { invitationExpiresIn, canInvite, onCreate, onMemberAdded, onMemberRemoved } = workspaces ?? {}
  const memberAdded = onMemberAdded && ctx
    ? async ({ member, organization }: { member: PluginMember, organization: PluginOrganization }) => onMemberAdded(ctx, { workspace: workspaceOf(organization), userId: member.userId, role: member.role })
    : undefined
  return {
    ...(invitationExpiresIn === undefined ? {} : { invitationExpiresIn }),
    ...(sendInvitationEmail ? { sendInvitationEmail } : {}),
    organizationHooks: {
      // A workspace the plugin made, through its create route or the
      // server's own `auth.api.createOrganization`.
      afterCreateOrganization: async ({ organization, user }) => {
        if (onCreate && ctx) await onCreate(ctx, { workspace: workspaceOf(organization), userId: user.id })
        await announceEntity(runtime, { kind: 'workspace', id: organization.id })
      },
      // A workspace that still holds a paid subscription stays: deleted, it
      // would go on being billed with no workspace left to cancel it from.
      beforeDeleteOrganization: async ({ organization }) => {
        const reason = await deletionRefusal(runtime, { kind: 'workspace', id: organization.id })
        if (reason) throw authRefusal('forbidden', { reason })
      },
      ...(canInvite && ctx
        ? {
            beforeCreateInvitation: async ({ invitation }) => {
              const verdict = await canInvite(ctx, { email: invitation.email.toLowerCase(), role: invitation.role, workspaceId: invitation.organizationId, inviterId: invitation.inviterId })
              if (verdict === true) return
              const message = typeof verdict === 'object' && verdict !== null && typeof verdict.message === 'string' && verdict.message ? verdict.message : undefined
              throw authRefusal('forbidden', { reason: 'invitation_refused', ...(message ? { message } : {}) })
            },
          }
        : {}),
      ...(memberAdded ? { afterAddMember: memberAdded, afterAcceptInvitation: memberAdded } : {}),
      ...(onMemberRemoved && ctx
        ? { afterRemoveMember: async ({ member, organization }) => onMemberRemoved(ctx, { workspace: workspaceOf(organization), userId: member.userId, role: member.role }) }
        : {}),
    },
  }
}
