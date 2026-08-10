import { admin, authed, org, withRole } from './functions'

/**
 * Live demos of the pre-authorized function builders (see functions.ts) —
 * each of these enforces its guard SERVER-SIDE, so the authorization
 * playground page can show real pass/deny outcomes per role.
 */

/** Any signed-in, non-banned user. */
export const whoami = authed.query({
  args: {},
  handler: async (ctx) => {
    const user = ctx.user as { email?: string, role?: string, banned?: boolean }
    return { email: user.email ?? null, role: user.role ?? 'user', banned: user.banned === true }
  },
})

/** Requires a fresh workspace membership — `ctx.organization` is live data. */
export const workspaceInfo = org.query({
  args: {},
  handler: async (ctx) => {
    const organization = ctx.organization as { name?: string, role?: string }
    return { workspace: organization.name ?? null, role: organization.role ?? null }
  },
})

/** App-wide admin only — everyone else gets a server-side denial. */
export const adminStat = admin.query({
  args: {},
  handler: async (ctx) => {
    const logs = await ctx.db.query('logs').take(1000)
    return { logRows: logs.length }
  },
})

/** Custom role tier — deny unless the user carries the `editor` role. */
export const editorOnly = withRole('editor').query({
  args: {},
  handler: async () => ({ ok: true as const, secret: 'visible to editors only' }),
})
