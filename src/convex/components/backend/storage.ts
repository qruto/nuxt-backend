import { v } from 'convex/values'
import { internal } from './_generated/api.js'
import type { Doc, Id } from './_generated/dataModel.js'
import { action, internalAction, internalMutation, internalQuery, mutation, type MutationCtx, query, type QueryCtx } from './_generated/server.js'
import { isAcceptedType, sniffContentType, STRIPPABLE_TYPES, stripImageMetadata } from '../../files.js'
import { logBackend } from '../../log.js'
import { toHex } from '../../tokens.js'
import { vFileOwner } from './schema.js'

/**
 * Files: the component's half of `setupStorage`. The bytes live in the
 * component's own storage, beside one owner record per file (`files`), so
 * the orphan sweep, an export and an erasure see every file the app keeps,
 * and the app's schema holds only ids.
 *
 * `store` keeps bytes the app already checked and stripped, with their
 * record, in the caller's transaction. `claim` records an upload the
 * browser sent to an upload URL: the stored size and the quotas now, the
 * type and the stripping next (`check`, in the background), and until that
 * ran the file's URL is not served. `release` deletes a file with its
 * record. The quotas are counted here, per holder, in one row
 * (`fileUsage`), which a check and a claim read and write in the same
 * transaction, so two claims at once never overshoot a limit.
 *
 * Share links live here too: one per shared row, the token's SHA-256 only.
 * Every function trusts its caller, the app's `setupStorage`, which decides
 * who may call it.
 */

/** The limits a store or a claim checks against: each absent one is no limit. */
const vLimits = v.object({ files: v.optional(v.number()), bytes: v.optional(v.number()) })

/** The billing quota keys the file and byte counts are registered under, when the app's quotas are catalog keys. */
const vCounters = v.object({ files: v.optional(v.string()), bytes: v.optional(v.string()) })

type Counters = { files?: string, bytes?: string }

/** A quota that has no room: which one, its limit, what is used and what the file adds. */
const vQuotaRefusal = v.object({ quota: v.union(v.literal('files'), v.literal('bytes')), limit: v.number(), used: v.number(), amount: v.number() })

/** What a check looks for in a claimed upload. */
const vCheck = v.object({ accept: v.array(v.string()), strip: v.boolean() })

type Limits = { files?: number, bytes?: number }
type QuotaRefusal = { quota: 'files' | 'bytes', limit: number, used: number, amount: number }

/** A holder's usage row, or a fresh one. */
async function usageOf(ctx: QueryCtx, holder: string): Promise<{ row: Doc<'fileUsage'> | null, files: number, bytes: number }> {
  const row = await ctx.db.query('fileUsage').withIndex('holder', q => q.eq('holder', holder)).unique()
  return { row, files: row?.files ?? 0, bytes: row?.bytes ?? 0 }
}

/** Add to a holder's counts, never below zero; a row that counts nothing goes. */
async function count(ctx: MutationCtx, holder: string, files: number, bytes: number): Promise<void> {
  const usage = await usageOf(ctx, holder)
  const next = { files: Math.max(0, usage.files + files), bytes: Math.max(0, usage.bytes + bytes) }
  if (usage.row && next.files === 0 && next.bytes === 0) await ctx.db.delete('fileUsage', usage.row._id)
  else if (usage.row) await ctx.db.patch('fileUsage', usage.row._id, next)
  else if (next.files > 0 || next.bytes > 0) await ctx.db.insert('fileUsage', { holder, ...next })
}

/**
 * Register the quota keys the counts answer to, once per key and source, so
 * a billing quota read finds them: the count is zero until a file is stored,
 * so a key registers with its first store.
 */
async function registerCounters(ctx: MutationCtx, counters: Counters | undefined): Promise<void> {
  for (const source of ['files', 'bytes'] as const) {
    const key = counters?.[source]
    if (key === undefined) continue
    const rows = await ctx.db.query('quotaCounters').withIndex('key', q => q.eq('key', key)).take(2)
    const row = rows.find(each => each.source === source)
    // A key that answered another source is now this one's: a key counts one thing.
    if (!row) {
      for (const other of rows) await ctx.db.delete('quotaCounters', other._id)
      await ctx.db.insert('quotaCounters', { key, source })
    }
  }
}

/** The quota one more file of `size` would exceed, or `null` when it fits. */
async function overQuota(ctx: QueryCtx, holder: string, limits: Limits, size: number): Promise<QuotaRefusal | null> {
  if (limits.files === undefined && limits.bytes === undefined) return null
  const usage = await usageOf(ctx, holder)
  if (limits.files !== undefined && usage.files + 1 > limits.files) return { quota: 'files', limit: limits.files, used: usage.files, amount: 1 }
  if (limits.bytes !== undefined && usage.bytes + size > limits.bytes) return { quota: 'bytes', limit: limits.bytes, used: usage.bytes, amount: size }
  return null
}

/** The SHA-256 of bytes, hex: what identical copies share. */
async function sha256Of(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', bytes as BufferSource))
}

/** Whether bytes with this hash were removed as an intimate image shared without consent: a copy is never kept again. */
async function isBlocked(ctx: QueryCtx, sha256: string): Promise<boolean> {
  return Boolean(await ctx.db.query('blockedFiles').withIndex('sha256', q => q.eq('sha256', sha256)).first())
}

/** A file's owner record, by the id the app holds. */
function recordOf(ctx: QueryCtx, storageId: Id<'_storage'>): Promise<Doc<'files'> | null> {
  return ctx.db.query('files').withIndex('storageId', q => q.eq('storageId', storageId)).unique()
}

/** The id as one of the component's storage ids, or `null` for anything else. */
function storageIdOf(ctx: QueryCtx, id: string): Id<'_storage'> | null {
  return ctx.db.system.normalizeId('_storage', id)
}

/** A file's owner record by an id from the app, which may name no file of the component's. */
async function recordById(ctx: QueryCtx, id: string): Promise<Doc<'files'> | null> {
  const storageId = storageIdOf(ctx, id)
  return storageId ? await recordOf(ctx, storageId) : null
}

/** Delete a file's bytes (the original and the served copy), its record, and its count. */
async function deleteFile(ctx: MutationCtx, record: Doc<'files'>): Promise<void> {
  for (const id of new Set([record.storageId, record.servedId])) {
    if (id && await ctx.db.system.get('_storage', id)) await ctx.storage.delete(id)
  }
  await ctx.db.delete('files', record._id)
  await count(ctx, record.holder, -1, -record.size)
}

/** Whether `userId` may read a file: its owner, for a file of their own; a member of its workspace, for a workspace's. */
async function mayRead(ctx: QueryCtx, record: Doc<'files'>, userId: string): Promise<boolean> {
  if (!record.workspaceId) return record.userId === userId
  const workspaceId = record.workspaceId
  return Boolean(await ctx.db.query('member').withIndex('organizationId_userId', q => q.eq('organizationId', workspaceId).eq('userId', userId)).first())
}

/** A one-time URL the browser uploads a file to, into the component's storage. */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async ctx => ctx.storage.generateUploadUrl(),
})

/**
 * Keep bytes the app checked and stripped, with their owner record, in the
 * caller's transaction; or refuse them for a quota without room, storing
 * nothing.
 */
export const store = mutation({
  args: { bytes: v.bytes(), contentType: v.string(), owner: vFileOwner, holder: v.string(), limits: vLimits, counters: v.optional(vCounters) },
  returns: v.union(v.object({ storageId: v.id('_storage') }), v.object({ refused: vQuotaRefusal }), v.object({ blocked: v.literal(true) })),
  handler: async (ctx, { bytes, contentType, owner, holder, limits, counters }) => {
    const size = bytes.byteLength
    const sha256 = await sha256Of(bytes)
    if (await isBlocked(ctx, sha256)) return { blocked: true as const }
    const refused = await overQuota(ctx, holder, limits, size)
    if (refused) return { refused }
    const storageId = await ctx.storage.store(new Blob([bytes], { type: contentType }))
    await ctx.db.insert('files', { storageId, ...owner, holder, size, contentType, sha256, status: 'ready', createdAt: Date.now() })
    await count(ctx, holder, 1, size)
    await registerCounters(ctx, counters)
    return { storageId }
  },
})

/** Who owns a file: the account, and the workspace whose members read it. */
type FileOwner = { userId: string, workspaceId?: string }

/**
 * The hash a file's record holds, of bytes an action is about to store:
 * what {@link keepGenerated} records.
 *
 * @internal
 */
export const fileSha256 = (bytes: ArrayBuffer): Promise<string> => sha256Of(bytes)

/**
 * Keep an image a model made (`ctx.storeImage`) as its owner's, in the
 * caller's transaction: already stored as it came by the component's action
 * (so its bytes are never a mutation's argument), its content credentials
 * intact, and counted in the holder's quota without a limit, since the model
 * was paid for by then. The app checks the quota before it starts the work.
 *
 * @internal
 */
export async function keepGenerated(ctx: MutationCtx, file: { storageId: Id<'_storage'>, size: number, sha256: string, contentType: string, owner: FileOwner, holder: string }): Promise<Id<'_storage'>> {
  const { storageId, size, sha256, contentType, owner, holder } = file
  await ctx.db.insert('files', { storageId, ...owner, holder, size, contentType, sha256, status: 'ready', createdAt: Date.now() })
  await count(ctx, holder, 1, size)
  return storageId
}

/**
 * The owner record of a file a billing entity keeps: a workspace's for its
 * members, the member who made it as its uploader; else the account's own.
 *
 * @internal
 */
export async function fileOwnerOf(ctx: QueryCtx, entity: string, userId: string | undefined): Promise<FileOwner> {
  const workspaceId = ctx.db.normalizeId('organization', entity)
  if (workspaceId && await ctx.db.get('organization', workspaceId)) return { userId: userId ?? entity, workspaceId: entity }
  return { userId: entity }
}

/**
 * Hand a kept file to a new owner, its count moving to the new holder: a
 * guest job's images, once a sign-up claims the job.
 *
 * @internal
 */
export async function reown(ctx: MutationCtx, storageId: string, owner: FileOwner, holder: string): Promise<void> {
  const id = storageIdOf(ctx, storageId)
  const record = id ? await recordOf(ctx, id) : null
  if (!record) return
  await ctx.db.patch('files', record._id, { userId: owner.userId, workspaceId: owner.workspaceId, holder })
  if (record.holder === holder) return
  await count(ctx, record.holder, -1, -record.size)
  await count(ctx, holder, 1, record.size)
}

/**
 * Record an upload as the owner's: refused when it is gone, already
 * claimed or over `maxSize`, or when a quota has no room. The type check
 * and the stripping run next, in the background; until they finish the
 * file's URL is not served.
 */
export const claim = mutation({
  args: { storageId: v.string(), owner: vFileOwner, holder: v.string(), limits: vLimits, maxSize: v.number(), check: vCheck, counters: v.optional(vCounters) },
  returns: v.union(
    v.object({ size: v.number() }),
    v.object({ invalid: v.union(v.literal('missing'), v.literal('claimed'), v.literal('too_large')) }),
    v.object({ refused: vQuotaRefusal }),
  ),
  handler: async (ctx, { storageId: id, owner, holder, limits, maxSize, check, counters }) => {
    const storageId = storageIdOf(ctx, id)
    const file = storageId ? await ctx.db.system.get('_storage', storageId) : null
    if (!storageId || !file) return { invalid: 'missing' as const }
    // A file the component keeps for itself, or one already kept, is never claimed again.
    const taken = await recordOf(ctx, storageId)
      ?? await ctx.db.query('files').withIndex('servedId', q => q.eq('servedId', storageId)).first()
      ?? await ctx.db.query('accountExports').withIndex('storageId', q => q.eq('storageId', storageId)).first()
      ?? await ctx.db.query('accountExportParts').withIndex('storageId', q => q.eq('storageId', storageId)).first()
    if (taken) return { invalid: 'claimed' as const }
    if (file.size > maxSize) return { invalid: 'too_large' as const }
    const refused = await overQuota(ctx, holder, limits, file.size)
    if (refused) return { refused }
    await ctx.db.insert('files', { storageId, ...owner, holder, size: file.size, status: 'checking', check, createdAt: Date.now() })
    await count(ctx, holder, 1, file.size)
    await registerCounters(ctx, counters)
    await ctx.scheduler.runAfter(0, internal.storage.check, { storageId })
    return { size: file.size }
  },
})

/**
 * Check a claimed upload: read its bytes, sniff their type, and strip an
 * image's metadata into a copy served in its place. Runs in an action, which
 * reads a file of any size.
 */
export const check = internalAction({
  args: { storageId: v.id('_storage') },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    const pending = await ctx.runQuery(internal.storage.pendingCheck, { storageId })
    if (!pending) return null
    const blob = await ctx.storage.get(storageId)
    if (!blob) {
      await ctx.runMutation(internal.storage.finishCheck, { storageId, outcome: { refused: true } })
      return null
    }
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const contentType = sniffContentType(bytes)
    if (!isAcceptedType(contentType, pending.accept, { strip: pending.strip })) {
      await ctx.runMutation(internal.storage.finishCheck, { storageId, outcome: { refused: true } })
      return null
    }
    let stripped: Uint8Array = bytes
    try {
      if (pending.strip && STRIPPABLE_TYPES.has(contentType)) stripped = stripImageMetadata(bytes, contentType)
    }
    catch {
      // A container the stripper cannot walk is no image of the type it claims.
      await ctx.runMutation(internal.storage.finishCheck, { storageId, outcome: { refused: true } })
      return null
    }
    // Always a copy under the sniffed type, never the upload itself: storage
    // serves a file with the type its uploader declared, and a GIF declared
    // as text/html would render as a page on the deployment's origin.
    const sha256 = await sha256Of(stripped)
    const servedId = await ctx.storage.store(new Blob([stripped as BlobPart], { type: contentType }))
    await ctx.runMutation(internal.storage.finishCheck, { storageId, outcome: { contentType, size: stripped.byteLength, servedId, sha256 } })
    return null
  },
})

/** What a claimed upload's check looks for, while it waits for one. */
export const pendingCheck = internalQuery({
  args: { storageId: v.id('_storage') },
  returns: v.union(vCheck, v.null()),
  handler: async (ctx, { storageId }) => {
    const record = await recordOf(ctx, storageId)
    return record?.status === 'checking' && record.check ? record.check : null
  },
})

/**
 * Record a check's outcome: a refused file goes with its record and its
 * count; a kept one is ready, its stripped copy served in its place and its
 * original deleted, and its count follows the size after stripping. A file
 * released while it was checked leaves only the copy, which goes too.
 */
export const finishCheck = internalMutation({
  args: {
    storageId: v.id('_storage'),
    outcome: v.union(
      v.object({ refused: v.literal(true) }),
      v.object({ contentType: v.string(), size: v.number(), servedId: v.optional(v.id('_storage')), sha256: v.optional(v.string()) }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { storageId, outcome }) => {
    const record = await recordOf(ctx, storageId)
    if (!record || record.status !== 'checking') {
      if ('servedId' in outcome && outcome.servedId) await ctx.storage.delete(outcome.servedId)
      return null
    }
    if ('refused' in outcome) {
      await deleteFile(ctx, record)
      return null
    }
    if (await removedOnCheck(ctx, record, outcome)) return null
    const { contentType, size, servedId, sha256 } = outcome
    if (servedId && await ctx.db.system.get('_storage', record.storageId)) await ctx.storage.delete(record.storageId)
    await ctx.db.patch('files', record._id, { status: 'ready', contentType, size, check: undefined, ...(servedId ? { servedId } : {}), ...(sha256 ? { sha256 } : {}) })
    await count(ctx, record.holder, 0, size - record.size)
    return null
  },
})

/**
 * Delete a checked file that a removed intimate image's hash blocks, refused
 * like a file of a type the app does not keep; or one a removal named while
 * it was checked, blocking its stripped bytes and removing every copy of
 * them with it. Answers whether it went.
 */
async function removedOnCheck(ctx: MutationCtx, record: Doc<'files'>, { servedId, sha256 }: { servedId?: Id<'_storage'>, sha256?: string }): Promise<boolean> {
  if (!record.removal && !(sha256 && await isBlocked(ctx, sha256))) return false
  if (servedId) await ctx.storage.delete(servedId)
  if (record.removal && sha256) await blockAndRemove(ctx, sha256, record.removal.decision)
  await deleteFile(ctx, record)
  return true
}

/**
 * What a holder keeps, by the billing quota key it was registered under:
 * billing's quota reads add it to the count the app claims itself, so a quota
 * shows one number whoever counts. A key nobody stored under is not listed.
 */
export const quotaUsage = query({
  args: { holder: v.string() },
  returns: v.record(v.string(), v.number()),
  handler: async (ctx, { holder }) => {
    const registered = await ctx.db.query('quotaCounters').take(100)
    if (registered.length === 0) return {}
    const usage = await usageOf(ctx, holder)
    return Object.fromEntries(registered.map(row => [row.key, usage[row.source]]))
  },
})

/** Delete a file, its record and its count; nothing for an id without a record. Returns whether one went. */
export const release = mutation({
  args: { storageId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { storageId: id }) => {
    const record = await recordById(ctx, id)
    if (!record) return false
    await deleteFile(ctx, record)
    return true
  },
})

/**
 * Delete an upload at once while nothing keeps it: one sent to an upload
 * URL that no claim, stored file, served copy or export holds. A kept file,
 * anyone's, is never touched; an id with no file is nothing to do. Returns
 * whether bytes went, so a second call answers `false`.
 */
export const discard = mutation({
  args: { storageId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { storageId: id }) => {
    const storageId = storageIdOf(ctx, id)
    if (!storageId || !await ctx.db.system.get('_storage', storageId)) return false
    if (await isKept(ctx, storageId)) return false
    await ctx.storage.delete(storageId)
    return true
  },
})

/**
 * A ready file's URL: for `userId` only when they may read it (its owner,
 * or a member of its workspace); for the app's own reads (no `userId`),
 * whenever the file is ready. `null` for a file that is gone, refused,
 * still being checked, or not theirs.
 */
export const url = query({
  args: { storageId: v.string(), userId: v.optional(v.string()) },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { storageId: id, userId }) => {
    const record = await recordById(ctx, id)
    if (record?.status !== 'ready') return null
    if (userId !== undefined && !await mayRead(ctx, record, userId)) return null
    return ctx.storage.getUrl(record.servedId ?? record.storageId)
  },
})

/** A ready file as a signed URL serves it: where its bytes are, and its type. `null` once it is gone. */
export const served = query({
  args: { storageId: v.string() },
  returns: v.union(v.object({ url: v.string(), contentType: v.string(), size: v.number() }), v.null()),
  handler: async (ctx, { storageId: id }) => {
    const record = await recordById(ctx, id)
    if (record?.status !== 'ready') return null
    const url = await ctx.storage.getUrl(record.servedId ?? record.storageId)
    return url ? { url, contentType: record.contentType ?? 'application/octet-stream', size: record.size } : null
  },
})

/** Whether a file is ready to serve: claimed, checked and not released. */
export const isReady = query({
  args: { storageId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { storageId: id }) => {
    const record = await recordById(ctx, id)
    return record?.status === 'ready'
  },
})

/** The id of a file a check may read: any in the component's storage but the ones it keeps for itself (an account's export). */
export const readable = internalQuery({
  args: { storageId: v.string() },
  returns: v.union(v.id('_storage'), v.null()),
  handler: async (ctx, { storageId: id }) => {
    const storageId = storageIdOf(ctx, id)
    if (!storageId || !await ctx.db.system.get('_storage', storageId)) return null
    const own = await ctx.db.query('accountExports').withIndex('storageId', q => q.eq('storageId', storageId)).first()
      ?? await ctx.db.query('accountExportParts').withIndex('storageId', q => q.eq('storageId', storageId)).first()
    return own ? null : storageId
  },
})

/**
 * A file's bytes, an upload not yet claimed included, for an action of the
 * app's (`storage.bytes`, the safety check of `ai.requireSafe`); `null` for
 * an id no file has.
 */
export const bytes = action({
  args: { storageId: v.string() },
  returns: v.union(v.bytes(), v.null()),
  handler: async (ctx, { storageId }): Promise<ArrayBuffer | null> => {
    const id = await ctx.runQuery(internal.storage.readable, { storageId })
    if (!id) return null
    const blob = await ctx.storage.get(id)
    return blob ? await blob.arrayBuffer() : null
  },
})

/**
 * Remove the identical copies of removed intimate images (the TAKE IT DOWN
 * Act): block each file's hash, so the same bytes are never kept again, and
 * delete every file that has it. A claimed upload still checked is marked,
 * and its check removes it once it has the stripped bytes' hash; a file kept
 * before hashes were (0.1) is hashed in the background from the copy it
 * serves. Answers how many files went now.
 */
export const removeCopies = mutation({
  args: { storageIds: v.array(v.string()), decision: v.optional(v.string()) },
  returns: v.number(),
  handler: async (ctx, { storageIds, decision: decisionId }) => {
    const decision = decisionId ? ctx.db.normalizeId('reportDecisions', decisionId) ?? undefined : undefined
    let removed = 0
    for (const id of storageIds.slice(0, 20)) {
      const record = await recordById(ctx, id)
      if (!record) {
        logBackend('warn', 'reports.copies_unmatched', 'A removed intimate image names a file setupStorage does not keep: its identical copies were not looked for.')
        continue
      }
      removed += await removeNamed(ctx, record, decision)
    }
    return removed
  },
})

/** Remove a file a removal names, with its copies: now when its hash is known, else by its check, or once its served bytes are hashed. Answers how many went now. */
async function removeNamed(ctx: MutationCtx, record: Doc<'files'>, decision: Id<'reportDecisions'> | undefined): Promise<number> {
  if (record.sha256) return blockAndRemove(ctx, record.sha256, decision)
  if (record.status === 'checking') await ctx.db.patch('files', record._id, { removal: decision ? { decision } : {} })
  else await ctx.scheduler.runAfter(0, internal.storage.hashForRemoval, { storageId: record.storageId, ...(record.servedId ? { servedId: record.servedId } : {}), ...(decision ? { decision } : {}) })
  return 0
}

/** Block a hash and delete every file that has it; answers how many went. */
async function blockAndRemove(ctx: MutationCtx, sha256: string, decision: Id<'reportDecisions'> | undefined): Promise<number> {
  if (!await isBlocked(ctx, sha256)) await ctx.db.insert('blockedFiles', { sha256, ...(decision ? { decision } : {}), at: Date.now() })
  const copies = await ctx.db.query('files').withIndex('sha256', q => q.eq('sha256', sha256)).take(500)
  for (const copy of copies) await deleteFile(ctx, copy)
  return copies.length
}

/** Hash a file whose hash is not known yet, from the copy it serves (the stripped bytes its copies share), then remove it and its copies. */
export const hashForRemoval = internalAction({
  args: { storageId: v.id('_storage'), servedId: v.optional(v.id('_storage')), decision: v.optional(v.id('reportDecisions')) },
  returns: v.null(),
  handler: async (ctx, { storageId, servedId, decision }) => {
    const blob = await ctx.storage.get(servedId ?? storageId)
    if (!blob) {
      logBackend('error', 'reports.copies_unmatched', 'A removed intimate image\'s bytes could not be read: its identical copies were not found or blocked. Remove them by hand.')
      return null
    }
    await ctx.runMutation(internal.storage.removeHashed, { sha256: await sha256Of(await blob.arrayBuffer()), storageId, ...(decision ? { decision } : {}) })
    return null
  },
})

/** Block a hash read in the background, and remove the file it was read from with its copies. */
export const removeHashed = internalMutation({
  args: { sha256: v.string(), storageId: v.id('_storage'), decision: v.optional(v.id('reportDecisions')) },
  returns: v.null(),
  handler: async (ctx, { sha256, storageId, decision }) => {
    await blockAndRemove(ctx, sha256, decision)
    const record = await recordOf(ctx, storageId)
    if (record) await deleteFile(ctx, record)
    return null
  },
})

// ── Share links ────────────────────────────────────────────────────────

const vShare = v.object({ sharedAt: v.number(), sharedBy: v.string() })

/** The link a row has: who turned it on and when; `null` while it has none. */
export const getShare = query({
  args: { table: v.string(), rowId: v.string() },
  returns: v.union(vShare, v.null()),
  handler: async (ctx, { table, rowId }) => {
    const link = await ctx.db.query('shareLinks').withIndex('table_rowId', q => q.eq('table', table).eq('rowId', rowId)).first()
    return link ? { sharedAt: link.sharedAt, sharedBy: link.sharedBy } : null
  },
})

/** Turn a row's link on with a token's hash, replacing the one it had: one link per row. */
export const enableShare = mutation({
  args: { table: v.string(), rowId: v.string(), tokenHash: v.string(), userId: v.string() },
  returns: vShare,
  handler: async (ctx, { table, rowId, tokenHash, userId }) => {
    for (const link of await ctx.db.query('shareLinks').withIndex('table_rowId', q => q.eq('table', table).eq('rowId', rowId)).take(10)) {
      await ctx.db.delete('shareLinks', link._id)
    }
    const sharedAt = Date.now()
    await ctx.db.insert('shareLinks', { table, rowId, tokenHash, sharedBy: userId, sharedAt })
    return { sharedAt, sharedBy: userId }
  },
})

/** Turn a row's link off. Returns whether it had one. */
export const revokeShare = mutation({
  args: { table: v.string(), rowId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { table, rowId }) => {
    const links = await ctx.db.query('shareLinks').withIndex('table_rowId', q => q.eq('table', table).eq('rowId', rowId)).take(10)
    for (const link of links) await ctx.db.delete('shareLinks', link._id)
    return links.length > 0
  },
})

/** The row a token's hash opens in a table, and who shared it; `null` for an unknown, rotated or revoked one. */
export const resolveShare = query({
  args: { table: v.string(), tokenHash: v.string() },
  returns: v.union(v.object({ rowId: v.string(), sharedBy: v.string() }), v.null()),
  handler: async (ctx, { table, tokenHash }) => {
    const link = await ctx.db.query('shareLinks').withIndex('tokenHash', q => q.eq('tokenHash', tokenHash)).first()
    return link && link.table === table ? { rowId: link.rowId, sharedBy: link.sharedBy } : null
  },
})

// ── The orphan sweep ───────────────────────────────────────────────────

/** Files one sweep batch reads at most. */
const SWEEP_BATCH = 200

/** Whether a file in storage is one the component keeps: a file's original or its served copy, or an export. */
async function isKept(ctx: QueryCtx, storageId: Id<'_storage'>): Promise<boolean> {
  return Boolean(await recordOf(ctx, storageId)
    ?? await ctx.db.query('files').withIndex('servedId', q => q.eq('servedId', storageId)).first()
    ?? await ctx.db.query('accountExports').withIndex('storageId', q => q.eq('storageId', storageId)).first()
    ?? await ctx.db.query('accountExportParts').withIndex('storageId', q => q.eq('storageId', storageId)).first())
}

/**
 * One batch of the orphan sweep: the files in storage older than `cutoff`
 * that nothing keeps (an upload nobody claimed, or one whose claim was
 * refused and rolled back) are deleted. Storage is read in creation order
 * from where the last batch stopped (`cursor`), so a large backlog never
 * fills one transaction and a kept file is read once. Returns how many it
 * deleted, where it stopped, and whether it reached the cutoff.
 *
 * @internal
 */
export async function sweepUnclaimed(ctx: MutationCtx, cutoff: number, cursor: number): Promise<{ pruned: number, cursor: number, done: boolean }> {
  let seen = 0
  let pruned = 0
  let last = cursor
  const files = ctx.db.system.query('_storage').withIndex('by_creation_time', q => q.gt('_creationTime', cursor).lt('_creationTime', cutoff))
  for await (const file of files) {
    last = file._creationTime
    if (!await isKept(ctx, file._id)) {
      await ctx.storage.delete(file._id)
      pruned++
    }
    if (++seen >= SWEEP_BATCH) break
  }
  return { pruned, cursor: last, done: seen < SWEEP_BATCH }
}

// ── Export and erasure ─────────────────────────────────────────────────

/** The most file records one export lists, and one erasure batch reads. */
const FILES_MAX = 500

/** A file as an account's export lists it: its record, and a link to its bytes while the file is kept. */
async function exportedFile(ctx: QueryCtx, record: Doc<'files'>) {
  return {
    storageId: record.storageId,
    contentType: record.contentType ?? null,
    size: record.size,
    workspaceId: record.workspaceId ?? null,
    createdAt: record.createdAt,
    url: record.status === 'ready' ? await ctx.storage.getUrl(record.servedId ?? record.storageId) : null,
  }
}

/**
 * An account's files for its export: the ones it uploaded for itself, and
 * every file of the workspaces it is the only member of; and the links it
 * shared.
 *
 * @internal
 */
export async function exportFiles(ctx: QueryCtx, userId: string, ownedAlone: readonly string[]) {
  const own = await ctx.db.query('files').withIndex('userId_workspaceId', q => q.eq('userId', userId).eq('workspaceId', undefined)).take(FILES_MAX)
  const workspaces = await Promise.all(ownedAlone.map(workspaceId => ctx.db.query('files').withIndex('workspaceId', q => q.eq('workspaceId', workspaceId)).take(FILES_MAX)))
  const links = await ctx.db.query('shareLinks').withIndex('sharedBy', q => q.eq('sharedBy', userId)).take(FILES_MAX)
  return {
    files: await Promise.all([...own, ...workspaces.flat()].map(record => exportedFile(ctx, record))),
    shareLinks: links.map(({ table, rowId, sharedAt }) => ({ table, rowId, sharedAt })),
  }
}

/**
 * The files' part of an erasure, one batch: the account's own files and
 * every file of a workspace that goes with it are deleted with their counts;
 * a file it uploaded to a workspace that stays keeps its place there, its
 * uploader the pseudonym; the links it shared go. Returns `true` while rows
 * may be left.
 *
 * @internal
 */
export async function eraseFiles(ctx: MutationCtx, erasure: { userId?: string, deleted: readonly string[], alias: string }, budget: number): Promise<boolean> {
  const { userId, deleted } = erasure
  let left = budget
  if (userId) left = await eraseOwnFiles(ctx, { ...erasure, userId }, left)
  for (const workspaceId of deleted) {
    if (left <= 0) break
    for (const record of await ctx.db.query('files').withIndex('workspaceId', q => q.eq('workspaceId', workspaceId)).take(left)) {
      await deleteFile(ctx, record)
      left--
    }
  }
  if (left <= 0) return true
  // The counts of every holder that goes: its files are gone by now.
  for (const holder of [...deleted, ...(userId ? [userId] : [])]) {
    const usage = await ctx.db.query('fileUsage').withIndex('holder', q => q.eq('holder', holder)).unique()
    if (usage) await ctx.db.delete('fileUsage', usage._id)
  }
  return false
}

/**
 * The files an account uploaded, one batch: its own and those of a
 * workspace that goes are deleted, those of a workspace that stays keep the
 * pseudonym; then the links it shared. Returns the budget left.
 */
async function eraseOwnFiles(ctx: MutationCtx, { userId, deleted, alias }: { userId: string, deleted: readonly string[], alias: string }, budget: number): Promise<number> {
  let left = budget
  for (const record of await ctx.db.query('files').withIndex('userId_workspaceId', q => q.eq('userId', userId)).take(left)) {
    if (!record.workspaceId || deleted.includes(record.workspaceId)) await deleteFile(ctx, record)
    else await ctx.db.patch('files', record._id, { userId: alias })
    left--
  }
  for (const link of await ctx.db.query('shareLinks').withIndex('sharedBy', q => q.eq('sharedBy', userId)).take(Math.max(0, left))) {
    await ctx.db.delete('shareLinks', link._id)
    left--
  }
  return left
}
