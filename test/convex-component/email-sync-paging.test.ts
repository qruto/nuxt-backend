/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { actionGeneric, componentsGeneric, defineSchema, type FunctionReference, makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'
import { defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { setupEmail } from '../../src/convex/integrations/email'
import type { EmailSyncReport } from '../../src/convex/integrations/email-sync'

// `email sync` against an account the provider pages: every listing the sync
// reads (topics, segments, contact properties, automations, domains) comes 20
// to an answer unless asked for more, so the sync reads each page by page and
// finds what it made before wherever it sits, makes nothing twice, and treats
// a refusal part of the way as the listing's own. Then what it decides about
// each declared object it finds: a topic's words brought up to date, a default
// the provider cannot change reported as drift, a topic followed by the id it
// kept after a rename, a property of another type, and the flows' templates
// and automations made once and kept as the deployment found them.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const TOPICS = {
  tips: { name: 'Tips', description: 'How to get more out of Panels.', subscribedByDefault: true },
  offers: { name: 'Offers', description: 'Discounts and plan news.', subscribedByDefault: false },
}
const brand = { name: 'Panels', address: 'Panels Ltd, 1 Example Street, Dublin' }
const email = setupEmail(components as never, { brand, topics: TOPICS, contactProperties: { plan: 'string', strips: { type: 'number', fallback: 0 } } })
const withFlows = setupEmail(components as never, { brand, topics: TOPICS, lifecycle: { welcome: true } })

const sync = actionGeneric({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }): Promise<EmailSyncReport> => ctx.runAction(makeFunctionReference<'action'>('email:syncEmail') as never, { dryRun, webhook: 'off' } as never),
})

const appWith = (api: object) => defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './email.js': () => Promise.resolve({ ...api }),
  './test.js': () => Promise.resolve({ sync }),
})
const plainApp = appWith(email.api)
const flowsApp = appWith(withFlows.api)
type App = ReturnType<typeof plainApp>

const syncRef = makeFunctionReference<'action', { dryRun?: boolean }, EmailSyncReport>('test:sync')
type KeptId = { kind: 'topic' | 'segment', key: string, providerId: string, version?: string }
const saveIds = (t: App, ids: KeptId[]) => t.mutation(components.backend.preferences.saveProviderIds as unknown as FunctionReference<'mutation'>, { ids })
const keptIds = (t: App) => t.query(components.backend.preferences.providerIds as unknown as FunctionReference<'query'>, {}) as Promise<KeptId[]>
const flowSettings = (t: App) => t.query(components.backend.lifecycle.settings as unknown as FunctionReference<'query'>, {}) as Promise<{ syncedAt: number } | null>

type Item = Record<string, unknown> & { id: string }
interface Call { method: string, path: string, limit: string | null, after: string | null, body: Record<string, unknown> | undefined }
type Answer = { status: number, body: unknown }

/**
 * A stand-in for the email provider, paging every listing as it does (20 by
 * default, `limit` up to 100, from `after`): `listed` holds what the account
 * has by path, and what the sync makes joins it, so a second sync finds it.
 * `answers` answer a call before anything else; `refuse` adds one.
 */
const provider = {
  listed: {} as Record<string, Item[]>,
  templates: new Set<string>(),
  answers: [] as Array<(call: Call) => Answer | undefined>,
  calls: [] as Call[],
}

function refuse(match: (call: Call) => boolean, status = 422, name = 'validation_error', message = 'refused') {
  provider.answers.push(call => match(call) ? { status, body: { name, message, statusCode: status } } : undefined)
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

function stubProvider() {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    // The DMARC lookups: no record anywhere.
    if (url.host === 'cloudflare-dns.com') return json({ Status: 3 })
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
    const call: Call = { method, path: url.pathname, limit: url.searchParams.get('limit'), after: url.searchParams.get('after'), body }
    provider.calls.push(call)
    const answered = provider.answers.map(answer => answer(call)).find(Boolean)
    if (answered) return json(answered.body, answered.status)
    if (method === 'GET' && url.pathname.startsWith('/templates/')) {
      const alias = decodeURIComponent(url.pathname.slice('/templates/'.length))
      return provider.templates.has(alias) ? json({ object: 'template', id: `tpl_${alias}` }) : json({ name: 'not_found', message: 'Template not found', statusCode: 404 }, 404)
    }
    if (method === 'GET') {
      const items = provider.listed[url.pathname] ?? []
      const from = call.after ? items.findIndex(item => item.id === call.after) + 1 : 0
      const page = items.slice(from, from + Math.min(Number(call.limit) || 20, 100))
      return json({ object: 'list', has_more: from + page.length < items.length, data: page })
    }
    if (method === 'POST' && url.pathname === '/templates') {
      provider.templates.add(String(body!.alias))
      return json({ object: 'template', id: `tpl_${body!.alias as string}` })
    }
    const id = `made_${provider.calls.length}`
    if (method === 'POST' && ['/topics', '/segments', '/contact-properties', '/automations'].includes(url.pathname)) {
      (provider.listed[url.pathname] ??= []).push({ id, ...body })
    }
    return json({ object: 'x', id })
  }))
}

/** `count` items a listing holds beside the ones a test is about. */
const others = (prefix: string, count: number, fields: (index: number) => Record<string, unknown> = index => ({ name: `Other ${index}` })): Item[] =>
  Array.from({ length: count }, (_, index) => ({ id: `${prefix}_${index}`, ...fields(index) }))

const asProvider = (topic: { name: string, description: string, subscribedByDefault: boolean }) => ({ name: topic.name, description: topic.description, default_subscription: topic.subscribedByDefault ? 'opt_in' : 'opt_out' })
const syncedTopics = () => [{ id: 'topic_tips', ...asProvider(TOPICS.tips) }, { id: 'topic_offers', ...asProvider(TOPICS.offers) }]

const made = (path: string) => provider.calls.filter(call => call.method === 'POST' && call.path === path)
const reads = (path: string) => provider.calls.filter(call => call.method === 'GET' && call.path === path)
const entries = (report: EmailSyncReport, kind: string) => report.log.filter(entry => entry.kind === kind).map(entry => `${entry.key}:${entry.action}`)

let t: App

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'], now: Date.UTC(2026, 9, 27, 12) })
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  // The provider's SDK logs each refusal it answers.
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('SITE_URL', 'https://panels.example.com')
  vi.stubEnv('EMAIL_API_KEY', 're_test_key')
  provider.listed = { '/topics': syncedTopics() }
  provider.templates = new Set()
  provider.answers = []
  provider.calls = []
  stubProvider()
  t = plainApp()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('email sync on an account with more than a page of each listing', () => {
  test('finds the accounts\' segment on a later page by its name, keeps its id, and makes none', async () => {
    provider.listed['/segments'] = [...others('segment', 150), { id: 'segment_accounts', name: 'Accounts' }]
    // A dry run finds it too, and keeps nothing.
    expect(entries(await t.action(syncRef, { dryRun: true }), 'segment')).toEqual(['accounts:exists'])
    expect(await keptIds(t)).toEqual([])

    const report = await t.action(syncRef, {})
    expect(report.log).toContainEqual({ action: 'exists', kind: 'segment', key: 'accounts', id: 'segment_accounts' })
    expect(made('/segments')).toEqual([])
    expect(await keptIds(t)).toContainEqual({ kind: 'segment', key: 'accounts', providerId: 'segment_accounts' })
    // A hundred to a page, the second from the first page's last.
    expect(reads('/segments').slice(-2).map(call => [call.limit, call.after])).toEqual([['100', null], ['100', 'segment_99']])
  })

  test('follows the segment by the id it kept, past the first page, over another one named Accounts', async () => {
    await saveIds(t, [{ kind: 'segment', key: 'accounts', providerId: 'segment_kept' }])
    provider.listed['/segments'] = [{ id: 'segment_named', name: 'Accounts' }, ...others('segment', 120), { id: 'segment_kept', name: 'Everyone with an account' }]
    const report = await t.action(syncRef, {})
    expect(report.log).toContainEqual({ action: 'exists', kind: 'segment', key: 'accounts', id: 'segment_kept' })
    expect(await keptIds(t)).toContainEqual({ kind: 'segment', key: 'accounts', providerId: 'segment_kept' })
  })

  test('finds a declared contact property on a later page, never makes it again, and reports one whose type drifted', async () => {
    provider.listed['/contact-properties'] = [
      ...others('property', 130, index => ({ key: `other_${index}`, type: 'string' })),
      { id: 'property_plan', key: 'plan', type: 'string' },
      { id: 'property_strips', key: 'strips', type: 'string' },
    ]
    const report = await t.action(syncRef, {})
    expect(report.log.filter(entry => entry.kind === 'property')).toEqual([
      { action: 'exists', kind: 'property', key: 'plan', id: 'property_plan' },
      { action: 'drift', kind: 'property', key: 'strips', id: 'property_strips', note: 'is a string at the provider' },
    ])
    expect(made('/contact-properties')).toEqual([])
  })

  test('reads the sending region of the sender\'s domain on a later page, against EMAIL_REGION', async () => {
    vi.stubEnv('EMAIL_FROM', 'Panels <hello@mail.panels.example>')
    vi.stubEnv('EMAIL_REGION', 'eu-west-1')
    provider.listed['/domains'] = [...others('domain', 105, index => ({ name: `other-${index}.example`, region: 'us-east-1' })), { id: 'domain_panels', name: 'panels.example', region: 'eu-west-1' }]
    const report = await t.action(syncRef, {})
    expect(report.senders).toEqual([{ variable: 'EMAIL_FROM', domain: 'mail.panels.example', region: 'eu-west-1', dmarc: null }])
    expect(report.region).toEqual({ expected: 'eu-west-1', actual: 'eu-west-1' })
  })

  test('stops at an empty page, whatever has_more says', async () => {
    provider.answers.push(call => call.method === 'GET' && call.path === '/segments' ? { status: 200, body: { object: 'list', has_more: true, data: [] } } : undefined)
    const report = await t.action(syncRef, {})
    expect(reads('/segments')).toHaveLength(1)
    expect(entries(report, 'segment')).toEqual(['accounts:created'])
  })

  test('stops after 50 reads of a provider that answers the same page forever', async () => {
    provider.answers.push(call => call.method === 'GET' && call.path === '/segments'
      ? { status: 200, body: { object: 'list', has_more: true, data: [{ id: 'segment_accounts', name: 'Accounts' }] } }
      : undefined)
    const report = await t.action(syncRef, {})
    expect(reads('/segments')).toHaveLength(50)
    expect(entries(report, 'segment')).toEqual(['accounts:exists'])
  })

  test('reads a listing up to its 50th page of 100: what lies past them reads as missing', async () => {
    provider.listed['/topics'] = [{ id: 'topic_offers', ...asProvider(TOPICS.offers) }, ...others('topic', 5000), { id: 'topic_tips', ...asProvider(TOPICS.tips) }]
    const report = await t.action(syncRef, { dryRun: true })
    expect(reads('/topics')).toHaveLength(50)
    expect(entries(report, 'topic')).toEqual(['tips:would-create', 'offers:exists'])
  })

  test('takes a refusal on a later page for the listing\'s own, and makes nothing it did not find', async () => {
    provider.listed['/segments'] = [...others('segment', 150), { id: 'segment_accounts', name: 'Accounts' }]
    refuse(call => call.path === '/segments' && call.after !== null, 500, 'application_error', 'try later')
    await expect(t.action(syncRef, {})).rejects.toThrow(/refused to list the segments: try later/)
    expect(made('/segments')).toEqual([])
    expect(await keptIds(t)).toEqual([])
  })

  test('reports no region when the domains cannot be read to the end, and still finishes', async () => {
    vi.stubEnv('EMAIL_FROM', 'Panels <hello@panels.example>')
    provider.listed['/domains'] = [{ id: 'domain_panels', name: 'panels.example', region: 'eu-west-1' }, ...others('domain', 150, index => ({ name: `other-${index}.example`, region: 'us-east-1' }))]
    refuse(call => call.path === '/domains' && call.after !== null, 500, 'application_error')
    const report = await t.action(syncRef, {})
    expect(report).toMatchObject({ key: 'full', senders: [{ variable: 'EMAIL_FROM', domain: 'panels.example', region: null }], region: { actual: null } })
  })
})

describe('email sync and the declared topics', () => {
  test('brings a topic\'s words up to date at the provider, and says it would on a dry run', async () => {
    provider.listed['/topics'] = [{ id: 'topic_tips', ...asProvider({ ...TOPICS.tips, description: 'Tips, now and then.' }) }, { id: 'topic_offers', ...asProvider(TOPICS.offers) }]
    expect(entries(await t.action(syncRef, { dryRun: true }), 'topic')).toEqual(['tips:would-update', 'offers:exists'])
    expect(provider.calls.filter(call => call.method === 'PATCH')).toEqual([])

    const report = await t.action(syncRef, {})
    expect(entries(report, 'topic')).toEqual(['tips:updated', 'offers:exists'])
    expect(provider.calls.filter(call => call.method === 'PATCH').map(call => [call.path, call.body])).toEqual([
      ['/topics/topic_tips', expect.objectContaining({ name: 'Tips', description: TOPICS.tips.description })],
    ])
  })

  test('fails the sync when the provider refuses a topic\'s new words, or to make a topic', async () => {
    provider.listed['/topics'] = [{ id: 'topic_tips', ...asProvider({ ...TOPICS.tips, description: 'Tips, now and then.' }) }]
    refuse(call => call.method === 'PATCH' && call.path === '/topics/topic_tips')
    await expect(t.action(syncRef, {})).rejects.toThrow(/refused to update the tips topic/)
    provider.listed['/topics'] = []
    refuse(call => call.method === 'POST' && call.path === '/topics')
    await expect(t.action(syncRef, {})).rejects.toThrow(/refused to create the tips topic/)
    // Nothing the failed syncs found or made was kept.
    expect(await keptIds(t)).toEqual([])
  })

  test('reports a topic whose default differs as drift, and changes nothing there', async () => {
    provider.listed['/topics'] = [{ id: 'topic_tips', ...asProvider({ ...TOPICS.tips, description: 'Other words', subscribedByDefault: false }) }, { id: 'topic_offers', ...asProvider(TOPICS.offers) }]
    const report = await t.action(syncRef, {})
    expect(report.log).toContainEqual({ action: 'drift', kind: 'topic', key: 'tips', id: 'topic_tips', note: expect.stringContaining('subscribes by opt_out at the provider') })
    expect(provider.calls.filter(call => call.method === 'PATCH' || (call.method === 'POST' && call.path === '/topics'))).toEqual([])
  })

  test('follows a topic renamed at the provider by the id it kept, renames it back, and keeps its words\' new version', async () => {
    await saveIds(t, [{ kind: 'topic', key: 'tips', providerId: 'topic_kept', version: 'words-before' }])
    provider.listed['/topics'] = [
      { id: 'topic_named', ...asProvider(TOPICS.tips) },
      ...others('topic', 30),
      { id: 'topic_kept', ...asProvider({ ...TOPICS.tips, name: 'Tips and tricks' }) },
      { id: 'topic_offers', ...asProvider(TOPICS.offers) },
    ]
    const report = await t.action(syncRef, {})
    expect(report.log).toContainEqual({ action: 'updated', kind: 'topic', key: 'tips', id: 'topic_kept' })
    expect(provider.calls.filter(call => call.method === 'PATCH').map(call => call.path)).toEqual(['/topics/topic_kept'])
    const kept = (await keptIds(t)).find(entry => entry.key === 'tips')!
    expect(kept.providerId).toBe('topic_kept')
    expect(kept.version).not.toBe('words-before')
    // A second sync finds everything as it left it: nothing kept anew, nothing changed.
    provider.calls = []
    provider.listed['/topics']!.find(item => item.id === 'topic_kept')!.name = 'Tips'
    expect(entries(await t.action(syncRef, {}), 'topic')).toEqual(['tips:exists', 'offers:exists'])
    expect(provider.calls.filter(call => call.method !== 'GET')).toEqual([])
  })

  test('takes a key the provider answers 401, or names restricted, for one that may only send; any other refusal fails the sync', async () => {
    provider.answers = []
    refuse(call => call.path === '/topics', 401, 'validation_error', 'API key is invalid')
    expect(await t.action(syncRef, {})).toMatchObject({ key: 'restricted', log: [] })
    provider.answers = []
    refuse(call => call.path === '/topics', 403, 'restricted_api_key', 'This API key is restricted to only send emails')
    expect(await t.action(syncRef, {})).toMatchObject({ key: 'restricted' })
    provider.answers = []
    refuse(call => call.path === '/topics', 500, 'application_error', 'Internal server error')
    await expect(t.action(syncRef, {})).rejects.toThrow(/refused to list the topics: Internal server error/)
    // A restricted key reached nothing past the topics.
    expect(provider.calls.filter(call => call.path !== '/topics')).toEqual([])
  })

  test('reaches no provider without a key, and reports it missing', async () => {
    vi.stubEnv('EMAIL_API_KEY', '')
    expect(await t.action(syncRef, {})).toMatchObject({ key: 'missing', log: [], topics: 2, postalAddress: true })
    expect(provider.calls).toEqual([])
  })
})

describe('email sync and the accounts\' segment and contact properties', () => {
  test('fails the sync when the provider refuses to list the segments, or the contact properties', async () => {
    refuse(call => call.method === 'GET' && call.path === '/segments')
    await expect(t.action(syncRef, {})).rejects.toThrow(/refused to list the segments/)
    provider.answers = []
    refuse(call => call.method === 'GET' && call.path === '/contact-properties')
    await expect(t.action(syncRef, {})).rejects.toThrow(/refused to list the contact properties/)
  })

  test('makes a missing property with its fallback once, says it would on a dry run, and fails on a refusal to make one', async () => {
    expect(entries(await t.action(syncRef, { dryRun: true }), 'property')).toEqual(['plan:would-create', 'strips:would-create'])
    expect(made('/contact-properties')).toEqual([])
    refuse(call => call.method === 'POST' && call.path === '/contact-properties' && call.body?.key === 'strips')
    await expect(t.action(syncRef, {})).rejects.toThrow(/refused to create the strips contact property/)
    provider.answers = []
    const report = await t.action(syncRef, {})
    expect(entries(report, 'property')).toEqual(['plan:exists', 'strips:created'])
    expect(made('/contact-properties').at(-1)!.body).toEqual({ key: 'strips', type: 'number', fallback_value: 0 })
  })
})

describe('email sync and the lifecycle flows', () => {
  beforeEach(() => {
    vi.stubEnv('EMAIL_FROM', 'Panels <hello@mail.panels.example>')
    t = flowsApp()
  })

  test('keeps a template the provider already holds, as it was edited there, and makes only its automation', async () => {
    provider.templates.add('nuxt-backend-welcome')
    const report = await t.action(syncRef, {})
    expect(report.log.filter(entry => entry.kind === 'template' || entry.kind === 'automation')).toEqual([
      { action: 'exists', kind: 'template', key: 'welcome', id: 'tpl_nuxt-backend-welcome' },
      { action: 'created', kind: 'automation', key: 'welcome', id: expect.any(String) },
    ])
    expect(made('/templates')).toEqual([])
    expect(JSON.stringify(made('/automations')[0]!.body)).toContain('tpl_nuxt-backend-welcome')
    expect(report.flows.unsynced).toEqual([])
  })

  test.each([
    ['a template it cannot read', (call: Call) => call.method === 'GET' && call.path === '/templates/nuxt-backend-welcome', /refused to read the welcome template/],
    ['a template it cannot publish', (call: Call) => call.path === '/templates/tpl_nuxt-backend-welcome/publish', /refused to publish the welcome template/],
    ['an automation it cannot make', (call: Call) => call.method === 'POST' && call.path === '/automations', /refused to create the welcome automation/],
    ['automations it cannot list', (call: Call) => call.method === 'GET' && call.path === '/automations', /refused to list the automations/],
  ])('fails on %s, and keeps the flow unsynced so nothing starts it', async (_, match, message) => {
    refuse(match, 500, 'application_error')
    await expect(t.action(syncRef, {})).rejects.toThrow(message)
    expect(await flowSettings(t)).toBeNull()
    provider.answers = []
    expect((await t.action(syncRef, { dryRun: true })).flows.unsynced).toEqual(['welcome'])
  })

  test('writes the flows\' settings once, and leaves them as they are on a sync that finds nothing changed', async () => {
    await t.action(syncRef, {})
    const first = await flowSettings(t)
    expect(first).not.toBeNull()
    vi.setSystemTime(Date.now() + 60_000)
    provider.calls = []
    const again = await t.action(syncRef, {})
    expect(again.log.filter(entry => entry.kind === 'template' || entry.kind === 'automation').map(entry => entry.action)).toEqual(['exists', 'exists'])
    expect(provider.calls.filter(call => call.method !== 'GET')).toEqual([])
    expect((await flowSettings(t))!.syncedAt).toBe(first!.syncedAt)
  })
})
