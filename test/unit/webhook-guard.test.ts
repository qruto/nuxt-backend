import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { Webhook } from 'standardwebhooks'
import { setupEmail, type Email, type EmailComponents, type EmailWebhookEvent } from '../../src/convex/integrations/email'
import { fakeCredential, signingSecret } from '../helpers/secrets'
import { verifyWebhookSignature } from '../../src/convex/webhook-signatures'
import {
  handleWebhookDelivery,
  parseSecretList,
  parseWebhookJson,
  type WebhookDelivery,
  type WebhookLogRefs,
  type WebhookOutcome,
  type WebhookService,
  WEBHOOK_BODY_LIMIT,
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
// The edge owns every row: the 503 / 413 / 200 rows before a route runs, and
// the 403 / 202 / 500 rows from the verdict a route's signature check hands
// back. The routes on it are exercised through `setupEmail`'s `/email/events`
// handler with the component call faked (and `/billing/events` against the
// real provider SDK in billing-webhook-edge.test.ts).

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

/** A POST carrying `body`, with any extra headers. */
const post = (body: string, headers: Record<string, string> = {}) =>
  new Request('https://site.test/events', { method: 'POST', body, headers })

/**
 * A delivery to the edge for a throwaway service, verified by `verify` (by
 * default: accepted). `body` is shorthand for a request carrying it.
 */
function delivery({ body = '{"type":"order.paid"}', ...overrides }: Partial<WebhookDelivery<Ctx>> & { body?: string } = {}): WebhookDelivery<Ctx> {
  return {
    service: service() as WebhookService,
    deliveryId: 'd1',
    request: post(body),
    secretsConfigured: true,
    verify: vi.fn(async () => ({ outcome: 'ok' as const, response: new Response('done', { status: 200 }) })),
    ...overrides,
  }
}

/** Every deployment-log line the edge wrote at `warn`. */
const warnings = () => (console.warn as Mock<typeof console.warn>).mock.calls.map(([message]) => String(message))

describe('parseWebhookJson', () => {
  it('reads the event type and the payload, and never throws', () => {
    expect(parseWebhookJson('{"type":"order.paid","data":{"id":"o1"}}')).toStrictEqual({ type: 'order.paid', payload: { type: 'order.paid', data: { id: 'o1' } } })
    expect(parseWebhookJson('{"data":{}}')).toStrictEqual({ payload: { data: {} } })
    expect(parseWebhookJson('{"type":7}')).toStrictEqual({ payload: { type: 7 } })
    expect(parseWebhookJson('null')).toStrictEqual({ payload: null })
    expect(parseWebhookJson('not json')).toStrictEqual({ payload: 'not json' })
  })
})

describe('handleWebhookDelivery — the rows the edge owns', () => {
  it('missing secret → 503 + missing_secret, without consulting the log, the body cap or the route', async () => {
    const ctx = makeCtx()
    const input = delivery({ secretsConfigured: false, body: 'x'.repeat(WEBHOOK_BODY_LIMIT + 1) })

    const response = await handleWebhookDelivery(ctx, refs, input)

    expect(response.status).toBe(503)
    expect(await response.text()).toBe('Webhook secret not configured')
    expect(recorded(ctx)).toStrictEqual([{ service: input.service, deliveryId: 'd1', type: undefined, outcome: 'missing_secret', note: undefined }])
    expect(ctx.runQuery).not.toHaveBeenCalled()
    expect(input.verify).not.toHaveBeenCalled()
  })

  it('warns about the unconfigured secret once per service, naming the route', async () => {
    const name = service() as WebhookService
    await handleWebhookDelivery(makeCtx(), refs, delivery({ service: name, secretsConfigured: false }))
    await handleWebhookDelivery(makeCtx(), refs, delivery({ service: name, secretsConfigured: false }))

    const explained = warnings().filter(message => message.includes('webhook.secret_missing'))
    expect(explained).toHaveLength(1)
    expect(explained[0]).toContain(`/${name}/events`)
    expect(explained[0]).toContain('503')
  })

  it('oversized body → 413 + oversized; a body exactly at the cap reaches the route', async () => {
    const ctx = makeCtx()
    const over = delivery({ body: 'x'.repeat(WEBHOOK_BODY_LIMIT + 1) })

    const response = await handleWebhookDelivery(ctx, refs, over)
    expect(response.status).toBe(413)
    expect(await response.text()).toBe('Payload too large')
    expect(recorded(ctx).map(row => row.outcome)).toStrictEqual(['oversized'])
    expect(ctx.runQuery).not.toHaveBeenCalled()
    expect(over.verify).not.toHaveBeenCalled()

    const atCap = delivery({ body: 'x'.repeat(WEBHOOK_BODY_LIMIT) })
    expect((await handleWebhookDelivery(makeCtx(), refs, atCap)).status).toBe(200)
    expect(atCap.verify).toHaveBeenCalledOnce()
  })

  it('a declared Content-Length over the cap → 413 before a byte of the body is read', async () => {
    const ctx = makeCtx()
    const request = post('{"type":"order.paid"}', { 'content-length': String(WEBHOOK_BODY_LIMIT + 1) })
    const input = delivery({ request })

    const response = await handleWebhookDelivery(ctx, refs, input)

    expect(response.status).toBe(413)
    expect(request.bodyUsed).toBe(false)
    expect(recorded(ctx).map(row => row.outcome)).toStrictEqual(['oversized'])
    expect(input.verify).not.toHaveBeenCalled()
  })

  it('a chunked body with no Content-Length stops being read at the cap', async () => {
    const chunk = new Uint8Array(64 * 1024)
    let pulled = 0
    const stream = new ReadableStream<Uint8Array>({
      // Endless: only a read that stops at the cap ever settles.
      pull(controller) {
        pulled++
        controller.enqueue(chunk)
      },
    })
    const request = new Request('https://site.test/billing/events', { method: 'POST', body: stream, duplex: 'half' } as RequestInit)
    const input = delivery({ request })

    const response = await handleWebhookDelivery(makeCtx(), refs, input)

    expect(response.status).toBe(413)
    expect(pulled * chunk.byteLength).toBeLessThanOrEqual(WEBHOOK_BODY_LIMIT + 2 * chunk.byteLength)
    expect(input.verify).not.toHaveBeenCalled()
  })

  it('caps the body in bytes, not characters', async () => {
    // Two bytes a character in UTF-8: half the cap in characters, just over it in bytes.
    const wide = 'é'.repeat(WEBHOOK_BODY_LIMIT / 2 + 1)
    const over = delivery({ body: wide })
    expect((await handleWebhookDelivery(makeCtx(), refs, over)).status).toBe(413)
    expect(over.verify).not.toHaveBeenCalled()

    const atCap = delivery({ body: 'é'.repeat(WEBHOOK_BODY_LIMIT / 2) })
    expect((await handleWebhookDelivery(makeCtx(), refs, atCap)).status).toBe(200)
    expect(atCap.verify).toHaveBeenCalledWith({ payload: 'é'.repeat(WEBHOOK_BODY_LIMIT / 2) }, 'é'.repeat(WEBHOOK_BODY_LIMIT / 2))
  })

  it('a redelivery of a fully-processed id → 200 + duplicate, without running anything', async () => {
    const ctx = makeCtx({ outcome: 'ok', receivedAt: 1 })
    const input = delivery()

    const response = await handleWebhookDelivery(ctx, refs, input)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('Already processed')
    expect(ctx.runQuery).toHaveBeenCalledWith(refs.find, { service: input.service, deliveryId: 'd1' })
    expect(recorded(ctx).map(row => row.outcome)).toStrictEqual(['duplicate'])
    expect(input.verify).not.toHaveBeenCalled()
  })

  it.each<WebhookOutcome>(['handler_error', 'invalid_signature', 'unknown_type', 'oversized', 'missing_secret'])(
    'a prior %s outcome does not dedupe — the provider retry runs',
    async (outcome) => {
      const input = delivery()
      await handleWebhookDelivery(makeCtx({ outcome, receivedAt: 1 }), refs, input)
      expect(input.verify).toHaveBeenCalledOnce()
    },
  )

  it('a delivery without a provider id skips dedupe and is logged under a synthetic id', async () => {
    const ctx = makeCtx()

    await handleWebhookDelivery(ctx, refs, delivery({ deliveryId: null }))

    expect(ctx.runQuery).not.toHaveBeenCalled()
    expect(recorded(ctx)[0]!.deliveryId).toMatch(/^none:\d+$/)
  })

  it('hands the route the parsed body and logs a verified delivery ok with its type', async () => {
    const ctx = makeCtx()
    const input = delivery({ body: '{"type":"order.paid","data":{}}' })

    const response = await handleWebhookDelivery(ctx, refs, input)

    expect(await response.text()).toBe('done')
    expect(input.verify).toHaveBeenCalledWith({ type: 'order.paid', payload: { type: 'order.paid', data: {} } }, '{"type":"order.paid","data":{}}')
    expect(recorded(ctx)).toStrictEqual([{ service: input.service, deliveryId: 'd1', type: 'order.paid', outcome: 'ok', note: undefined }])
  })

  it('a route throw → handler_error with the type and the message, rethrown so the provider retries', async () => {
    const ctx = makeCtx()
    const input = delivery({ verify: async () => {
      throw new Error('boom')
    } })

    await expect(handleWebhookDelivery(ctx, refs, input)).rejects.toThrow('boom')
    expect(recorded(ctx).map(row => [row.outcome, row.type, row.note])).toStrictEqual([['handler_error', 'order.paid', 'boom']])
  })

  it('a handler_error verdict logs no type: thrown without a response, passed through with one', async () => {
    const thrown = makeCtx()
    await expect(handleWebhookDelivery(thrown, refs, delivery({ verify: async () => ({ outcome: 'handler_error', note: 'cannot verify' }) })))
      .rejects.toThrow('cannot verify')
    expect(recorded(thrown).map(row => [row.outcome, row.type, row.note])).toStrictEqual([['handler_error', undefined, 'cannot verify']])

    const answered = makeCtx()
    const response = await handleWebhookDelivery(answered, refs, delivery({
      verify: async () => ({ outcome: 'handler_error', note: 'component answered 500', response: new Response('no', { status: 500 }) }),
    }))
    expect(response.status).toBe(500)
  })

  it('an unknown type → 202 + unknown_type, after the onUnknownEvent hook saw the payload', async () => {
    const ctx = makeCtx()
    const onUnknownEvent = vi.fn(async () => {})
    const input = delivery({ body: '{"type":"brand.new"}', verify: async () => ({ outcome: 'unknown_type' }), onUnknownEvent })

    const response = await handleWebhookDelivery(ctx, refs, input)

    expect(response.status).toBe(202)
    expect(onUnknownEvent).toHaveBeenCalledWith(ctx, { type: 'brand.new', payload: { type: 'brand.new' } })
    expect(recorded(ctx).map(row => [row.outcome, row.type])).toStrictEqual([['unknown_type', 'brand.new']])
  })

  it('a throwing onUnknownEvent → handler_error with the type, rethrown so the provider retries', async () => {
    const ctx = makeCtx()
    const input = delivery({
      body: '{"type":"brand.new"}',
      verify: async () => ({ outcome: 'unknown_type' }),
      onUnknownEvent: async () => {
        throw new Error('hook failed')
      },
    })

    await expect(handleWebhookDelivery(ctx, refs, input)).rejects.toThrow('hook failed')
    expect(recorded(ctx).map(row => [row.outcome, row.type, row.note])).toStrictEqual([['handler_error', 'brand.new', 'hook failed']])
  })

  it('an invalid signature → 403 + invalid_signature, with no type from the unverified body', async () => {
    const ctx = makeCtx()

    const response = await handleWebhookDelivery(ctx, refs, delivery({ verify: async () => ({ outcome: 'invalid_signature' }) }))

    expect(response.status).toBe(403)
    expect(await response.text()).toBe('Invalid signature')
    expect(recorded(ctx).map(row => [row.outcome, row.type])).toStrictEqual([['invalid_signature', undefined]])
  })

  it('never fails a delivery over its log row', async () => {
    const ctx = makeCtx()
    ctx.runMutation.mockRejectedValueOnce(new Error('log table unavailable'))
    const input = delivery()

    expect((await handleWebhookDelivery(ctx, refs, input)).status).toBe(200)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(input.service), expect.any(Error))
  })
})

describe('the webhook.rejected line', () => {
  const rejected = () => warnings().filter(message => message.includes('webhook.rejected'))
  const line = (name: string, refusal: string) =>
    `[nuxt-backend] webhook.rejected: /${name}/events refused a delivery: ${refusal}. Further refusals like it are counted in the delivery log, not repeated here.`

  it('is written once per isolate for each route and outcome, naming both and the status', async () => {
    const name = service() as WebhookService
    const other = service() as WebhookService
    const oversized = () => delivery({ service: name, body: 'x'.repeat(WEBHOOK_BODY_LIMIT + 1) })
    const forged = (route: WebhookService) => delivery({ service: route, verify: async () => ({ outcome: 'invalid_signature' }) })
    const unforwarded = () => delivery({ service: name, verify: async () => ({ outcome: 'missing_secret', note: 'component has none' }) })

    for (const input of [oversized(), oversized(), forged(name), forged(name), forged(other), unforwarded(), unforwarded()]) {
      const ctx = makeCtx()
      await handleWebhookDelivery(ctx, refs, input)
      // The delivery log still counts every one.
      expect(recorded(ctx)).toHaveLength(1)
    }

    expect(rejected()).toStrictEqual([
      line(name, 'oversized (413)'),
      line(name, 'invalid_signature (403)'),
      line(other, 'invalid_signature (403)'),
      line(name, 'missing_secret (503)'),
    ])
  })

  it('leaves a missing app secret to webhook.secret_missing, the one line that explains it', async () => {
    const name = service() as WebhookService
    await handleWebhookDelivery(makeCtx(), refs, delivery({ service: name, secretsConfigured: false }))

    expect(rejected()).toStrictEqual([])
    expect(warnings().filter(message => message.includes('webhook.secret_missing'))).toHaveLength(1)
  })

  it('is not written for a delivery the route accepted, deduped or failed on', async () => {
    const name = service() as WebhookService
    await handleWebhookDelivery(makeCtx(), refs, delivery({ service: name }))
    await handleWebhookDelivery(makeCtx({ outcome: 'ok', receivedAt: 1 }), refs, delivery({ service: name }))
    await handleWebhookDelivery(makeCtx(), refs, delivery({ service: name, verify: async () => ({ outcome: 'unknown_type' }) }))
    await expect(handleWebhookDelivery(makeCtx(), refs, delivery({ service: name, verify: async () => {
      throw new Error('boom')
    } }))).rejects.toThrow()

    expect(rejected()).toStrictEqual([])
  })
})

describe('/email/events on the edge — what its route decides', () => {
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

  it('a signature check that fails to run → 500 + handler_error, with no type from the unverified body', async () => {
    const ctx = makeCtx()
    ctx.runAction.mockRejectedValue(new Error('component unavailable'))

    await expect(setupEmail(components).webhookHandler(asCtx(ctx), request('{"type":"email.bounced","data":{}}')))
      .rejects.toThrow('component unavailable')

    expect(recorded(ctx)).toStrictEqual([{
      service: 'email',
      deliveryId: 'msg_1',
      type: undefined,
      outcome: 'handler_error',
      note: 'the signature check failed to run: component unavailable',
    }])
  })

  it('a throwing onUnknownEvent → rethrown + handler_error with the verified type', async () => {
    const ctx = makeCtx()
    ctx.runAction.mockResolvedValue({ status: 202, body: '', type: 'mystery.event' })
    const onUnknownEvent = vi.fn(async () => {
      throw new Error('hook failed')
    })

    await expect(setupEmail(components, { onUnknownEvent }).webhookHandler(asCtx(ctx), request('{"type":"mystery.event"}')))
      .rejects.toThrow('hook failed')

    expect(recorded(ctx).map(row => [row.outcome, row.type, row.note])).toStrictEqual([['handler_error', 'mystery.event', 'hook failed']])
  })

  // The app has the secret, but `app.use(backend, { env })` never gave it to
  // the component: nothing was verified, so it is counted, not logged.
  it('a 503 from the component itself (no secret on its side) → passed through + missing_secret', async () => {
    const ctx = makeCtx()
    ctx.runAction.mockResolvedValue({ status: 503, body: 'Webhook secret not configured' })

    const response = await setupEmail(components).webhookHandler(asCtx(ctx), request('{}'))

    expect(response.status).toBe(503)
    expect(recorded(ctx).map(row => [row.outcome, row.note])).toStrictEqual([['missing_secret', 'the backend component has no EMAIL_WEBHOOK_SECRET']])
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

    const declared = makeCtx()
    const unread = request('{}', { 'svix-id': 'msg_2', 'content-length': String(WEBHOOK_BODY_LIMIT + 1) })
    expect((await setupEmail(components).webhookHandler(asCtx(declared), unread)).status).toBe(413)
    expect(unread.bodyUsed).toBe(false)

    expect(missing.runAction).not.toHaveBeenCalled()
    expect(oversized.runAction).not.toHaveBeenCalled()
    expect(declared.runAction).not.toHaveBeenCalled()
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
})

describe('verifyWebhookSignature, the one verifier', () => {
  const secret = signingSecret(32)
  const body = JSON.stringify({ type: 'order.paid', data: { id: 'ord_1' } })
  const id = 'msg_1'
  const at = new Date()
  const headersFor = (signature: string, prefix = 'webhook') => new Headers({ [`${prefix}-id`]: id, [`${prefix}-timestamp`]: String(Math.floor(at.getTime() / 1000)), [`${prefix}-signature`]: signature })

  it('verifies a Standard Webhooks signature under the webhook-* or the svix-* headers', () => {
    const standard = new Webhook(secret).sign(id, at, body)
    expect(verifyWebhookSignature([secret], body, headersFor(standard))).toBe(true)
    expect(verifyWebhookSignature([secret], body, headersFor(standard, 'svix'))).toBe(true)
  })

  it('takes Polar\'s legacy key reading only where the route asks for it', () => {
    const legacySecret = fakeCredential('polar_whs_')
    const legacy = new Webhook(new TextEncoder().encode(legacySecret), { format: 'raw' }).sign(id, at, body)
    expect(verifyWebhookSignature([legacySecret], body, headersFor(legacy), { legacyKey: true })).toBe(true)
    expect(verifyWebhookSignature([legacySecret], body, headersFor(legacy))).toBe(false)
  })

  it('refuses a bogus signature, missing headers, a stale timestamp and an empty accept-list', () => {
    const standard = new Webhook(secret).sign(id, at, body)
    expect(verifyWebhookSignature([secret], body, headersFor('v1,bogus'), { legacyKey: true })).toBe(false)
    expect(verifyWebhookSignature([secret], body, new Headers(), { legacyKey: true })).toBe(false)
    expect(verifyWebhookSignature([], body, headersFor(standard), { legacyKey: true })).toBe(false)
    const stale = new Date(at.getTime() - 10 * 60_000)
    const staleHeaders = new Headers({ 'webhook-id': id, 'webhook-timestamp': String(Math.floor(stale.getTime() / 1000)), 'webhook-signature': new Webhook(secret).sign(id, stale, body) })
    expect(verifyWebhookSignature([secret], body, staleHeaders, { legacyKey: true })).toBe(false)
  })

  it('tries every accepted secret of a rotation, a secret no reading can use included', () => {
    const rotated = signingSecret(32)
    const standard = new Webhook(rotated).sign(id, at, body)
    expect(verifyWebhookSignature(['plain-old-secret', secret, rotated], body, headersFor(standard), { legacyKey: true })).toBe(true)
  })
})
