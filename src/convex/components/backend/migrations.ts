import { getFunctionName } from 'convex/server'
import { v } from 'convex/values'
import { userWorkspace, type WorkspaceStore } from '../../client/workspaces.js'
import { Migrations } from '@convex-dev/migrations'
import { PACKAGE_MIGRATIONS, type PackageMigrationName, type PackageMigrationStatus } from '../../package-migrations.js'
import { components, internal } from './_generated/api.js'
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server.js'
import schema from './schema.js'

/**
 * The package's own data migrations (`PACKAGE_MIGRATIONS` lists them), on
 * the migrations component nested in this one: its record of how far each
 * got lives beside the tables it migrates, apart from the app's own
 * migrations. `nuxt-backend upgrade` reads `status` and calls `run` with
 * `convex run --component backend`; neither is part of the component's API.
 */
const migrations = new Migrations(components.migrations, { schema })

/** The component's own tables as the workspace resolution reads and writes them: the same rows a sign-in makes. */
function tableStore(ctx: MutationCtx): WorkspaceStore {
  return {
    membershipOf: async userId => (await ctx.db.query('member').withIndex('userId', q => q.eq('userId', userId)).first())?.organizationId ?? null,
    workspaceBySlug: async slug => (await ctx.db.query('organization').withIndex('slug', q => q.eq('slug', slug)).first())?._id ?? null,
    hasMember: async organizationId => (await ctx.db.query('member').withIndex('organizationId', q => q.eq('organizationId', organizationId)).first()) !== null,
    createWorkspace: async data => await ctx.db.insert('organization', { ...data, createdAt: Date.now() }),
    addOwner: async (organizationId, userId) => {
      await ctx.db.insert('member', { organizationId, userId, role: 'owner', createdAt: Date.now() })
    },
  }
}

/**
 * 0.2.0: workspaces are always on, and a sign-in gives a user without one
 * their personal workspace. A user of an app that ran without workspaces
 * has none until they sign in again; this gives it now to each one signed
 * in (a live session), the same workspace their sign-in would have made.
 * Anyone else gets it at their next sign-in, which asks the app's
 * `canSignIn` first: the migration cannot ask it (the gate runs in the
 * app, this in the component), so it writes nothing for a user who is not
 * signed in now. A banned user is left too, as the sign-in refuses before
 * it writes.
 */
export const personalWorkspaces = migrations.define({
  table: 'user',
  migrateOne: async (ctx, user) => {
    const now = Date.now()
    if (user.banned && (!user.banExpires || user.banExpires > now)) return
    const signedIn = await ctx.db.query('session').withIndex('userId_expiresAt', q => q.eq('userId', user._id).gt('expiresAt', now)).first()
    if (!signedIn) return
    await userWorkspace(tableStore(ctx), user._id, user.name)
  },
})

/**
 * 0.2.0: a new session activates a workspace, which billing and the
 * workspace pages act in. A session that predates it keeps none until it
 * ends; this activates the user's first workspace on every one still live.
 */
export const activeWorkspaces = migrations.define({
  table: 'session',
  migrateOne: async (ctx, session) => {
    if (session.activeOrganizationId || session.expiresAt <= Date.now()) return
    const organizationId = await tableStore(ctx).membershipOf(session.userId)
    return organizationId ? { activeOrganizationId: organizationId } : undefined
  },
})

/** Each package migration's definition, by its registry name. */
const DEFINED = {
  personalWorkspaces: internal.migrations.personalWorkspaces,
  activeWorkspaces: internal.migrations.activeWorkspaces,
} satisfies Record<PackageMigrationName, unknown>

const ORDER = PACKAGE_MIGRATIONS.map(migration => DEFINED[migration.name])

const vPackageMigration = v.object({
  name: v.string(),
  since: v.string(),
  does: v.string(),
  state: v.union(v.literal('pending'), v.literal('running'), v.literal('done'), v.literal('failed')),
  processed: v.number(),
  error: v.optional(v.string()),
})

/** Where this deployment is with each package migration, in the registry's order. */
async function statuses(ctx: QueryCtx | MutationCtx): Promise<PackageMigrationStatus[]> {
  const reported = new Map((await migrations.getStatus(ctx, { migrations: ORDER })).map(status => [status.name, status]))
  return PACKAGE_MIGRATIONS.map(({ name, since, does }) => {
    const status = reported.get(getFunctionName(DEFINED[name]))
    // `unknown` is a migration never started, or one a series has yet to reach.
    const state = !status || status.state === 'unknown' ? 'pending' : status.state === 'success' ? 'done' : status.state === 'inProgress' ? 'running' : 'failed'
    const error = status?.error ?? (status?.state === 'canceled' ? 'canceled' : undefined)
    return { name, since, does, state, processed: status?.processed ?? 0, ...(error && state === 'failed' ? { error } : {}) }
  })
}

/** Every package migration and where this deployment is with it: what `nuxt-backend upgrade` reads. */
export const status = internalQuery({
  args: {},
  returns: v.array(vPackageMigration),
  handler: ctx => statuses(ctx),
})

/**
 * Start the package migrations this deployment has not finished, in the
 * registry's order, one after another, from the first unfinished one: one
 * that failed or was canceled resumes where it stopped, and a failure stops
 * the series until the next run. Returns where each stands once that one's
 * first batch ran — a retry that failed again reads as failed, one that got
 * past its error as running — and the rest continue on the scheduler.
 */
export const run = internalMutation({
  args: {},
  returns: v.array(vPackageMigration),
  handler: async (ctx) => {
    const first = (await statuses(ctx)).findIndex(migration => migration.state !== 'done')
    if (first >= 0) await migrations.runSerially(ctx, ORDER.slice(first))
    return statuses(ctx)
  },
})
