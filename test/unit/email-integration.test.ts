import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Resend } from 'resend'
import { setupEmail } from '../../src/convex/integrations/email'
import type { EmailComponents } from '../../src/convex/integrations/email'

// Mock the marketing Resend SDK. The factory's segment/contact/broadcast
// objects are stable across `new Resend()` calls, so `new Resend().segments.*`
// in a test is the very spy the helper invokes internally.
vi.mock('resend', () => {
  const segments = { create: vi.fn(), list: vi.fn(), remove: vi.fn() }
  const contacts = { create: vi.fn(), list: vi.fn(), update: vi.fn(), remove: vi.fn(), segments: { add: vi.fn(), remove: vi.fn() } }
  const broadcasts = { create: vi.fn(), send: vi.fn() }
  class Resend {
    segments = segments
    contacts = contacts
    broadcasts = broadcasts
  }
  return { Resend }
})

const refs = {
  send: 'ref:send',
  status: 'ref:status',
  get: 'ref:get',
  cancel: 'ref:cancel',
  cleanup: 'ref:cleanup',
  cleanupAbandoned: 'ref:cleanupAbandoned',
  handleWebhook: 'ref:handleWebhook',
}
// Every delivery goes through the webhook log, so the component carries it.
const webhooks = { record: 'ref:webhooks.record', find: 'ref:webhooks.find', listRecent: 'ref:webhooks.listRecent' }
const component = { backend: { email: refs, webhooks } } as unknown as EmailComponents

// The guarded webhook edge fails closed (503) without a configured secret.
beforeEach(() => {
  process.env.EMAIL_WEBHOOK_SECRET = 'whsec_test'
})
afterEach(() => {
  delete process.env.EMAIL_WEBHOOK_SECRET
})

function makeCtx() {
  return {
    runMutation: vi.fn(),
    runQuery: vi.fn(),
    runAction: vi.fn(),
  }
}

// The shared marketing SDK instance (same object every `new Resend()`).
type MarketingSdk = {
  segments: { create: ReturnType<typeof vi.fn>, list: ReturnType<typeof vi.fn>, remove: ReturnType<typeof vi.fn> }
  contacts: {
    create: ReturnType<typeof vi.fn>
    list: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
    segments: { add: ReturnType<typeof vi.fn>, remove: ReturnType<typeof vi.fn> }
  }
  broadcasts: { create: ReturnType<typeof vi.fn>, send: ReturnType<typeof vi.fn> }
}
const sdk = new (Resend as unknown as new () => MarketingSdk)()

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('setupEmail transactional helpers', () => {
  it('send forwards options to the component send mutation', async () => {
    const ctx = makeCtx()
    ctx.runMutation.mockResolvedValue('em_1')
    const email = setupEmail(component)
    const options = { to: 'a@b.com', subject: 'Hi', html: '<p>hi</p>' }

    expect(await email.send(ctx, options)).toBe('em_1')
    // With the app's retention, `{}` for the defaults.
    expect(ctx.runMutation).toHaveBeenCalledWith(refs.send, { ...options, retention: {} })
  })

  it('status queries the component for a delivery record', async () => {
    const ctx = makeCtx()
    ctx.runQuery.mockResolvedValue({ status: 'delivered' })
    const email = setupEmail(component)

    expect(await email.status(ctx, 'em_1')).toStrictEqual({ status: 'delivered' })
    expect(ctx.runQuery).toHaveBeenCalledWith(refs.status, { emailId: 'em_1' })
  })

  it('cancel runs the component cancel mutation', async () => {
    const ctx = makeCtx()
    ctx.runMutation.mockResolvedValue(null)
    const email = setupEmail(component)

    await email.cancel(ctx, 'em_1')
    expect(ctx.runMutation).toHaveBeenCalledWith(refs.cancel, { emailId: 'em_1' })
  })

  it('cleanup / cleanupAbandoned schedule the component pruning with the retention window', async () => {
    const email = setupEmail(component)
    const ctx = makeCtx()
    await email.cleanup(ctx, { olderThanMs: 1_000 })
    await email.cleanupAbandoned(ctx)
    expect(ctx.runMutation).toHaveBeenNthCalledWith(1, 'ref:cleanup', { olderThanMs: 1_000 })
    expect(ctx.runMutation).toHaveBeenNthCalledWith(2, 'ref:cleanupAbandoned', {})
  })

  it('webhookHandler forwards body + headers and passes the verified response through', async () => {
    const ctx = makeCtx()
    ctx.runAction.mockResolvedValue({ status: 202, body: '', type: 'email.delivered' })
    const email = setupEmail(component)
    const request = new Request('https://app.test/resend-webhook', {
      method: 'POST',
      body: '{"type":"email.delivered"}',
      headers: { 'svix-id': 'msg_1', 'content-type': 'application/json' },
    })

    const res = await email.webhookHandler(ctx, request)

    expect(res).toBeInstanceOf(Response)
    expect(res.status).toBe(202)
    expect(ctx.runAction).toHaveBeenCalledWith(
      refs.handleWebhook,
      expect.objectContaining({
        body: '{"type":"email.delivered"}',
        headers: expect.objectContaining({ 'svix-id': 'msg_1' }),
      }),
    )
  })

  it('webhookHandler fails closed with 503 while the secret env is unset', async () => {
    delete process.env.EMAIL_WEBHOOK_SECRET
    const ctx = makeCtx()
    const email = setupEmail(component)

    const res = await email.webhookHandler(ctx, new Request('https://app.test/x', { method: 'POST', body: 'x' }))
    expect(res.status).toBe(503)
    expect(ctx.runAction).not.toHaveBeenCalled()
  })

  it('webhookHandler passes non-2xx component responses through (bad signature = 403)', async () => {
    const ctx = makeCtx()
    ctx.runAction.mockResolvedValue({ status: 403, body: 'Invalid signature' })
    const email = setupEmail(component)
    const request = new Request('https://app.test/resend-webhook', { method: 'POST', body: 'x' })

    const res = await email.webhookHandler(ctx, request)
    expect(res.status).toBe(403)
  })

  it('exposes the reactive getEmailStatus query', () => {
    const email = setupEmail(component)
    expect(email.api.getEmailStatus).toBeDefined()
  })

  describe('getSandboxInbox', () => {
    const invoke = (fn: unknown, ctx: unknown, args: unknown) =>
      (fn as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler(ctx, args)
    const messages = [{ from: 'onboarding@resend.dev', subject: 'Code', text: '123456', receivedAt: 1 }]
    const read = async () => {
      const ctx = { runAction: vi.fn(async () => messages) }
      const withInbox = setupEmail({ backend: { email: { ...refs, inbox: 'ref:inbox' } } } as unknown as EmailComponents)
      return { ctx, answer: await invoke(withInbox.api.getSandboxInbox, ctx, { address: 'delivered+a@resend.dev' }) }
    }
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('reads the dev inbox through the component\'s action once the deployment opts in outside production', async () => {
      vi.stubEnv('BACKEND_ENVIRONMENT', 'development')
      vi.stubEnv('EMAIL_DEV_INBOX', '1')
      const { ctx, answer } = await read()
      expect(answer).toEqual(messages)
      expect(ctx.runAction).toHaveBeenCalledWith('ref:inbox', { address: 'delivered+a@resend.dev' })
    })

    /** A read through an app whose auth adapter answers `account` for the address asked about. */
    const readAs = async (account: Record<string, unknown> | null, address = ' Delivered+Root@resend.dev ', options: Parameters<typeof setupEmail>[1] = {}) => {
      const ctx = { runAction: vi.fn(async () => messages), runQuery: vi.fn(async () => account) }
      const withInbox = setupEmail({ backend: { email: { ...refs, inbox: 'ref:inbox' }, adapter: { findOne: 'ref:findOne' } } } as unknown as EmailComponents, options)
      return { ctx, answer: await invoke(withInbox.api.getSandboxInbox, ctx, { address }) }
    }

    it.each([
      ['an administrator', { _id: 'u1', role: 'admin' }, {}],
      ['an administrator among several roles', { _id: 'u1', role: 'user,admin' }, {}],
      ['an app role named an admin role', { _id: 'u1', role: 'support' }, { adminRoles: ['support'] }],
      ['an administrator named by id', { _id: 'u1', role: 'user' }, { adminUserIds: ['u1'] }],
      ['a passkey-only account', { _id: 'u1', role: 'user', passkeyOnly: true }, {}],
    ])('shows no mail for %s, never asking the provider', async (_label, account, options) => {
      vi.stubEnv('BACKEND_ENVIRONMENT', 'sandbox')
      vi.stubEnv('EMAIL_DEV_INBOX', '1')
      const { ctx, answer } = await readAs(account, undefined, options as never)
      expect(answer).toEqual([])
      expect(ctx.runAction).not.toHaveBeenCalled()
      // The account is found by the address as Better Auth stores it.
      expect(ctx.runQuery).toHaveBeenCalledWith('ref:findOne', { model: 'user', where: [{ field: 'email', value: 'delivered+root@resend.dev' }] })
    })

    it.each([
      ['a test account', { _id: 'u2', role: 'user', passkeyOnly: false }],
      ['an address with no account yet', null],
    ])('shows the mail of %s', async (_label, account) => {
      vi.stubEnv('BACKEND_ENVIRONMENT', 'sandbox')
      vi.stubEnv('EMAIL_DEV_INBOX', '1')
      const { answer } = await readAs(account)
      expect(answer).toEqual(messages)
    })

    it.each([
      ['without the opt-in', 'sandbox', undefined],
      ['with another value', 'development', 'true'],
      ['on production', 'production', '1'],
      ['on a deployment that does not say what it is', undefined, '1'],
    ])('answers nothing %s, never asking the provider', async (_label, environment, flag) => {
      vi.stubEnv('BACKEND_ENVIRONMENT', environment)
      vi.stubEnv('EMAIL_DEV_INBOX', flag)
      const { ctx, answer } = await read()
      expect(answer).toEqual([])
      expect(ctx.runAction).not.toHaveBeenCalled()
    })
  })
})

describe('setupEmail marketing helpers', () => {
  it('segments create/list/remove call the Resend SDK and unwrap data', async () => {
    sdk.segments.create.mockResolvedValue({ data: { id: 'seg_1' }, error: null })
    sdk.segments.list.mockResolvedValue({ data: { object: 'list', data: [{ id: 'seg_1', name: 'Newsletter' }], has_more: false }, error: null })
    sdk.segments.remove.mockResolvedValue({ data: { id: 'seg_1', deleted: true }, error: null })
    const email = setupEmail(component)

    expect(await email.segments.create({ name: 'Newsletter' })).toStrictEqual({ id: 'seg_1' })
    expect(sdk.segments.create).toHaveBeenCalledWith({ name: 'Newsletter' })
    expect(await email.segments.list()).toStrictEqual({ object: 'list', data: [{ id: 'seg_1', name: 'Newsletter' }], has_more: false })
    expect(await email.segments.remove('seg_1')).toStrictEqual({ id: 'seg_1', deleted: true })
    expect(sdk.segments.remove).toHaveBeenCalledWith('seg_1')
  })

  it('segments addContact/removeContact move an existing contact in and out', async () => {
    sdk.contacts.segments.add.mockResolvedValue({ data: { id: 'seg_1' }, error: null })
    sdk.contacts.segments.remove.mockResolvedValue({ data: { id: 'seg_1', deleted: true }, error: null })
    const email = setupEmail(component)

    expect(await email.segments.addContact({ email: 'a@b.com', segmentId: 'seg_1' })).toStrictEqual({ id: 'seg_1' })
    expect(sdk.contacts.segments.add).toHaveBeenCalledWith({ email: 'a@b.com', segmentId: 'seg_1' })
    await email.segments.removeContact({ contactId: 'c1', segmentId: 'seg_1' })
    expect(sdk.contacts.segments.remove).toHaveBeenCalledWith({ contactId: 'c1', segmentId: 'seg_1' })
  })

  it('contacts add/list/update/remove proxy to the SDK', async () => {
    sdk.contacts.create.mockResolvedValue({ data: { id: 'c1' }, error: null })
    sdk.contacts.list.mockResolvedValue({ data: [], error: null })
    sdk.contacts.update.mockResolvedValue({ data: { id: 'c1' }, error: null })
    sdk.contacts.remove.mockResolvedValue({ data: { id: 'c1', deleted: true }, error: null })
    const email = setupEmail(component)

    await email.contacts.add({ email: 'a@b.com', segments: [{ id: 'seg_1' }] })
    expect(sdk.contacts.create).toHaveBeenCalledWith({ email: 'a@b.com', segments: [{ id: 'seg_1' }] })
    await email.contacts.list({ segmentId: 'seg_1' })
    expect(sdk.contacts.list).toHaveBeenCalledWith({ segmentId: 'seg_1' })
    await email.contacts.update({ id: 'c1', unsubscribed: true })
    expect(sdk.contacts.update).toHaveBeenCalled()
    await email.contacts.remove('c1')
    expect(sdk.contacts.remove).toHaveBeenCalled()
  })

  it('broadcasts create/send proxy to the SDK', async () => {
    sdk.broadcasts.create.mockResolvedValue({ data: { id: 'b1' }, error: null })
    sdk.broadcasts.send.mockResolvedValue({ data: { id: 'b1' }, error: null })
    const email = setupEmail(component)

    // Cast: the SDK's CreateBroadcastOptions requires render fields we don't exercise here.
    await email.broadcasts.create({ segmentId: 'seg_1', from: 'x@y.com', subject: 'Hi' } as never)
    expect(sdk.broadcasts.create).toHaveBeenCalled()
    await email.broadcasts.send('b1', { scheduledAt: 'in 1 hour' })
    expect(sdk.broadcasts.send).toHaveBeenCalledWith('b1', { scheduledAt: 'in 1 hour' })
  })

  it('sends a broadcast from the marketing sender, else the transactional one, unless it names its own', async () => {
    sdk.broadcasts.create.mockResolvedValue({ data: { id: 'b1' }, error: null })
    const email = setupEmail(component)
    const sender = async (payload: Record<string, unknown> = {}) => {
      sdk.broadcasts.create.mockClear()
      await email.broadcasts.create({ segmentId: 'seg_1', subject: 'Hi', ...payload } as never)
      return (sdk.broadcasts.create.mock.calls[0]![0] as { from: string }).from
    }
    vi.stubEnv('EMAIL_FROM', 'Acme <hello@mail.acme.com>')
    vi.stubEnv('EMAIL_MARKETING_FROM', 'Acme News <news@news.acme.com>')
    expect(await sender()).toBe('Acme News <news@news.acme.com>')
    expect(await sender({ from: 'ceo@acme.com' })).toBe('ceo@acme.com')
    vi.stubEnv('EMAIL_MARKETING_FROM', '')
    expect(await sender()).toBe('Acme <hello@mail.acme.com>')
    vi.stubEnv('EMAIL_FROM', '')
    expect(await sender()).toBe('onboarding@resend.dev')
    vi.unstubAllEnvs()
  })

  it('throws a namespaced error when the SDK returns an error', async () => {
    sdk.segments.create.mockResolvedValue({ data: null, error: { message: 'rate limited' } })
    const email = setupEmail(component)

    const refusal = email.segments.create({ name: 'x' })
    await expect(refusal).rejects.toThrow('[nuxt-backend] Resend: rate limited')
    // The provider's words stay in the message, for the log; the client reads the code.
    await expect(refusal).rejects.toMatchObject({ data: { code: 'unavailable', service: 'email', reason: 'provider_refused' } })
  })
})

describe('email event hooks', () => {
  function webhookRequest(payload: unknown) {
    return new Request('https://x.convex.site/resend-webhook', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  it('runs the matching typed handler after the component verifies the event', async () => {
    const onBounced = vi.fn()
    const email = setupEmail(component, { events: { 'email.bounced': onBounced } })
    const ctx = makeCtx()
    ctx.runAction.mockResolvedValue({ status: 202, body: '', type: 'email.bounced' })

    await email.webhookHandler(ctx as never, webhookRequest({
      type: 'email.bounced',
      data: { email_id: 'em_1', to: ['bounced@resend.dev'] },
    }))

    expect(onBounced).toHaveBeenCalledWith(ctx, expect.objectContaining({
      type: 'email.bounced',
      data: expect.objectContaining({ email_id: 'em_1', to: ['bounced@resend.dev'] }),
    }))
  })

  it('dispatches contact events to their typed handlers too', async () => {
    const onContact = vi.fn()
    const email = setupEmail(component, { events: { 'contact.created': onContact } })
    const ctx = makeCtx()
    ctx.runAction.mockResolvedValue({ status: 202, body: '', type: 'contact.created' })

    await email.webhookHandler(ctx as never, webhookRequest({
      type: 'contact.created',
      data: { id: 'c_1', email: 'a@b.co' },
    }))

    expect(onContact).toHaveBeenCalledWith(ctx, expect.objectContaining({ type: 'contact.created' }))
  })

  it('acknowledges verified-but-unknown types with 202 and the onUnknownEvent hook', async () => {
    const onUnknownEvent = vi.fn()
    const email = setupEmail(component, { onUnknownEvent })
    const ctx = makeCtx()
    ctx.runAction.mockResolvedValue({ status: 202, body: '', type: 'email.some_future_thing' })

    const res = await email.webhookHandler(ctx as never, webhookRequest({ type: 'email.some_future_thing' }))

    expect(res.status).toBe(202)
    expect(onUnknownEvent).toHaveBeenCalledWith(ctx, expect.objectContaining({ type: 'email.some_future_thing' }))
  })

  it('does not run handlers when the component rejects the event (bad signature)', async () => {
    const onDelivered = vi.fn()
    const email = setupEmail(component, { events: { 'email.delivered': onDelivered } })
    const ctx = makeCtx()
    ctx.runAction.mockResolvedValue({ status: 403, body: 'invalid signature' })

    await email.webhookHandler(ctx as never, webhookRequest({ type: 'email.delivered', data: {} }))

    expect(onDelivered).toHaveBeenCalledTimes(0)
  })

  it('ignores event types without a configured hook and malformed bodies', async () => {
    const onComplained = vi.fn()
    const email = setupEmail(component, { events: { 'email.complained': onComplained } })
    const ctx = makeCtx()
    ctx.runAction.mockResolvedValue({ status: 202, body: '', type: 'email.opened' })

    await email.webhookHandler(ctx as never, webhookRequest({ type: 'email.opened', data: {} }))

    expect(onComplained).not.toHaveBeenCalled()
  })
})
