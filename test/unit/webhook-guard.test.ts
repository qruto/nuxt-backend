import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { setupEmail, type Email, type EmailComponents, type EmailWebhookEvent } from '../../src/convex/integrations/email'
import {
  guardDelivery,
  parseSecretList,
  WEBHOOK_BODY_LIMIT,
  type WebhookLogRefs,
  type WebhookOutcome,
} from '../../src/convex/integrations/webhook-guard'

// Pins the fail-closed status table documented in webhook-guard.ts:
//
// | condition                     | status | outcome           |
// | secret env missing/empty      | 503    | missing_secret    |
// | invalid/stale signature       | 403    | invalid_signature |
// | body over the cap             | 413    | oversized         |
// | authentic, type unknown       | 202    | unknown_type      |
// | handler threw                 | 500    | handler_error     |
// | duplicate of a successful one | 200    | duplicate         |
//
// The guard itself owns the 503 / 413 / 200 rows; the 403 / 202 / 500 rows are
// produced by the routes built on it, exercised here through `setupEmail`'s
// `/email/events` handler with the component call faked.

const refs = {
  record: 'ref:webhooks.record',
  find: 'ref:webhooks.find',
  listRecent: 'ref:webhooks.listRecent',
} as unknown as WebhookLogRefs

type RunCall = (ref: unknown, args: unknown) => Promise<unknown>
type Ctx = {
  runQuery: Mock<RunCall>
  runMutation: Mock<RunCall>
  runAction: Mock<RunCall>
}

function makeCtx(prior: { outcome: WebhookOutcome, receivedAt: number } | null = null): Ctx {
  return {
    runQuery: vi.fn<RunCall>(async () => prior),
    runMutation: vi.fn<RunCall>(async () => null),
    runAction: vi.fn<RunCall>(),
  }
}

/** The fake is structurally what the route needs; only the nominal generic signatures differ. */
type HandlerCtx = Parameters<Email['webhookHandler']>[0]
const asCtx = (ctx: Ctx) => ctx as unknown as HandlerCtx

/** Every outcome written to the delivery log, in order. */
function recorded(ctx: Ctx) {
  return ctx.runMutation.mock.calls
    .filter(([ref]) => ref === refs.record)
    .map(([, args]) => args as { service: string, deliveryId: string, outcome: WebhookOutcome, type?: string, note?: string })
}

let serviceCounter = 0
/** A fresh service name per test — the missing-secret warning is deduped per service for the process lifetime. */
function service() {
  serviceCounter += 1
  return `svc-${serviceCounter}`
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseSecretList', () => {
  it('accepts a comma-separated rotation list, trimming blanks', () => {
    expect(parseSecretList(undefined)).toStrictEqual([])
    expect(parseSecretList('')).toStrictEqual([])
    expect(parseSecretList(' , ')).toStrictEqual([])
    expect(parseSecretList('whsec_new, whsec_old,,')).toStrictEqual(['whsec_new', 'whsec_old'])
  })
})

describe('guardDelivery — the rows the guard owns', () => {
  it('missing secret → 503 + missing_secret, without consulting the log or the body cap', async () => {
    const ctx = makeCtx()
    const name = service()

    const guard = await guardDelivery(ctx, refs, {
      service: name, deliveryId: 'd1', bodyLength: WEBHOOK_BODY_LIMIT + 1, secretsConfigured: false,
    })

    expect(guard.rejection?.status).toBe(503)
    expect(await guard.rejection?.text()).toBe('Webhook secret not configured')
    expect(recorded(ctx)).toStrictEqual([{ service: name, deliveryId: 'd1', type: undefined, outcome: 'missing_secret', note: undefined }])
    expect(ctx.runQuery).not.toHaveBeenCalled()
  })

  it('warns about the unconfigured secret once per service, naming the route', async () => {
    const name = service()
    const input = { service: name, deliveryId: 'd1', bodyLength: 1, secretsConfigured: false }

    await guardDelivery(makeCtx(), refs, input)
    await guardDelivery(makeCtx(), refs, input)

    const warnings = (console.warn as Mock<typeof console.warn>).mock.calls.map(([message]) => String(message))
    expect(warnings.filter(message => message.includes(`/${name}/events`))).toHaveLength(1)
    expect(warnings[0]).toContain('503')
  })

  it('oversized body → 413 + oversized; a body exactly at the cap passes', async () => {
    const ctx = makeCtx()
    const name = service()

    const over = await guardDelivery(ctx, refs, { service: name, deliveryId: 'd1', bodyLength: WEBHOOK_BODY_LIMIT + 1, secretsConfigured: true })
    expect(over.rejection?.status).toBe(413)
    expect(await over.rejection?.text()).toBe('Payload too large')
    expect(recorded(ctx).map(row => row.outcome)).toStrictEqual(['oversized'])
    expect(ctx.runQuery).not.toHaveBeenCalled()

    const atCap = await guardDelivery(makeCtx(), refs, { service: name, deliveryId: 'd1', bodyLength: WEBHOOK_BODY_LIMIT, secretsConfigured: true })
    expect(atCap.rejection).toBeNull()
  })

  it('a redelivery of a fully-processed id → 200 + duplicate, without running anything', async () => {
    const ctx = makeCtx({ outcome: 'ok', receivedAt: 1 })
    const name = service()

    const guard = await guardDelivery(ctx, refs, { service: name, deliveryId: 'd1', bodyLength: 1, secretsConfigured: true })

    expect(guard.rejection?.status).toBe(200)
    expect(await guard.rejection?.text()).toBe('Already processed')
    expect(ctx.runQuery).toHaveBeenCalledWith(refs.find, { service: name, deliveryId: 'd1' })
    expect(recorded(ctx).map(row => row.outcome)).toStrictEqual(['duplicate'])
  })

  it.each<WebhookOutcome>(['handler_error', 'invalid_signature', 'unknown_type', 'oversized', 'missing_secret'])(
    'a prior %s outcome does not dedupe — the provider retry runs',
    async (outcome) => {
      const guard = await guardDelivery(makeCtx({ outcome, receivedAt: 1 }), refs, {
        service: service(), deliveryId: 'd1', bodyLength: 1, secretsConfigured: true,
      })
      expect(guard.rejection).toBeNull()
    },
  )

  it('a delivery without a provider id skips dedupe and gets a synthetic id', async () => {
    const ctx = makeCtx()

    const guard = await guardDelivery(ctx, refs, { service: service(), deliveryId: null, bodyLength: 1, secretsConfigured: true })

    expect(guard.rejection).toBeNull()
    expect(guard.deliveryId).toMatch(/^none:\d+$/)
    expect(ctx.runQuery).not.toHaveBeenCalled()
  })

  it('record forwards type + note under the delivery id, and never throws', async () => {
    const ctx = makeCtx()
    const name = service()
    const guard = await guardDelivery(ctx, refs, { service: name, deliveryId: 'd1', bodyLength: 1, secretsConfigured: true })

    await guard.record('ok', { type: 'order.paid' })
    await guard.record('handler_error', { type: 'order.paid', note: 'boom' })
    expect(recorded(ctx)).toStrictEqual([
      { service: name, deliveryId: 'd1', type: 'order.paid', outcome: 'ok', note: undefined },
      { service: name, deliveryId: 'd1', type: 'order.paid', outcome: 'handler_error', note: 'boom' },
    ])

    ctx.runMutation.mockRejectedValueOnce(new Error('log table unavailable'))
    await expect(guard.record('ok')).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(name), expect.any(Error))
  })
})

describe('/email/events on the guard — the rows the route owns', () => {
  const components = { backend: { email: {
    send: 'ref:email.send',
    status: 'ref:email.status',
    get: 'ref:email.get',
    cancel: 'ref:email.cancel',
    handleWebhook: 'ref:email.handleWebhook',
  }, webhooks: refs } } as unknown as EmailComponents

  const request = (body: string, headers: Record<string, string> = { 'svix-id': 'msg_1' }) =>
    new Request('https://site.test/email/events', { method: 'POST', body, headers })

  beforeEach(() => {
    process.env.EMAIL_WEBHOOK_SECRET = 'whsec_test'
  })

  afterEach(() => {
    delete process.env.EMAIL_WEBHOOK_SECRET
  })

  it('invalid signature (component answered 403) → 403 + invalid_signature', async () => {
    const ctx = makeCtx()
    ctx.runAction.mockResolvedValue({ status: 403, body: 'Invalid signature' })

    const response = await setupEmail(components).webhookHandler(asCtx(ctx), request('{}'))

    expect(response.status).toBe(403)
    expect(await response.text()).toBe('Invalid signature')
    expect(recorded(ctx)).toStrictEqual([{ service: 'email', deliveryId: 'msg_1', type: undefined, outcome: 'invalid_signature', note: undefined }])
  })

  it('authentic, unknown type → 202 + unknown_type, via the onUnknownEvent hook', async () => {
    const ctx = makeCtx()
    ctx.runAction.mockResolvedValue({ status: 202, body: '', type: 'mystery.event' })
    const onUnknownEvent = vi.fn(async () => {})

    const response = await setupEmail(components, { onUnknownEvent }).webhookHandler(asCtx(ctx), request('{"type":"mystery.event"}'))

    expect(response.status).toBe(202)
    expect(await response.text()).toBe('Accepted (unknown event type)')
    expect(onUnknownEvent).toHaveBeenCalledWith(ctx, { type: 'mystery.event', payload: { type: 'mystery.event' } })
    expect(recorded(ctx).map(row => [row.outcome, row.type])).toStrictEqual([['unknown_type', 'mystery.event']])
  })

  it('handler throw → rethrown (the HTTP action runtime answers 500 so the provider retries) + handler_error', async () => {
    const ctx = makeCtx()
    ctx.runAction.mockResolvedValue({ status: 202, body: '', type: 'email.bounced' })
    const events = {
      'email.bounced': async () => {
        throw new Error('boom')
      },
    }

    await expect(setupEmail(components, { events }).webhookHandler(asCtx(ctx), request('{"type":"email.bounced","data":{}}')))
      .rejects.toThrow('boom')

    expect(recorded(ctx)).toStrictEqual([{ service: 'email', deliveryId: 'msg_1', type: 'email.bounced', outcome: 'handler_error', note: 'boom' }])
  })

  it('any other non-2xx from the component (e.g. its own 503) → passed through + handler_error', async () => {
    const ctx = makeCtx()
    ctx.runAction.mockResolvedValue({ status: 503, body: 'Webhook secret not configured' })

    const response = await setupEmail(components).webhookHandler(asCtx(ctx), request('{}'))

    expect(response.status).toBe(503)
    expect(recorded(ctx).map(row => [row.outcome, row.note])).toStrictEqual([['handler_error', 'component answered 503']])
  })

  it('duplicate of a successful delivery → 200 without invoking the component', async () => {
    const ctx = makeCtx({ outcome: 'ok', receivedAt: 1 })

    const response = await setupEmail(components).webhookHandler(asCtx(ctx), request('{}'))

    expect(response.status).toBe(200)
    expect(ctx.runAction).not.toHaveBeenCalled()
    expect(recorded(ctx).map(row => row.outcome)).toStrictEqual(['duplicate'])
  })

  it('missing secret → 503 and oversized → 413 before the component is ever invoked', async () => {
    delete process.env.EMAIL_WEBHOOK_SECRET
    const missing = makeCtx()
    expect((await setupEmail(components).webhookHandler(asCtx(missing), request('{}'))).status).toBe(503)
    expect(recorded(missing).map(row => row.outcome)).toStrictEqual(['missing_secret'])

    process.env.EMAIL_WEBHOOK_SECRET = 'whsec_test'
    const oversized = makeCtx()
    expect((await setupEmail(components).webhookHandler(asCtx(oversized), request('x'.repeat(WEBHOOK_BODY_LIMIT + 1)))).status).toBe(413)
    expect(recorded(oversized).map(row => row.outcome)).toStrictEqual(['oversized'])

    expect(missing.runAction).not.toHaveBeenCalled()
    expect(oversized.runAction).not.toHaveBeenCalled()
  })

  it('success → the typed handler runs with the parsed event and the delivery is logged ok', async () => {
    const ctx = makeCtx()
    ctx.runAction.mockResolvedValue({ status: 202, body: '', type: 'email.delivered' })
    const delivered = vi.fn(async (_ctx: unknown, _event: EmailWebhookEvent<'email.delivered'>) => {})

    const response = await setupEmail(components, { events: { 'email.delivered': delivered } })
      .webhookHandler(asCtx(ctx), request('{"type":"email.delivered","data":{"email_id":"re_1"}}'))

    expect(response.status).toBe(202)
    expect(delivered).toHaveBeenCalledWith(ctx, { type: 'email.delivered', data: { email_id: 're_1' } })
    expect(recorded(ctx).map(row => [row.outcome, row.type])).toStrictEqual([['ok', 'email.delivered']])
  })

  it('deliveryLog: false keeps the 503 / 413 rows but touches no log', async () => {
    delete process.env.EMAIL_WEBHOOK_SECRET
    const ctx = makeCtx()
    const email = setupEmail(components, { deliveryLog: false })

    expect((await email.webhookHandler(asCtx(ctx), request('{}'))).status).toBe(503)
    process.env.EMAIL_WEBHOOK_SECRET = 'whsec_test'
    expect((await email.webhookHandler(asCtx(ctx), request('x'.repeat(WEBHOOK_BODY_LIMIT + 1)))).status).toBe(413)

    expect(ctx.runQuery).not.toHaveBeenCalled()
    expect(ctx.runMutation).not.toHaveBeenCalled()
  })
})
