/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { actionGeneric, componentsGeneric, defineSchema, defineTable, type FunctionReference, makeFunctionReference, mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { generateText } from 'ai'
import backendTest, { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { backendError, getBackendError } from '../../src/convex/errors'
import { defineJobQueue, setupAi } from '../../src/convex/integrations/ai'
import type { Billing } from '../../src/convex/integrations/billing'
import { setupRateLimiter } from '../../src/convex/integrations/rate-limit'
import { setupStorage } from '../../src/convex/integrations/storage'
import { generateProvenanceCredentials } from '../../src/provenance-keys'
import { recordImage, storeGeneratedImage } from '../../src/convex/components/backend/ai'

// setupAi({ provenance }) the way a strips module uses it: a job step stores
// the panel a model drew through ctx.storeImage, which writes the IPTC
// source type and a signed C2PA manifest into the file before it reaches
// storage and records what made it; the job's result carries provenance
// once it is done, and ai.provenanceOf reads the record in a query of the
// app's own. Without a signing key the image keeps the source type only,
// and a format C2PA writing here does not take is stored as it came. The
// image is kept in the component's storage as the job's owner's, like an
// upload storage.claim kept: the quota counts it, an export lists it, an
// erasure deletes it, and another workspace never reads it. The manifest's
// own structure is held by test/unit/content-credentials.test.ts.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'>, rateLimiter: never, workflow: never, persistentTextStreaming: never }

/** A 1×1 PNG, as an image model's file would arrive. */
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), char => char.charCodeAt(0))
const GIF = new TextEncoder().encode('GIF89a\x01\x00\x01\x00')

const billing = {
  requireEntity: async (ctx: { auth: { getUserIdentity: () => Promise<Record<string, unknown> | null> } }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw backendError('unauthenticated', {})
    return { userId: identity.activeOrganizationId as string, email: identity.email as string }
  },
  requireFeature: async (_ctx: unknown, feature: string) => {
    throw backendError('feature_required', { feature, plans: [] })
  },
  reportCost: async () => {},
  recordEvent: async () => {},
} as unknown as Billing

const rateLimiter = setupRateLimiter(components as never)
const ai = setupAi(components as never, { billing, rateLimiter, provenance: { name: 'Panels' } })
const plain = setupAi(components as never, { billing, rateLimiter })
const jobs = defineJobQueue(components as never, { ai })
const storage = setupStorage(components as never, { quota: { files: 2 } })

const appSchema = defineSchema({
  strips: defineTable({ idea: v.string(), photoId: v.string(), panels: v.array(v.string()), jobId: v.optional(v.string()) }),
})

const drawPanel = jobs.step({
  model: 'test/image',
  args: { stripId: v.id('strips'), photoId: v.string() },
  handler: async (ctx, { stripId, photoId }) => {
    await generateText({ model: ctx.model(), prompt: 'Panel 1 of a strip about a fox.' })
    const storageId = await ctx.storeImage({ uint8Array: PNG, mediaType: 'image/png' }, { inputs: [stripId, photoId] })
    await ctx.runMutation(makeFunctionReference<'mutation'>('strips:savePanel'), { stripId, storageId })
  },
})

const render = jobs.define({
  meter: false,
  args: { stripId: v.id('strips'), photoId: v.string() },
  handler: async (job, args) => {
    await job.run(makeFunctionReference<'action'>('strips:drawPanel') as unknown as FunctionReference<'action', 'internal'>, args)
  },
})

const create = mutationGeneric({
  args: {},
  handler: async (ctx) => {
    const stripId = await ctx.db.insert('strips', { idea: 'A fox who wants to fly', photoId: 'photo_1', panels: [] })
    const { jobId } = await jobs.enqueue(ctx, makeFunctionReference<'mutation'>('strips:render') as never, { stripId, photoId: 'photo_1' })
    await ctx.db.patch(stripId, { jobId })
    return { stripId, jobId }
  },
})
/** A kind that charges credits: never one the app pays for. */
const paid = jobs.define({
  meter: 'credits',
  cost: 1,
  args: { stripId: v.id('strips'), photoId: v.string() },
  handler: async () => {},
})
/** Content the app seeds for everyone: a strip drawn by a job the app owns, with nobody signed in. */
const seed = mutationGeneric({
  args: { kind: v.optional(v.literal('paid')) },
  handler: async (ctx, { kind }) => {
    const stripId = await ctx.db.insert('strips', { idea: 'A fox who wants to fly', photoId: 'photo_1', panels: [] })
    const { jobId } = await jobs.enqueue(ctx, makeFunctionReference<'mutation'>(`strips:${kind ?? 'render'}`) as never, { stripId, photoId: 'photo_1' }, { billTo: 'app' })
    await ctx.db.patch(stripId, { jobId })
    return { stripId, jobId }
  },
})
const savePanel = mutationGeneric({
  args: { stripId: v.id('strips'), storageId: v.string() },
  handler: async (ctx, { stripId, storageId }) => {
    const strip = (await ctx.db.get(stripId))!
    await ctx.db.patch(stripId, { panels: [...strip.panels, storageId] })
  },
})
const get = queryGeneric({ args: { id: v.id('strips') }, handler: async (ctx, { id }) => ctx.db.get(id) })
/** A photo a person uploads into their active workspace, through storage.store and its quota. */
const addPhoto = mutationGeneric({
  args: { photo: v.bytes() },
  handler: async (ctx, { photo }) => {
    const identity = (await ctx.auth.getUserIdentity())!
    return (await storage.store(ctx, photo, { userId: identity.subject, workspaceId: identity.activeOrganizationId as string })).storageId
  },
})
/** The app's own read of a file's URL, once its query decided who may see it. */
const fileUrl = queryGeneric({ args: { storageId: v.string() }, handler: async (ctx, { storageId }) => storage.fileUrl(ctx, storageId) })
const provenanceOf = queryGeneric({ args: { storageId: v.string() }, handler: async (ctx, { storageId }) => ai.provenanceOf(ctx, storageId) })

/** A metered action that stores what its handler is given: a cover, outside any job. */
const cover = ai.meteredAction({
  meter: false,
  model: 'test/image',
  args: { kind: v.union(v.literal('png'), v.literal('gif')), composite: v.optional(v.boolean()) },
  handler: async (ctx, { kind, composite }) => ctx.storeImage(kind === 'png' ? new Blob([PNG], { type: 'image/png' }) : new Blob([GIF], { type: 'image/gif' }), composite ? { sourceType: 'composite' } : {}),
})
const unprovenanced = plain.meteredAction({
  meter: false,
  args: {},
  handler: async ctx => ctx.storeImage(PNG),
})

const testApp = defineBackendTestApp(appSchema, {
  './_generated/api.js': () => Promise.resolve({}),
  './jobs.js': () => Promise.resolve(jobs.api),
  './strips.js': () => Promise.resolve({ render, paid, seed, drawPanel, create, savePanel, get, provenanceOf, cover, unprovenanced, addPhoto, fileUrl }),
  './storage.js': () => Promise.resolve(storage.api),
})
type App = ReturnType<typeof testApp>

// Reads of the component's own, for the test: a file's bytes and its owner record.
const testing = {
  read: actionGeneric({ args: { id: v.string() }, handler: async (ctx, { id }) => (await ctx.storage.get(id as never))?.arrayBuffer() ?? null }),
  record: queryGeneric({ args: { id: v.string() }, handler: async (ctx, { id }) => (await ctx.db.query('files').collect()).find(file => file.storageId === id) ?? null }),
  usage: queryGeneric({ args: { holder: v.string() }, handler: async (ctx, { holder }) => (await ctx.db.query('fileUsage').collect()).find(row => row.holder === holder)?.files ?? 0 }),
  /** A visitor's job that a sign-up claimed (claimVisitor's first half): its owner still the visitor's. */
  guestJob: mutationGeneric({
    args: { visitor: v.string(), userId: v.string() },
    handler: async (ctx, { visitor, userId }) => String(await ctx.db.insert('jobs', {
      kind: 'strips:render', args: {}, owner: `guest:${visitor}`, userId, visitor, status: 'done', rank: 0, score: 0, joinedAt: 0,
      cost: 0, budgetCounted: 0, charged: false, refunded: false, attempts: 1, retries: 0,
    } as never)),
  }),
}
const backend = (componentsGeneric() as unknown as { backend: Record<string, Record<string, FunctionReference<'query' | 'mutation' | 'action', 'internal'>>> }).backend

/** The app under test, with the component's test-only module beside its own. */
function appUnderTest(): App {
  const t = testApp()
  t.registerComponent('backend', backendTest.schema, { ...backendTest.modules, './components/backend/testing.ts': () => Promise.resolve(testing) })
  return t
}

const ref = {
  create: makeFunctionReference<'mutation', Record<string, never>, { stripId: string, jobId: string }>('strips:create'),
  seed: makeFunctionReference<'mutation', { kind?: 'paid' }, { stripId: string, jobId: string }>('strips:seed'),
  get: makeFunctionReference<'query', { id: string }, { panels: string[] } | null>('strips:get'),
  getJob: makeFunctionReference<'query', { jobId: string }, Record<string, unknown> | null>('jobs:getJob'),
  provenanceOf: makeFunctionReference<'query', { storageId: string }, Record<string, unknown> | null>('strips:provenanceOf'),
  cover: makeFunctionReference<'action', { kind: 'png' | 'gif', composite?: boolean }, string>('strips:cover'),
  unprovenanced: makeFunctionReference<'action', Record<string, never>, string>('strips:unprovenanced'),
  addPhoto: makeFunctionReference<'mutation', { photo: ArrayBuffer }, string>('strips:addPhoto'),
  fileUrl: makeFunctionReference<'query', { storageId: string }, string | null>('strips:fileUrl'),
  getFileUrl: makeFunctionReference<'query', { storageId: string }, string | null>('storage:getFileUrl'),
}

async function drain(t: App) {
  await t.finishAllScheduledFunctions(vi.runAllTimers, 500)
}

/** A kept file's bytes, read from the component's storage, as a string. */
async function stored(t: App, storageId: string): Promise<string> {
  const bytes = await t.action(backend.testing!.read as unknown as FunctionReference<'action', 'internal'>, { id: storageId }) as ArrayBuffer
  return String.fromCharCode(...new Uint8Array(bytes))
}

/** A kept file's owner record in the component, or `null`. */
async function record(t: App, storageId: string): Promise<{ userId: string, workspaceId?: string, holder: string, status: string, contentType?: string } | null> {
  return await t.query(backend.testing!.record as unknown as FunctionReference<'query', 'internal'>, { id: storageId }) as never
}

const credentials = generateProvenanceCredentials('Panels')
const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('PROVENANCE_PRIVATE_KEY', credentials.privateKey.replace(/\n/g, '\\n'))
  vi.stubEnv('PROVENANCE_CERTIFICATE', credentials.certificate)
  warn.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('ctx.storeImage in a job step', () => {
  test('stores the panel with its content credentials, and the job\'s result carries what made it', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    const { stripId, jobId } = await ada.mutation(ref.create, {})
    await drain(t)

    const [storageId] = (await ada.query(ref.get, { id: stripId }))!.panels
    const file = await stored(t, storageId!)
    // The IPTC source type in its XMP, and a C2PA manifest store in a caBX chunk naming the generator and the model.
    expect(file).toContain('Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"')
    expect(file).toContain('caBX')
    expect(file).toContain('c2pa.actions.v2')
    expect(file).toContain('Panels')
    expect(file).toContain('test/image')

    const job = await ada.query(ref.getJob, { jobId })
    expect(job).toMatchObject({ status: 'done', provenance: { models: ['test/image'], finishedAt: expect.any(Number), inputs: [stripId, 'photo_1'] } })

    // The record, as a query of the app's own reads it.
    expect(await ada.query(ref.provenanceOf, { storageId: storageId! })).toEqual({ models: ['test/image'], finishedAt: expect.any(Number), inputs: [stripId, 'photo_1'] })
  })
})

describe('ctx.storeImage in a metered action', () => {
  test('records the action\'s model, and the composite source type when asked', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    const storageId = await ada.action(ref.cover, { kind: 'png', composite: true })
    expect(await stored(t, storageId)).toContain('compositeWithTrainedAlgorithmicMedia')
    expect(await ada.query(ref.provenanceOf, { storageId })).toEqual({ models: ['test/image'], finishedAt: expect.any(Number), inputs: [] })
  })

  test('stores a format C2PA writing does not take as it came, with its record, and says so', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    const storageId = await ada.action(ref.cover, { kind: 'gif' })
    expect(await stored(t, storageId)).toBe('GIF89a\x01\x00\x01\x00')
    expect(await ada.query(ref.provenanceOf, { storageId })).toMatchObject({ models: ['test/image'] })
    expect(warn.mock.calls.flat().join(' ')).toContain('ai.provenance_skipped')
  })

  test('without a signing key, the image keeps the IPTC source type, no manifest, and the log says why', async () => {
    vi.stubEnv('PROVENANCE_PRIVATE_KEY', '')
    const t = appUnderTest()
    const ada = await asUser(t)
    const storageId = await ada.action(ref.cover, { kind: 'png' })
    const file = await stored(t, storageId)
    expect(file).toContain('trainedAlgorithmicMedia')
    expect(file).not.toContain('caBX')
    expect(warn.mock.calls.flat().join(' ')).toContain('ai.provenance_unsigned')
  })

  test('is refused while provenance is off: ctx.storage.store is the plain way', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    await expect(ada.action(ref.unprovenanced, {})).rejects.toThrow(/setupAi\(\{ provenance: true \}\)/)
  })

  test('a file nothing recorded has no provenance', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    const storageId = await t.run(ctx => ctx.storage.store(new Blob([PNG])))
    expect(await ada.query(ref.provenanceOf, { storageId })).toBeNull()
  })
})

describe('a generated image is its owner\'s file', () => {
  test('a job\'s image is kept as its workspace\'s, and another workspace never reads it', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    const colleague = await asUser(t, { workspace: ada.workspaceId })
    const stranger = await asUser(t)
    const { stripId } = await ada.mutation(ref.create, {})
    await drain(t)
    const [storageId] = (await ada.query(ref.get, { id: stripId }))!.panels

    expect(await record(t, storageId!)).toMatchObject({ userId: ada.userId, workspaceId: ada.workspaceId, holder: ada.workspaceId, status: 'ready', contentType: 'image/png' })
    // Its members read its URL, through the package; anyone else reads nothing.
    expect(await ada.query(ref.getFileUrl, { storageId: storageId! })).toMatch(/^https:/)
    expect(await colleague.query(ref.getFileUrl, { storageId: storageId! })).toMatch(/^https:/)
    expect(await stranger.query(ref.getFileUrl, { storageId: storageId! })).toBeNull()
    expect(await ada.query(ref.fileUrl, { storageId: storageId! })).toMatch(/^https:/)
    // It is not in the app's own storage.
    expect(await t.run(async ctx => ctx.storage.getUrl(storageId as never))).toBeNull()
  })

  test('the quota counts it: an upload past the limit is refused', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    await ada.action(ref.cover, { kind: 'png' })
    await ada.mutation(ref.addPhoto, { photo: PNG.slice().buffer })
    const refused = await ada.mutation(ref.addPhoto, { photo: PNG.slice().buffer }).then(() => null, (error: unknown) => getBackendError(error))
    expect(refused).toMatchObject({ code: 'quota_exceeded', data: { quota: 'files', limit: 2, used: 2, amount: 1 } })
  })

  test('an export lists it, and an erasure of its owner deletes it', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    const storageId = await ada.action(ref.cover, { kind: 'png' })
    const { stripId } = await ada.mutation(ref.create, {})
    await drain(t)
    const [panelId] = (await ada.query(ref.get, { id: stripId }))!.panels

    const exported = await t.query(backend.account!.exportData as unknown as FunctionReference<'query', 'internal'>, { userId: ada.userId }) as { files: Array<{ storageId: string, contentType: string | null, url: string | null }> }
    expect(exported.files.map(file => file.storageId).sort()).toEqual([storageId, panelId].sort())
    expect(exported.files.every(file => file.contentType === 'image/png' && file.url?.startsWith('https:'))).toBe(true)

    await t.mutation(backend.account!.forget as unknown as FunctionReference<'mutation', 'internal'>, { userId: ada.userId })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await record(t, storageId)).toBeNull()
    expect(await record(t, panelId!)).toBeNull()
    expect(await t.action(backend.testing!.read as unknown as FunctionReference<'action', 'internal'>, { id: storageId })).toBeNull()
  })
})

describe('an image a job the app runs for itself stores', () => {
  test('is the app\'s: no account reads it through the package, exports it or erases it', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    const { stripId } = await t.mutation(ref.seed, {})
    await drain(t)
    const [storageId] = (await t.query(ref.get, { id: stripId }))!.panels
    expect(await record(t, storageId!)).toMatchObject({ userId: 'app', holder: 'app', status: 'ready' })
    expect((await record(t, storageId!))!.workspaceId).toBeUndefined()
    // The app's own read shows it wherever its query decided; getFileUrl, nobody.
    expect(await ada.query(ref.fileUrl, { storageId: storageId! })).toMatch(/^https:/)
    expect(await ada.query(ref.getFileUrl, { storageId: storageId! })).toBeNull()
    // No account's export lists it, and no erasure deletes it.
    const exported = await t.query(backend.account!.exportData as unknown as FunctionReference<'query', 'internal'>, { userId: ada.userId }) as { files: Array<{ storageId: string }> }
    expect(exported.files).toEqual([])
    await t.mutation(backend.account!.forget as unknown as FunctionReference<'mutation', 'internal'>, { userId: ada.userId })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await record(t, storageId!)).toMatchObject({ userId: 'app' })
  })

  test('is only a free kind\'s: a kind that charges credits is refused', async () => {
    const t = appUnderTest()
    await expect(t.mutation(ref.seed, { kind: 'paid' })).rejects.toThrow('a job the app pays for (billTo: \'app\') is a `meter: false` kind')
  })
})

describe('a generated image\'s bytes', () => {
  // The model was paid for by the time an image is stored, so its bytes
  // must never meet a mutation's argument limit: the component's action
  // stores them, and only the storage id reaches the owner-record mutation.
  test('go to storage from the component\'s action, and the mutation takes only the id', () => {
    const kind = (fn: unknown) => fn as { isAction?: boolean, isMutation?: boolean, exportArgs: () => string }
    expect(kind(storeGeneratedImage).isAction).toBe(true)
    expect(kind(recordImage).isMutation).toBe(true)
    const args = JSON.parse(kind(recordImage).exportArgs()) as { value: Record<string, { fieldType: { type: string } }> }
    expect(Object.keys(args.value)).not.toContain('bytes')
    expect(args.value.storageId!.fieldType).toMatchObject({ type: 'id' })
    expect(Object.values(args.value).map(field => field.fieldType.type)).not.toContain('bytes')
  })
})

describe('a guest job\'s image', () => {
  test('moves to the account\'s workspace with its job when a sign-up claims it, and its count with it', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    const call = <Kind extends 'query' | 'mutation'>(name: string) => backend.testing![name] as unknown as FunctionReference<Kind, 'internal'>
    const jobId = await t.mutation(call<'mutation'>('guestJob'), { visitor: 'v1', userId: ada.userId }) as string
    const storageId = await t.action(backend.ai!.storeGeneratedImage as unknown as FunctionReference<'action', 'internal'>, {
      bytes: PNG.slice().buffer, contentType: 'image/png', jobId, models: ['test/image'], inputs: [], sourceType: 'trainedAlgorithmicMedia',
    }) as string
    expect(await record(t, storageId)).toMatchObject({ userId: 'guest:v1', holder: 'guest:v1' })
    expect(await t.query(call<'query'>('usage'), { holder: 'guest:v1' })).toBe(1)

    await t.mutation(backend.jobs!.moveClaimed as unknown as FunctionReference<'mutation', 'internal'>, { userId: ada.userId, owner: ada.workspaceId })
    expect(await record(t, storageId)).toMatchObject({ userId: ada.userId, workspaceId: ada.workspaceId, holder: ada.workspaceId })
    expect(await t.query(call<'query'>('usage'), { holder: 'guest:v1' })).toBe(0)
    expect(await t.query(call<'query'>('usage'), { holder: ada.workspaceId! })).toBe(1)
    expect(await ada.query(ref.getFileUrl, { storageId })).toMatch(/^https:/)
  })
})
