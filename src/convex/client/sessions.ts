import type { GenericDataModel, GenericQueryCtx } from 'convex/server'
import type { AdapterRefs } from './component.js'

// The caller's device sessions, read from the component's session table for
// `setupAuth`'s `listSessions` and `revokeSession`.

/** Sessions read per page; every page is read. */
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
 * A user's sessions, latest expiry first, without the ones an admin opened by
 * impersonating them (Better Auth's /list-sessions hides those too). Expired
 * rows are left in: a query must not read the clock, so callers drop them.
 *
 * Read through the session table's `userId` index, every page of it, and
 * sorted here. One page left out every session past the first hundred, and
 * an adapter sort on `expiresAt` stays on the user's rows only through an
 * index on `[userId, expiresAt]`: without one, it scans the whole table in
 * creation order under a row cap, and a user whose sessions are older than
 * the deployment's newest few hundred finds none of them.
 */
export async function userSessions(
  ctx: Pick<GenericQueryCtx<GenericDataModel>, 'runQuery'>,
  adapter: AdapterRefs,
  userId: string,
): Promise<SessionRow[]> {
  const rows: SessionRow[] = []
  let cursor: string | null = null
  for (;;) {
    const result: { page: unknown[], isDone: boolean, continueCursor: string } = await ctx.runQuery(adapter.findMany, {
      model: 'session',
      where: [{ field: 'userId', value: userId }],
      paginationOpts: { numItems: SESSION_PAGE_SIZE, cursor },
    })
    rows.push(...result.page as SessionRow[])
    // A cursor that does not move would page forever.
    if (result.isDone || result.continueCursor === cursor) break
    cursor = result.continueCursor
  }
  return rows
    .filter(row => !row.impersonatedBy)
    .sort((a, b) => b.expiresAt - a.expiresAt || b.createdAt - a.createdAt)
}
