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
const component = { backend: { email: refs } } as unknown as EmailComponents

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
    expect(ctx.runMutation).toHaveBeenCalledWith(refs.send, options)
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

  it('cleanup names the missing component function on an older component build', async () => {
    const { cleanup: _cleanup, cleanupAbandoned: _abandoned, ...older } = refs
    const email = setupEmail({ backend: { email: older } } as unknown as EmailComponents)
    await expect(email.cleanup(makeCtx())).rejects.toThrow('components.backend.email.cleanup is missing')
    await expect(email.cleanupAbandoned(makeCtx())).rejects.toThrow('components.backend.email.cleanupAbandoned is missing')
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

  it('throws a namespaced error when the SDK returns an error', async () => {
    sdk.segments.create.mockResolvedValue({ data: null, error: { message: 'rate limited' } })
    const email = setupEmail(component)

    await expect(email.segments.create({ name: 'x' })).rejects.toThrow('[nuxt-backend] Resend: rate limited')
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
