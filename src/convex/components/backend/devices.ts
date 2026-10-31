import { type Infer, v } from 'convex/values'
import type { Doc } from './_generated/dataModel.js'
import { mutation, type MutationCtx, query } from './_generated/server.js'

/**
 * The devices each account signed in from, for new-device alerts. The auth
 * layer hashes a device's fingerprint (its browser, its system and its
 * network range) under the auth secret, bound to the account, and hands
 * the hash here as each session opens: the fingerprint itself is never
 * kept. {@link see} answers whether the sign-in is news:
 *
 * - a device the account used before is not, its record only refreshed;
 * - the account's first device is not either: a new account has nothing to
 *   be warned about;
 * - any other device is, and so is every recovery-code sign-in, even on a
 *   device the account knows.
 *
 * The hashes follow the auth secret's rotation: the auth layer hands the
 * device's hashes under every older live secret too, and a row found under
 * one is re-keyed to the current secret, so a rotation alerts nothing. A
 * device unseen for the whole window, until the older secret retired, reads
 * as new once.
 *
 * An alert goes by email at most once a day per browser and system, so a
 * device whose network range keeps changing does not flood the inbox; the
 * event and the in-app notice are recorded each time. The maintenance pass
 * prunes a device a year after it was last seen.
 */

/** A device not seen for this long is pruned. */
export const KNOWN_DEVICE_RETENTION_MS = 365 * 24 * 60 * 60 * 1000

/** One email per browser and system in this window. */
export const NEW_DEVICE_EMAIL_INTERVAL_MS = 24 * 60 * 60 * 1000

/** A known device's `lastSeenAt` is rewritten at most this often, so a busy account does not rewrite its row on every sign-in. */
const LAST_SEEN_GRANULARITY_MS = 60 * 60 * 1000

/** The most alerts the Alerts section lists. */
const ALERTS_MAX = 10

const vSeen = v.object({
  /** The sign-in is news: record the event and the in-app notice. */
  alert: v.boolean(),
  /** Send the alert email too. */
  email: v.boolean(),
})

const vSeeArgs = v.object({
  userId: v.string(),
  fingerprint: v.string(),
  device: v.string(),
  browser: v.optional(v.string()),
  os: v.optional(v.string()),
  recovery: v.optional(v.boolean()),
  sessionId: v.optional(v.string()),
  /** The same device's hashes under the older live secrets, newest first: a rotation's window. */
  previous: v.optional(v.array(v.object({ fingerprint: v.string(), device: v.string() }))),
})

/** The most older secrets a sign-in's hashes are looked up under. */
const PREVIOUS_SECRETS_MAX = 4

type SeeArgs = Infer<typeof vSeeArgs>

/** What the alert of a sign-in stamps on its device's row. */
function alertFields(args: SeeArgs, now: number) {
  return { alertedAt: now, ...(args.sessionId ? { sessionId: args.sessionId } : {}) }
}

/**
 * A known device signed in again: refresh when it was last seen, at most
 * hourly. A recovery on it is news all the same; the recovery email tells
 * of it, so none goes from here.
 */
async function seeKnown(ctx: MutationCtx, known: Doc<'knownDevices'>, args: SeeArgs, now: number) {
  const recovery = args.recovery === true
  const stale = now - known.lastSeenAt >= LAST_SEEN_GRANULARITY_MS
  if (recovery) await ctx.db.patch('knownDevices', known._id, { ...alertFields(args, now), recovery: true, lastSeenAt: now })
  else if (stale) await ctx.db.patch('knownDevices', known._id, { lastSeenAt: now })
  return { alert: recovery, email: false }
}

/**
 * A device the account has not used: news unless it is the account's first,
 * and always after a recovery, whose own email goes from the recovery.
 */
async function seeNew(ctx: MutationCtx, args: SeeArgs, now: number) {
  const recovery = args.recovery === true
  const first = !(await ctx.db.query('knownDevices').withIndex('userId_fingerprint', q => q.eq('userId', args.userId)).first())
  const alert = recovery || !first
  const email = alert && !recovery && !(await emailedRecently(ctx, args, now))
  await ctx.db.insert('knownDevices', {
    userId: args.userId,
    fingerprint: args.fingerprint,
    device: args.device,
    ...(args.browser ? { browser: args.browser } : {}),
    ...(args.os ? { os: args.os } : {}),
    firstSeenAt: now,
    lastSeenAt: now,
    ...(alert ? alertFields(args, now) : {}),
    ...(recovery ? { recovery: true } : {}),
    ...(email ? { emailedAt: now } : {}),
  })
  return { alert, email }
}

/**
 * Note a sign-in's device for an account and answer what it calls for.
 * `recovery` marks a recovery-code sign-in, always news. The email is
 * claimed here, in the same transaction, so two sign-ins at once send one.
 */
export const see = mutation({
  args: vSeeArgs,
  returns: vSeen,
  handler: async (ctx, args) => {
    const now = Date.now()
    const known = await knownDevice(ctx, args)
    return known ? await seeKnown(ctx, known, args, now) : await seeNew(ctx, args, now)
  },
})

/** The older secrets' hashes a sign-in carries, bounded. */
function previousHashes(args: SeeArgs) {
  return (args.previous ?? []).slice(0, PREVIOUS_SECRETS_MAX)
}

/**
 * The account's row for this device: under the current secret, else under
 * an older live one, which is then re-keyed to the current secret so the
 * row outlives the older secret's retirement.
 */
async function knownDevice(ctx: MutationCtx, args: SeeArgs): Promise<Doc<'knownDevices'> | null> {
  const byFingerprint = (fingerprint: string) => ctx.db.query('knownDevices').withIndex('userId_fingerprint', q => q.eq('userId', args.userId).eq('fingerprint', fingerprint)).first()
  const current = await byFingerprint(args.fingerprint)
  if (current) return current
  for (const previous of previousHashes(args)) {
    const old = await byFingerprint(previous.fingerprint)
    if (!old) continue
    await ctx.db.patch('knownDevices', old._id, { fingerprint: args.fingerprint, device: args.device })
    return { ...old, fingerprint: args.fingerprint, device: args.device }
  }
  return null
}

/** Whether an alert for this browser and system went by email within the interval, under any live secret. */
async function emailedRecently(ctx: MutationCtx, args: SeeArgs, now: number): Promise<boolean> {
  for (const device of [args.device, ...previousHashes(args).map(previous => previous.device)]) {
    const recent = await ctx.db
      .query('knownDevices')
      .withIndex('userId_device_emailedAt', q => q.eq('userId', args.userId).eq('device', device).gt('emailedAt', now - NEW_DEVICE_EMAIL_INTERVAL_MS))
      .first()
    if (recent) return true
  }
  return false
}

const vAlert = v.object({
  /** When the device first signed in. */
  at: v.number(),
  browser: v.optional(v.string()),
  os: v.optional(v.string()),
  /** The sign-in was a recovery code's. */
  recovery: v.boolean(),
  /** The session it opened, while the Alerts section may sign it out. */
  sessionId: v.optional(v.string()),
})

/**
 * The account's latest new-device sign-ins, newest first: what the Alerts
 * section of the security page lists. A device goes a year after it was
 * last seen, its alert with it.
 */
export const alerts = query({
  args: { userId: v.string() },
  returns: v.array(vAlert),
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query('knownDevices')
      .withIndex('userId_alertedAt', q => q.eq('userId', userId).gt('alertedAt', 0))
      .order('desc')
      .take(ALERTS_MAX)
    return rows.map(row => ({
      at: row.alertedAt ?? row.firstSeenAt,
      ...(row.browser ? { browser: row.browser } : {}),
      ...(row.os ? { os: row.os } : {}),
      recovery: row.recovery === true,
      ...(row.sessionId ? { sessionId: row.sessionId } : {}),
    }))
  },
})

/** Erasure: an account's devices go, a batch at a time. Answers whether the batch was spent (more may remain). */
export async function forgetDevices(ctx: MutationCtx, userId: string, batch: number): Promise<boolean> {
  const rows = await ctx.db.query('knownDevices').withIndex('userId_fingerprint', q => q.eq('userId', userId)).take(batch)
  for (const row of rows) await ctx.db.delete('knownDevices', row._id)
  return rows.length === batch
}
