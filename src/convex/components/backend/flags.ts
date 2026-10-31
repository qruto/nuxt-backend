import { v } from 'convex/values'
import { backendError } from '../../errors.js'
import { FLAG_ROWS_MAX } from '../../flags.js'
import { mutation, type MutationCtx, query } from './_generated/server.js'
import { vFlagOverride } from './schema.js'

/**
 * Feature flags: the component's half. One row per flag an administrator
 * overrode (`setupFlags`'s `setFlag` writes it, checked and normalized
 * there); a flag without one holds its default from code. `list` serves
 * every evaluation of a request at once, `get` one flag (the package's kill
 * switches, read where it honors them), and `forgetUser` is the flags' part
 * of an account's erasure: the account leaves every target list.
 */

const vFlagRow = v.object({ key: v.string(), override: vFlagOverride, updatedAt: v.number() })

/** Every stored override, by key order. */
export const list = query({
  args: {},
  returns: v.array(vFlagRow),
  handler: async (ctx) => {
    const rows = await ctx.db.query('flagOverrides').withIndex('key').take(FLAG_ROWS_MAX)
    return rows.map(({ key, override, updatedAt }) => ({ key, override, updatedAt }))
  },
})

/** One flag's stored override, or `null` while it holds its default. */
export const get = query({
  args: { key: v.string() },
  returns: v.union(v.null(), vFlagRow),
  handler: async (ctx, { key }) => {
    const row = await ctx.db.query('flagOverrides').withIndex('key', q => q.eq('key', key)).unique()
    return row ? { key: row.key, override: row.override, updatedAt: row.updatedAt } : null
  },
})

/**
 * Store a flag's override, replacing the one before; `null` removes it, so
 * the flag holds its default again. A new override past
 * {@link FLAG_ROWS_MAX} is refused, so `list` and `forgetUser` always read
 * every one.
 */
export const set = mutation({
  args: { key: v.string(), override: v.union(v.null(), vFlagOverride) },
  returns: v.null(),
  handler: async (ctx, { key, override }) => {
    const row = await ctx.db.query('flagOverrides').withIndex('key', q => q.eq('key', key)).unique()
    if (override === null) {
      if (row) await ctx.db.delete('flagOverrides', row._id)
      return null
    }
    const updatedAt = Date.now()
    if (row) {
      // An administrator's write: the override is theirs now, which no automatic reset clears.
      await ctx.db.patch('flagOverrides', row._id, { override, updatedAt, setBy: undefined })
      return null
    }
    if ((await ctx.db.query('flagOverrides').take(FLAG_ROWS_MAX)).length >= FLAG_ROWS_MAX) {
      throw backendError('invalid_input', { field: 'key', reason: 'too_many_overrides' }, `[nuxt-backend] setFlag: ${FLAG_ROWS_MAX} flags hold an override already; remove one first.`)
    }
    await ctx.db.insert('flagOverrides', { key, override, updatedAt })
    return null
  },
})

/** Take an account's id out of every override that targets it: at most {@link FLAG_ROWS_MAX} rows, so one transaction does. */
export async function forgetFlagTargets(ctx: MutationCtx, userId: string): Promise<void> {
  for (const row of await ctx.db.query('flagOverrides').take(FLAG_ROWS_MAX)) {
    if (!row.override.users?.includes(userId)) continue
    const users = row.override.users.filter(id => id !== userId)
    const { users: _users, ...rest } = row.override
    await ctx.db.patch('flagOverrides', row._id, { override: users.length ? { ...rest, users } : rest })
  }
}

/** The flags' part of an account's erasure: the account's id leaves every override that targets it. */
export const forgetUser = mutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await forgetFlagTargets(ctx, userId)
    return null
  },
})
