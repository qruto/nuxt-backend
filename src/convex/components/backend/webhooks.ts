import { v } from 'convex/values'
import { internal } from './_generated/api.js'
import type { Doc } from './_generated/dataModel.js'
import { internalMutation, type MutationCtx, mutation, query, type QueryCtx } from './_generated/server.js'
import { vDeliveryOutcome } from './schema.js'

/**
 * Webhook delivery log — never a source of truth. Every request on
 * `/billing/events` and `/email/events` is recorded with its outcome, which
 * powers redelivery dedupe (`find`), the DevTools Webhooks page and the
 * playground's webhook feed (`listRecent`). How depends on whether the request
 * proved who sent it:
 *
 * - A delivery whose signature verified (`ok`, `unknown_type`,
 *   `handler_error`) gets a row of its own, in a ring of the newest
 *   {@link RING_CAP}. Recording one inserts the row and reads the one trim
 *   schedule row, never the ring, so concurrent deliveries do not contend.
 *   The ring is trimmed off that path: a delivery that finds no trim pending
 *   schedules one {@link TRIM_INTERVAL_MS} later.
 * - A request answered before any signature verified — refused for a missing
 *   secret, an oversized body or a bad signature, or answered as a
 *   `duplicate` of a processed id — is counted per service and outcome
 *   instead, keeping the latest one's id. Anyone can send one, so a flood of
 *   them neither grows the log nor pushes a verified delivery out of the ring
 *   (and with it the dedupe of its redelivery).
 */

/** Verified deliveries the ring keeps. */
const RING_CAP = 200

/** How long a trim waits after the delivery that scheduled it: at most one runs per interval. */
const TRIM_INTERVAL_MS = 60 * 60 * 1000

/**
 * Rows younger than this wait for the next trim. A trim reads only rows older
 * than any delivery still being recorded, so it never conflicts with one.
 */
const TRIM_GRACE_MS = 60 * 1000

/** Rows one trim deletes before it hands the rest to a fresh transaction. */
const TRIM_BATCH = 500

/** A tally starts counting afresh after a day without a request of its kind. */
const TALLY_WINDOW_MS = 24 * 60 * 60 * 1000

/** How much of each caller-supplied string a row keeps. */
const DELIVERY_ID_LIMIT = 128
const TYPE_LIMIT = 128
const NOTE_LIMIT = 500

/** Rows `listRecent` serves when no limit is given. */
const DEFAULT_FEED_SIZE = 50

type DeliveryOutcome = Doc<'webhookDeliveries'>['outcome']
type TalliedOutcome = Doc<'webhookTallies'>['outcome']

const TALLIED_OUTCOMES: ReadonlySet<DeliveryOutcome> = new Set<TalliedOutcome>(['missing_secret', 'oversized', 'invalid_signature', 'duplicate'])

/** Answered before any signature verified: counted, never logged one by one. */
function isTallied(outcome: DeliveryOutcome): outcome is TalliedOutcome {
  return TALLIED_OUTCOMES.has(outcome)
}

/** `value` cut to `limit` UTF-16 units, never between the halves of a surrogate pair. */
function clip(value: string, limit: number): string {
  if (value.length <= limit) return value
  const last = value.charCodeAt(limit - 1)
  return value.slice(0, last >= 0xD800 && last <= 0xDBFF ? limit - 1 : limit)
}

interface Entry {
  service: string
  deliveryId: string
  type?: string
  note?: string
}

/**
 * Count one request answered before any signature verified. Requests of one
 * kind share a row, so a flood of them contends only with itself — never with
 * a verified delivery, which never reads a tally.
 */
async function tally(ctx: MutationCtx, entry: Entry, outcome: TalliedOutcome, now: number): Promise<void> {
  const existing = await ctx.db
    .query('webhookTallies')
    .withIndex('service_outcome', q => q.eq('service', entry.service).eq('outcome', outcome))
    .first()
  if (!existing) {
    await ctx.db.insert('webhookTallies', { ...entry, outcome, count: 1, receivedAt: now })
    return
  }
  const count = now - existing.receivedAt > TALLY_WINDOW_MS ? 1 : existing.count + 1
  // `type` and `note` are the latest request's: an absent one clears the field.
  await ctx.db.patch('webhookTallies', existing._id, { ...entry, count, receivedAt: now })
}

/**
 * Schedule the ring's trim unless one is already pending. The schedule row is
 * written once per interval, so it is the only point where deliveries being
 * recorded at the same moment can conflict, and the one that retries then
 * finds the trim scheduled.
 */
async function scheduleTrim(ctx: MutationCtx, now: number): Promise<void> {
  const pending = await ctx.db.query('webhookTrims').first()
  if (pending && pending.dueAt > now) return
  const dueAt = now + TRIM_INTERVAL_MS
  await ctx.scheduler.runAt(dueAt, internal.webhooks.trim, {})
  if (pending) await ctx.db.patch('webhookTrims', pending._id, { dueAt })
  else await ctx.db.insert('webhookTrims', { dueAt })
}

export const record = mutation({
  args: {
    service: v.string(),
    deliveryId: v.string(),
    type: v.optional(v.string()),
    outcome: vDeliveryOutcome,
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { service, deliveryId, type, outcome, note }): Promise<null> => {
    const now = Date.now()
    // The id and type come straight off the request — a header and the body
    // of a delivery not yet verified — so neither is trusted to be short.
    const entry: Entry = {
      service,
      deliveryId: clip(deliveryId, DELIVERY_ID_LIMIT),
      type: type === undefined ? undefined : clip(type, TYPE_LIMIT),
      note: note === undefined ? undefined : clip(note, NOTE_LIMIT),
    }
    if (isTallied(outcome)) {
      await tally(ctx, entry, outcome, now)
      return null
    }
    await ctx.db.insert('webhookDeliveries', { ...entry, outcome, receivedAt: now })
    await scheduleTrim(ctx, now)
    return null
  },
})

/**
 * Cut the ring back to its newest {@link RING_CAP} rows, counting only rows
 * older than {@link TRIM_GRACE_MS}: younger ones are left for the next trim,
 * so this never reads where deliveries are being inserted. A burst more than
 * a batch over the cap carries on in a fresh transaction.
 */
export const trim = internalMutation({
  args: {},
  returns: v.null(),
  // Annotated: the body schedules this same function, which TypeScript
  // cannot infer through.
  handler: async (ctx): Promise<null> => {
    const settled = await ctx.db
      .query('webhookDeliveries')
      .withIndex('receivedAt', q => q.lt('receivedAt', Date.now() - TRIM_GRACE_MS))
      .order('desc')
      .take(RING_CAP + 1)
    // The newest row past the cap: it and everything older goes.
    const boundary = settled[RING_CAP]
    if (!boundary) return null
    const stale = await ctx.db
      .query('webhookDeliveries')
      .withIndex('receivedAt', q => q.lte('receivedAt', boundary.receivedAt))
      .order('asc')
      .take(TRIM_BATCH)
    let deleted = 0
    for (const row of stale) {
      // The index orders equal times by creation: past the boundary, the cap keeps them.
      if (row.receivedAt === boundary.receivedAt && row._creationTime > boundary._creationTime) break
      await ctx.db.delete('webhookDeliveries', row._id)
      deleted += 1
    }
    if (deleted === TRIM_BATCH) await ctx.scheduler.runAfter(0, internal.webhooks.trim, {})
    return null
  },
})

/** Was this delivery id already fully processed? (Dedupe peek — `ok` only.) */
export const find = query({
  args: { service: v.string(), deliveryId: v.string() },
  returns: v.union(v.object({ outcome: vDeliveryOutcome, receivedAt: v.number() }), v.null()),
  handler: async (ctx, { service, deliveryId }) => {
    // Matched the way `record` stores it.
    const id = clip(deliveryId, DELIVERY_ID_LIMIT)
    const row = await ctx.db
      .query('webhookDeliveries')
      .withIndex('service_deliveryId_outcome', q => q.eq('service', service).eq('deliveryId', id).eq('outcome', 'ok'))
      .first()
      ?? await ctx.db
        .query('webhookDeliveries')
        .withIndex('service_deliveryId', q => q.eq('service', service).eq('deliveryId', id))
        .order('desc')
        .first()
    return row ? { outcome: row.outcome, receivedAt: row.receivedAt } : null
  },
})

/** A ring row, or a tally standing for `count` requests. */
function feedRow(doc: Doc<'webhookDeliveries'> | Doc<'webhookTallies'>) {
  return {
    service: doc.service,
    deliveryId: doc.deliveryId,
    outcome: doc.outcome,
    receivedAt: doc.receivedAt,
    ...(doc.type === undefined ? {} : { type: doc.type }),
    ...(doc.note === undefined ? {} : { note: doc.note }),
    ...('count' in doc ? { count: doc.count } : {}),
    ...('replayedAt' in doc && doc.replayedAt !== undefined ? { replayedAt: doc.replayedAt } : {}),
  }
}

/** The feed size asked for, kept to a whole number within the ring. */
function feedSize(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_FEED_SIZE
  return Math.min(Math.max(Math.trunc(limit), 0), RING_CAP)
}

/**
 * Recent deliveries, newest first (the DevTools / playground feed). Each
 * tally is one row, at the time of its latest request, with `count`.
 */
export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.object({
    service: v.string(),
    deliveryId: v.string(),
    type: v.optional(v.string()),
    outcome: vDeliveryOutcome,
    note: v.optional(v.string()),
    receivedAt: v.number(),
    count: v.optional(v.number()),
    replayedAt: v.optional(v.number()),
  })),
  handler: async (ctx, { limit }) => {
    const size = feedSize(limit)
    const rows = await ctx.db.query('webhookDeliveries').withIndex('receivedAt').order('desc').take(size)
    const tallies = await ctx.db.query('webhookTallies').withIndex('receivedAt').order('desc').take(size)
    // Tallies first, so a tie keeps one ahead of a row: a duplicate is always
    // answered after the delivery it repeats.
    return [...tallies, ...rows]
      .sort((a, b) => b.receivedAt - a.receivedAt)
      .slice(0, size)
      .map(feedRow)
  },
})

/** The newest verified row of one delivery: what a replay asks the provider to send again. */
async function newestRow(ctx: { db: QueryCtx['db'] }, service: string, deliveryId: string) {
  return await ctx.db
    .query('webhookDeliveries')
    .withIndex('service_deliveryId', q => q.eq('service', service).eq('deliveryId', clip(deliveryId, DELIVERY_ID_LIMIT)))
    .order('desc')
    .first()
}

/**
 * One delivery of the log, by its service and provider id: its type and
 * outcome, and when it was last replayed. `null` for an id the ring does
 * not hold, a request counted before its signature verified included:
 * only a verified delivery can be replayed.
 */
export const entry = query({
  args: { service: v.string(), deliveryId: v.string() },
  returns: v.union(v.object({ type: v.optional(v.string()), outcome: vDeliveryOutcome, receivedAt: v.number(), replayedAt: v.optional(v.number()) }), v.null()),
  handler: async (ctx, { service, deliveryId }) => {
    const row = await newestRow(ctx, service, deliveryId)
    if (!row) return null
    return { ...(row.type === undefined ? {} : { type: row.type }), outcome: row.outcome, receivedAt: row.receivedAt, ...(row.replayedAt === undefined ? {} : { replayedAt: row.replayedAt }) }
  },
})

/**
 * Stamp a delivery the provider was asked to send again: its newest row
 * gets `replayedAt`. Answers the time, or `null` when the ring no longer
 * holds it (trimmed between the ask and the stamp).
 */
export const markReplayed = mutation({
  args: { service: v.string(), deliveryId: v.string() },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, { service, deliveryId }) => {
    const row = await newestRow(ctx, service, deliveryId)
    if (!row) return null
    const at = Date.now()
    await ctx.db.patch('webhookDeliveries', row._id, { replayedAt: at })
    return at
  },
})
