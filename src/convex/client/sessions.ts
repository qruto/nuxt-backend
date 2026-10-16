import type { GenericDataModel, GenericQueryCtx } from 'convex/server'
import type { AdapterRefs } from './component.js'

// The caller's device sessions, read from the component's session table for
// `makeAuthApi`'s `listSessions` and `revokeSession`.

/** More device sessions than any real account holds; a bound, not pagination. */
const SESSION_PAGE_SIZE = 100

/** A session row as the component stores it. */
interface SessionRow {
  _id: string
  token: string
  userId: string
  userAgent?: string | null
  createdAt: number
  updatedAt: number
  expiresAt: number
  impersonatedBy?: string | null
}

/**
 * The Better Auth session behind a Convex identity. Session JWTs carry it as
 * `sessionId`; agent tokens from the MCP exchange carry none.
 */
export function identitySessionId(identity: unknown): string | null {
  const sessionId = (identity as { sessionId?: unknown } | null)?.sessionId
  return typeof sessionId === 'string' ? sessionId : null
}

/**
 * A user's sessions, latest expiry first, without the ones an admin opened by
 * impersonating them (Better Auth's /list-sessions hides those too). Expired
 * rows are left in: a query must not read the clock, so callers drop them.
 */
export async function userSessions(
  ctx: Pick<GenericQueryCtx<GenericDataModel>, 'runQuery'>,
  adapter: AdapterRefs,
  userId: string,
): Promise<SessionRow[]> {
  const result = await ctx.runQuery(adapter.findMany, {
    model: 'session',
    where: [{ field: 'userId', value: userId }],
    sortBy: { field: 'expiresAt', direction: 'desc' },
    paginationOpts: { numItems: SESSION_PAGE_SIZE, cursor: null },
  })
  return (result.page as SessionRow[]).filter(row => !row.impersonatedBy)
}
