import { type FunctionHandle, paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'
import { internal } from './_generated/api.js'
import type { Doc } from './_generated/dataModel.js'
import { internalMutation, mutation, type MutationCtx, query, type QueryCtx } from './_generated/server.js'
import { administratorActs, ERASED_PREFIX, nameReader, partyOf, vPartyKind } from './parties.js'
import { vEventData, vEventRow } from './schema.js'
import { backendError } from '../../errors.js'
import { deriveDeliveries, eventProblem, HIDDEN_FROM_OWN_ACTIVITY } from '../../events.js'
import { logBackend } from '../../log.js'
import type { NotificationPlan } from '../../notifications.js'
import { notifyEvent } from './notifications.js'
import { onLifecycleSignal } from './lifecycle.js'
import { countEvent } from './funnel.js'

/**
 * The audit trail: the component's half of the shared event path. `record`
 * writes one row per event (`recordBackendEvent` in nuxt-backend/audit, and
 * the auth layer's own write points), logs one line naming only the event's
 * type and id, and hands the event to the app's `onEvent` action when the
 * app has one. `list` reads a page of it for one reader: an account's own
 * activity, a workspace's, or everything. `forgetSubject` is the trail's
 * part of an account's erasure. The maintenance pass deletes rows
 * `AUDIT_EVENT_RETENTION_MS` after they were written (maintenance.ts).
 */

/** What the app's `notify` made of an event of its own: the channels it may use and where it links. */
const vNotifyPlan = v.object({ channels: v.array(v.union(v.literal('app'), v.literal('email'), v.literal('push'))), link: v.optional(v.string()) })

const vDeliveries = v.object({ inApp: v.boolean(), email: v.boolean() })

/** Rows one erasure transaction rewrites at most, before it hands the rest to a fresh one. */
export const ERASURE_BATCH = 200

/** The most rows a page of activity holds. */
export const AUDIT_PAGE_MAX = 100

/**
 * Record one event: check it against the catalog, write its row, log its
 * type and id, count it into the growth funnel (`activation` names the
 * kind that activates an account; without one, its first `app.*` event
 * does), and schedule the app's `onEvent` action (`forward`, a function
 * handle) with it, fire and forget. `deliver` is the handle of the
 * app's `deliverNotification`, which email and push notifications go
 * through. Returns the row's id and what the event
 * derives by the channel matrix. Run from a mutation, it commits or rolls
 * back with the caller's writes.
 */
/** Run what an event sets off beside it: a failure goes to `failed`, which logs it, and never fails the event. */
async function beside(run: () => Promise<unknown>, failed: (error: unknown) => void): Promise<void> {
  try {
    await run()
  }
  catch (error) {
    failed(error)
  }
}

export const record = mutation({
  args: { event: vEventRow, forward: v.optional(v.string()), notify: v.optional(vNotifyPlan), deliver: v.optional(v.string()), activation: v.optional(v.string()) },
  returns: v.object({ id: v.string(), deliveries: vDeliveries }),
  handler: async (ctx, { event, forward, notify, deliver, activation }) => {
    const problem = eventProblem(event)
    if (problem) throw backendError('invalid_input', { field: problem.field, reason: problem.reason }, `[nuxt-backend] recordBackendEvent: ${problem.field} must be ${problem.reason}.`)
    const at = Date.now()
    const id = await ctx.db.insert('auditEvents', { ...event, at })
    logBackend('info', 'audit.recorded', `${event.type} ${id}`)
    const recorded = { ...event, id, at }
    // What the event sets off beside it; a failure of any one is logged and never fails the event.
    // The people it is for hear of it in the same transaction.
    await beside(() => notifyEvent(ctx, recorded, notify as NotificationPlan | undefined, deliver ? { deliver } : {}), error => logBackend('warn', 'notifications.deliver_failed', `Notifications for ${event.type} ${id} were not delivered; the event is recorded.`, error))
    // A billing event starts and stops the lifecycle flows it names.
    if (event.type.startsWith('billing.')) {
      await beside(() => onLifecycleSignal(ctx, { type: event.type, ...(event.entityId ? { entityId: event.entityId } : {}), ...(event.data ? { data: event.data } : {}) }), error => logBackend('warn', 'email.lifecycle_failed', `The lifecycle flows did not hear of ${event.type} ${id}; the event is recorded.`, error))
    }
    // The growth funnel and the experiments count it.
    await beside(() => countEvent(ctx, recorded, { ...(activation ? { activation } : {}), ...(forward ? { forward } : {}) }), error => logBackend('warn', 'funnel.count_failed', `The growth funnel did not count ${event.type} ${id}; the event is recorded.`, error))
    if (forward) {
      await beside(() => ctx.scheduler.runAfter(0, forward as FunctionHandle<'action'>, { event: recorded }), error => logBackend('warn', 'audit.forward_failed', `The app's onEvent action could not be scheduled for ${event.type} ${id}; the event is recorded.`, error))
    }
    return { id, deliveries: deriveDeliveries(event.type, event.subjectId) }
  },
})

/** Someone an entry names, as its reader may know them. */
const vParty = v.object({
  kind: vPartyKind,
  id: v.union(v.string(), v.null()),
  name: v.union(v.string(), v.null()),
})

/** One entry of a page of activity. */
export const vAuditEntry = v.object({
  id: v.string(),
  type: v.string(),
  at: v.number(),
  actor: vParty,
  subject: v.union(vParty, v.null()),
  workspace: v.union(v.object({ id: v.string(), name: v.union(v.string(), v.null()) }), v.null()),
  impersonated: v.boolean(),
  targetId: v.union(v.string(), v.null()),
  data: vEventData,
})

/** Whose activity a page reads, and who reads it. */
const vView = v.union(
  v.object({ kind: v.literal('subject'), userId: v.string() }),
  v.object({ kind: v.literal('workspace'), workspaceId: v.string(), viewerId: v.string() }),
  v.object({ kind: v.literal('all'), viewerId: v.string() }),
)

type View = typeof vView.type

/** One entry, its ids put into words its reader may see. */
async function entryOf(row: Doc<'auditEvents'>, view: View, names: ReturnType<typeof nameReader>) {
  const viewerId = view.kind === 'subject' ? view.userId : view.viewerId
  const party = (id: string | undefined, administrator: boolean) => partyOf(names, id, viewerId, administrator)
  return {
    id: row._id,
    type: row.type,
    at: row.at,
    actor: await party(row.actorId, view.kind === 'subject' && administratorActs(row)),
    subject: row.subjectId === undefined ? null : await party(row.subjectId, false),
    workspace: row.entityId === undefined ? null : { id: row.entityId, name: await names.workspace(row.entityId) },
    impersonated: row.impersonatorId !== undefined,
    targetId: row.targetId ?? null,
    data: row.data ?? {},
  }
}

/** Where a page resumes: the last row it holds, by its place in the index (`at`, then `_creationTime`). */
interface Cursor {
  at: number
  creationTime: number
}

/** A cursor read back; `null` for the first page, or one that does not parse. */
function readCursor(cursor: string | null): Cursor | null {
  const match = cursor ? /^(\d+):(\d+(?:\.\d+)?)$/.exec(cursor) : null
  return match ? { at: Number(match[1]), creationTime: Number(match[2]) } : null
}

/**
 * The rows of one reader's view, newest first, from `after` on: the rows
 * recorded at its instant before it, then the older ones. The view's own
 * equality bounds every range, so no cursor reaches another reader's rows.
 */
function rowsOf(ctx: QueryCtx, view: View, after: Cursor | null) {
  const events = ctx.db.query('auditEvents')
  const scoped = (range: (q: IndexRange) => IndexRange) => view.kind === 'subject'
    ? events.withIndex('subjectId_at', q => range(q.eq('subjectId', view.userId) as never) as never)
    : view.kind === 'workspace'
      ? events.withIndex('entityId_at', q => range(q.eq('entityId', view.workspaceId) as never) as never)
      : events.withIndex('at', q => range(q as never) as never)
  // A person's own view leaves out what would tell them which test cohort they are in.
  // No index holds the type beside the subject and the time; the hidden kinds are
  // rare (an exposure is once per person and experiment), so few rows are skipped.
  const shown = (query: ReturnType<typeof scoped>) => view.kind === 'subject'
    // eslint-disable-next-line @convex-dev/no-filter-in-query
    ? query.order('desc').filter(q => q.and(...HIDDEN_FROM_OWN_ACTIVITY.map(type => q.neq(q.field('type'), type))))
    : query.order('desc')
  if (!after) return [shown(scoped(q => q))]
  return [
    shown(scoped(q => q.eq('at', after.at).lt('_creationTime', after.creationTime))),
    shown(scoped(q => q.lt('at', after.at))),
  ]
}

/** The part of an index range `rowsOf` narrows: `at`, then `_creationTime`. */
interface IndexRange {
  eq: (field: 'at', value: number) => IndexRange
  lt: (field: 'at' | '_creationTime', value: number) => IndexRange
}

/**
 * A page of activity, newest first, for one reader: an account's own (the
 * rows about it), a workspace's (the rows inside it), or every row. The app
 * decides who may read which (nuxt-backend/audit checks the caller first);
 * this only shapes what it returns: names of accounts and workspaces, never
 * an address, and an administrator who acted on an account is unnamed in
 * that account's own activity. A page's cursor is the place of its last
 * row, so a page reads the same rows however many events arrive above it.
 */
export const list = query({
  args: { view: vView, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(vAuditEntry),
  handler: async (ctx, { view, paginationOpts }) => {
    const size = Math.max(1, Math.min(Math.floor(paginationOpts.numItems), AUDIT_PAGE_MAX))
    const rows: Doc<'auditEvents'>[] = []
    // One row past the page says whether another page follows.
    for (const query of rowsOf(ctx, view, readCursor(paginationOpts.cursor))) {
      rows.push(...await query.take(size + 1 - rows.length))
      if (rows.length > size) break
    }
    const page = rows.slice(0, size)
    const last = page.at(-1)
    const names = nameReader(ctx)
    return {
      page: await Promise.all(page.map(row => entryOf(row, view, names))),
      isDone: rows.length <= size,
      continueCursor: last ? `${last.at}:${last._creationTime}` : paginationOpts.cursor ?? '',
    }
  },
})

/** The most tasks one lookup of first events answers (the checklist holds at most seven). */
const FIRST_EVENTS_MAX = 16

/**
 * When each of the given event kinds was first recorded for an account, or
 * for the workspace it is in (a task with the `workspace` scope): the
 * activation checklist's ticks. A row recorded while an administrator acted
 * as the account never counts, since it is not the person's first result.
 * `null` while the kind has not landed, and for a workspace task when no
 * workspace is named.
 */
export const firstEvents = query({
  args: {
    userId: v.string(),
    workspaceId: v.optional(v.string()),
    tasks: v.array(v.object({ key: v.string(), kind: v.string(), scope: v.union(v.literal('person'), v.literal('workspace')) })),
  },
  returns: v.array(v.object({ key: v.string(), at: v.union(v.number(), v.null()) })),
  handler: async (ctx, { userId, workspaceId, tasks }) => {
    if (tasks.length > FIRST_EVENTS_MAX) throw backendError('invalid_input', { field: 'tasks' }, '[nuxt-backend] firstEvents: too many tasks in one lookup.')
    return Promise.all(tasks.map(async ({ key, kind, scope }) => {
      if (scope === 'workspace' && !workspaceId) return { key, at: null }
      const rows = ctx.db.query('auditEvents')
      const indexed = scope === 'workspace'
        ? rows.withIndex('type_entityId', q => q.eq('type', kind).eq('entityId', workspaceId))
        : rows.withIndex('type_subjectId', q => q.eq('type', kind).eq('subjectId', userId))
      // Oldest first, to the first row nobody recorded on the person's behalf.
      for await (const row of indexed) {
        if (row.impersonatorId === undefined) return { key, at: row.at }
      }
      return { key, at: null }
    }))
  },
})

/**
 * What an account's erasure does with a row the account took part in:
 * removes it as the account's own record, or keeps it as someone else's
 * with the account's id pseudonymized.
 * - Kept: a row an administrator took part in, acting on an account or
 *   behind its session. It is the record of what an administrator did,
 *   which neither account's deletion removes.
 * - Removed: any other row in the account's personal workspace, which is
 *   named after the person and would point to the pseudonym.
 * - Kept: any other row in a workspace (its other managers read it), and a
 *   row where the account acted on another, or another acted on it.
 * - Removed: the rest, the account's own record.
 */
function erasureOf(row: Doc<'auditEvents'>, userId: string, personal: boolean): 'remove' | 'keep' {
  if (row.impersonatorId !== undefined || administratorActs(row)) return 'keep'
  if (personal) return 'remove'
  if (row.entityId !== undefined || row.subjectId !== userId) return 'keep'
  return row.actorId === undefined || row.actorId === userId ? 'remove' : 'keep'
}

/**
 * Whether a workspace is the account's personal one, which its first
 * sign-in made under the slug `personal-<id>` (or that slug and a suffix,
 * when others held the first). Each workspace is read once per batch.
 */
function personalWorkspaces(ctx: MutationCtx, userId: string): (entityId: string | undefined) => Promise<boolean> {
  const slug = `personal-${userId.toLowerCase()}`
  const known = new Map<string, Promise<boolean>>()
  const read = async (entityId: string) => {
    const id = ctx.db.normalizeId('organization', entityId)
    const workspace = id ? await ctx.db.get('organization', id) : null
    return workspace ? workspace.slug === slug || workspace.slug.startsWith(`${slug}-`) : false
  }
  return (entityId) => {
    if (entityId === undefined) return Promise.resolve(false)
    if (!known.has(entityId)) known.set(entityId, read(entityId))
    return known.get(entityId)!
  }
}

/** A fresh pseudonym: `erased:` and sixteen random hex characters, derived from nothing of the account. */
export function pseudonym(): string {
  return ERASED_PREFIX + Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** The id fields of a row an erased account's id is replaced in. */
const ERASED_FIELDS = ['actorId', 'impersonatorId', 'subjectId'] as const

/**
 * One batch of an erasure: every row about the account, acted in by it or
 * behind a session as it, removed or given the pseudonym instead of its id
 * ({@link erasureOf}). A rewritten row leaves the index the next read
 * starts from, so each batch reads from the start. Returns whether rows
 * may be left.
 */
export async function forgetBatch(ctx: MutationCtx, userId: string, alias: string): Promise<boolean> {
  const personal = personalWorkspaces(ctx, userId)
  const reads = [
    () => ctx.db.query('auditEvents').withIndex('subjectId_at', q => q.eq('subjectId', userId)),
    () => ctx.db.query('auditEvents').withIndex('actorId', q => q.eq('actorId', userId)),
    () => ctx.db.query('auditEvents').withIndex('impersonatorId', q => q.eq('impersonatorId', userId)),
  ]
  let budget = ERASURE_BATCH
  for (const read of reads) {
    if (budget <= 0) break
    for (const row of await read().take(budget)) {
      if (erasureOf(row, userId, await personal(row.entityId)) === 'remove') await ctx.db.delete('auditEvents', row._id)
      else await ctx.db.patch('auditEvents', row._id, Object.fromEntries(ERASED_FIELDS.filter(field => row[field] === userId).map(field => [field, alias])))
      budget--
    }
  }
  return budget <= 0
}

/**
 * The audit trail's part of an account's erasure, run once its account is
 * deleted: the rows of the account's own record are removed, and the
 * account's id becomes one pseudonym in the rows that stay, the ones of a
 * workspace's trail, the ones it acted in on someone else and the ones an
 * administrator took part in ({@link erasureOf}). Batched: what one
 * transaction leaves, a scheduled one finishes.
 */
export const forgetSubject = mutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const alias = pseudonym()
    if (await forgetBatch(ctx, userId, alias)) await ctx.scheduler.runAfter(0, internal.audit.continueForgetting, { userId, alias })
    return null
  },
})

/** The next batch of an erasure `forgetSubject` started. */
export const continueForgetting = internalMutation({
  args: { userId: v.string(), alias: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, alias }) => {
    if (await forgetBatch(ctx, userId, alias)) await ctx.scheduler.runAfter(0, internal.audit.continueForgetting, { userId, alias })
    return null
  },
})
