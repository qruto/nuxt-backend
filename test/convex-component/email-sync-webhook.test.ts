/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { actionGeneric, componentsGeneric, defineSchema, makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'
import { defineBackendTestApp } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { setupEmail } from '../../src/convex/integrations/email'
import { dmarcPolicy, type EmailSyncReport, REQUIRED_EMAIL_WEBHOOK_EVENTS } from '../../src/convex/integrations/email-sync'

// `email sync`, `doctor --fix` and `env rotate EMAIL_WEBHOOK_SECRET` at the
// provider's webhook: the sync points one webhook at the deployment's
// `/email/events` with every event the package reads, finds it again on any
// page, gives it the events it lacks and never takes one away, turns it back
// on only when asked, and a rotation changes its signing secret and nothing
// else. Then the senders: each one's domain, its sending region and its
// DMARC policy, read over DNS-over-HTTPS.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const email = setupEmail(components as never, {
  brand: { name: 'Panels', address: 'Panels Ltd, 1 Example Street, Dublin' },
  topics: { tips: { name: 'Tips', description: 'How to get more out of Panels.', subscribedByDefault: true } },
})

type SyncArgs = { dryRun?: boolean, webhook?: string, enableWebhook?: boolean, rotateWebhookSecret?: boolean }
const sync = actionGeneric({
  args: { dryRun: v.optional(v.boolean()), webhook: v.optional(v.string()), enableWebhook: v.optional(v.boolean()), rotateWebhookSecret: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<EmailSyncReport> => ctx.runAction(makeFunctionReference<'action'>('email:syncEmail') as never, args as never),
})

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './email.js': () => Promise.resolve({ ...email.api }),
  './test.js': () => Promise.resolve({ sync }),
})
type App = ReturnType<typeof testApp>

const syncRef = makeFunctionReference<'action', SyncArgs, EmailSyncReport>('test:sync')
const HOOK = 'https://happy-otter-123.convex.site/email/events'
const EVENTS: string[] = [...REQUIRED_EMAIL_WEBHOOK_EVENTS]

type Item = Record<string, unknown> & { id: string }
interface Call { method: string, path: string, after: string | null, body: Record<string, unknown> | undefined }

/**
 * A stand-in for the email provider, paging as it does (20 by default,
 * `limit` up to 100, from `after`), and for the DNS-over-HTTPS resolver:
 * `listed` holds what the account has by path, `refused` the calls it
 * refuses, and `dns` each name's TXT records (`'down'`: the resolver answers
 * 503, `'unreachable'`: the request throws; a name not there has none).
 */
const provider = {
  listed: {} as Record<string, Item[]>,
  refused: [] as Array<(call: Call) => boolean>,
  dns: {} as Record<string, string[] | 'down' | 'unreachable'>,
  calls: [] as Call[],
  lookups: [] as string[],
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

function stubProvider() {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    if (url.host === 'cloudflare-dns.com') {
      const name = url.searchParams.get('name')!
      provider.lookups.push(name)
      const records = provider.dns[name]
      if (records === 'unreachable') throw new TypeError('fetch failed')
      if (records === 'down') return json({}, 503)
      return json(records ? { Status: 0, Answer: records.map(data => ({ name, type: 16, data })) } : { Status: 3 })
    }
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
    const call: Call = { method, path: url.pathname, after: url.searchParams.get('after'), body }
    provider.calls.push(call)
    if (provider.refused.some(refuses => refuses(call))) return json({ name: 'application_error', message: 'try later', statusCode: 500 }, 500)
    if (method === 'GET') {
      const items = provider.listed[url.pathname] ?? []
      const from = call.after ? items.findIndex(item => item.id === call.after) + 1 : 0
      const page = items.slice(from, from + Math.min(Number(url.searchParams.get('limit')) || 20, 100))
      return json({ object: 'list', has_more: from + page.length < items.length, data: page })
    }
    if (method === 'POST' && url.pathname === '/webhooks') return json({ object: 'webhook', id: 'hook_new', signing_secret: 'whsec_new' })
    if (method === 'POST' && url.pathname.endsWith('/signing-secret/rotate')) return json({ object: 'webhook', id: url.pathname.split('/')[2], signing_secret: 'whsec_rotated' })
    return json({ object: 'x', id: `made_${provider.calls.length}` })
  }))
}

/** The provider's webhook at `endpoint`. */
const hook = (fields: { endpoint?: string, status?: string, events?: string[] | null } = {}): Item => ({ id: 'hook_ours', endpoint: HOOK, status: 'enabled', events: EVENTS, ...fields })
const otherHooks = (count: number): Item[] => Array.from({ length: count }, (_, index) => ({ id: `hook_${index}`, endpoint: `https://other-${index}.example/hooks`, status: 'enabled', events: ['email.sent'] }))

const at = (path: string) => provider.calls.filter(call => call.path === path && call.method !== 'GET')
const changes = () => provider.calls.filter(call => call.method !== 'GET')

let t: App

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'], now: Date.UTC(2026, 9, 27, 12) })
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  // The provider's SDK logs each refusal it answers.
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('SITE_URL', 'https://panels.example.com')
  vi.stubEnv('EMAIL_API_KEY', 're_test_key')
  // Everything but the webhook is at the provider already.
  provider.listed = {
    '/topics': [{ id: 'topic_tips', name: 'Tips', description: 'How to get more out of Panels.', default_subscription: 'opt_in' }],
    '/segments': [{ id: 'segment_accounts', name: 'Accounts' }],
  }
  provider.refused = []
  provider.dns = {}
  provider.calls = []
  provider.lookups = []
  stubProvider()
  t = testApp()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the webhook', () => {
  test('is made with every event the deployment reads, its signing secret handed back; a dry run makes none', async () => {
    expect((await t.action(syncRef, { dryRun: true, webhook: HOOK })).webhook).toEqual({ url: HOOK, action: 'would-create', missingEvents: EVENTS })
    expect(changes()).toEqual([])

    expect((await t.action(syncRef, { webhook: HOOK })).webhook).toEqual({ url: HOOK, action: 'created', missingEvents: [], secret: 'whsec_new' })
    expect(at('/webhooks').map(call => call.body)).toEqual([{ endpoint: HOOK, events: EVENTS }])
  })

  test('is found on a later page, its endpoint\'s trailing slash aside, and given the events it lacks beside its own', async () => {
    provider.listed['/webhooks'] = [...otherHooks(130), hook({ endpoint: `${HOOK}/`, events: ['email.opened', 'email.sent'] })]
    const missing = EVENTS.filter(event => event !== 'email.sent')
    expect((await t.action(syncRef, { dryRun: true, webhook: HOOK })).webhook).toEqual({ url: HOOK, action: 'would-update', missingEvents: missing, enabled: true })
    expect(changes()).toEqual([])

    expect((await t.action(syncRef, { webhook: HOOK })).webhook).toEqual({ url: HOOK, action: 'updated', missingEvents: [], enabled: true })
    expect(at('/webhooks')).toEqual([])
    const [update] = at('/webhooks/hook_ours')
    expect(update!.method).toBe('PATCH')
    // The events it had stay: a sync only ever adds.
    expect([...(update!.body!.events as string[])].sort()).toEqual(['email.opened', ...EVENTS].sort())
    expect(update!.body).not.toHaveProperty('status')
  })

  test('is left as it is when it has every event, and one with no events listed is given them all', async () => {
    provider.listed['/webhooks'] = [hook()]
    expect((await t.action(syncRef, { webhook: HOOK })).webhook).toEqual({ url: HOOK, action: 'exists', missingEvents: [], enabled: true })
    expect(changes()).toEqual([])
    provider.listed['/webhooks'] = [hook({ events: null })]
    expect((await t.action(syncRef, { webhook: HOOK })).webhook).toMatchObject({ action: 'updated' })
    expect(at('/webhooks/hook_ours')[0]!.body).toEqual({ events: EVENTS })
  })

  test('is turned back on, when the provider turned it off, only when asked: never off', async () => {
    provider.listed['/webhooks'] = [hook({ status: 'disabled' })]
    expect((await t.action(syncRef, { webhook: HOOK })).webhook).toEqual({ url: HOOK, action: 'exists', missingEvents: [], enabled: false })
    expect((await t.action(syncRef, { webhook: HOOK, enableWebhook: true, dryRun: true })).webhook).toEqual({ url: HOOK, action: 'exists', missingEvents: [], enabled: false, changed: 'would-enable' })
    expect(changes()).toEqual([])

    expect((await t.action(syncRef, { webhook: HOOK, enableWebhook: true })).webhook).toEqual({ url: HOOK, action: 'exists', missingEvents: [], enabled: true, changed: 'enabled' })
    expect(at('/webhooks/hook_ours').map(call => [call.method, call.body])).toEqual([['PATCH', { status: 'enabled' }]])

    // One that delivers already is not touched by the same ask.
    provider.calls = []
    provider.listed['/webhooks'] = [hook()]
    expect((await t.action(syncRef, { webhook: HOOK, enableWebhook: true })).webhook).toEqual({ url: HOOK, action: 'exists', missingEvents: [], enabled: true })
    expect(changes()).toEqual([])
  })

  test('is turned back on and completed in one change', async () => {
    provider.listed['/webhooks'] = [hook({ status: 'disabled', events: ['email.sent'] })]
    expect((await t.action(syncRef, { webhook: HOOK, enableWebhook: true })).webhook).toEqual({ url: HOOK, action: 'updated', missingEvents: [], enabled: true, changed: 'enabled' })
    expect(at('/webhooks/hook_ours').map(call => call.body)).toEqual([{ events: EVENTS, status: 'enabled' }])
  })

  test('points at <site>/email/events by default, and is skipped with no site to point at, or when off', async () => {
    vi.stubEnv('CONVEX_SITE_URL', 'https://happy-otter-123.convex.site/')
    expect((await t.action(syncRef, {})).webhook).toMatchObject({ url: HOOK, action: 'created' })
    provider.calls = []
    vi.stubEnv('CONVEX_SITE_URL', '')
    expect((await t.action(syncRef, {})).webhook).toEqual({ url: null, action: 'skipped', missingEvents: [] })
    vi.stubEnv('CONVEX_SITE_URL', 'https://happy-otter-123.convex.site')
    expect((await t.action(syncRef, { webhook: 'off' })).webhook).toEqual({ url: null, action: 'skipped', missingEvents: [] })
    expect(provider.calls.filter(call => call.path.startsWith('/webhooks'))).toEqual([])
  })

  test.each([
    ['list the webhooks', (call: Call) => call.method === 'GET' && call.path === '/webhooks', [] as Item[], false],
    ['create the webhook', (call: Call) => call.method === 'POST' && call.path === '/webhooks', [] as Item[], false],
    ['update the webhook\'s events', (call: Call) => call.method === 'PATCH', [hook({ events: ['email.sent'] })], false],
    ['turn the webhook back on', (call: Call) => call.method === 'PATCH', [hook({ status: 'disabled' })], true],
  ])('fails the sync when the provider refuses to %s', async (what, refuses, hooks, enableWebhook) => {
    provider.listed['/webhooks'] = hooks
    provider.refused.push(refuses)
    await expect(t.action(syncRef, { webhook: HOOK, enableWebhook })).rejects.toThrow(`the provider refused to ${what}: try later`)
  })
})

describe('rotating the webhook\'s signing secret', () => {
  test('hands the new secret back, and changes nothing else at the provider', async () => {
    // A webhook missing events, and a topic and a segment the sync would make: a rotation leaves them all.
    provider.listed = { '/webhooks': [...otherHooks(120), hook({ events: ['email.sent'] })] }
    const report = await t.action(syncRef, { webhook: HOOK, rotateWebhookSecret: true })
    expect(report).toMatchObject({ key: 'full', log: [], senders: [], webhook: { url: HOOK, action: 'exists', missingEvents: [], enabled: true, changed: 'secret-rotated', secret: 'whsec_rotated' } })
    expect(changes().map(call => `${call.method} ${call.path}`)).toEqual(['POST /webhooks/hook_ours/signing-secret/rotate'])
  })

  test('says it would on a dry run, says the webhook is missing when there is none, and fails on a refusal', async () => {
    provider.listed['/webhooks'] = [hook({ status: 'disabled' })]
    expect((await t.action(syncRef, { webhook: HOOK, rotateWebhookSecret: true, dryRun: true })).webhook).toEqual({ url: HOOK, action: 'exists', missingEvents: [], enabled: false, changed: 'would-rotate' })
    expect(changes()).toEqual([])

    provider.refused.push(call => call.path.endsWith('/signing-secret/rotate'))
    await expect(t.action(syncRef, { webhook: HOOK, rotateWebhookSecret: true })).rejects.toThrow(/refused to rotate the webhook's signing secret/)

    provider.listed['/webhooks'] = otherHooks(3)
    expect((await t.action(syncRef, { webhook: HOOK, rotateWebhookSecret: true })).webhook).toEqual({ url: HOOK, action: 'missing', missingEvents: EVENTS })
  })

  test('with no webhook to point at, rotates nothing', async () => {
    provider.listed['/webhooks'] = [hook()]
    expect((await t.action(syncRef, { webhook: 'off', rotateWebhookSecret: true })).webhook).toEqual({ url: null, action: 'skipped', missingEvents: [] })
    expect(changes()).toEqual([])
  })
})

describe('the senders', () => {
  test('carry each domain\'s DMARC policy: its own record, else its organisational domain\'s, quoted and split as DNS answers it', async () => {
    vi.stubEnv('EMAIL_FROM', 'Panels <hello@mail.panels.example>')
    vi.stubEnv('EMAIL_MARKETING_FROM', 'news@news.panels.example')
    provider.dns = {
      '_dmarc.panels.example': ['"v=DMARC1; p=quarantine; rua=mailto:dmarc@panels.example"'],
      '_dmarc.news.panels.example': ['"v=spf1 -all"', '"v=DMARC1; " "p=Reject"'],
    }
    const report = await t.action(syncRef, { webhook: 'off' })
    expect(report.senders).toEqual([
      { variable: 'EMAIL_FROM', domain: 'mail.panels.example', region: null, dmarc: 'quarantine' },
      { variable: 'EMAIL_MARKETING_FROM', domain: 'news.panels.example', region: null, dmarc: 'reject' },
    ])
    // The sender's own name first, then its parent's; the news domain had its own.
    expect(provider.lookups).toEqual(['_dmarc.mail.panels.example', '_dmarc.panels.example', '_dmarc.news.panels.example'])
  })

  test('read a DMARC record with no policy as none, and nothing when the resolver is down or out of reach', async () => {
    vi.stubEnv('EMAIL_FROM', 'hello@panels.example')
    provider.dns = { '_dmarc.panels.example': ['v=DMARC1; rua=mailto:dmarc@panels.example'] }
    expect((await t.action(syncRef, { webhook: 'off' })).senders).toMatchObject([{ dmarc: 'none' }])
    provider.dns = { '_dmarc.panels.example': 'down' }
    expect((await t.action(syncRef, { webhook: 'off' })).senders).toMatchObject([{ dmarc: null }])
    provider.dns = { '_dmarc.panels.example': 'unreachable' }
    expect((await t.action(syncRef, { webhook: 'off' })).senders).toMatchObject([{ dmarc: null }])
  })

  test('leave out a sender that is unset or is no address', async () => {
    vi.stubEnv('EMAIL_FROM', 'Panels')
    expect((await t.action(syncRef, { webhook: 'off' })).senders).toEqual([])
    expect(provider.lookups).toEqual([])
  })
})

describe('dmarcPolicy', () => {
  test('reads the policy of the first DMARC record, lower-cased, and no record as none found', () => {
    expect(dmarcPolicy(['v=spf1 include:_spf.example -all', 'v=DMARC1;p=REJECT;pct=100'])).toBe('reject')
    expect(dmarcPolicy(['"v=DMARC1; sp=none; p=quarantine"'])).toBe('quarantine')
    expect(dmarcPolicy(['v=spf1 -all'])).toBeNull()
    expect(dmarcPolicy([])).toBeNull()
  })
})
