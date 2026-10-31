/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { convexTest } from 'convex-test'
import resendComponent from '@convex-dev/resend/test'
import { Webhook } from 'standardwebhooks'
import { actionGeneric, componentsGeneric, defineSchema, makeFunctionReference, mutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import component, { asUser, defineBackendTestApp, seedWorkspace } from '../../src/convex/test'
import schema from '../../src/convex/components/backend/schema'
import { api, internal } from '../../src/convex/components/backend/_generated/api'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { getBackendError } from '../../src/convex/errors'
import { type InboundMessage, setupEmail } from '../../src/convex/integrations/email'
import type { InboxConsole } from '../../src/convex/integrations/inbound'
import { contactEmail, INBOUND_RETENTION_MS } from '../../src/convex/inbound-rules'
import { deploymentAudience, signProof } from '../../src/convex/proof'
import { setupRateLimiter } from '../../src/convex/integrations/rate-limit'

// The contact form and inbound mail over the mounted component: the form's
// checks and what it stores, reply addresses, the receiving webhook's routing
// and verdicts, the support inbox's events, the Inbox tab's reads and replies,
// and the sync. The provider's SDK is a stub; the delivery edge, the
// rate limiter and the component's tables are real.

const sdk = vi.hoisted(() => ({
  received: vi.fn(),
  threadEmail: vi.fn(),
  reply: vi.fn(),
  inboxGet: vi.fn(),
  inboxCreate: vi.fn(),
  domains: vi.fn(),
  webhooks: vi.fn(),
  webhookUpdate: vi.fn(),
}))
vi.mock('resend', () => {
  class Resend {
    emails = { receiving: { get: sdk.received } }
    inboxes = { get: sdk.inboxGet, create: sdk.inboxCreate, threads: { emails: { get: sdk.threadEmail, reply: sdk.reply } } }
    domains = { list: sdk.domains }
    webhooks = { list: sdk.webhooks, update: sdk.webhookUpdate }
  }
  return { Resend }
})

const hooks = vi.hoisted(() => ({ onReply: vi.fn(), onWorkspaceMail: vi.fn() }))

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const inbound = { domain: 'in.panels.example', onReply: hooks.onReply, onWorkspaceMail: hooks.onWorkspaceMail }
/** The full setup: a receiving domain, hooks, and a support inbox that test mode holds back from. */
const email = setupEmail(components as never, { inbound: { ...inbound, support: 'support@panels.example' } })
/** Only a contact mailbox: the copy goes there. */
const copyOnly = setupEmail(components as never, { contact: { to: 'team@panels.example' } })
/** A support inbox test mode lets through. */
const sandboxSupport = setupEmail(components as never, { inbound: { support: 'delivered+support@resend.dev' } })
/** No destination at all. */
const bare = setupEmail(components as never, {})
/** The app's own limiter, with a stricter contact limit. */
const strict = setupEmail(components as never, { rateLimiter: setupRateLimiter(components as never, { contact: { kind: 'token bucket', rate: 1, period: 3_600_000, capacity: 1 } }) })

const makeAddress = mutationGeneric({
  args: { userId: v.string(), thread: v.string() },
  handler: async (ctx, args) => email.replyAddress(ctx, args),
})
const deliver = actionGeneric({
  args: { body: v.string(), headers: v.record(v.string(), v.string()) },
  handler: async (ctx, args) => {
    const response = await email.webhookHandler(ctx, new Request('https://app.test/email/events', { method: 'POST', body: args.body, headers: args.headers }))
    return { status: response.status }
  },
})
const syncRef = makeFunctionReference<'action', Record<string, never>, any>('email:syncInbound')

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './email.js': () => Promise.resolve({ ...email.api, makeAddress, deliver }),
  './copy.js': () => Promise.resolve({ ...copyOnly.api }),
  './sandbox.js': () => Promise.resolve({ ...sandboxSupport.api }),
  './bare.js': () => Promise.resolve({ ...bare.api }),
  './strict.js': () => Promise.resolve({ ...strict.api }),
})
type App = ReturnType<typeof testApp>

const submit = makeFunctionReference<'action', { name?: string, email?: string, message: string, website?: string, locale?: string, human?: string | null }, { sent: true }>('email:submitContactMessage')
const submitCopy = makeFunctionReference<'action', { name?: string, email?: string, message: string }, { sent: true }>('copy:submitContactMessage')
const submitSandbox = makeFunctionReference<'action', { name?: string, email?: string, message: string }, { sent: true }>('sandbox:submitContactMessage')
const submitBare = makeFunctionReference<'action', { name?: string, email?: string, message: string }, { sent: true }>('bare:submitContactMessage')
const submitStrict = makeFunctionReference<'action', { name?: string, email?: string, message: string }, { sent: true }>('strict:submitContactMessage')
const inboxOf = makeFunctionReference<'query', Record<string, never>, InboxConsole | null>('email:getInboxConsole')
const replyTo = makeFunctionReference<'action', { kind: 'contact' | 'inbound', id: string, text: string }, null>('email:replyToInbox')
const addressOf = makeFunctionReference<'mutation', { userId: string, thread: string }, string>('email:makeAddress')
const webhook = makeFunctionReference<'action', { body: string, headers: Record<string, string> }, { status: number }>('email:deliver')

const SECRET = `whsec_${btoa('i'.repeat(24))}`
const NOW = Date.parse('2026-10-27T09:00:00.000Z')

let t: App
let delivery = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
  vi.setSystemTime(NOW)
  vi.stubEnv('EMAIL_API_KEY', 're_test_key')
  vi.stubEnv('EMAIL_WEBHOOK_SECRET', SECRET)
  vi.stubEnv('EMAIL_FROM', 'Panels <hello@panels.example>')
  vi.stubEnv('CONVEX_SITE_URL', 'https://panels.convex.site')
  t = testApp()
  for (const spy of [...Object.values(sdk), ...Object.values(hooks)]) spy.mockReset()
  sdk.received.mockResolvedValue({ data: null, error: { name: 'not_found', message: 'gone', statusCode: 404 } })
  sdk.reply.mockResolvedValue({ data: { id: 'sent_1' }, error: null })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

async function refusalOf(call: Promise<unknown>) {
  try {
    await call
  }
  catch (error) {
    return getBackendError(error)
  }
  return null
}

/** Warnings the package logged with this code. */
const logged = (spy: { mock: { calls: unknown[][] } }, code: string) => spy.mock.calls.map(call => String(call[0])).filter(line => line.includes(code))

describe('the contact form', () => {
  const stranger = { name: 'Mo', email: 'Mo@Example.com', message: 'Where do I find my invoices?' }

  test('stores a stranger\'s message in the console, behind a name and an address', async () => {
    await t.action(submit, stranger)
    const admin = await asUser(t, { role: 'admin' })
    const rows = (await admin.query(inboxOf, {}))!.rows
    expect(rows).toEqual([expect.objectContaining({ kind: 'contact', from: 'mo@example.com', name: 'Mo', text: stranger.message, account: null, delivery: 'held', canReply: false })])
  })

  test('sends a signed-in account as the account, with the message alone', async () => {
    const ana = await asUser(t, { email: 'ana@example.com', name: 'Ana' })
    await ana.action(submit, { message: 'The export button is hidden.' })
    const admin = await asUser(t, { role: 'admin' })
    const [row] = (await admin.query(inboxOf, {}))!.rows
    expect(row).toMatchObject({ kind: 'contact', from: 'ana@example.com', name: 'Ana', account: { id: ana.userId, email: 'ana@example.com' } })
  })

  test('refuses an administrator acting as the account, and stores nothing in its name', async () => {
    const admin = await asUser(t, { role: 'admin' })
    const visit = await asUser(t, { email: 'ana@example.com', impersonatedBy: admin.userId })
    expect(await refusalOf(visit.action(submit, { message: 'The export button is hidden.' }))).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
    expect((await admin.query(inboxOf, {}))!.rows).toEqual([])
  })

  test('checks the message and the address', async () => {
    expect(await refusalOf(t.action(submit, { ...stranger, message: 'short' }))).toMatchObject({ code: 'invalid_input', data: { field: 'message', reason: 'too_short' } })
    expect(await refusalOf(t.action(submit, { ...stranger, message: 'x'.repeat(2001) }))).toMatchObject({ code: 'invalid_input', data: { field: 'message', reason: 'too_long' } })
    expect(await refusalOf(t.action(submit, { message: stranger.message }))).toMatchObject({ code: 'invalid_input', data: { field: 'name' } })
    expect(await refusalOf(t.action(submit, { ...stranger, email: 'nope' }))).toMatchObject({ code: 'invalid_input', data: { field: 'email', reason: 'malformed' } })
    const admin = await asUser(t, { role: 'admin' })
    expect((await admin.query(inboxOf, {}))!.rows).toEqual([])
  })

  test('tells a bot that filled the hidden field it was sent, and writes nothing', async () => {
    await expect(t.action(submit, { ...stranger, website: 'https://spam.example' })).resolves.toEqual({ sent: true })
    const admin = await asUser(t, { role: 'admin' })
    expect((await admin.query(inboxOf, {}))!.rows).toEqual([])
  })

  test('refuses a sender past the limit with rate_limited, and not another sender', async () => {
    for (let n = 0; n < 3; n++) await t.action(submit, stranger)
    expect(await refusalOf(t.action(submit, stranger))).toMatchObject({ code: 'rate_limited', data: { limit: 'contact' } })
    await expect(t.action(submit, { ...stranger, email: 'bo@example.com' })).resolves.toEqual({ sent: true })
  })

  test('spends the app\'s own limits when it passes its rate limiter', async () => {
    await t.action(submitStrict, stranger)
    expect(await refusalOf(t.action(submitStrict, stranger))).toMatchObject({ code: 'rate_limited', data: { limit: 'contact' } })
  })

  test('takes a proof of the bot check when the deployment checks, and refuses one it cannot place', async () => {
    vi.stubEnv('PROTECTION_PROOF_SECRET', 'a-proof-secret-that-is-long-enough-1')
    expect(await refusalOf(t.action(submit, stranger))).toMatchObject({ code: 'forbidden', data: { reason: 'bot_check' } })
    const human = await signProof('a-proof-secret-that-is-long-enough-1', { method: 'CALL', path: 'contact', audience: deploymentAudience(), subject: 'mo@example.com' })
    await expect(t.action(submit, { ...stranger, human })).resolves.toEqual({ sent: true })
    // A proof given for another action, or another address, is no proof for this one.
    const other = await signProof('a-proof-secret-that-is-long-enough-1', { method: 'CALL', path: 'waitlist', audience: deploymentAudience(), subject: 'mo@example.com' })
    expect(await refusalOf(t.action(submit, { ...stranger, human: other }))).toMatchObject({ data: { reason: 'bot_check' } })
  })

  test('is closed in production while no bot check is set up', async () => {
    vi.stubEnv('BACKEND_ENVIRONMENT', 'production')
    expect(await refusalOf(t.action(submit, stranger))).toMatchObject({ code: 'forbidden', data: { reason: 'bot_check' } })
    vi.stubEnv('PROTECTION_PROOF_SECRET', 'a-proof-secret-that-is-long-enough-1')
    const human = await signProof('a-proof-secret-that-is-long-enough-1', { method: 'CALL', path: 'contact', audience: deploymentAudience(), subject: 'mo@example.com' })
    await expect(t.action(submit, { ...stranger, human })).resolves.toEqual({ sent: true })
  })

  test('copies a message to the contact mailbox with the visitor as reply-to, never to the visitor', async () => {
    const root = convexTest(schema, component.modules)
    resendComponent.register(root, 'resend')
    vi.stubEnv('BACKEND_ENVIRONMENT', 'development')
    const stored = await root.mutation(api.inbound.storeContact, { name: 'Mo', email: 'mo@example.com', message: 'Where do I find my invoices?', to: 'delivered@resend.dev' })
    expect(stored.delivery).toBe('copy')
    const [row] = await root.run(ctx => ctx.db.query('contactMessages').collect())
    expect(row).toMatchObject({ delivery: 'copy', emailId: expect.any(String) })
    const sent = await root.query(api.email.get, { emailId: row!.emailId! })
    expect(sent).toMatchObject({ to: ['delivered@resend.dev'], replyTo: ['mo@example.com'], from: 'Panels <hello@panels.example>' })
    expect(sent!.subject).toBe('Message from Mo')
    expect(sent!.text).toContain('Where do I find my invoices?')
    expect(sent!.text).toContain(`Reference: ${stored.ref}`)
    expect(JSON.stringify(sent!.to)).not.toContain('mo@example.com')
  })

  test('posts into the support inbox when there is one, which wins over the contact mailbox', async () => {
    const root = convexTest(schema, component.modules)
    resendComponent.register(root, 'resend')
    vi.stubEnv('BACKEND_ENVIRONMENT', 'development')
    const stored = await root.mutation(api.inbound.storeContact, { email: 'mo@example.com', name: 'Mo', message: 'Hello there, team.', support: 'delivered+support@resend.dev', to: 'delivered@resend.dev' })
    expect(stored.delivery).toBe('support')
    const [row] = await root.run(ctx => ctx.db.query('contactMessages').collect())
    expect((await root.query(api.email.get, { emailId: row!.emailId! }))!.to).toEqual(['delivered+support@resend.dev'])
  })

  test('holds the copy back in test mode and without a key, and keeps the message', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await t.action(submitCopy, { ...stranger, email: 'mo@example.com' })
    vi.stubEnv('EMAIL_API_KEY', '')
    await t.action(submitSandbox, { ...stranger, email: 'bo@example.com' })
    await t.action(submitBare, { ...stranger, email: 'cy@example.com' })
    const admin = await asUser(t, { role: 'admin' })
    const rows = (await admin.query(inboxOf, {}))!.rows
    expect(rows.map(row => [row.from, row.delivery]).sort()).toEqual([['bo@example.com', 'held'], ['cy@example.com', 'kept'], ['mo@example.com', 'held']])
    expect(logged(warn, 'email.contact_held')).toHaveLength(2)
    // The log never carries the visitor's address.
    expect(warn.mock.calls.flat().join(' ')).not.toContain('@example.com')
  })

  test('shows administrators the console and nobody else', async () => {
    await t.action(submit, stranger)
    expect(await t.query(inboxOf, {})).toBeNull()
    const user = await asUser(t, { role: 'user' })
    expect(await user.query(inboxOf, {})).toBeNull()
    const admin = await asUser(t, { role: 'admin' })
    expect((await admin.query(inboxOf, {}))!.support).toBe('support@panels.example')
  })
})

describe('reply addresses', () => {
  test('are the same for the same person and thread, and different for another thread', async () => {
    const ana = await asUser(t, { email: 'ana@example.com' })
    const first = await t.mutation(addressOf, { userId: ana.userId, thread: 'strip:1' })
    expect(first).toMatch(/^reply-[a-z2-7]{16}@in\.panels\.example$/)
    expect(await t.mutation(addressOf, { userId: ana.userId, thread: 'strip:1' })).toBe(first)
    expect(await t.mutation(addressOf, { userId: ana.userId, thread: 'strip:2' })).not.toBe(first)
  })

  test('need a receiving domain', async () => {
    const ctx = { runMutation: vi.fn() }
    await expect(bare.replyAddress(ctx as never, { userId: 'u', thread: 't' })).rejects.toThrow('receiving domain')
  })
})

describe('receiving', () => {
  /** The delivery edge answers 202 for a handled event and 200 for one it had handled before. */
  const accepted = (answer: { status: number }) => expect([200, 202]).toContain(answer.status)

  /** A signed `email.received` or `inbox.email.received` delivery. */
  async function post(type: string, data: Record<string, unknown>, options: { id?: string } = {}) {
    const body = JSON.stringify({ type, created_at: '2026-10-27T09:00:00.000Z', data })
    const id = options.id ?? `msg_${++delivery}`
    const headers = { 'svix-id': id, 'svix-timestamp': String(Math.floor(Date.now() / 1000)), 'svix-signature': new Webhook(SECRET).sign(id, new Date(), body) }
    return t.action(webhook, { body, headers })
  }

  const mail = (to: string[], from: string, extra: Record<string, unknown> = {}) => ({
    email_id: `em_${++delivery}`, created_at: '2026-10-27T08:59:58.000Z', from, to, cc: [], bcc: [], message_id: '<m@mail>', subject: 'Re: a new comment', attachments: [], ...extra,
  })

  /** What the provider answers when the app reads the message. */
  const readAs = (authentication: Record<string, string> | null, extra: Record<string, unknown> = {}) => sdk.received.mockResolvedValue({
    data: { id: 'em', to: [], from: 'x', created_at: '2026-10-27T08:59:58.000Z', subject: 'Re: a new comment', text: 'I agree with you.', html: '<p>I agree with you.</p>', headers: { from: 'Ana B <ana@example.com>' }, attachments: [{ id: 'att_1', filename: 'a.png', size: 10 }], authentication, ...extra },
    error: null,
  })
  const PASS = { spf: 'pass', dkim: 'pass', dmarc: 'pass' }

  test('hands a reply from its owner, passing DMARC, to onReply once, and stores it', async () => {
    const ana = await asUser(t, { email: 'ana@example.com', name: 'Ana' })
    const address = await t.mutation(addressOf, { userId: ana.userId, thread: 'strip:1' })
    readAs(PASS)
    const data = mail([address], 'ana@example.com')
    accepted(await post('email.received', data))
    expect(sdk.received).toHaveBeenCalledWith(data.email_id)
    expect(hooks.onReply).toHaveBeenCalledTimes(1)
    const [, event] = hooks.onReply.mock.calls[0] as [unknown, { userId: string, thread: string, message: InboundMessage }]
    expect(event).toMatchObject({ userId: ana.userId, thread: 'strip:1' })
    expect(event.message).toEqual({
      id: data.email_id,
      from: 'ana@example.com',
      name: 'Ana B',
      to: address,
      subject: 'Re: a new comment',
      text: 'I agree with you.',
      html: '<p>I agree with you.</p>',
      attachments: [{ name: 'a.png', size: 10 }],
      receivedAt: Date.parse('2026-10-27T08:59:58.000Z'),
    })
    const admin = await asUser(t, { role: 'admin' })
    expect((await admin.query(inboxOf, {}))!.rows).toEqual([expect.objectContaining({ kind: 'reply', thread: 'strip:1', text: 'I agree with you.', account: expect.objectContaining({ id: ana.userId }), canReply: false })])
  })

  test('runs the hook again when it threw, without storing the message twice', async () => {
    const ana = await asUser(t, { email: 'ana@example.com' })
    const address = await t.mutation(addressOf, { userId: ana.userId, thread: 'strip:1' })
    readAs(PASS)
    const data = mail([address], 'ana@example.com')
    hooks.onReply.mockRejectedValueOnce(new Error('the comment table is down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(post('email.received', data)).rejects.toThrow()
    accepted(await post('email.received', data))
    expect(hooks.onReply).toHaveBeenCalledTimes(2)
    // Once handled, a redelivery runs nothing.
    accepted(await post('email.received', data))
    expect(hooks.onReply).toHaveBeenCalledTimes(2)
    const admin = await asUser(t, { role: 'admin' })
    expect((await admin.query(inboxOf, {}))!.rows).toHaveLength(1)
  })

  test('drops a reply answered by someone else, a leaked address gives no one the person\'s voice', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ana = await asUser(t, { email: 'ana@example.com' })
    const address = await t.mutation(addressOf, { userId: ana.userId, thread: 'strip:1' })
    readAs(PASS)
    accepted(await post('email.received', mail([address], 'mallory@example.com')))
    expect(hooks.onReply).not.toHaveBeenCalled()
    expect(logged(warn, 'email.inbound_rejected')).toEqual([expect.stringContaining('sender_mismatch')])
    expect(sdk.received).not.toHaveBeenCalled()
    expect(warn.mock.calls.flat().join(' ')).not.toContain('mallory')
  })

  test('drops a reply from an account that is banned, from its own mailbox too', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ana = await asUser(t, { email: 'ana@example.com' })
    const address = await t.mutation(addressOf, { userId: ana.userId, thread: 'strip:1' })
    await t.mutation(components.backend.adapter.updateOne, { input: { model: 'user', where: [{ field: '_id', value: ana.userId }], update: { banned: true } } } as never)
    readAs(PASS)
    accepted(await post('email.received', mail([address], 'ana@example.com')))
    expect(hooks.onReply).not.toHaveBeenCalled()
    expect(logged(warn, 'email.inbound_rejected')).toEqual([expect.stringContaining('sender_mismatch')])
  })

  test('drops mail that fails DMARC, and a reply whose sender merely did not fail', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ana = await asUser(t, { email: 'ana@example.com' })
    const address = await t.mutation(addressOf, { userId: ana.userId, thread: 'strip:1' })
    readAs({ spf: 'fail', dkim: 'fail', dmarc: 'fail' })
    await post('email.received', mail([address], 'ana@example.com'))
    readAs({ spf: 'pass', dkim: 'pass', dmarc: 'gray' })
    await post('email.received', mail([address], 'ana@example.com'))
    expect(hooks.onReply).not.toHaveBeenCalled()
    expect(logged(warn, 'email.inbound_rejected').every(line => line.includes('reason dmarc'))).toBe(true)
    expect(logged(warn, 'email.inbound_rejected')).toHaveLength(2)
  })

  test('drops mail to an address nothing claims, and never gives a reserved name to a workspace', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    readAs(PASS)
    await post('email.received', mail(['reply-aaaaaaaaaaaaaaaa@in.panels.example'], 'ana@example.com'))
    await post('email.received', mail(['nobody@in.panels.example'], 'ana@example.com'))
    await post('email.received', mail(['postmaster@in.panels.example'], 'ana@example.com'))
    // The support address is the inbox's to take, and mail for another domain is not ours to judge.
    await post('email.received', mail(['support@panels.example', 'someone@elsewhere.example'], 'ana@example.com'))
    expect(logged(warn, 'email.inbound_rejected')).toHaveLength(3)
    expect(logged(warn, 'email.inbound_rejected').every(line => line.includes('unknown_recipient'))).toBe(true)
    expect(sdk.received).not.toHaveBeenCalled()
  })

  test('hands mail for a workspace\'s own address to onWorkspaceMail with the workspace', async () => {
    const workspaceId = await seedWorkspace(t, { name: 'Studio' })
    const slug = ((await t.query(components.backend.adapter.findOne, { model: 'organization', where: [{ field: '_id', value: workspaceId }] })) as { slug: string }).slug
    readAs({ spf: 'pass', dkim: 'gray', dmarc: 'gray' }, { headers: { from: 'receipts@vendor.example' }, text: 'Your receipt.' })
    await post('email.received', mail([`${slug.toUpperCase()}@in.panels.example`], 'receipts@vendor.example'))
    expect(hooks.onWorkspaceMail).toHaveBeenCalledTimes(1)
    const [, event] = hooks.onWorkspaceMail.mock.calls[0] as [unknown, { workspaceId: string, slug: string, message: InboundMessage }]
    expect(event).toMatchObject({ workspaceId, slug })
    expect(event.message).toMatchObject({ from: 'receipts@vendor.example', text: 'Your receipt.' })
    const admin = await asUser(t, { role: 'admin' })
    expect((await admin.query(inboxOf, {}))!.rows).toEqual([expect.objectContaining({ kind: 'workspace', workspaceId })])
  })

  test('drops mail past the inbound rate limit', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const workspaceId = await seedWorkspace(t)
    const slug = ((await t.query(components.backend.adapter.findOne, { model: 'organization', where: [{ field: '_id', value: workspaceId }] })) as { slug: string }).slug
    readAs({ dmarc: 'pass' })
    for (let n = 0; n < 12; n++) await post('email.received', mail([`${slug}@in.panels.example`], 'spammer@vendor.example'))
    expect(hooks.onWorkspaceMail).toHaveBeenCalledTimes(10)
    expect(logged(warn, 'email.inbound_rejected')).toHaveLength(2)
    expect(logged(warn, 'email.inbound_rejected').every(line => line.includes('rate_limited'))).toBe(true)
  })

  test('spends no sender\'s limit on mail nothing claims, nor on mail forged in their name', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ana = await asUser(t, { email: 'ana@example.com' })
    const address = await t.mutation(addressOf, { userId: ana.userId, thread: 'strip:1' })
    const workspaceId = await seedWorkspace(t)
    const slug = ((await t.query(components.backend.adapter.findOne, { model: 'organization', where: [{ field: '_id', value: workspaceId }] })) as { slug: string }).slug
    // In Ana's name: junk to addresses nobody holds, mail that fails DMARC, and mail whose results are unknown.
    for (let n = 0; n < 12; n++) await post('email.received', mail([`nobody${n}@in.panels.example`], 'ana@example.com'))
    readAs({ dmarc: 'fail' })
    for (let n = 0; n < 12; n++) await post('email.received', mail([`${slug}@in.panels.example`], 'ana@example.com'))
    readAs({ dmarc: 'gray' })
    for (let n = 0; n < 12; n++) await post('email.received', mail([`${slug}@in.panels.example`], 'ana@example.com'))
    // The unknown ones spend a bucket of their own, and Ana's own reply still lands.
    expect(hooks.onWorkspaceMail).toHaveBeenCalledTimes(10)
    expect(logged(warn, 'email.inbound_rejected').filter(line => line.includes('rate_limited'))).toHaveLength(2)
    readAs(PASS)
    accepted(await post('email.received', mail([address], 'ana@example.com')))
    expect(hooks.onReply).toHaveBeenCalledTimes(1)
  })

  test('ignores inbound events when the app named no receiving domain', async () => {
    readAs(PASS)
    accepted(await post('email.received', mail(['reply-aaaaaaaaaaaaaaaa@in.panels.example'], 'ana@example.com')))
    expect(hooks.onReply).not.toHaveBeenCalled()
  })

  describe('the support inbox', () => {
    const inboxEvent = (extra: { from?: string, subject?: string, id?: string, thread?: string, to?: string[] } = {}) => ({
      source: 'system',
      inbox_id: 'inbox_1',
      thread_id: extra.thread ?? 'thread_1',
      email_id: extra.id ?? 'ie_1',
      thread: { object: 'inbox_thread', id: extra.thread ?? 'thread_1', subject: extra.subject ?? 'Question about my invoice', folder: 'inbox', labels: [], read: false },
      email: { id: extra.id ?? 'ie_1', direction: 'inbound', from: extra.from ?? 'Steve <steve@example.com>', to: extra.to ?? ['support@panels.example'], cc: [], bcc: [], reply_to: [], subject: extra.subject ?? 'Question about my invoice', message_id: '<c@mail>', attachments: [{ id: 'att_9', filename: 'invoice.pdf', size: 48213 }], read: false, received_at: '2026-10-27T08:59:00.000Z' },
    })
    const threadBody = (text: string) => sdk.threadEmail.mockResolvedValue({ data: { id: 'ie_1', direction: 'inbound', from: 'x', to: [], text, html: null, attachments: [] }, error: null })

    test('keeps a copy of a thread\'s mail, with the account that holds the sender\'s address when the sender passed DMARC', async () => {
      const steve = await asUser(t, { email: 'steve@example.com', name: 'Steve' })
      threadBody('Why was I charged twice?')
      readAs(PASS)
      accepted(await post('inbox.email.received', inboxEvent()))
      expect(sdk.threadEmail).toHaveBeenCalledWith({ emailAddress: 'support@panels.example', threadId: 'thread_1', emailId: 'ie_1' })
      const admin = await asUser(t, { role: 'admin' })
      expect((await admin.query(inboxOf, {}))!.rows).toEqual([expect.objectContaining({
        kind: 'support',
        from: 'steve@example.com',
        subject: 'Question about my invoice',
        text: 'Why was I charged twice?',
        attachments: [{ name: 'invoice.pdf', size: 48213 }],
        account: expect.objectContaining({ id: steve.userId }),
        canReply: true,
      })])
    })

    test('ties no account to a sender the provider cannot vouch for, and drops a forgery', async () => {
      await asUser(t, { email: 'steve@example.com' })
      threadBody('Hello.')
      // Nothing known of the sender's results: stored, but never tied to the account that holds the address.
      await post('inbox.email.received', inboxEvent())
      readAs({ spf: 'fail', dkim: 'fail', dmarc: 'fail' })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      await post('inbox.email.received', inboxEvent({ id: 'ie_2', thread: 'thread_2' }))
      const admin = await asUser(t, { role: 'admin' })
      const rows = (await admin.query(inboxOf, {}))!.rows
      expect(rows).toHaveLength(1)
      expect(rows[0]!.account).toBeNull()
      expect(logged(warn, 'email.inbound_rejected')).toEqual([expect.stringContaining('reason dmarc')])
    })

    test('ignores another inbox\'s mail, and mail it sent itself', async () => {
      threadBody('Hello.')
      sdk.inboxGet.mockResolvedValue({ data: { id: 'inbox_other' }, error: null })
      await post('inbox.email.received', inboxEvent({ to: ['sales@panels.example'] }))
      await post('inbox.email.received', { ...inboxEvent({ id: 'ie_3' }), email: { ...inboxEvent().email, id: 'ie_3', direction: 'outbound' } })
      const admin = await asUser(t, { role: 'admin' })
      expect((await admin.query(inboxOf, {}))!.rows).toEqual([])
    })

    test('hands the thread of a contact message back to its row, which an administrator can answer', async () => {
      const { ref } = await t.mutation(components.backend.inbound.storeContact, { name: 'Mo', email: 'mo@example.com', message: 'Where do I find my invoices?' })
      const { text } = contactEmail({ name: 'Mo', email: 'mo@example.com', body: 'Where do I find my invoices?', ref })
      threadBody(text)
      await post('inbox.email.received', inboxEvent({ from: 'Panels <hello@panels.example>', subject: 'Message from Mo' }))
      const admin = await asUser(t, { role: 'admin' })
      const rows = (await admin.query(inboxOf, {}))!.rows
      expect(rows).toEqual([expect.objectContaining({ kind: 'contact', from: 'mo@example.com', canReply: true })])
      await admin.action(replyTo, { kind: 'contact', id: rows[0]!.id, text: 'Under Billing, then Invoices.' })
      expect(sdk.reply).toHaveBeenCalledWith({ emailAddress: 'support@panels.example', threadId: 'thread_1', emailId: 'ie_1', text: 'Under Billing, then Invoices.' }, { idempotencyKey: expect.stringMatching(/^nuxt-backend:inbox-reply:contact:/) })
      expect((await admin.query(inboxOf, {}))!.rows[0]!.repliedAt).toBeGreaterThanOrEqual(NOW)
    })

    test('gives a contact message\'s row one thread, and holds mail from the app\'s own address to the limits', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { ref } = await t.mutation(components.backend.inbound.storeContact, { name: 'Mo', email: 'mo@example.com', message: 'Where do I find my invoices?' })
      threadBody(contactEmail({ name: 'Mo', email: 'mo@example.com', body: 'Where do I find my invoices?', ref }).text)
      const own = { from: 'Panels <hello@panels.example>', subject: 'Message from Mo' }
      await post('inbox.email.received', inboxEvent(own))
      // Delivered again, the same copy changes nothing.
      await post('inbox.email.received', inboxEvent(own))
      // A copy of its reference on other threads moves nothing, and is mail like any other.
      for (let n = 2; n <= 12; n++) await post('inbox.email.received', inboxEvent({ ...own, id: `ie_${n}`, thread: `thread_${n}` }))
      const admin = await asUser(t, { role: 'admin' })
      const rows = (await admin.query(inboxOf, {}))!.rows
      const contact = rows.filter(row => row.kind === 'contact')
      expect(contact).toEqual([expect.objectContaining({ canReply: true })])
      expect(rows.filter(row => row.kind === 'support')).toHaveLength(10)
      expect(logged(warn, 'email.inbound_rejected').filter(line => line.includes('rate_limited'))).toHaveLength(1)
      await admin.action(replyTo, { kind: 'contact', id: contact[0]!.id, text: 'Under Billing, then Invoices.' })
      expect(sdk.reply.mock.calls[0]![0]).toMatchObject({ threadId: 'thread_1', emailId: 'ie_1' })
    })

    test('lets an administrator in person reply to a thread, and nobody else', async () => {
      threadBody('Why was I charged twice?')
      readAs(PASS)
      await post('inbox.email.received', inboxEvent())
      const admin = await asUser(t, { role: 'admin' })
      const [row] = (await admin.query(inboxOf, {}))!.rows
      const text = '  Sorry about that, refunded.  '
      expect(await refusalOf(t.action(replyTo, { kind: 'inbound', id: row!.id, text }))).toMatchObject({ code: 'unauthenticated' })
      expect(await refusalOf((await asUser(t, { role: 'user' })).action(replyTo, { kind: 'inbound', id: row!.id, text }))).toMatchObject({ code: 'forbidden', data: { reason: 'admin_only' } })
      const stale = await asUser(t, { role: 'admin', signedInAt: NOW - 3_600_000 })
      expect(await refusalOf(stale.action(replyTo, { kind: 'inbound', id: row!.id, text }))).toMatchObject({ code: 'reauthentication_required' })
      expect(await refusalOf(admin.action(replyTo, { kind: 'inbound', id: row!.id, text: '   ' }))).toMatchObject({ code: 'invalid_input', data: { field: 'text' } })
      expect(sdk.reply).not.toHaveBeenCalled()

      await admin.action(replyTo, { kind: 'inbound', id: row!.id, text })
      expect(sdk.reply).toHaveBeenCalledWith({ emailAddress: 'support@panels.example', threadId: 'thread_1', emailId: 'ie_1', text: 'Sorry about that, refunded.' }, { idempotencyKey: expect.stringMatching(/^nuxt-backend:inbox-reply:inbound:/) })
      expect((await admin.query(inboxOf, {}))!.rows[0]!.repliedAt).toBeGreaterThanOrEqual(NOW)
    })

    test('sends the same reply once however often it is retried, and holds an administrator to the admin limit', async () => {
      threadBody('Why was I charged twice?')
      readAs(PASS)
      await post('inbox.email.received', inboxEvent())
      const admin = await asUser(t, { role: 'admin' })
      const [row] = (await admin.query(inboxOf, {}))!.rows
      await admin.action(replyTo, { kind: 'inbound', id: row!.id, text: 'Refunded.' })
      await admin.action(replyTo, { kind: 'inbound', id: row!.id, text: 'Refunded.' })
      await admin.action(replyTo, { kind: 'inbound', id: row!.id, text: 'Refunded twice, sorry.' })
      const keys = sdk.reply.mock.calls.map(call => (call[1] as { idempotencyKey: string }).idempotencyKey)
      expect(keys[0]).toBe(keys[1])
      expect(keys[2]).not.toBe(keys[0])
      // A burst of ten, then the limit.
      for (let n = 3; n < 10; n++) await admin.action(replyTo, { kind: 'inbound', id: row!.id, text: `Reply ${n}` })
      expect(await refusalOf(admin.action(replyTo, { kind: 'inbound', id: row!.id, text: 'One more.' }))).toMatchObject({ code: 'rate_limited', data: { limit: 'admin' } })
      expect(sdk.reply).toHaveBeenCalledTimes(10)
    })

    test('does not reply to a row that is no thread of the inbox, and names the provider\'s refusal', async () => {
      await t.action(submit, { name: 'Mo', email: 'mo@example.com', message: 'Where do I find my invoices?' })
      const admin = await asUser(t, { role: 'admin' })
      const [row] = (await admin.query(inboxOf, {}))!.rows
      expect(await refusalOf(admin.action(replyTo, { kind: 'contact', id: row!.id, text: 'Hello' }))).toMatchObject({ code: 'invalid_input', data: { reason: 'no_thread' } })

      threadBody('Hi')
      readAs(PASS)
      await post('inbox.email.received', inboxEvent())
      const [thread] = (await admin.query(inboxOf, {}))!.rows.filter(entry => entry.kind === 'support')
      sdk.reply.mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'bad reply', statusCode: 422 } })
      expect(await refusalOf(admin.action(replyTo, { kind: 'inbound', id: thread!.id, text: 'Hello' }))).toMatchObject({ code: 'unavailable', data: { service: 'email', reason: 'provider_refused' } })
    })
  })
})

describe('email sync', () => {
  test('creates the missing inbox, completes the webhook\'s events and says what is left', async () => {
    sdk.domains.mockResolvedValue({ data: { data: [{ name: 'panels.example', status: 'verified', capabilities: { sending: 'enabled', receiving: 'disabled' } }] }, error: null })
    sdk.inboxGet.mockResolvedValue({ data: null, error: { name: 'not_found', message: 'no', statusCode: 404 } })
    sdk.inboxCreate.mockResolvedValue({ data: { id: 'inbox_1' }, error: null })
    sdk.webhooks.mockResolvedValue({ data: { data: [{ id: 'wh_1', endpoint: 'https://panels.convex.site/email/events', events: ['email.sent', 'email.received'] }] }, error: null })
    sdk.webhookUpdate.mockResolvedValue({ data: { id: 'wh_1' }, error: null })
    const report = await t.action(syncRef, {})
    expect(sdk.inboxCreate).toHaveBeenCalledWith({ emailAddress: 'support@panels.example', name: 'Support' })
    expect(sdk.webhookUpdate).toHaveBeenCalledWith('wh_1', { events: ['email.sent', 'email.received', 'inbox.email.received'] })
    expect(report).toMatchObject({ support: 'support@panels.example', inbox: 'created', domain: { name: 'panels.example', receiving: false }, webhook: { state: 'updated', id: 'wh_1', added: ['inbox.email.received'] } })
    expect(report.todo).toEqual([expect.stringContaining('Turn on receiving for panels.example')])
  })

  test('finds what is there and changes nothing', async () => {
    sdk.domains.mockResolvedValue({ data: { data: [{ name: 'panels.example', status: 'verified', capabilities: { sending: 'enabled', receiving: 'enabled' } }] }, error: null })
    sdk.inboxGet.mockResolvedValue({ data: { id: 'inbox_1' }, error: null })
    sdk.webhooks.mockResolvedValue({ data: { data: [{ id: 'wh_1', endpoint: 'https://panels.convex.site/email/events', events: ['email.received', 'inbox.email.received'] }] }, error: null })
    const report = await t.action(syncRef, {})
    expect(report).toMatchObject({ inbox: 'found', webhook: { state: 'ok', added: [] }, todo: [] })
    expect(sdk.inboxCreate).not.toHaveBeenCalled()
    expect(sdk.webhookUpdate).not.toHaveBeenCalled()
  })

  test('says the webhook is missing, and the domain is not held', async () => {
    sdk.domains.mockResolvedValue({ data: { data: [] }, error: null })
    sdk.inboxGet.mockResolvedValue({ data: null, error: { name: 'not_found', message: 'no', statusCode: 404 } })
    sdk.webhooks.mockResolvedValue({ data: { data: [] }, error: null })
    const report = await t.action(syncRef, {})
    expect(sdk.inboxCreate).not.toHaveBeenCalled()
    expect(report).toMatchObject({ inbox: null, domain: null, webhook: { state: 'missing', id: null } })
    expect(report.todo).toHaveLength(2)
  })
})

describe('what the component keeps', () => {
  let root: ReturnType<typeof convexTest>
  beforeEach(() => {
    root = convexTest(schema, component.modules)
    resendComponent.register(root, 'resend')
  })

  const message = (extra: Record<string, unknown> = {}) => ({
    emailId: 'em_1', route: 'support' as const, to: 'support@panels.example', from: 'steve@example.com', subject: 'Hi', attachments: [], receivedAt: NOW, threadId: 'th', inboxEmailId: 'em_1', ...extra,
  })

  test('stores a received email once for each recipient', async () => {
    const first = await root.mutation(api.inbound.recordInbound, { message: message() })
    expect(first).toMatchObject({ fresh: true, handled: false })
    expect(await root.mutation(api.inbound.recordInbound, { message: message() })).toEqual({ id: first.id, fresh: false, handled: false })
    expect(await root.mutation(api.inbound.recordInbound, { message: message({ to: 'other@panels.example' }) })).toMatchObject({ fresh: true })
    await root.mutation(api.inbound.markHandled, { id: first.id })
    expect(await root.mutation(api.inbound.recordInbound, { message: message() })).toEqual({ id: first.id, fresh: false, handled: true })
  })

  test('prunes messages after 90 days and reply addresses after a year', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    vi.setSystemTime(NOW)
    const old = await root.mutation(api.inbound.storeContact, { name: 'Mo', email: 'mo@example.com', message: 'An old message to the team.' })
    await root.mutation(api.inbound.recordInbound, { message: message({ receivedAt: NOW }) })
    await root.mutation(api.inbound.replyToken, { userId: 'u1', thread: 't1' })
    vi.setSystemTime(NOW + INBOUND_RETENTION_MS + 1000)
    const fresh = await root.mutation(api.inbound.storeContact, { name: 'Bo', email: 'bo@example.com', message: 'A message from today.' })
    await root.mutation(internal.maintenance.run, {})
    await root.finishAllScheduledFunctions(() => vi.runAllTimers())
    const contacts = await root.run(ctx => ctx.db.query('contactMessages').collect())
    expect(contacts.map(row => row.ref)).toEqual([fresh.ref])
    expect(contacts.map(row => row.ref)).not.toContain(old.ref)
    expect(await root.run(ctx => ctx.db.query('inboundMessages').collect())).toEqual([])
    // A reply address outlives the messages it brought.
    expect(await root.run(ctx => ctx.db.query('replyAddresses').collect())).toHaveLength(1)
    vi.setSystemTime(NOW + 366 * 24 * 60 * 60 * 1000)
    await root.mutation(internal.maintenance.run, {})
    await root.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await root.run(ctx => ctx.db.query('replyAddresses').collect())).toEqual([])
    vi.useRealTimers()
  })

  test('exports and erases a sender of many long messages within a transaction\'s limits', async () => {
    const limited = convexTest({ schema, modules: component.modules, transactionLimits: true })
    resendComponent.register(limited, 'resend')
    vi.spyOn(console, 'info').mockImplementation(() => {})
    // 300 replies of 20,000 three-byte characters: about 18 MB, more than one transaction may read.
    const text = 'あ'.repeat(20_000)
    const userId = await limited.run(ctx => ctx.db.insert('user', { name: 'Ana', email: 'ana@example.com', emailVerified: true, createdAt: NOW, updatedAt: NOW }))
    for (let part = 0; part < 6; part++) {
      await limited.run(async (ctx) => {
        for (let n = 0; n < 50; n++) {
          await ctx.db.insert('inboundMessages', { emailId: `em_${part}_${n}`, route: 'reply', to: 'reply-aaaaaaaaaaaaaaaa@in.panels.example', from: 'ana@example.com', subject: 'Re: a comment', text, attachments: [], receivedAt: NOW + part * 50 + n, userId, thread: 'strip:1' })
        }
      })
    }
    const exported = await limited.query(api.account.exportData, { userId }) as { inboundMessages: Array<{ receivedAt: number }> }
    expect(exported.inboundMessages.length).toBeGreaterThan(0)
    expect(exported.inboundMessages[0]!.receivedAt).toBe(NOW + 299)
    await limited.mutation(api.account.forget, { userId })
    await limited.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await limited.run(ctx => ctx.db.query('inboundMessages').collect())).toEqual([])
    expect(await limited.run(ctx => ctx.db.query('accountErasures').collect())).toEqual([])
  }, 120_000)

  test('keeps a reply address a year after the last email it went out in', async () => {
    const day = 24 * 60 * 60 * 1000
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    vi.setSystemTime(NOW)
    const token = await root.mutation(api.inbound.replyToken, { userId: 'u1', thread: 't1' })
    // Handed out again for a new email on day 364, it still takes the reply two days later.
    vi.setSystemTime(NOW + 364 * day)
    expect(await root.mutation(api.inbound.replyToken, { userId: 'u1', thread: 't1' })).toBe(token)
    vi.setSystemTime(NOW + 366 * day)
    await root.mutation(internal.maintenance.run, {})
    await root.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await root.query(api.inbound.replyOf, { token })).toEqual({ userId: 'u1', thread: 't1' })
    vi.useRealTimers()
  })
})
