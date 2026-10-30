/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { actionGeneric, componentsGeneric, defineSchema, makeFunctionReference, mutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { getBackendError } from '../../src/convex/errors'
import { setupEmail } from '../../src/convex/integrations/email'
import type { EmailSyncReport } from '../../src/convex/integrations/email-sync'

// The ready-made lifecycle flows and the provider's automations, as the app
// declares them: `setupEmail({ lifecycle })` refuses a flow it cannot run as
// the deployment loads, `email sync` makes each flow's template (in the
// package's layout, with the postal address and the provider's unsubscribe
// link where it is not transactional) and its automation, and keeps the
// flows' settings on the deployment, and `email.automations.track` sends the
// app's own events, never a billing one.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const TOPICS = {
  tips: { name: 'Tips', description: 'How to get more out of Panels.', subscribedByDefault: true },
  offers: { name: 'Offers', description: 'Discounts and plan news.', subscribedByDefault: false, from: 'Panels <offers@news.panels.example>' },
}
const email = setupEmail(components as never, {
  brand: { name: 'Panels', address: 'Panels Ltd, 1 Example Street, Dublin' },
  topics: TOPICS,
  contactProperties: { plan: 'string', strips: { type: 'number', fallback: 0 } },
  lifecycle: { welcome: true, activationNudge: { topic: 'tips' }, firstResult: { event: 'app.strip_ready' }, winBack: { topic: 'offers' } },
})

const track = mutationGeneric({
  args: { event: v.string(), userId: v.optional(v.string()), email: v.optional(v.string()) },
  handler: async (ctx, args) => email.automations.track(ctx, { ...args, data: { strips: 1 } }),
})
const signedUp = mutationGeneric({
  args: { id: v.string(), email: v.string() },
  handler: async (ctx, user) => email.lifecycle.signedUp(ctx, user),
})
const sync = actionGeneric({
  args: { dryRun: v.boolean() },
  handler: async (ctx, { dryRun }): Promise<EmailSyncReport> => ctx.runAction(makeFunctionReference<'action', { dryRun: boolean, webhook: string }, EmailSyncReport>('email:syncEmail') as never, { dryRun, webhook: 'off' } as never),
})

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './email.js': () => Promise.resolve({ ...email.api }),
  './test.js': () => Promise.resolve({ track, signedUp, sync }),
})
type App = ReturnType<typeof testApp>

const trackRef = makeFunctionReference<'mutation', { event: string, userId?: string, email?: string }, null>('test:track')
const signedUpRef = makeFunctionReference<'mutation', { id: string, email: string }, { welcome: boolean }>('test:signedUp')
const syncRef = makeFunctionReference<'action', { dryRun: boolean }, EmailSyncReport>('test:sync')

let t: App
let calls: Array<{ method: string, path: string, body: Record<string, unknown> | undefined }>

/** A stand-in for the email provider: nothing exists until it is made. `refuse` answers one path (one method of it, when named) with the provider's refusal. */
function provider(refuse?: { path: string, status: number, name: string, method?: string, message?: string }) {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
    calls.push({ method, path: url.pathname, body })
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
    if (refuse && url.pathname === refuse.path && (!refuse.method || refuse.method === method)) return json({ name: refuse.name, message: refuse.message ?? 'refused', statusCode: refuse.status }, refuse.status)
    if (method === 'GET' && url.pathname.startsWith('/templates/')) return json({ name: 'not_found', message: 'Template not found', statusCode: 404 }, 404)
    if (method === 'GET') return json({ object: 'list', has_more: false, data: [] })
    if (url.pathname === '/templates') return json({ object: 'template', id: `tpl_${(body?.alias as string).slice(13)}` })
    return json({ object: 'x', id: `id_${calls.length}` })
  }))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'], now: Date.UTC(2026, 9, 27, 12) })
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubEnv('SITE_URL', 'https://panels.example.com')
  vi.stubEnv('EMAIL_FROM', 'Panels <hello@mail.panels.example>')
  vi.stubEnv('EMAIL_MARKETING_FROM', 'Panels <news@news.panels.example>')
  calls = []
  t = testApp()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('setupEmail({ lifecycle })', () => {
  const setup = (lifecycle: Record<string, unknown>) => () => setupEmail(components as never, { topics: TOPICS, lifecycle: lifecycle as never })

  test('refuses a flow it cannot run, naming the flow', () => {
    expect(setup({ winBack: true })).toThrow(/winBack is marketing email, so it goes under a topic/)
    expect(setup({ stalled: { topic: 'nope' } })).toThrow(/stalled is lifecycle email/)
    expect(setup({ creditsLow: { topic: 'tips' } })).toThrow(/creditsLow is transactional/)
    expect(setup({ firstResult: true })).toThrow(/firstResult starts on an event of your own/)
    expect(setup({ activationNudge: { topic: 'tips' } })).toThrow(/activationNudge stops once the person creates something/)
    expect(setup({ firstResult: { event: 'billing.order_paid' } })).toThrow(/is a billing event/)
    expect(setup({ winBack: { topic: 'offers', days: [0] } })).toThrow(/winBack.days/)
    expect(setup({ birthday: true })).toThrow(/birthday is no ready-made flow/)
  })
})

describe('email sync', () => {
  test('keeps the flows\' settings, and makes each flow\'s template and automation once', async () => {
    const declared = ['welcome', 'activationNudge', 'firstResult', 'winBack']
    const dry = await t.action(syncRef, { dryRun: true })
    expect(dry.flows).toEqual({ declared, unsynced: declared })
    // Without a key, nothing is made at the provider, so nothing is kept: no flow starts.
    expect((await t.action(syncRef, { dryRun: false })).flows.unsynced).toEqual(declared)

    vi.stubEnv('EMAIL_API_KEY', 're_test_key')
    provider()
    const report = await t.action(syncRef, { dryRun: false })
    expect(report.flows.unsynced).toEqual([])
    expect((await t.action(syncRef, { dryRun: true })).flows.unsynced).toEqual([])
    expect(report.log.filter(entry => entry.kind === 'template' || entry.kind === 'automation').map(entry => `${entry.kind}:${entry.key}:${entry.action}`)).toEqual([
      'template:welcome:created', 'automation:welcome:created',
      'template:activationNudge:created', 'automation:activationNudge:created',
      'template:firstResult:created', 'automation:firstResult:created',
      'template:winBack:created', 'automation:winBack:created',
    ])
    const templates = calls.filter(call => call.method === 'POST' && call.path === '/templates').map(call => call.body!)
    const welcome = templates.find(body => body.alias === 'nuxt-backend-welcome')!
    expect(welcome).toMatchObject({ subject: 'Welcome to Panels', from: 'Panels <hello@mail.panels.example>' })
    expect(String(welcome.html)).not.toContain('RESEND_UNSUBSCRIBE_URL')
    const winBack = templates.find(body => body.alias === 'nuxt-backend-win-back')!
    expect(winBack).toMatchObject({ from: 'Panels <offers@news.panels.example>' })
    expect(String(winBack.html)).toContain('{{{RESEND_UNSUBSCRIBE_URL}}}')
    expect(String(winBack.html)).toContain('Panels Ltd, 1 Example Street, Dublin')
    expect(String(winBack.html)).toContain('https://panels.example.com/pricing')
    // Each template is published, then an automation sends it on the flow's event.
    expect(calls.filter(call => call.method === 'POST' && /^\/templates\/[^/]+\/publish$/.test(call.path))).toHaveLength(4)
    const automation = calls.find(call => call.method === 'POST' && call.path === '/automations' && JSON.stringify(call.body).includes('lifecycle.win_back'))!
    expect(automation.body).toMatchObject({ name: 'nuxt-backend: winBack', status: 'enabled', connections: [{ from: 'start', to: 'send' }] })
    expect(JSON.stringify(automation.body)).toContain('tpl_win-back')
    // The contact properties, the shorthand included.
    expect(calls.filter(call => call.path === '/contact-properties' && call.method === 'POST').map(call => call.body)).toEqual([
      expect.objectContaining({ key: 'plan', type: 'string' }),
      expect.objectContaining({ key: 'strips', type: 'number' }),
    ])
  })

  test('keeps no flow running whose template or automation the provider refused, so the packaged welcome still goes', async () => {
    const declared = ['welcome', 'activationNudge', 'firstResult', 'winBack']
    const ada = await asUser(t, { email: 'delivered+ada@resend.dev' })
    vi.stubEnv('EMAIL_API_KEY', 're_test_key')
    // A key that may only send.
    provider({ path: '/topics', status: 401, name: 'restricted_api_key' })
    expect(await t.action(syncRef, { dryRun: false })).toMatchObject({ key: 'restricted', flows: { unsynced: declared } })
    // A template the provider refuses to make.
    provider({ path: '/templates', status: 422, name: 'validation_error' })
    await expect(t.action(syncRef, { dryRun: false })).rejects.toThrow(/create the welcome template/)
    expect(await t.mutation(signedUpRef, { id: ada.userId, email: ada.email })).toEqual({ welcome: false })
  })
})

describe('email sync on a plan at its segment limit', () => {
  test('logs the accounts\' segment it could not make, and syncs the rest', async () => {
    vi.stubEnv('EMAIL_API_KEY', 're_test_key')
    provider({ path: '/segments', method: 'POST', status: 422, name: 'validation_error', message: 'Your plan includes 3 segments. Upgrade to add more.' })
    const report = await t.action(syncRef, { dryRun: false })
    expect(report.log).toContainEqual(expect.objectContaining({ action: 'drift', kind: 'segment', key: 'accounts', note: expect.stringContaining('Your plan includes 3 segments') }))
    // The topics, the properties and the flows were still made.
    expect(report.log.filter(entry => entry.kind === 'automation').every(entry => entry.action === 'created')).toBe(true)
    expect(calls.filter(call => call.path === '/contact-properties' && call.method === 'POST')).toHaveLength(2)
  })
})

describe('automations.track', () => {
  test('refuses a billing event and the package\'s own names, and an event about nobody', async () => {
    const ada = await asUser(t, { email: 'delivered+ada@resend.dev' })
    const refusal = (args: { event: string, userId?: string, email?: string }) => t.mutation(trackRef, args).then(() => null, error => getBackendError(error)?.data)
    expect(await refusal({ event: 'billing.order_paid', userId: ada.userId })).toMatchObject({ field: 'event', reason: 'billing_event' })
    expect(await refusal({ event: 'order.paid', userId: ada.userId })).toMatchObject({ field: 'event', reason: 'billing_event' })
    expect(await refusal({ event: 'lifecycle.welcome', userId: ada.userId })).toMatchObject({ field: 'event', reason: 'reserved' })
    expect(await refusal({ event: 'strip.published' })).toMatchObject({ field: 'email' })
  })

  test('sends the event for the account\'s contact by a job, and starts the flow it names', async () => {
    vi.stubEnv('EMAIL_API_KEY', 're_test_key')
    provider()
    await t.action(syncRef, { dryRun: false })
    const ada = await asUser(t, { email: 'delivered+ada@resend.dev' })
    expect(await t.mutation(signedUpRef, { id: ada.userId, email: ada.email })).toEqual({ welcome: true })
    await t.mutation(trackRef, { event: 'strip.published', userId: ada.userId })
    await t.mutation(trackRef, { event: 'app.strip_ready', userId: ada.userId })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    const events = calls.filter(call => call.path === '/events/send').map(call => `${call.body!.event}:${JSON.stringify(call.body!.payload ?? {})}`)
    expect(events).toEqual(expect.arrayContaining(['lifecycle.welcome:{}', 'strip.published:{"strips":1}', 'app.strip_ready:{"strips":1}', 'lifecycle.first_result:{}']))
    expect(events).not.toContain('lifecycle.activation_nudge:{}')
  })
})
