import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Resend } from 'resend'
import { setupEmail } from '../../src/convex/integrations/email'
import type { EmailComponentApi } from '../../src/convex/integrations/email'

// Mock the marketing Resend SDK. The factory's audience/contact/broadcast
// objects are stable across `new Resend()` calls, so `new Resend().audiences.*`
// in a test is the very spy the helper invokes internally.
vi.mock('resend', () => {
  const audiences = { create: vi.fn(), list: vi.fn(), remove: vi.fn() }
  const contacts = { create: vi.fn(), list: vi.fn(), update: vi.fn(), remove: vi.fn() }
  const broadcasts = { create: vi.fn(), send: vi.fn() }
  class Resend {
    audiences = audiences
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
  handleWebhook: 'ref:handleWebhook',
}
const component = { email: refs } as unknown as EmailComponentApi

function makeCtx() {
  return {
    runMutation: vi.fn(),
    runQuery: vi.fn(),
    runAction: vi.fn(),
  }
}

// The shared marketing SDK instance (same object every `new Resend()`).
type MarketingSdk = {
  audiences: { create: ReturnType<typeof vi.fn>, list: ReturnType<typeof vi.fn>, remove: ReturnType<typeof vi.fn> }
  contacts: { create: ReturnType<typeof vi.fn>, list: ReturnType<typeof vi.fn>, update: ReturnType<typeof vi.fn>, remove: ReturnType<typeof vi.fn> }
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

  it('webhookHandler forwards body + headers and returns the action response', async () => {
    const ctx = makeCtx()
    ctx.runAction.mockResolvedValue({ status: 200, body: 'ok' })
    const email = setupEmail(component)
    const request = new Request('https://app.test/resend-webhook', {
      method: 'POST',
      body: '{"type":"email.delivered"}',
      headers: { 'svix-id': 'msg_1', 'content-type': 'application/json' },
    })

    const res = await email.webhookHandler(ctx, request)

    expect(res).toBeInstanceOf(Response)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
    expect(ctx.runAction).toHaveBeenCalledWith(
      refs.handleWebhook,
      expect.objectContaining({
        body: '{"type":"email.delivered"}',
        headers: expect.objectContaining({ 'svix-id': 'msg_1' }),
      }),
    )
  })

  it('webhookHandler returns an empty body when the action body is empty', async () => {
    const ctx = makeCtx()
    ctx.runAction.mockResolvedValue({ status: 400, body: '' })
    const email = setupEmail(component)
    const request = new Request('https://app.test/resend-webhook', { method: 'POST', body: 'x' })

    const res = await email.webhookHandler(ctx, request)
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('')
  })

  it('exposes the reactive getEmailStatus query', () => {
    const email = setupEmail(component)
    expect(email.api.getEmailStatus).toBeDefined()
  })
})

describe('setupEmail marketing helpers', () => {
  it('audiences create/list/remove call the Resend SDK and unwrap data', async () => {
    sdk.audiences.create.mockResolvedValue({ data: { id: 'aud_1' }, error: null })
    sdk.audiences.list.mockResolvedValue({ data: [{ id: 'aud_1' }], error: null })
    sdk.audiences.remove.mockResolvedValue({ data: { id: 'aud_1', deleted: true }, error: null })
    const email = setupEmail(component)

    expect(await email.audiences.create({ name: 'Newsletter' })).toStrictEqual({ id: 'aud_1' })
    expect(sdk.audiences.create).toHaveBeenCalledWith({ name: 'Newsletter' })
    expect(await email.audiences.list()).toStrictEqual([{ id: 'aud_1' }])
    expect(await email.audiences.remove('aud_1')).toStrictEqual({ id: 'aud_1', deleted: true })
    expect(sdk.audiences.remove).toHaveBeenCalledWith('aud_1')
  })

  it('contacts add/list/update/remove proxy to the SDK', async () => {
    sdk.contacts.create.mockResolvedValue({ data: { id: 'c1' }, error: null })
    sdk.contacts.list.mockResolvedValue({ data: [], error: null })
    sdk.contacts.update.mockResolvedValue({ data: { id: 'c1' }, error: null })
    sdk.contacts.remove.mockResolvedValue({ data: { id: 'c1', deleted: true }, error: null })
    const email = setupEmail(component)

    await email.contacts.add({ email: 'a@b.com', audienceId: 'aud_1' })
    expect(sdk.contacts.create).toHaveBeenCalledWith({ email: 'a@b.com', audienceId: 'aud_1' })
    await email.contacts.list({ audienceId: 'aud_1' })
    expect(sdk.contacts.list).toHaveBeenCalledWith({ audienceId: 'aud_1' })
    await email.contacts.update({ id: 'c1', audienceId: 'aud_1', unsubscribed: true })
    expect(sdk.contacts.update).toHaveBeenCalled()
    await email.contacts.remove({ id: 'c1', audienceId: 'aud_1' })
    expect(sdk.contacts.remove).toHaveBeenCalled()
  })

  it('broadcasts create/send proxy to the SDK', async () => {
    sdk.broadcasts.create.mockResolvedValue({ data: { id: 'b1' }, error: null })
    sdk.broadcasts.send.mockResolvedValue({ data: { id: 'b1' }, error: null })
    const email = setupEmail(component)

    // Cast: the SDK's CreateBroadcastOptions requires render fields we don't exercise here.
    await email.broadcasts.create({ audienceId: 'aud_1', from: 'x@y.com', subject: 'Hi' } as never)
    expect(sdk.broadcasts.create).toHaveBeenCalled()
    await email.broadcasts.send('b1', { scheduledAt: 'in 1 hour' })
    expect(sdk.broadcasts.send).toHaveBeenCalledWith('b1', { scheduledAt: 'in 1 hour' })
  })

  it('throws a namespaced error when the SDK returns an error', async () => {
    sdk.audiences.create.mockResolvedValue({ data: null, error: { message: 'rate limited' } })
    const email = setupEmail(component)

    await expect(email.audiences.create({ name: 'x' })).rejects.toThrow('[nuxt-backend] Resend: rate limited')
  })
})
