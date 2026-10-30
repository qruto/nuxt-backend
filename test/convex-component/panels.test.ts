/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { actionGeneric, componentsGeneric, queryGeneric, type FunctionReference, makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'
import type { TestConvex } from 'convex-test'
import { syncBillingCatalog } from '../../src/cli/billing/sync'
import { getBackendError } from '../../src/convex/errors'
import backendTest, { asUser, defineBackendTestApp } from '../../src/convex/test'
import { TEST_IMAGE_PNG } from '../../src/convex/test-models'
import { createPolarFake, type PolarFake, routeToFake } from '../fixtures/polar-fake/server'
import { signingSecret } from '../helpers/secrets'
import catalogDefinition from '../../templates/panels/backend/billing.catalog'
import schema from '../../templates/panels/backend/schema'

// templates/panels/backend, the tutorial's app, run as the app runs: its own
// strips, storage, jobs and email modules over the scaffold beside them, on
// convex-test (test/helpers/scaffold-backend.ts resolves the imports, so
// there is no codegen and no deployment). The billing provider is the fake
// one, with Panels' own catalog synced to it, and every model answers with
// nuxt-backend/test's mock, which draws a PNG for an image model's id. Each
// test holds one promise of the tutorial: strips stay in their workspace, a
// strip waits for credits, a cancel gives the hold back, and a drawn strip
// ends ready, in the inbox, with its email queued. The public demo (a
// sandbox deployment) holds its own: canned ideas copied for free, an idea
// of one's own behind a passkey, no share links, a nightly reset, and the
// day's spend limit that pauses AI.

const PANELS = '../../templates/panels/backend/'
const SITE = 'http://localhost:3000'
const FAKE = 'http://127.0.0.1:4747'
const ENDPOINT = 'https://panels.convex.site/billing/events'
const SECRET = signingSecret()

// What `billing sync` writes, filled from the fake provider's sync before the
// first function call loads billing.ts: the ids are stable on every machine.
const generated = vi.hoisted(() => ({ catalog: {} as Record<string, unknown> }))
vi.mock('../../templates/panels/backend/billing.generated', () => generated)

// The AI SDK as the template calls it, with a way for one test to answer a
// prompt itself: every other call goes to nuxt-backend/test's mock.
const answers = vi.hoisted(() => ({ captions: null as string | null }))
vi.mock('ai', async (importOriginal) => {
  const original = await importOriginal<typeof import('ai')>()
  return {
    ...original,
    generateText: (async (options: Parameters<typeof original.generateText>[0]) => {
      if (answers.captions !== null && typeof options.prompt === 'string' && options.prompt.includes('short captions')) {
        return { ...(await original.generateText(options)), text: answers.captions }
      }
      return original.generateText(options)
    }) as typeof original.generateText,
  }
})

vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_fake')
vi.stubEnv('BILLING_WEBHOOK_SECRET', SECRET)
vi.stubEnv('EMAIL_API_KEY', 're_test_key')
vi.stubEnv('SITE_URL', SITE)
vi.stubEnv('AUTH_SECRET', 'panels-suite-secret-0123456789abcdefghijklmnop')

const modules = import.meta.glob(['../../templates/panels/backend/*.ts', '!**/convex.config.ts', '!**/auth.config.ts', '!**/*.test.ts'])
const testApp = defineBackendTestApp(schema, {
  ...modules,
  // convex-test finds the functions' root by its `_generated` directory.
  [`${PANELS}_generated/api.js`]: () => Promise.resolve({}),
})

const fn = <Kind extends 'query' | 'mutation' | 'action'>(path: string) => makeFunctionReference<Kind>(path) as FunctionReference<Kind, 'public'>

type App = TestConvex<typeof schema>
type Caller = Awaited<ReturnType<typeof asUser>>
type Strip = { _id: string, status: string, jobId?: string, photoId?: string, cost: number | null, panels: Array<{ imageId: string, caption: string, url: string | null }> }

let t: App
let fake: PolarFake
/** What reached the email provider's API: each message's body. */
let mail: Array<{ to?: string | string[], subject?: string }>

/** The email provider's API, answered here: every message is taken and recorded. */
async function emailProvider(request: Request): Promise<Response> {
  if (new URL(request.url).host !== 'api.resend.com') return Response.json({ error: 'not reachable from the suite' }, { status: 503 })
  const body = request.method === 'POST' ? await request.json() as unknown : null
  const messages = (Array.isArray(body) ? body : [body]).filter(Boolean) as typeof mail
  mail.push(...messages)
  const ids = messages.map((_, index) => ({ id: `re_${mail.length - messages.length + index}` }))
  return Response.json(Array.isArray(body) ? { data: ids } : ids[0] ?? {})
}
let ids: Awaited<ReturnType<typeof syncBillingCatalog>>['ids']

beforeAll(() => {
  // Only the timers: scheduled work runs when a test drains it, and the fake
  // provider's own deliveries still go out on setImmediate.
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] })
  for (const level of ['log', 'info', 'warn'] as const) vi.spyOn(console, level).mockImplementation(() => {})
})

afterAll(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

beforeEach(async () => {
  t = testApp()
  const app = t
  fake = createPolarFake({
    baseUrl: FAKE,
    fetcher: (url, init) => {
      const deliver = () => app.fetch(new URL(url).pathname, { method: 'POST', headers: init.headers, body: init.body as string })
      if (!held) return deliver()
      held.push(deliver)
      return Promise.resolve(Response.json({}))
    },
  })
  mail = []
  vi.stubGlobal('fetch', routeToFake(fake, FAKE, emailProvider))
  fake.ensureEndpoint(ENDPOINT, SECRET)
  ids = (await syncBillingCatalog(catalogDefinition, { rootDir: '.', environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun: false, adopt: {} })).ids
  generated.catalog.sandbox = ids
  await fake.idle()
})

afterEach(async () => {
  answers.captions = null
  // A test that stopped with the clock held hands setImmediate back first.
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] })
  held = null
  await fake.idle()
  fake.close()
  vi.unstubAllGlobals()
})

/** The provider's webhooks held back while scheduled functions run: convex-test runs one transaction at a time. */
let held: Array<() => Promise<Response>> | null = null

/**
 * Fake every timer from here on, and hold the provider's webhooks: the
 * scheduled work a strip starts then runs only when {@link drain} runs it,
 * one function after another.
 */
function holdTheClock() {
  held = []
  vi.useFakeTimers()
}

/**
 * Run every scheduled function to its end (the queue's pick, the workflow's
 * steps), then hand setImmediate back and deliver the provider's webhooks,
 * whose sends go out on it.
 */
async function drain() {
  held ??= []
  try {
    await t.finishAllScheduledFunctions(vi.runAllTimers, 500)
  }
  finally {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] })
    const deliveries = held
    held = null
    for (const deliver of deliveries) await deliver()
    await fake.idle()
  }
}

/** The caller's credit balance, as useCredits reads it. */
async function balance(caller: Caller): Promise<number | undefined> {
  return (await caller.query(fn<'query'>('billing:getCredits'), {}) as { meters: Array<{ balance: number }> } | null)?.meters[0]?.balance
}

/** A signed-in person whose workspace bought the 100-credit pack on the provider's checkout. */
async function withCredits(email: string, options: Parameters<typeof asUser>[1] = {}): Promise<Caller> {
  const caller = await asUser(t, { ...options, email })
  const { url } = await caller.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [ids.products.credits100!], origin: SITE, successUrl: `${SITE}/strips` })
  await fake.handle(new Request(`${url}/pay`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'origin': FAKE } }))
  await fake.idle()
  return caller
}

const refusal = async (call: Promise<unknown>) => getBackendError(await call.then(() => null, (error: unknown) => error))
const strip = (caller: Caller, id: string) => caller.query(fn<'query'>('strips:get'), { id }) as Promise<Strip | null>

/** The package's component, as the suite reaches into it. */
const backend = () => (componentsGeneric() as unknown as { backend: {
  testing: { upload: FunctionReference<'action', 'internal'>, exists: FunctionReference<'query', 'internal'>, events: FunctionReference<'query', 'internal'> }
  costs: { record: FunctionReference<'mutation', 'internal'>, summary: FunctionReference<'query', 'internal'> }
  ai: { storeGeneratedImage: FunctionReference<'action', 'internal'> }
  storage: { url: FunctionReference<'query', 'internal'>, served: FunctionReference<'query', 'internal'> }
  account: { exportData: FunctionReference<'query', 'internal'> }
} }).backend

/**
 * A generated image as ctx.storeImage keeps it, in the package's storage:
 * `owner`'s (a workspace), or the app's without one, as a job the app runs
 * for itself stores it.
 */
async function storeImage(owner?: string): Promise<string> {
  return await t.action(backend().ai.storeGeneratedImage, {
    bytes: TEST_IMAGE_PNG.slice().buffer,
    contentType: 'image/png',
    ...(owner === undefined ? {} : { owner }),
    models: ['test/image'],
    inputs: [],
    sourceType: 'trainedAlgorithmicMedia',
  }) as string
}

/** Whether a file is still in the package's storage, as the app's own read finds it. */
const stored = async (id: string) => (await t.query(backend().storage.url, { storageId: id })) !== null

/** The package's component with a module of the suite's own: it starts the component afresh, so call it before any other write. */
function registerTesting() {
  t.registerComponent('backend', backendTest.schema, {
    ...backendTest.modules,
    './components/backend/testing.ts': () => Promise.resolve({
      upload: actionGeneric({ args: { bytes: v.bytes() }, handler: async (ctx, { bytes }) => ctx.storage.store(new Blob([bytes], { type: 'image/png' })) }),
      exists: queryGeneric({ args: { id: v.string() }, handler: async (ctx, { id }) => (await ctx.db.system.get(id as never)) !== null }),
      events: queryGeneric({ args: {}, handler: async ctx => await ctx.db.query('auditEvents').collect() }),
    }),
  })
}

/** An upload straight into the package's storage, unclaimed: what an upload URL does. Call it before any other write. */
async function upload(bytes: Uint8Array): Promise<string> {
  registerTesting()
  return await t.action(backend().testing.upload, { bytes: bytes.slice().buffer }) as string
}

describe('templates/panels/backend', () => {
  test('a strip belongs to the workspace it was made in', async () => {
    const ada = await asUser(t)
    const grace = await asUser(t)
    const id = await ada.mutation(fn<'mutation'>('strips:create'), { idea: 'A cat learns to surf' }) as string
    expect(await strip(ada, id)).toMatchObject({ idea: 'A cat learns to surf', status: 'draft' })
    expect(await strip(grace, id)).toBeNull()
    expect(await grace.query(fn<'query'>('strips:list'), {})).toEqual([])
    // Nor can another workspace start it.
    expect(await refusal(grace.mutation(fn<'mutation'>('strips:generate'), { id }))).toMatchObject({ code: 'forbidden' })
  })

  test('an idea of the wrong length is refused on its field', async () => {
    const ada = await asUser(t)
    expect(await refusal(ada.mutation(fn<'mutation'>('strips:create'), { idea: 'no' }))).toMatchObject({ code: 'invalid_input', data: { field: 'idea' } })
  })

  test('generate is refused without credits, and the strip stays a draft', async () => {
    // A new workspace's balance has not reached the deployment yet.
    const grace = await asUser(t)
    const first = await grace.mutation(fn<'mutation'>('strips:create'), { idea: 'A cat learns to surf' }) as string
    expect(await refusal(grace.mutation(fn<'mutation'>('strips:generate'), { id: first }))).toMatchObject({ code: 'not_ready', data: { reason: 'not_synced' } })
    expect(await strip(grace, first)).toMatchObject({ status: 'draft' })

    // 100 credits hold three strips of 30; the fourth waits for more.
    const ada = await withCredits('delivered+credits@resend.dev')
    for (const idea of ['One', 'Two', 'Three']) {
      const id = await ada.mutation(fn<'mutation'>('strips:create'), { idea: `${idea} cat` }) as string
      await ada.mutation(fn<'mutation'>('strips:generate'), { id })
    }
    const fourth = await ada.mutation(fn<'mutation'>('strips:create'), { idea: 'Four cats' }) as string
    expect(await refusal(ada.mutation(fn<'mutation'>('strips:generate'), { id: fourth }))).toMatchObject({ code: 'insufficient_credits', data: { need: 30 } })
    expect(await strip(ada, fourth)).toMatchObject({ status: 'draft' })
    expect((await strip(ada, fourth))?.jobId).toBeUndefined()
  })

  test('a canceled strip gives its hold back: the balance is whole again', async () => {
    const ada = await withCredits('delivered+cancel@resend.dev')
    const before = await balance(ada)
    expect(before).toBeGreaterThanOrEqual(100)
    holdTheClock()
    const id = await ada.mutation(fn<'mutation'>('strips:create'), { idea: 'A cat learns to surf' }) as string
    await ada.mutation(fn<'mutation'>('strips:generate'), { id })
    const { jobId } = (await strip(ada, id))!
    expect(jobId).toBeTruthy()
    // Held while it waits in line.
    expect(await balance(ada)).toBe(before! - 30)
    // Nothing to try again while it waits.
    expect(await refusal(ada.mutation(fn<'mutation'>('strips:retry'), { id }))).toMatchObject({ code: 'invalid_input', data: { reason: 'not_stopped' } })
    await ada.mutation(fn<'mutation'>('jobs:cancelJob'), { jobId })
    await drain()
    expect(await ada.query(fn<'query'>('jobs:getJob'), { jobId })).toMatchObject({ status: 'canceled' })
    expect(await balance(ada)).toBe(before)
    // The canceled strip is a draft again, to be drawn once more.
    expect(await strip(ada, id)).toMatchObject({ status: 'queued' })
    await ada.mutation(fn<'mutation'>('strips:retry'), { id })
    expect(await strip(ada, id)).toMatchObject({ status: 'draft', panels: [], cost: 30 })
    expect((await strip(ada, id))?.jobId).toBeUndefined()
  })

  test('a job that fails leaves no strip stranded: refunded, and drawn again after a retry', async () => {
    const ada = await withCredits('delivered+failed@resend.dev')
    const before = await balance(ada)
    // The model writes no caption: no panel to draw.
    answers.captions = '\n  \n'
    holdTheClock()
    const id = await ada.mutation(fn<'mutation'>('strips:create'), { idea: 'A cat learns to surf' }) as string
    await ada.mutation(fn<'mutation'>('strips:generate'), { id })
    await drain()
    const { jobId } = (await strip(ada, id))!
    expect(await ada.query(fn<'query'>('jobs:getJob'), { jobId })).toMatchObject({ status: 'failed' })
    expect(await strip(ada, id)).toMatchObject({ status: 'queued', panels: [] })
    expect(await balance(ada)).toBe(before)

    answers.captions = null
    await ada.mutation(fn<'mutation'>('strips:retry'), { id })
    expect(await strip(ada, id)).toMatchObject({ status: 'draft' })
    holdTheClock()
    await ada.mutation(fn<'mutation'>('strips:generate'), { id })
    await drain()
    expect(await strip(ada, id)).toMatchObject({ status: 'ready', panels: [expect.anything()] })
    expect(await balance(ada)).toBe(before! - 30)
  })

  test('a panel saved twice is one panel, and one announcement', async () => {
    const ada = await asUser(t, { email: 'delivered+twice@resend.dev' })
    const id = await ada.mutation(fn<'mutation'>('strips:create'), { idea: 'A cat learns to surf' }) as string
    // Queued for a job, as generate leaves it.
    await t.run(async ctx => ctx.db.patch(id as never, { status: 'queued', jobId: 'job_1' } as never))
    const first = await storeImage(ada.workspaceId)
    const second = await storeImage(ada.workspaceId)
    holdTheClock()
    const save = (imageId: string) => t.mutation(internalFn<'mutation'>('strips:savePanel'), { stripId: id, jobId: 'job_1', imageId, caption: 'Surf', index: 0, last: true })
    await save(first)
    // The step ran again after a restart.
    await save(second)
    // A job the strip let go of draws nothing onto it either.
    const stale = await storeImage(ada.workspaceId)
    await t.mutation(internalFn<'mutation'>('strips:savePanel'), { stripId: id, jobId: 'job_0', imageId: stale, caption: 'Old', index: 0, last: true })
    await drain()
    expect(await strip(ada, id)).toMatchObject({ status: 'ready', panels: [{ imageId: first }] })
    expect(await stored(second)).toBe(false)
    expect(await stored(stale)).toBe(false)
    const inbox = await ada.query(fn<'query'>('notifications:listNotifications'), { paginationOpts: { numItems: 10, cursor: null } }) as { page: Array<{ type: string }> }
    expect(inbox.page.filter(item => item.type === 'app.strip_ready')).toHaveLength(1)
    expect(mail.filter(message => message.subject === 'Your strip is ready')).toHaveLength(1)
  })

  test('a cache panel saved twice is one panel', async () => {
    await t.run(async ctx => ctx.db.insert('cannedStrips', { ideaId: 'surfing-cat', jobId: 'seed_1', panels: [], ready: false }))
    const first = await storeImage()
    const second = await storeImage()
    const save = (imageId: string, index: number, last: boolean) => t.mutation(internalFn<'mutation'>('demo:cachePanel'), { ideaId: 'surfing-cat', jobId: 'seed_1', imageId, caption: 'Surf', index, last })
    await save(first, 0, false)
    // The step ran again after a restart.
    await save(second, 0, false)
    const [row] = await t.run(async ctx => ctx.db.query('cannedStrips').collect())
    expect(row).toMatchObject({ panels: [{ imageId: first }], ready: false })
    expect(await stored(second)).toBe(false)
  })

  test('the ready email follows the author\'s channels', async () => {
    const ada = await withCredits('delivered+channels@resend.dev')
    // The kind offers each channel, and the author turns email off.
    const kinds = await ada.query(fn<'query'>('notifications:getNotificationChannels'), {}) as Array<{ type: string, channels: Array<{ channel: string }> }>
    expect(kinds.find(kind => kind.type === 'app.strip_ready')?.channels.map(choice => choice.channel)).toEqual(['app', 'email', 'push'])
    await ada.mutation(fn<'mutation'>('notifications:setNotificationChannel'), { type: 'app.strip_ready', channel: 'email', enabled: false })
    holdTheClock()
    const id = await ada.mutation(fn<'mutation'>('strips:create'), { idea: 'A cat learns to surf' }) as string
    await ada.mutation(fn<'mutation'>('strips:generate'), { id })
    await drain()
    expect(await strip(ada, id)).toMatchObject({ status: 'ready' })
    const inbox = await ada.query(fn<'query'>('notifications:listNotifications'), { paginationOpts: { numItems: 10, cursor: null } }) as { page: Array<{ type: string }> }
    expect(inbox.page).toContainEqual(expect.objectContaining({ type: 'app.strip_ready' }))
    expect(mail.filter(message => message.subject === 'Your strip is ready')).toEqual([])
  })

  test('an account\'s strips are in its export, and its erasure deletes them', async () => {
    const photoId = await upload(TEST_IMAGE_PNG)
    const ada = await asUser(t, { email: 'delivered+erase@resend.dev' })
    const grace = await asUser(t)
    const id = await ada.mutation(fn<'mutation'>('strips:create'), { idea: 'A cat learns to surf' }) as string
    const kept = await grace.mutation(fn<'mutation'>('strips:create'), { idea: 'A dog learns to ski' }) as string
    holdTheClock()
    await ada.action(fn<'action'>('strips:attachPhoto'), { id, photoId })
    await drain()
    expect(await t.query(internalFn<'query'>('strips:exportFor'), { userId: ada.userId })).toEqual([
      expect.objectContaining({ id, idea: 'A cat learns to surf', status: 'draft', photoId, panels: [] }),
    ])
    holdTheClock()
    await t.mutation(internalFn<'mutation'>('strips:forgetFor'), { userId: ada.userId, email: 'delivered+erase@resend.dev' })
    await drain()
    expect(await t.run(async ctx => ctx.db.get(id as never))).toBeNull()
    expect(await t.query(backend().testing.exists, { id: photoId })).toBe(false)
    // Another author's strip stays, and an address alone has none.
    expect(await strip(grace, kept)).toMatchObject({ idea: 'A dog learns to ski' })
    expect(await t.mutation(internalFn<'mutation'>('strips:forgetFor'), { email: 'nobody@example.com' })).toEqual({ done: true })
  })

  test('a canned idea off the demo is a suggestion, drawn like any other', async () => {
    await seedCache()
    const ada = await withCredits('delivered+suggestion@resend.dev')
    const before = await balance(ada)
    const id = await ada.mutation(fn<'mutation'>('strips:create'), { ideaId: 'surfing-cat' }) as string
    expect(await strip(ada, id)).toMatchObject({ cost: 30 })
    holdTheClock()
    await ada.mutation(fn<'mutation'>('strips:generate'), { id })
    const queued = (await strip(ada, id))!
    expect(queued.jobId).toBeTruthy()
    expect(await balance(ada)).toBe(before! - 30)
    await drain()
    const ready = (await strip(ada, id))!
    expect(ready).toMatchObject({ status: 'ready' })
    expect((ready as Strip & { cached?: boolean }).cached).toBeUndefined()
  })

  test('a hidden strip is neither drawn nor given a photo', async () => {
    const photoId = await upload(TEST_IMAGE_PNG)
    const ada = await withCredits('delivered+hidden@resend.dev')
    const id = await ada.mutation(fn<'mutation'>('strips:create'), { idea: 'A cat learns to surf' }) as string
    await t.run(async ctx => ctx.db.patch(id as never, { hidden: true } as never))
    expect(await refusal(ada.mutation(fn<'mutation'>('strips:generate'), { id }))).toMatchObject({ code: 'forbidden', data: { reason: 'hidden' } })
    holdTheClock()
    expect(await refusal(ada.action(fn<'action'>('strips:attachPhoto'), { id, photoId }))).toMatchObject({ code: 'forbidden', data: { reason: 'hidden' } })
    await drain()
    expect(await t.run(async ctx => ctx.db.get(id as never))).toMatchObject({ status: 'draft' })
    expect((await t.run(async ctx => ctx.db.get(id as never)) as { photoId?: string }).photoId).toBeUndefined()
  })

  test('a photo is kept once moderation passed, and its owner\'s workspace sees it', async () => {
    // Registering the test-only module starts the component afresh: upload before anyone signs in.
    const photoId = await upload(TEST_IMAGE_PNG)
    const ada = await asUser(t)
    const grace = await asUser(t)
    const id = await ada.mutation(fn<'mutation'>('strips:create'), { idea: 'A cat learns to surf' }) as string
    holdTheClock()
    // Another workspace cannot put its photo on this strip.
    expect(await refusal(grace.action(fn<'action'>('strips:attachPhoto'), { id, photoId }))).toMatchObject({ code: 'forbidden' })
    await ada.action(fn<'action'>('strips:attachPhoto'), { id, photoId })
    await drain()
    expect(await strip(ada, id)).toMatchObject({ photoId })
    expect(await ada.query(fn<'query'>('storage:getFileUrl'), { storageId: photoId })).toEqual(expect.any(String))
    expect(await grace.query(fn<'query'>('storage:getFileUrl'), { storageId: photoId })).toBeNull()
  })

  test('a drawn strip ends ready: its panels stored, the author notified, the email queued', async () => {
    const ada = await withCredits('delivered+ready@resend.dev')
    const before = await balance(ada)
    holdTheClock()
    const id = await ada.mutation(fn<'mutation'>('strips:create'), { idea: 'A cat learns to surf' }) as string
    await ada.mutation(fn<'mutation'>('strips:generate'), { id })
    await drain()

    const ready = (await strip(ada, id))!
    expect(ready.status).toBe('ready')
    // The mock writes one caption line, and draws a PNG for the image model.
    expect(ready.panels).toHaveLength(1)
    expect(ready.panels[0]!.caption).toContain('A cat learns to surf')
    expect(await ada.query(fn<'query'>('jobs:getJob'), { jobId: ready.jobId })).toMatchObject({ status: 'done' })
    // Charged when it started.
    expect(await balance(ada)).toBe(before! - 30)
    // The panel is a stored image, the workspace's file in the package's
    // storage, with its URL for the members of the workspace.
    expect(ready.panels[0]!.url).toEqual(expect.any(String))
    expect(await t.query(backend().storage.served, { storageId: ready.panels[0]!.imageId })).toMatchObject({ contentType: 'image/png' })
    expect(await ada.query(fn<'query'>('storage:getFileUrl'), { storageId: ready.panels[0]!.imageId })).toEqual(expect.any(String))
    expect(await t.run(async ctx => ctx.storage.getUrl(ready.panels[0]!.imageId as never))).toBeNull()

    // The strip_ready event reached the inbox, linking to the strip.
    const inbox = await ada.query(fn<'query'>('notifications:listNotifications'), { paginationOpts: { numItems: 10, cursor: null } }) as { page: Array<{ type: string, link?: string }> }
    expect(inbox.page).toContainEqual(expect.objectContaining({ type: 'app.strip_ready', link: `/strips/${id}` }))

    // The ready email went to the author.
    expect(mail).toContainEqual(expect.objectContaining({ subject: 'Your strip is ready' }))
    expect(JSON.stringify(mail.find(message => message.subject === 'Your strip is ready')?.to)).toContain('delivered+ready@resend.dev')

    // A shared link reads the finished strip for anyone; an unknown token reads nothing.
    const { url: link } = await ada.mutation(fn<'mutation'>('storage:enableShareLink'), { table: 'strips', id }) as { url: string }
    const token = link.split('/').pop()!
    expect(await t.query(fn<'query'>('strips:shared'), { token })).toMatchObject({ idea: 'A cat learns to surf', panels: [{ url: expect.any(String) }] })
    expect(await t.query(fn<'query'>('strips:shared'), { token: 'not-a-token' })).toBeNull()
  })
})

const internalFn = <Kind extends 'query' | 'mutation'>(path: string) => makeFunctionReference<Kind>(path) as unknown as FunctionReference<Kind, 'internal'>

/** The demo's cache, as the seed job leaves it: one drawn panel for the canned idea, the app's own file. */
async function seedCache(ideaId = 'surfing-cat'): Promise<string> {
  const imageId = await storeImage()
  await t.run(async ctx => ctx.db.insert('cannedStrips', { ideaId, panels: [{ imageId, caption: 'A cat on a board' }], ready: true }))
  return imageId
}

describe('templates/panels/backend as the public demo', () => {
  beforeEach(() => {
    vi.stubEnv('BACKEND_ENVIRONMENT', 'sandbox')
  })
  afterEach(() => {
    vi.stubEnv('BACKEND_ENVIRONMENT', '')
  })

  test('says what the pages fit: the demo, sharing off, own ideas behind a passkey', async () => {
    await seedCache()
    expect(await t.query(fn<'query'>('demo:status'), {})).toMatchObject({
      demo: true,
      sharing: false,
      ownIdeaNeedsPasskey: true,
      ideas: expect.arrayContaining([{ id: 'surfing-cat', idea: 'A cat learns to surf', ready: true }, expect.objectContaining({ ready: false })]),
    })
    vi.stubEnv('BACKEND_ENVIRONMENT', '')
    expect(await t.query(fn<'query'>('demo:status'), {})).toMatchObject({ demo: false, sharing: true, ownIdeaNeedsPasskey: false })
  })

  test('copies a canned idea the demo drew: ready at once, no job, no model call, no credits', async () => {
    const imageId = await seedCache()
    // A new workspace, without a credit to its name.
    const ada = await asUser(t, { email: 'delivered+canned@resend.dev' })
    const id = await ada.mutation(fn<'mutation'>('strips:create'), { ideaId: 'surfing-cat' }) as string
    // Its button says what it costs: nothing.
    expect(await strip(ada, id)).toMatchObject({ cost: 0 })
    await ada.mutation(fn<'mutation'>('strips:generate'), { id })
    const ready = (await strip(ada, id))!
    expect(ready).toMatchObject({ idea: 'A cat learns to surf', status: 'ready', cached: true, panels: [{ imageId, caption: 'A cat on a board', url: expect.any(String) }] })
    expect(ready.jobId).toBeUndefined()
    // The panel is the app's file: the strip's query reads it for the
    // workspace, the package's own read gives it to nobody.
    expect(await ada.query(fn<'query'>('storage:getFileUrl'), { storageId: imageId })).toBeNull()
    // Nothing reached a model: the day's AI costs are empty.
    expect(await t.query(backend().costs.summary, { since: 0 })).toMatchObject({ usd: 0, runs: 0 })
    // The author still hears it is ready.
    const inbox = await ada.query(fn<'query'>('notifications:listNotifications'), { paginationOpts: { numItems: 10, cursor: null } }) as { page: Array<{ type: string }> }
    expect(inbox.page).toContainEqual(expect.objectContaining({ type: 'app.strip_ready' }))
    // An id that names no canned idea is refused on its field.
    expect(await refusal(ada.mutation(fn<'mutation'>('strips:create'), { ideaId: 'nope' }))).toMatchObject({ code: 'invalid_input', data: { field: 'ideaId' } })
  })

  test('refuses to draw a canned idea the cache does not hold yet: no job, no model call', async () => {
    const ada = await withCredits('delivered+unready@resend.dev')
    const before = await balance(ada)
    const id = await ada.mutation(fn<'mutation'>('strips:create'), { ideaId: 'moon-bus' }) as string
    // No button: the strip says so.
    expect(await strip(ada, id)).toMatchObject({ cost: null })
    holdTheClock()
    expect(await refusal(ada.mutation(fn<'mutation'>('strips:generate'), { id }))).toMatchObject({ code: 'not_ready', data: { reason: 'idea_not_drawn' } })
    await drain()
    expect(await strip(ada, id)).toMatchObject({ status: 'draft' })
    expect((await strip(ada, id))?.jobId).toBeUndefined()
    expect(await balance(ada)).toBe(before)
    expect(await t.query(backend().costs.summary, { since: 0 })).toMatchObject({ usd: 0, runs: 0 })
  })

  test('refuses an idea of one\'s own without a passkey session, and takes it with one', async () => {
    const coded = await asUser(t, { signInMethod: 'email-otp' })
    expect(await refusal(coded.mutation(fn<'mutation'>('strips:create'), { idea: 'A cat learns to surf' }))).toMatchObject({ code: 'forbidden', data: { reason: 'passkey_required' } })
    // A canned idea needs no passkey.
    expect(await coded.mutation(fn<'mutation'>('strips:create'), { ideaId: 'moon-bus' })).toEqual(expect.any(String))

    const passkey = await asUser(t, { signInMethod: 'passkey' })
    const id = await passkey.mutation(fn<'mutation'>('strips:create'), { idea: 'A cat learns to surf' }) as string
    expect(await strip(passkey, id)).toMatchObject({ idea: 'A cat learns to surf', status: 'draft' })
  })

  test('shares nothing: turning a link on is refused', async () => {
    await seedCache()
    const ada = await asUser(t, { email: 'delivered+share@resend.dev' })
    const id = await ada.mutation(fn<'mutation'>('strips:create'), { ideaId: 'surfing-cat' }) as string
    await ada.mutation(fn<'mutation'>('strips:generate'), { id })
    expect(await strip(ada, id)).toMatchObject({ status: 'ready' })
    expect(await refusal(ada.mutation(fn<'mutation'>('storage:enableShareLink'), { table: 'strips', id }))).toMatchObject({ code: 'forbidden', data: { reason: 'cannot_share' } })
    // Off the demo, the same strip shares.
    vi.stubEnv('BACKEND_ENVIRONMENT', '')
    expect(await ada.mutation(fn<'mutation'>('storage:enableShareLink'), { table: 'strips', id })).toMatchObject({ url: expect.stringContaining(`${SITE}/s/`) })
  })

  test('the nightly reset deletes strips older than a day with their files, and keeps the cache', async () => {
    const photoId = await upload(TEST_IMAGE_PNG)
    const cacheImage = await seedCache()
    const ada = await asUser(t, { email: 'delivered+reset@resend.dev', signInMethod: 'passkey' })
    const canned = await ada.mutation(fn<'mutation'>('strips:create'), { ideaId: 'surfing-cat' }) as string
    await ada.mutation(fn<'mutation'>('strips:generate'), { id: canned })
    const own = await ada.mutation(fn<'mutation'>('strips:create'), { idea: 'A cat learns to surf' }) as string
    holdTheClock()
    await ada.action(fn<'action'>('strips:attachPhoto'), { id: own, photoId })
    await drain()
    // A panel of its own, the workspace's, as the job saves one.
    const ownImage = await storeImage(ada.workspaceId)
    await t.run(async ctx => ctx.db.patch(own as never, { status: 'queued', jobId: 'job_own' } as never))
    await t.mutation(internalFn<'mutation'>('strips:savePanel'), { stripId: own, jobId: 'job_own', imageId: ownImage, caption: 'Surf', index: 0, last: true })
    const photoUrl = () => ada.query(fn<'query'>('storage:getFileUrl'), { storageId: photoId })
    expect(await photoUrl()).toEqual(expect.any(String))
    const readyNotifications = async () => (await ada.query(fn<'query'>('notifications:listNotifications'), { paginationOpts: { numItems: 10, cursor: null } }) as { page: Array<{ type: string }> }).page.filter(item => item.type === 'app.strip_ready')
    expect(await readyNotifications()).toHaveLength(2)

    // Off the demo the reset does nothing.
    vi.stubEnv('BACKEND_ENVIRONMENT', '')
    expect(await t.mutation(internalFn<'mutation'>('demo:reset'), { now: Date.now() + 25 * 3600_000 })).toBe(false)
    vi.stubEnv('BACKEND_ENVIRONMENT', 'sandbox')
    // Within the day, the strips stay.
    holdTheClock()
    expect(await t.mutation(internalFn<'mutation'>('demo:reset'), { now: Date.now() + 3600_000 })).toBe(true)
    await drain()
    expect(await ada.query(fn<'query'>('strips:list'), {})).toHaveLength(2)

    holdTheClock()
    await t.mutation(internalFn<'mutation'>('demo:reset'), { now: Date.now() + 25 * 3600_000 })
    await drain()
    expect(await ada.query(fn<'query'>('strips:list'), {})).toEqual([])
    // The photo went with its owner record, the strip's own panel too, and
    // the notifications that linked to the strips; the canned panels are
    // the app's and stay, and so does the cache.
    expect(await photoUrl()).toBeNull()
    expect(await stored(ownImage)).toBe(false)
    expect(await stored(cacheImage)).toBe(true)
    expect(await readyNotifications()).toEqual([])
    expect(await t.query(fn<'query'>('demo:status'), {})).toMatchObject({ ideas: expect.arrayContaining([expect.objectContaining({ id: 'surfing-cat', ready: true })]) })
  })

  test('a refused upload is deleted at once, not left for the sweep', async () => {
    // Over the 8 MB the template keeps: the claim refuses it on its size.
    const photoId = await upload(new Uint8Array(8 * 1024 * 1024 + 1))
    const ada = await asUser(t, { signInMethod: 'passkey' })
    const id = await ada.mutation(fn<'mutation'>('strips:create'), { idea: 'A cat learns to surf' }) as string
    expect(await t.query(backend().testing.exists, { id: photoId })).toBe(true)
    holdTheClock()
    expect(await refusal(ada.action(fn<'action'>('strips:attachPhoto'), { id, photoId }))).toMatchObject({ code: 'invalid_input' })
    await drain()
    expect(await t.query(backend().testing.exists, { id: photoId })).toBe(false)
    expect((await strip(ada, id))?.photoId).toBeUndefined()
  })

  test('an administrator\'s seed draws each canned idea once, for free', async () => {
    const root = await asUser(t, { role: 'admin', signInMethod: 'passkey', passkeyOnly: true })
    holdTheClock()
    expect(await root.mutation(fn<'mutation'>('demo:seed'), {})).toEqual({ queued: 4 })
    await drain()
    const status = await t.query(fn<'query'>('demo:status'), {}) as { ideas: Array<{ ready: boolean }> }
    expect(status.ideas.every(idea => idea.ready)).toBe(true)
    // The panels are the app's files, not the administrator's: their export
    // lists none, and the package's own read gives them nothing.
    const cache = await t.run(async ctx => ctx.db.query('cannedStrips').collect())
    const imageId = cache[0]!.panels[0]!.imageId
    expect(await stored(imageId)).toBe(true)
    expect(await root.query(fn<'query'>('storage:getFileUrl'), { storageId: imageId })).toBeNull()
    expect(await t.query(backend().account.exportData, { userId: root.userId })).toMatchObject({ files: [] })
    // Drawn already: a second seed queues nothing.
    expect(await root.mutation(fn<'mutation'>('demo:seed'), {})).toEqual({ queued: 0 })
    // Not for anyone else.
    const ada = await asUser(t, { signInMethod: 'passkey' })
    expect(await refusal(ada.mutation(fn<'mutation'>('demo:seed'), {}))).toMatchObject({ code: 'forbidden' })
  })

  test('the day\'s spend limit turns pause_ai on', async () => {
    registerTesting()
    const ada = await withCredits('delivered+limit@resend.dev', { signInMethod: 'passkey' })
    // The day has cost the app far past Panels' limit already, recorded
    // without one, so nothing paused yet.
    await t.mutation(backend().costs.record, { owner: 'elsewhere', usage: { usd: 1000, input: 1, output: 1, cached: 0 } })
    holdTheClock()
    // An idea of one's own, from a passkey session, is drawn by the models.
    const first = await ada.mutation(fn<'mutation'>('strips:create'), { idea: 'A cat learns to surf' }) as string
    await ada.mutation(fn<'mutation'>('strips:generate'), { id: first })
    await drain()
    // Its steps' costs were recorded with Panels' limit, which the day is
    // over: pause_ai went on (and, the clock run to its end, off again at
    // the next UTC day).
    expect(await strip(ada, first)).toMatchObject({ status: 'ready' })
    expect(await t.query(backend().testing.events, {})).toContainEqual(expect.objectContaining({ type: 'ai.spend_limit_reached', data: expect.objectContaining({ limit: 5 }) }))
  })
})
