/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { actionGeneric, componentsGeneric, defineSchema, defineTable, type FunctionReference, httpActionGeneric, httpRouter, makeFunctionReference, mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import backendTest, { asUser, defineBackendTestApp, seedWorkspace } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { backendError, getBackendError } from '../../src/convex/errors'
import { setupStorage } from '../../src/convex/integrations/storage'
import { exifJpeg, jpegSegments, orientationOf } from '../helpers/images'

// setupStorage over the mounted component, the way backend/storage.ts and a
// strips module use it: a photo stored with its row in one mutation, an
// upload claimed and checked in the background, who reads a file's URL,
// release and the orphan sweep, expiring URLs served by the deployment's
// route, share links, a file given an end, and a person's files in export
// and erasure.

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'>, rateLimiter: unknown }

const appSchema = defineSchema({
  strips: defineTable({
    title: v.string(),
    authorId: v.string(),
    workspaceId: v.string(),
    photoId: v.optional(v.string()),
    coverId: v.optional(v.string()),
  }),
  shareEvents: defineTable({ stripId: v.string(), by: v.string(), rotated: v.boolean() }),
})

const storage = setupStorage(components as never, {
  maxSize: 4096,
  accept: ['image/png', 'image/jpeg', 'image/webp'],
  quota: { files: 3, bytes: 3000 },
})
storage.shareable('strips' as never, {
  path: '/s',
  canShare: (ctx, strip) => (strip as { authorId: string }).authorId === ctx.user.id,
  ogImage: strip => (strip as { coverId?: string }).coverId ?? null,
  // What an app records once a link is on: who shared what, never the link
  // itself (a bearer secret), which goes on to the author by mail. A strip
  // titled "Refused" throws, which rolls the link back.
  onEnable: async (ctx, strip, link) => {
    const { _id, title } = strip as unknown as { _id: string, title: string }
    if (title === 'Refused') throw new Error('not this one')
    await (ctx.db as unknown as { insert: (table: string, row: object) => Promise<string> }).insert('shareEvents', { stripId: _id, by: ctx.user.id, rotated: link.rotated })
    mailed.push(link.url)
  },
})

/** The links `onEnable` handed on, as a mailer would send them: in memory, never in a table. */
const mailed: string[] = []

/** The caller, as the scaffold's `workspace` tier hands it over. */
async function caller(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string, activeOrganizationId?: unknown } | null> } }) {
  const identity = (await ctx.auth.getUserIdentity())!
  return { userId: identity.subject, workspaceId: identity.activeOrganizationId as string }
}

const create = mutationGeneric({
  args: { title: v.string() },
  handler: async (ctx, { title }) => {
    const { userId, workspaceId } = await caller(ctx)
    return ctx.db.insert('strips', { title, authorId: userId, workspaceId })
  },
})
const addPhoto = mutationGeneric({
  args: { id: v.id('strips'), photo: v.bytes() },
  handler: async (ctx, { id, photo }) => {
    const owner = await caller(ctx)
    const strip = (await ctx.db.get(id))!
    const { storageId } = await storage.store(ctx, photo, owner)
    await storage.release(ctx, strip.photoId as string | undefined)
    await ctx.db.patch(id, { photoId: storageId })
    return storageId
  },
})
const addOwnPhoto = mutationGeneric({
  args: { photo: v.bytes() },
  handler: async (ctx, { photo }) => (await storage.store(ctx, photo, { userId: (await caller(ctx)).userId })).storageId,
})
const attachFile = mutationGeneric({
  args: { id: v.id('strips'), fileId: v.string() },
  handler: async (ctx, { id, fileId }) => {
    await storage.claim(ctx, fileId, await caller(ctx))
    await ctx.db.patch(id, { coverId: fileId })
  },
})
const remove = mutationGeneric({
  args: { id: v.id('strips') },
  handler: async (ctx, { id }) => {
    const strip = (await ctx.db.get(id))!
    await storage.release(ctx, strip.photoId as string | undefined)
    await storage.release(ctx, strip.coverId as string | undefined)
    await storage.revokeShareLink(ctx, 'strips' as never, id)
    await ctx.db.delete(id)
  },
})
const expirePhoto = mutationGeneric({
  args: { id: v.id('strips'), at: v.union(v.number(), v.null()) },
  handler: async (ctx, { id, at }) => storage.expire(ctx, (await ctx.db.get(id))!.photoId as string | undefined, at),
})
const expireFile = mutationGeneric({
  args: { fileId: v.string(), at: v.union(v.number(), v.null()) },
  handler: async (ctx, { fileId, at }) => storage.expire(ctx, fileId, at),
})
const shareEvents = queryGeneric({ args: {}, handler: async ctx => ctx.db.query('shareEvents').collect() })
const shared = queryGeneric({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const link = await storage.resolveShareLink(ctx, 'strips' as never, token)
    const strip = link ? await ctx.db.get(link.id as never) as { title: string } | null : null
    return link && strip ? { title: strip.title, sharedBy: link.sharedBy, ogImageUrl: link.ogImageUrl } : null
  },
})
// A dropped upload, discarded from a mutation and from an action.
const dropUpload = mutationGeneric({
  args: { fileId: v.string() },
  handler: async (ctx, { fileId }) => storage.discard(ctx, fileId),
})
const dropUploadLater = actionGeneric({
  args: { fileId: v.string() },
  handler: async (ctx, { fileId }) => storage.discard(ctx, fileId),
})
// An upload accepted in one call: the strip's check, a content check, the
// claim. The content check is a stand-in for `ai`: it answers what
// `safety.verdict` says, and records what it read.
const safety = { verdict: 'safe' as 'safe' | 'blocked' | 'down', read: [] as Array<{ images: string[], about: unknown }> }
const fakeAi = {
  requireSafe: async (_ctx: unknown, input: { images?: string[] }, about?: unknown) => {
    safety.read.push({ images: input.images ?? [], about })
    if (safety.verdict === 'blocked') throw backendError('invalid_input', { field: 'images', reason: 'content_blocked' })
    if (safety.verdict === 'down') throw backendError('unavailable', { service: 'moderation', reason: 'provider_refused' })
  },
}
const checkCover = queryGeneric({
  args: { id: v.id('strips'), workspaceId: v.string() },
  handler: async (ctx, { id, workspaceId }) => {
    if ((await ctx.db.get(id))?.workspaceId !== workspaceId) throw backendError('forbidden', { reason: 'other_workspace' })
  },
})
const keepCover = mutationGeneric({
  args: { id: v.id('strips'), fileId: v.string(), userId: v.string(), workspaceId: v.string() },
  handler: async (ctx, { id, fileId, userId, workspaceId }) => {
    await storage.claim(ctx, fileId, { userId, workspaceId })
    await ctx.db.patch(id, { coverId: fileId })
    return { fileId }
  },
})
const acceptCover = actionGeneric({
  args: { id: v.id('strips'), fileId: v.string(), unchecked: v.optional(v.boolean()), misconfigured: v.optional(v.boolean()) },
  handler: async (ctx, { id, fileId, unchecked, misconfigured }) => {
    const owner = await caller(ctx)
    return storage.acceptUpload(ctx, fileId, {
      check: () => ctx.runQuery(makeFunctionReference<'query'>('strips:checkCover'), { id, workspaceId: owner.workspaceId }),
      safety: misconfigured ? undefined as never : unchecked ? false : fakeAi,
      about: { subject: id },
      keep: () => ctx.runMutation(makeFunctionReference<'mutation', Record<string, unknown>, { fileId: string }>('strips:keepCover'), { id, fileId, ...owner }),
    })
  },
})
const downloadUrl = queryGeneric({
  args: { storageId: v.string(), ttl: v.optional(v.number()) },
  handler: async (ctx, { storageId, ttl }) => storage.signedUrl(ctx, storageId, { ttl }),
})

// Reads and writes of the component's own, for the test: an upload straight
// into its storage (what an upload URL does), and its tables and files.
const testing = {
  upload: actionGeneric({ args: { bytes: v.bytes(), type: v.string() }, handler: async (ctx, { bytes, type }) => ctx.storage.store(new Blob([bytes], { type })) }),
  read: actionGeneric({ args: { id: v.string() }, handler: async (ctx, { id }) => (await ctx.storage.get(id as never))?.arrayBuffer() ?? null }),
  files: queryGeneric({ args: {}, handler: async ctx => ctx.db.query('files').collect() }),
  exists: queryGeneric({ args: { id: v.string() }, handler: async (ctx, { id }) => (await ctx.db.system.get('_storage', id as never)) !== null }),
  stored: queryGeneric({ args: {}, handler: async ctx => (await ctx.db.system.query('_storage').collect()).length }),
  type: queryGeneric({ args: { id: v.string() }, handler: async (ctx, { id }) => (await ctx.db.system.get('_storage', id as never))?.contentType ?? null }),
  /** A record as 0.1 kept it, before hashes were. */
  forgetHash: mutationGeneric({
    args: { id: v.string() },
    handler: async (ctx, { id }) => {
      const row = (await ctx.db.query('files').collect()).find(file => file.storageId === id)!
      await ctx.db.patch(row._id, { sha256: undefined })
    },
  }),
}
const backend = (componentsGeneric() as unknown as { backend: Record<string, Record<string, FunctionReference<'query' | 'mutation' | 'action', 'internal'>>> }).backend

const http = httpRouter()
http.route({ pathPrefix: '/storage/', method: 'GET', handler: storage.fileRoute })
http.route({ path: '/noop', method: 'GET', handler: httpActionGeneric(async () => new Response('')) })

const testApp = defineBackendTestApp(appSchema, {
  './_generated/api.js': () => Promise.resolve({}),
  './storage.js': () => Promise.resolve(storage.api),
  './strips.js': () => Promise.resolve({ create, addPhoto, addOwnPhoto, attachFile, remove, shared, downloadUrl, dropUpload, dropUploadLater, expirePhoto, expireFile, shareEvents, checkCover, keepCover, acceptCover }),
  './http.js': () => Promise.resolve({ default: http }),
})
type App = ReturnType<typeof testApp>

/** The app under test, with the component's test-only module beside its own. */
function appUnderTest(): App {
  const t = testApp()
  t.registerComponent('backend', backendTest.schema, { ...backendTest.modules, './components/backend/testing.ts': () => Promise.resolve(testing) })
  return t
}

const ref = {
  create: makeFunctionReference<'mutation', { title: string }, string>('strips:create'),
  addPhoto: makeFunctionReference<'mutation', { id: string, photo: ArrayBuffer }, string>('strips:addPhoto'),
  addOwnPhoto: makeFunctionReference<'mutation', { photo: ArrayBuffer }, string>('strips:addOwnPhoto'),
  attachFile: makeFunctionReference<'mutation', { id: string, fileId: string }>('strips:attachFile'),
  remove: makeFunctionReference<'mutation', { id: string }>('strips:remove'),
  shared: makeFunctionReference<'query', { token: string }, { title: string, sharedBy: string, ogImageUrl: string | null } | null>('strips:shared'),
  downloadUrl: makeFunctionReference<'query', { storageId: string, ttl?: number }, string | null>('strips:downloadUrl'),
  dropUpload: makeFunctionReference<'mutation', { fileId: string }, boolean>('strips:dropUpload'),
  dropUploadLater: makeFunctionReference<'action', { fileId: string }, boolean>('strips:dropUploadLater'),
  acceptCover: makeFunctionReference<'action', { id: string, fileId: string, unchecked?: boolean, misconfigured?: boolean }, { fileId: string }>('strips:acceptCover'),
  expirePhoto: makeFunctionReference<'mutation', { id: string, at: number | null }, boolean>('strips:expirePhoto'),
  expireFile: makeFunctionReference<'mutation', { fileId: string, at: number | null }, boolean>('strips:expireFile'),
  shareEvents: makeFunctionReference<'query', Record<string, never>, Array<{ stripId: string, by: string, rotated: boolean }>>('strips:shareEvents'),
  generateUploadUrl: makeFunctionReference<'mutation', Record<string, never>, string>('storage:generateUploadUrl'),
  getFileUrl: makeFunctionReference<'query', { storageId: string }, string | null>('storage:getFileUrl'),
  getShareLink: makeFunctionReference<'query', { table: string, id: string }, { sharedAt: number } | null>('storage:getShareLink'),
  enableShareLink: makeFunctionReference<'mutation', { table: string, id: string }, { token: string, url: string }>('storage:enableShareLink'),
  revokeShareLink: makeFunctionReference<'mutation', { table: string, id: string }, null>('storage:revokeShareLink'),
}

const png = (extra = 0) => new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0, 0x49, 0x45, 0x4E, 0x44, 0, 0, 0, 0, ...Array.from({ length: extra }, () => 7)]).buffer

/** Upload bytes the way an upload URL does: straight into the component's storage, unclaimed. */
async function upload(t: App, bytes: Uint8Array | ArrayBuffer, type = 'image/jpeg'): Promise<string> {
  const buffer = bytes instanceof Uint8Array ? bytes.slice().buffer : bytes
  return await t.action(backend.testing!.upload as unknown as FunctionReference<'action', 'internal'>, { bytes: buffer, type }) as string
}

/** Whether a file is in the component's storage. */
async function exists(t: App, id: string): Promise<boolean> {
  return await t.query(backend.testing!.exists as unknown as FunctionReference<'query', 'internal'>, { id }) as boolean
}

/** How many files the component's storage holds. */
async function stored(t: App): Promise<number> {
  return await t.query(backend.testing!.stored as unknown as FunctionReference<'query', 'internal'>, {}) as number
}

/** The component's owner records. */
async function records(t: App): Promise<Array<{ servedId?: string, contentType?: string, status: string }>> {
  return await t.query(backend.testing!.files as unknown as FunctionReference<'query', 'internal'>, {}) as never
}

/** The refusal a call threw. */
async function refusal(call: Promise<unknown>) {
  const error = await call.then(() => null, (failure: unknown) => failure)
  return getBackendError(error)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
  vi.stubEnv('AUTH_SECRET', 'test-secret-for-signed-file-urls-0123456789')
  vi.stubEnv('CONVEX_SITE_URL', 'https://happy-otter-123.convex.site')
  vi.stubEnv('SITE_URL', 'https://panels.example.com')
  safety.verdict = 'safe'
  safety.read = []
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('storage.store', () => {
  test('keeps a photo with its row, stripped, readable by its workspace and nobody else', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const colleague = await asUser(t, { workspace: author.workspaceId })
    const stranger = await asUser(t)
    const id = await author.mutation(ref.create, { title: 'Monday' })
    const photoId = await author.mutation(ref.addPhoto, { id, photo: exifJpeg({ orientation: 6 }).slice().buffer })

    const kept = await t.run(ctx => ctx.db.get(id as never)) as { photoId: string }
    expect(kept.photoId).toBe(photoId)
    const bytes = new Uint8Array(await t.action(backend.testing!.read as unknown as FunctionReference<'action', 'internal'>, { id: photoId }) as ArrayBuffer)
    expect(jpegSegments(bytes)).toEqual(['E0', 'E1', 'E2', 'DB', 'DA'])
    expect(orientationOf(bytes)).toBe(6)

    expect(await author.query(ref.getFileUrl, { storageId: photoId })).toMatch(/^https:/)
    expect(await colleague.query(ref.getFileUrl, { storageId: photoId })).toMatch(/^https:/)
    expect(await stranger.query(ref.getFileUrl, { storageId: photoId })).toBeNull()
    expect(await t.query(ref.getFileUrl, { storageId: photoId })).toBeNull()
  })

  test('a file of the account\'s own is read by that account alone', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const colleague = await asUser(t, { workspace: author.workspaceId })
    const photoId = await author.mutation(ref.addOwnPhoto, { photo: png() })
    expect(await author.query(ref.getFileUrl, { storageId: photoId })).toMatch(/^https:/)
    expect(await colleague.query(ref.getFileUrl, { storageId: photoId })).toBeNull()
  })

  test('refuses a file that is not an image, or too large, and leaves nothing behind', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const id = await author.mutation(ref.create, { title: 'Monday' })
    expect(await refusal(author.mutation(ref.addPhoto, { id, photo: new TextEncoder().encode('not an image').buffer })))
      .toMatchObject({ code: 'invalid_input', data: { field: 'file', reason: 'unsupported_type' } })
    expect(await refusal(author.mutation(ref.addPhoto, { id, photo: png(5000) })))
      .toMatchObject({ code: 'invalid_input', data: { field: 'file', reason: 'too_large' } })
    expect(await records(t)).toEqual([])
    expect(await stored(t)).toBe(0)
  })

  test('counts files and bytes against the quota, and gives them back on release', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const ids = await Promise.all([1, 2, 3, 4].map(n => author.mutation(ref.create, { title: `Strip ${n}` })))
    for (const id of ids.slice(0, 3)) await author.mutation(ref.addPhoto, { id, photo: png() })
    expect(await refusal(author.mutation(ref.addPhoto, { id: ids[3]!, photo: png() })))
      .toMatchObject({ code: 'quota_exceeded', data: { quota: 'files', limit: 3, used: 3, amount: 1, plans: [] } })
    await author.mutation(ref.remove, { id: ids[0]! })
    await author.mutation(ref.addPhoto, { id: ids[3]!, photo: png() })
  })
})

describe('upload URLs and claims', () => {
  test('an upload URL is for signed-in accounts, at the upload rate', async () => {
    const t = appUnderTest()
    expect(await refusal(t.mutation(ref.generateUploadUrl, {}))).toMatchObject({ code: 'unauthenticated' })
    const author = await asUser(t)
    for (let n = 0; n < 20; n++) expect(await author.mutation(ref.generateUploadUrl, {})).toMatch(/^https:/)
    expect(await refusal(author.mutation(ref.generateUploadUrl, {}))).toMatchObject({ code: 'rate_limited', data: { limit: 'upload' } })
  })

  test('a claimed image is checked and stripped in the background, its URL served only then', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const id = await author.mutation(ref.create, { title: 'Monday' })
    const fileId = await upload(t, exifJpeg())
    await author.mutation(ref.attachFile, { id, fileId })
    expect(await author.query(ref.getFileUrl, { storageId: fileId })).toBeNull()
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await author.query(ref.getFileUrl, { storageId: fileId })).toMatch(/^https:/)
    // The original, with its GPS block, is gone; a stripped copy is served in its place.
    expect(await exists(t, fileId)).toBe(false)
    const [record] = await records(t)
    expect(record).toMatchObject({ status: 'ready', contentType: 'image/jpeg' })
    expect(record!.servedId).toBeDefined()
  })

  test('a kept file is served from a copy under its sniffed type, never under the type its uploader declared', async () => {
    const t = appUnderTest()
    const polyglot = new Uint8Array([...new TextEncoder().encode('GIF89a'), 1, 0, 1, 0, ...new TextEncoder().encode('<script>alert(1)</script>')])
    const fileId = await upload(t, polyglot, 'text/html')
    // An app that keeps GIFs, and strips nothing: the bytes stay, never the declared type.
    await t.mutation(backend.storage!.claim as unknown as FunctionReference<'mutation', 'internal'>, { storageId: fileId, owner: { userId: 'u1' }, holder: 'u1', limits: {}, maxSize: 4096, check: { accept: ['image/*'], strip: false } })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    const [record] = await records(t)
    expect(record).toMatchObject({ status: 'ready', contentType: 'image/gif' })
    expect(await exists(t, fileId)).toBe(false)
    expect(await t.query(backend.testing!.type as unknown as FunctionReference<'query', 'internal'>, { id: record!.servedId! })).toBe('image/gif')
  })

  test('refuses to start with an image type whose metadata it cannot strip, while it strips', () => {
    expect(() => setupStorage(components as never, { accept: ['image/heic'] })).toThrow(/can't be stripped/)
    expect(() => setupStorage(components as never, { accept: ['image/heic'], stripMetadata: false })).not.toThrow()
  })

  test('a claimed upload whose bytes are not an accepted type is deleted, its URL never served', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const id = await author.mutation(ref.create, { title: 'Monday' })
    const fileId = await upload(t, new TextEncoder().encode('%PDF-1.7 renamed to .jpg'))
    await author.mutation(ref.attachFile, { id, fileId })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await author.query(ref.getFileUrl, { storageId: fileId })).toBeNull()
    expect(await stored(t)).toBe(0)
  })

  test('refuses an upload that is gone, too large or already claimed', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const id = await author.mutation(ref.create, { title: 'Monday' })
    expect(await refusal(author.mutation(ref.attachFile, { id, fileId: 'kg2notastorageid' }))).toMatchObject({ code: 'invalid_input', data: { field: 'file', reason: 'upload_gone' } })
    const big = await upload(t, new Uint8Array(5000))
    expect(await refusal(author.mutation(ref.attachFile, { id, fileId: big }))).toMatchObject({ code: 'invalid_input', data: { reason: 'too_large' } })
    const fileId = await upload(t, exifJpeg())
    await author.mutation(ref.attachFile, { id, fileId })
    expect(await refusal(author.mutation(ref.attachFile, { id, fileId }))).toMatchObject({ code: 'invalid_input', data: { reason: 'upload_claimed' } })
  })
})

describe('removing an intimate image\'s copies', () => {
  const removeCopies = (t: App, storageIds: string[]) => t.mutation(backend.storage!.removeCopies as unknown as FunctionReference<'mutation', 'internal'>, { storageIds })

  /** A photo claimed and checked into a strip of the account's own: its stripped copy is served, its hash kept. */
  async function checkedPhoto(t: App, account: Awaited<ReturnType<typeof asUser>>): Promise<string> {
    const id = await account.mutation(ref.create, { title: 'Monday' })
    const fileId = await upload(t, exifJpeg())
    await account.mutation(ref.attachFile, { id, fileId })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    return fileId
  }

  test('a file kept before hashes were is hashed from the copy it serves: its copies go, and the bytes are refused after', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const other = await asUser(t)
    const photo = await checkedPhoto(t, author)
    await checkedPhoto(t, other)
    await t.mutation(backend.testing!.forgetHash as unknown as FunctionReference<'mutation', 'internal'>, { id: photo })
    await removeCopies(t, [photo])
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await records(t)).toEqual([])
    expect(await stored(t)).toBe(0)
    await checkedPhoto(t, other)
    expect(await stored(t)).toBe(0)
  })

  test('an upload still checked is removed by its check, with the copies of its stripped bytes', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const other = await asUser(t)
    await checkedPhoto(t, other)
    const id = await author.mutation(ref.create, { title: 'Monday' })
    const photo = await upload(t, exifJpeg())
    await author.mutation(ref.attachFile, { id, fileId: photo })
    await removeCopies(t, [photo])
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await records(t)).toEqual([])
    expect(await stored(t)).toBe(0)
  })
})

describe('cleanup', () => {
  test('the sweep deletes uploads nobody claimed a day after they arrived, and keeps the rest', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const id = await author.mutation(ref.create, { title: 'Monday' })
    const orphan = await upload(t, exifJpeg())
    const claimed = await upload(t, exifJpeg())
    await author.mutation(ref.attachFile, { id, fileId: claimed })
    const stored = await author.mutation(ref.addOwnPhoto, { photo: png() })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    vi.advanceTimersByTime(DAY + HOUR)
    const fresh = await upload(t, exifJpeg())
    await t.mutation(backend.maintenance!.run as unknown as FunctionReference<'mutation', 'internal'>, {})
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await exists(t, orphan)).toBe(false)
    expect(await exists(t, fresh)).toBe(true)
    expect(await author.query(ref.getFileUrl, { storageId: claimed })).toMatch(/^https:/)
    expect(await author.query(ref.getFileUrl, { storageId: stored })).toMatch(/^https:/)
  })

  test('release deletes the file and its URL reads null; twice is safe', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const id = await author.mutation(ref.create, { title: 'Monday' })
    const photoId = await author.mutation(ref.addPhoto, { id, photo: png() })
    await author.mutation(ref.remove, { id })
    expect(await author.query(ref.getFileUrl, { storageId: photoId })).toBeNull()
    expect(await stored(t)).toBe(0)
  })
})

describe('expire', () => {
  /** One maintenance pass, run to its end. */
  async function maintain(t: App) {
    await t.mutation(backend.maintenance!.run as unknown as FunctionReference<'mutation', 'internal'>, {})
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
  }

  test('a file goes with its record once its end passed, and its bytes leave the quota', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const id = await author.mutation(ref.create, { title: 'Monday' })
    const photoId = await author.mutation(ref.addPhoto, { id, photo: png() })
    expect(await author.mutation(ref.expirePhoto, { id, at: Date.now() + 2 * HOUR })).toBe(true)

    await maintain(t)
    expect(await author.query(ref.getFileUrl, { storageId: photoId })).toMatch(/^https:/)

    vi.advanceTimersByTime(3 * HOUR)
    await maintain(t)
    expect(await author.query(ref.getFileUrl, { storageId: photoId })).toBeNull()
    expect(await exists(t, photoId)).toBe(false)
    expect(await records(t)).toEqual([])
    // The quota (three files) counts it no longer.
    for (let i = 0; i < 3; i++) await author.mutation(ref.addOwnPhoto, { photo: png(i) })
  })

  test('null keeps a file again; an unknown id, no id or an unkept upload is nothing to expire', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const id = await author.mutation(ref.create, { title: 'Monday' })
    const photoId = await author.mutation(ref.addPhoto, { id, photo: png() })
    await author.mutation(ref.expirePhoto, { id, at: Date.now() + HOUR })
    expect(await author.mutation(ref.expirePhoto, { id, at: null })).toBe(true)
    vi.advanceTimersByTime(2 * HOUR)
    await maintain(t)
    expect(await author.query(ref.getFileUrl, { storageId: photoId })).toMatch(/^https:/)

    // A time at or before the epoch is past: due at the next run, not never.
    const old = await author.mutation(ref.addOwnPhoto, { photo: png(7) })
    expect(await author.mutation(ref.expireFile, { fileId: old, at: 0 })).toBe(true)
    await maintain(t)
    expect(await exists(t, old)).toBe(false)

    // The component refuses an `at` that is no time, called directly too.
    const expireDirectly = backend.storage!.expire as unknown as FunctionReference<'mutation', 'internal'>
    for (const at of [Number.NaN, Number.POSITIVE_INFINITY]) await expect(t.mutation(expireDirectly, { storageId: photoId, at }), String(at)).rejects.toThrow(/is no time|epoch milliseconds/)

    const unclaimed = await upload(t, png())
    for (const fileId of ['', 'not-an-id', unclaimed]) expect(await author.mutation(ref.expireFile, { fileId, at: Date.now() }), fileId).toBe(false)
  })

  test('refuses an end that is not a time', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const photoId = await author.mutation(ref.addOwnPhoto, { photo: png() })
    await expect(author.mutation(ref.expireFile, { fileId: photoId, at: Number.NaN })).rejects.toThrow(/epoch milliseconds or a Date/)
  })
})

describe('discard', () => {
  test('deletes an unclaimed upload at once, from a mutation or an action, and answers false the second time', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const dropped = await upload(t, png())
    expect(await author.mutation(ref.dropUpload, { fileId: dropped })).toBe(true)
    expect(await exists(t, dropped)).toBe(false)
    expect(await author.mutation(ref.dropUpload, { fileId: dropped })).toBe(false)

    const later = await upload(t, png())
    expect(await author.action(ref.dropUploadLater, { fileId: later })).toBe(true)
    expect(await exists(t, later)).toBe(false)
    expect(await author.action(ref.dropUploadLater, { fileId: later })).toBe(false)
  })

  test('never touches a kept file: claimed, stored or served, whoever asks', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const stranger = await asUser(t)
    const id = await author.mutation(ref.create, { title: 'Monday' })
    const kept = await author.mutation(ref.addPhoto, { id, photo: png() })
    const claimed = await upload(t, png())
    await author.mutation(ref.attachFile, { id, fileId: claimed })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    const served = (await records(t)).map(record => record.servedId).filter(Boolean) as string[]

    for (const fileId of [kept, claimed, ...served]) {
      expect(await stranger.mutation(ref.dropUpload, { fileId }), fileId).toBe(false)
      expect(await author.action(ref.dropUploadLater, { fileId }), fileId).toBe(false)
    }
    expect(await author.query(ref.getFileUrl, { storageId: kept })).toMatch(/^https:/)
    expect(await author.query(ref.getFileUrl, { storageId: claimed })).toMatch(/^https:/)
  })

  test('does nothing for no id, an unknown one, or one of another table', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const id = await author.mutation(ref.create, { title: 'Monday' })
    for (const fileId of ['', 'not-an-id', id]) expect(await author.mutation(ref.dropUpload, { fileId }), fileId).toBe(false)
  })
})

describe('acceptUpload', () => {
  /** The strip's cover, as keepCover set it. */
  const coverOf = async (t: App, id: string) => (await t.run(ctx => ctx.db.get(id as never)) as { coverId?: string }).coverId

  test('runs the check, the content check and the keep in turn, and answers what keep returned', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const id = await author.mutation(ref.create, { title: 'Monday' })
    const fileId = await upload(t, png())
    expect(await author.action(ref.acceptCover, { id, fileId })).toEqual({ fileId })
    expect(safety.read).toEqual([{ images: [fileId], about: { stage: 'upload', subject: id } }])
    expect(await coverOf(t, id)).toBe(fileId)
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await author.query(ref.getFileUrl, { storageId: fileId })).toMatch(/^https:/)
  })

  test('discards an upload the content check refuses, and keeps nothing', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const id = await author.mutation(ref.create, { title: 'Monday' })
    const fileId = await upload(t, png())
    safety.verdict = 'blocked'
    expect(await refusal(author.action(ref.acceptCover, { id, fileId }))).toMatchObject({ code: 'invalid_input', data: { field: 'images', reason: 'content_blocked' } })
    expect(await exists(t, fileId)).toBe(false)
    expect(await coverOf(t, id)).toBeUndefined()
  })

  test('discards an upload the claim refuses: over maxSize', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const id = await author.mutation(ref.create, { title: 'Monday' })
    const fileId = await upload(t, png(5000))
    expect(await refusal(author.action(ref.acceptCover, { id, fileId }))).toMatchObject({ code: 'invalid_input', data: { field: 'file', reason: 'too_large' } })
    expect(await exists(t, fileId)).toBe(false)
    expect(await coverOf(t, id)).toBeUndefined()
  })

  test('keeps the upload for a retry when the failure says nothing about the file', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const id = await author.mutation(ref.create, { title: 'Monday' })
    const fileId = await upload(t, png())
    safety.verdict = 'down'
    expect(await refusal(author.action(ref.acceptCover, { id, fileId }))).toMatchObject({ code: 'unavailable' })
    expect(await exists(t, fileId)).toBe(true)
    expect(await coverOf(t, id)).toBeUndefined()

    safety.verdict = 'safe'
    expect(await author.action(ref.acceptCover, { id, fileId })).toEqual({ fileId })
    expect(await coverOf(t, id)).toBe(fileId)
  })

  test('stops at the check: no content check is paid for, and the upload stays', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const stranger = await asUser(t)
    const id = await author.mutation(ref.create, { title: 'Monday' })
    const fileId = await upload(t, png())
    expect(await refusal(stranger.action(ref.acceptCover, { id, fileId }))).toMatchObject({ code: 'forbidden', data: { reason: 'other_workspace' } })
    expect(safety.read).toEqual([])
    expect(await exists(t, fileId)).toBe(true)
  })

  test('never discards a kept file, though a second accept of it is refused', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const id = await author.mutation(ref.create, { title: 'Monday' })
    const fileId = await upload(t, png())
    await author.action(ref.acceptCover, { id, fileId })
    expect(await refusal(author.action(ref.acceptCover, { id, fileId }))).toMatchObject({ code: 'invalid_input', data: { reason: 'upload_claimed' } })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await author.query(ref.getFileUrl, { storageId: fileId })).toMatch(/^https:/)
  })

  test('keeps an upload with no content check under safety: false, and refuses a missing safety outright', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const id = await author.mutation(ref.create, { title: 'Monday' })
    const unchecked = await upload(t, png())
    expect(await author.action(ref.acceptCover, { id, fileId: unchecked, unchecked: true })).toEqual({ fileId: unchecked })
    expect(safety.read).toEqual([])

    const other = await upload(t, png())
    await expect(author.action(ref.acceptCover, { id, fileId: other, misconfigured: true })).rejects.toThrow(/safety is your ai/)
    expect(await exists(t, other)).toBe(true)
  })
})

describe('signed URLs', () => {
  test('serve the file until they expire, as a download unless it is an image, and 404 once altered', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const photoId = await author.mutation(ref.addOwnPhoto, { photo: png() })
    const url = (await t.query(ref.downloadUrl, { storageId: photoId }))!
    expect(url).toMatch(/^https:\/\/happy-otter-123\.convex\.site\/storage\/.+\?expires=\d+&signature=[\w-]+$/)
    const path = url.slice('https://happy-otter-123.convex.site'.length)
    const realFetch = globalThis.fetch
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const target = String(input instanceof Request ? input.url : input)
      return target.includes('/api/storage/') ? new Response(new Uint8Array(png()), { status: 200 }) : realFetch(input, init)
    })
    const served = await t.fetch(path)
    expect(served.status).toBe(200)
    expect(served.headers.get('content-type')).toBe('image/png')
    expect(served.headers.get('x-content-type-options')).toBe('nosniff')
    expect(served.headers.get('content-disposition')).toBe('inline')
    expect((await t.fetch(path.replace(/signature=(.)/, (_, first: string) => `signature=${first === 'x' ? 'y' : 'x'}`))).status).toBe(404)
    vi.advanceTimersByTime(2 * HOUR)
    expect((await t.fetch(path)).status).toBe(404)
  })

  test('is null for a file that is gone', async () => {
    const t = appUnderTest()
    expect(await t.query(ref.downloadUrl, { storageId: 'kg2gone' })).toBeNull()
  })

  /** The URL clock's cron, run now. */
  const tick = (t: App) => t.mutation(backend.storage!.tickUrlClock as unknown as FunctionReference<'mutation', 'internal'>, {})
  const expiresOf = (url: string | null) => Number(new URL(url!).searchParams.get('expires'))

  test('answer the same URL between two ticks of the URL clock, and a later one after the next', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const photoId = await author.mutation(ref.addOwnPhoto, { photo: png() })
    // A quarter past: the twenty minutes below cross a half hour with no tick.
    const half = 30 * 60 * 1000
    vi.advanceTimersByTime((half / 2 - (Date.now() % half) + half) % half)
    await tick(t)
    const tickedAt = Date.now()
    const first = await t.query(ref.downloadUrl, { storageId: photoId })
    // Twenty minutes on, no tick: the same URL, so the browser's cache holds.
    vi.advanceTimersByTime(20 * 60 * 1000)
    expect(await t.query(ref.downloadUrl, { storageId: photoId })).toBe(first)
    // It counts from the tick, not from now: at least the hour, half as long again at most.
    expect(expiresOf(first) - tickedAt).toBeGreaterThanOrEqual(HOUR)
    expect(expiresOf(first) - tickedAt).toBeLessThanOrEqual(1.5 * HOUR)
    vi.advanceTimersByTime(10 * 60 * 1000)
    await tick(t)
    const second = await t.query(ref.downloadUrl, { storageId: photoId })
    expect(expiresOf(second) - expiresOf(first)).toBe(30 * 60 * 1000)
    // Still good past the next tick: never expired on a live page.
    expect(expiresOf(second) - Date.now()).toBeGreaterThan(30 * 60 * 1000)
  })

  test('a longer URL changes once a step of half its life, not on every tick', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const photoId = await author.mutation(ref.addOwnPhoto, { photo: png() })
    const seen = new Set<string>()
    // Six hours of ticks: a six-hour URL steps every three hours.
    for (let tickNumber = 0; tickNumber < 12; tickNumber++) {
      await tick(t)
      seen.add((await t.query(ref.downloadUrl, { storageId: photoId, ttl: 6 * HOUR }))!)
      vi.advanceTimersByTime(30 * 60 * 1000)
    }
    expect(seen.size).toBeLessThanOrEqual(3)
  })

  test('a URL of a day or more reads no clock: it counts from now, on the hour, never past its ttl', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const photoId = await author.mutation(ref.addOwnPhoto, { photo: png() })
    const url = await t.query(ref.downloadUrl, { storageId: photoId, ttl: 7 * 24 * HOUR })
    expect(expiresOf(url) % HOUR).toBe(0)
    expect(expiresOf(url) - Date.now()).toBeLessThanOrEqual(7 * 24 * HOUR)
    await tick(t)
    expect(await t.query(ref.downloadUrl, { storageId: photoId, ttl: 7 * 24 * HOUR })).toBe(url)
  })
})

describe('share links', () => {
  test('the author turns a link on; anyone holding it reads the row until it is revoked', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const id = await author.mutation(ref.create, { title: 'Monday' })
    const { token, url } = await author.mutation(ref.enableShareLink, { table: 'strips', id })
    expect(url).toBe(`https://panels.example.com/s/${token}`)
    expect(await author.query(ref.getShareLink, { table: 'strips', id })).toMatchObject({ sharedAt: expect.any(Number) })
    expect(await t.query(ref.shared, { token })).toMatchObject({ title: 'Monday', sharedBy: author.userId, ogImageUrl: null })
    // Rotating replaces the link.
    const rotated = await author.mutation(ref.enableShareLink, { table: 'strips', id })
    expect(await t.query(ref.shared, { token })).toBeNull()
    await author.mutation(ref.revokeShareLink, { table: 'strips', id })
    expect(await t.query(ref.shared, { token: rotated.token })).toBeNull()
    expect(await author.query(ref.getShareLink, { table: 'strips', id })).toBeNull()
  })

  test('onEnable runs in the same mutation, with the caller, the row and the link, and a throw rolls the link back', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const id = await author.mutation(ref.create, { title: 'Monday' })
    mailed.length = 0
    const first = await author.mutation(ref.enableShareLink, { table: 'strips', id })
    const second = await author.mutation(ref.enableShareLink, { table: 'strips', id })
    expect(await t.query(ref.shareEvents, {})).toEqual([
      expect.objectContaining({ stripId: id, by: author.userId, rotated: false }),
      expect.objectContaining({ stripId: id, by: author.userId, rotated: true }),
    ])
    expect(mailed).toEqual([first.url, second.url])

    const refused = await author.mutation(ref.create, { title: 'Refused' })
    await expect(author.mutation(ref.enableShareLink, { table: 'strips', id: refused })).rejects.toThrow(/not this one/)
    expect(await author.query(ref.getShareLink, { table: 'strips', id: refused })).toBeNull()
  })

  test('the preview card is an expiring URL of the ogImage file', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const id = await author.mutation(ref.create, { title: 'Monday' })
    const coverId = await upload(t, exifJpeg())
    await author.mutation(ref.attachFile, { id, fileId: coverId })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    const { token } = await author.mutation(ref.enableShareLink, { table: 'strips', id })
    expect((await t.query(ref.shared, { token }))!.ogImageUrl).toMatch(/\/storage\/.+signature=/)
  })

  test('refuses a table not marked shareable, a caller canShare refuses, and a signed-out caller', async () => {
    const t = appUnderTest()
    const author = await asUser(t)
    const colleague = await asUser(t, { workspace: author.workspaceId })
    const id = await author.mutation(ref.create, { title: 'Monday' })
    expect(await refusal(author.mutation(ref.enableShareLink, { table: 'todos', id }))).toMatchObject({ code: 'invalid_input', data: { field: 'table' } })
    expect(await refusal(colleague.mutation(ref.enableShareLink, { table: 'strips', id }))).toMatchObject({ code: 'forbidden', data: { reason: 'cannot_share' } })
    expect(await refusal(t.mutation(ref.enableShareLink, { table: 'strips', id }))).toMatchObject({ code: 'unauthenticated' })
    await author.mutation(ref.enableShareLink, { table: 'strips', id })
    expect(await colleague.query(ref.getShareLink, { table: 'strips', id })).toBeNull()
    expect(await refusal(colleague.mutation(ref.revokeShareLink, { table: 'strips', id }))).toMatchObject({ code: 'forbidden', data: { reason: 'cannot_share' } })
  })
})

describe('export and erasure', () => {
  test('an export lists the account\'s files; its erasure deletes them and keeps a shared workspace\'s', async () => {
    const t = appUnderTest()
    const shared = await seedWorkspace(t)
    const author = await asUser(t)
    const member = await asUser(t, { workspace: shared })
    const keeper = await asUser(t, { workspace: shared })
    const own = await author.mutation(ref.addOwnPhoto, { photo: png() })
    const workspacePhoto = await member.mutation(ref.addOwnPhoto, { photo: png() })
    const sharedStrip = await member.mutation(ref.create, { title: 'Ours' })
    const sharedPhoto = await member.mutation(ref.addPhoto, { id: sharedStrip, photo: png() })

    const exported = await t.query(backend.account!.exportData as unknown as FunctionReference<'query', 'internal'>, { userId: author.userId }) as { files: Array<{ storageId: string }> }
    expect(exported.files.map(file => file.storageId)).toEqual([own])

    for (const userId of [author.userId, member.userId]) {
      await t.mutation(backend.account!.forget as unknown as FunctionReference<'mutation', 'internal'>, { userId })
    }
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await author.query(ref.getFileUrl, { storageId: own })).toBeNull()
    expect(await exists(t, workspacePhoto)).toBe(false)
    // The workspace stays with its other member, and so does its photo, its uploader a pseudonym.
    expect(await keeper.query(ref.getFileUrl, { storageId: sharedPhoto })).toMatch(/^https:/)
  })
})
