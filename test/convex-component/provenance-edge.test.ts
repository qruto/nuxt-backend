/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { actionGeneric, componentsGeneric, defineSchema, type FunctionReference, makeFunctionReference, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import backendTest, { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { backendError } from '../../src/convex/errors'
import { DIGITAL_SOURCE_TYPES, FORMAT_WRITERS } from '../../src/convex/c2pa/formats'
import { readCredentials, type SigningCredentials, writeManifest } from '../../src/convex/c2pa/manifest'
import { setupAi } from '../../src/convex/integrations/ai'
import type { Billing } from '../../src/convex/integrations/billing'
import { setupRateLimiter } from '../../src/convex/integrations/rate-limit'
import { generateProvenanceCredentials } from '../../src/provenance-keys'

// ctx.storeImage at its edges, the way a metered action of the app's calls
// it: the generator a manifest names when setupAi({ provenance: true }) gives
// none, the image a model sent with credentials of its own (kept untouched),
// a key that does not match its certificate and a signature that fails (the
// image is still stored, with the source type), the bytes the AI SDK may hand
// over in any of its shapes, and the inputs and source type it refuses. The
// happy path and the owner rules are in provenance.test.ts.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'>, rateLimiter: never }

/** A 1×1 PNG, as an image model's file would arrive. */
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), char => char.charCodeAt(0))
const GIF = new TextEncoder().encode('GIF89a\x01\x00\x01\x00')

const billing = {
  requireEntity: async (ctx: { auth: { getUserIdentity: () => Promise<Record<string, unknown> | null> } }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw backendError('unauthenticated', {})
    return { userId: identity.activeOrganizationId as string, email: identity.email as string }
  },
  reportCost: async () => {},
  recordEvent: async () => {},
} as unknown as Billing

const rateLimiter = setupRateLimiter(components as never)
// No generator name: the manifest names the app by SITE_URL's host.
const ai = setupAi(components as never, { billing, rateLimiter, provenance: true })

/** What the action is handed to store: the file, in the shape a test names, and the options as they come. */
const store = ai.meteredAction({
  meter: false,
  model: 'test/image',
  args: { shape: v.string(), bytes: v.optional(v.bytes()), inputs: v.optional(v.any()), sourceType: v.optional(v.any()) },
  handler: async (ctx, { shape, bytes, inputs, sourceType }) => {
    const raw = bytes ? new Uint8Array(bytes) : PNG
    const file = shape === 'bytes'
      ? raw
      : shape === 'gif'
        ? new Blob([GIF], { type: 'image/gif' })
        : shape === 'sdk'
          ? { uint8Array: raw }
          : shape
    return await ctx.storeImage(file as never, { ...(inputs !== undefined ? { inputs } : {}), ...(sourceType !== undefined ? { sourceType } : {}) })
  },
})
/** An action that names no model, in an app whose setupAi names none: nothing says what made the image. */
const unattributed = ai.meteredAction({
  meter: false,
  args: {},
  handler: async ctx => ctx.storeImage(PNG),
})
const provenanceOf = queryGeneric({ args: { storageId: v.string() }, handler: async (ctx, { storageId }) => ai.provenanceOf(ctx, storageId) })

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './covers.js': () => Promise.resolve({ store, unattributed, provenanceOf }),
})
type App = ReturnType<typeof testApp>

// Reads of the component's own, for the test: a file's bytes and its owner record.
const testing = {
  read: actionGeneric({ args: { id: v.string() }, handler: async (ctx, { id }) => (await ctx.storage.get(id as never))?.arrayBuffer() ?? null }),
  record: queryGeneric({ args: { id: v.string() }, handler: async (ctx, { id }) => (await ctx.db.query('files').collect()).find(file => file.storageId === id) ?? null }),
}
const backend = (componentsGeneric() as unknown as { backend: Record<string, Record<string, FunctionReference<'query' | 'mutation' | 'action', 'internal'>>> }).backend

function appUnderTest(): App {
  const t = testApp()
  t.registerComponent('backend', backendTest.schema, { ...backendTest.modules, './components/backend/testing.ts': () => Promise.resolve(testing) })
  return t
}

const ref = {
  store: makeFunctionReference<'action', { shape: string, bytes?: ArrayBuffer, inputs?: unknown, sourceType?: unknown }, string>('covers:store'),
  unattributed: makeFunctionReference<'action', Record<string, never>, string>('covers:unattributed'),
  provenanceOf: makeFunctionReference<'query', { storageId: string }, Record<string, unknown> | null>('covers:provenanceOf'),
}

async function storedBytes(t: App, storageId: string): Promise<Uint8Array> {
  return new Uint8Array(await t.action(backend.testing!.read as unknown as FunctionReference<'action', 'internal'>, { id: storageId }) as ArrayBuffer)
}

async function stored(t: App, storageId: string): Promise<string> {
  return String.fromCharCode(...await storedBytes(t, storageId))
}

async function contentTypeOf(t: App, storageId: string): Promise<string | undefined> {
  return (await t.query(backend.testing!.record as unknown as FunctionReference<'query', 'internal'>, { id: storageId }) as { contentType?: string } | null)?.contentType
}

const credentials = generateProvenanceCredentials('Panels')
const other = generateProvenanceCredentials('Someone else')
const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
const warnings = () => warn.mock.calls.flat().map(String).join('\n')
/** A Web Crypto signature made to fail, put back after each test. */
let sign: { mockRestore: () => void } | undefined

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('SITE_URL', 'https://panels.example.com')
  vi.stubEnv('PROVENANCE_PRIVATE_KEY', credentials.privateKey.replace(/\n/g, '\\n'))
  vi.stubEnv('PROVENANCE_CERTIFICATE', credentials.certificate)
  warn.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  sign?.mockRestore()
})

describe('the manifest\'s generator', () => {
  test('is the app\'s host when setupAi({ provenance: true }) names none', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    const file = await stored(t, await ada.action(ref.store, { shape: 'bytes' }))
    expect(file).toContain('caBX')
    expect(file).toContain('panels.example.com')
  })

  test('falls back to the package\'s name without a SITE_URL to read a host from', async () => {
    vi.stubEnv('SITE_URL', '')
    const t = appUnderTest()
    const ada = await asUser(t)
    const file = await stored(t, await ada.action(ref.store, { shape: 'bytes' }))
    expect(file).toContain('caBX')
    expect(file).toContain('nuxt-backend')
    expect(file).not.toContain('panels.example.com')
  })
})

describe('an image that came with content credentials of its own', () => {
  test('is stored byte for byte: a second manifest would break the model\'s hash', async () => {
    // A PNG as a model that signs its own output sends it.
    const theirs = await readCredentials(other.privateKey, other.certificate) as SigningCredentials
    const sourceType = DIGITAL_SOURCE_TYPES.trainedAlgorithmicMedia
    const signed = (await writeManifest(FORMAT_WRITERS['image/png'].addSourceType(PNG, sourceType), 'image/png', { generator: 'The model\'s maker', when: new Date(), sourceType }, theirs)).bytes
    const t = appUnderTest()
    const ada = await asUser(t)
    const storageId = await ada.action(ref.store, { shape: 'sdk', bytes: signed.slice().buffer })
    expect(await storedBytes(t, storageId)).toEqual(signed)
    expect(await contentTypeOf(t, storageId)).toBe('image/png')
    expect(await ada.query(ref.provenanceOf, { storageId })).toMatchObject({ models: ['test/image'] })
    expect(warnings()).toContain('carried content credentials of its own')
  })
})

describe('signing that cannot be done', () => {
  test('a key that is not the certificate\'s stores the image with the source type only, and says the pair does not match', async () => {
    vi.stubEnv('PROVENANCE_CERTIFICATE', other.certificate)
    const t = appUnderTest()
    const ada = await asUser(t)
    const file = await stored(t, await ada.action(ref.store, { shape: 'bytes' }))
    expect(file).toContain('trainedAlgorithmicMedia')
    expect(file).not.toContain('caBX')
    expect(warnings()).toContain('does not match the first certificate')
  })

  test('a signature that fails stores the image with the source type only: the model was paid for', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    // The credentials are read (and probed) once; the next signature fails.
    await ada.action(ref.store, { shape: 'bytes' })
    sign = vi.spyOn(crypto.subtle, 'sign').mockRejectedValue(new Error('The key store is unavailable.'))
    const storageId = await ada.action(ref.store, { shape: 'bytes' })
    const file = await stored(t, storageId)
    expect(file).toContain('trainedAlgorithmicMedia')
    expect(file).not.toContain('caBX')
    expect(warnings()).toContain('could not be signed')
    expect(await ada.query(ref.provenanceOf, { storageId })).toMatchObject({ models: ['test/image'] })
  })
})

describe('the file ctx.storeImage takes', () => {
  test('may be bytes alone: the type is read from them, never declared', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    const storageId = await ada.action(ref.store, { shape: 'bytes' })
    expect(await contentTypeOf(t, storageId)).toBe('image/png')
    // Bytes of no type it knows, with nothing declared: kept as they came, as an unknown type.
    const unknown = await ada.action(ref.store, { shape: 'sdk', bytes: Uint8Array.of(1, 2, 3, 4).buffer })
    expect([...await storedBytes(t, unknown)]).toEqual([1, 2, 3, 4])
    expect(await contentTypeOf(t, unknown)).toBe('application/octet-stream')
  })

  test('says once, not for every image, that a format took no credentials', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    await ada.action(ref.store, { shape: 'gif' })
    await ada.action(ref.store, { shape: 'gif' })
    expect(warn.mock.calls.flat().filter(line => String(line).includes('A generated image/gif was stored without content credentials'))).toHaveLength(1)
  })

  test('is refused when it is none of the shapes the AI SDK hands over', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    await expect(ada.action(ref.store, { shape: 'a data URL, say' })).rejects.toThrow(/takes the file the AI SDK returned, a Blob, or its bytes/)
  })
})

describe('what ctx.storeImage records', () => {
  test('refuses inputs that are not a short list of ids, and a source type it does not write', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    const refused = /`inputs` is a list of up to 50 ids/
    await expect(ada.action(ref.store, { shape: 'bytes', inputs: 'strip_1' })).rejects.toThrow(refused)
    await expect(ada.action(ref.store, { shape: 'bytes', inputs: [''] })).rejects.toThrow(refused)
    await expect(ada.action(ref.store, { shape: 'bytes', inputs: ['x'.repeat(201)] })).rejects.toThrow(refused)
    await expect(ada.action(ref.store, { shape: 'bytes', inputs: Array.from({ length: 51 }, (_, i) => `strip_${i}`) })).rejects.toThrow(refused)
    await expect(ada.action(ref.store, { shape: 'bytes', sourceType: 'photo' })).rejects.toThrow(/`sourceType` is 'generated' or 'composite'/)
    // Up to the limit is fine.
    const storageId = await ada.action(ref.store, { shape: 'bytes', inputs: Array.from({ length: 50 }, (_, i) => `strip_${i}`), sourceType: 'generated' })
    expect((await ada.query(ref.provenanceOf, { storageId }))!.inputs).toHaveLength(50)
  })

  test('names no model for a run that called none and names none', async () => {
    const t = appUnderTest()
    const ada = await asUser(t)
    const storageId = await ada.action(ref.unattributed, {})
    expect(await ada.query(ref.provenanceOf, { storageId })).toEqual({ models: [], finishedAt: expect.any(Number), inputs: [] })
    expect(await stored(t, storageId)).toContain('caBX')
  })
})
